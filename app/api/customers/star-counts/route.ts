import { NextResponse } from 'next/server'
import { checkPermission, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { countStarredCustomers, parseStaffStarFilters, staffStarViewFilter, type StarCountRow, type StarCounts } from '@/lib/starredCustomers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getJstDateString } from '@/lib/followUpWorkflow'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { parseStarCheckFilter } from '@/lib/starLog'
import { aggregateGoalVisits, goalMonthBounds, type GoalVisit } from '@/lib/starCustomerGoals'
import { fetchStaffStarVisitCustomerIds } from '@/lib/staffStarVisitDate'

// スタッフの名簿用。顧客閲覧認可は必須。全員数はセッションRLS、対象数は
// 検索APIと同じ認可済みスタッフの全顧客範囲で集計する（キャストには返さない）。
// 顧客名や明細は返さず、⭐️全員の人数と、⭐️以外も含む当月売上を担当別に返す。
export async function GET(request: Request) {
  try {
    const profile = await requireUser()
    if (profile.role !== 'admin' || (!profile.is_owner && !(await checkPermission('顧客.閲覧')))) {
      return NextResponse.json({ error: '顧客.閲覧 の権限がありません' }, { status: 403 })
    }
    const params = new URL(request.url).searchParams
    const filters = parseStaffStarFilters(params)
    if (!filters.ok) return NextResponse.json({ error: filters.error }, { status: 400 })
    const starCheck = parseStarCheckFilter(params.get('starCheck'))
    if (starCheck === null || starCheck !== 'all' && filters.view === null) return NextResponse.json({ error: '確認状況の条件が不正です' }, { status: 400 })
    const keywordRaw = params.get('keyword')
    if (keywordRaw !== null && keywordRaw.length > 100) return NextResponse.json({ error: 'keyword は 100 文字以内で指定してください' }, { status: 400 })
    const keyword = keywordRaw?.trim()
    const today = getJstDateString(), month = today.slice(0, 7)
    if (filters.visitDate && filters.visitDate > today) return NextResponse.json({ error: '来店日は本日以前の日付を指定してください' }, { status: 400 })
    const client = await createClient()
    // 件数が1000以上でも切り捨てない。必ず同じid順でページングする。
    const rows = await fetchAllPaginated<StarCountRow & { id: number | string }>((from, to) => client.from('customers')
      .select('id,cast_name,nomination_status,region,customer_rank').eq('is_starred', true)
      .order('id', { ascending: true }).range(from, to))
    if (rows.length >= 100000) throw new Error('⭐️のお客様の取得上限を超えました')
    const counts: StarCounts = countStarredCustomers(rows)
    const { start, end } = goalMonthBounds(month)
    const byCast = new Map(Object.keys(counts.byCast).map(name => [name, 0]))
    let total = 0
    // 月内の実来店と担当だけを取得。顧客側にもセッションRLSを適用し、
    // ⭐️の有無や表示条件に左右されない。全顧客IDの巨大なIN句/N+1は作らない。
    const visits = await fetchAllPaginated<GoalVisit & { customer: { cast_name: string | null } | { cast_name: string | null }[] }>((from, to) => client.from('customer_visits')
      .select('customer_id,visit_date,amount_spent,is_planned,customer:customers!inner(cast_name)')
      .gte('visit_date', start).lt('visit_date', end).lte('visit_date', today)
      .or('is_planned.is.null,is_planned.eq.false').order('id', { ascending: true }).range(from, to))
    if (visits.length >= 100000) throw new Error('当月来店の取得上限を超えました')
    const customerCasts = new Map(visits.map(visit => {
      const customer = Array.isArray(visit.customer) ? visit.customer.length === 1 ? visit.customer[0] : null : visit.customer
      if (!customer || customer.cast_name !== null && typeof customer.cast_name !== 'string') throw new Error('来店の担当情報を確認してください')
      return [String(visit.customer_id), customer.cast_name ?? ''] as const
    }))
    const actuals = aggregateGoalVisits([...customerCasts.keys()], visits, month, today)
    for (const [id, castName] of customerCasts) {
      const sales = actuals[id].sales
      byCast.set(castName, (byCast.get(castName) ?? 0) + sales)
      total += sales
    }
    // 既存の月間売上と同様に場内延長も加算。⭐️0名/顧客来店0件でも取得する。
    const casts = await fetchAllPaginated<{ id: string; cast_name: string | null }>((from, to) => client.from('profiles')
      .select('id,cast_name').eq('role', 'cast').order('id', { ascending: true }).range(from, to))
    if (casts.length >= 100000) throw new Error('キャストの取得上限を超えました')
    let extensionCount = 0
    for (let offset = 0; offset < casts.length; offset += 200) {
      const batch = casts.slice(offset, offset + 200), castNames = new Map(batch.map(cast => [cast.id, cast.cast_name ?? '']))
      const extensions = await fetchAllPaginated<{ cast_id: string; amount_spent: number | string | null }>((from, to) => client.from('cast_extension_sales')
        .select('cast_id,amount_spent').in('cast_id', batch.map(cast => cast.id))
        .gte('sale_date', start).lt('sale_date', end).lte('sale_date', today)
        .order('id', { ascending: true }).range(from, to))
      extensionCount += extensions.length
      if (extensionCount >= 100000) throw new Error('当月延長売上の取得上限を超えました')
      for (const extension of extensions) {
        const castName = castNames.get(extension.cast_id)
        if (castName === undefined) continue
        const sales = Number(extension.amount_spent ?? 0)
        if (!Number.isFinite(sales)) throw new Error('延長売上の形式を確認してください')
        byCast.set(castName, (byCast.get(castName) ?? 0) + sales)
        total += sales
      }
    }
    if (!Number.isFinite(total) || [...byCast.values()].some(sales => !Number.isFinite(sales))) throw new Error('当月売上の形式を確認してください')
    counts.monthlySales = { month, total, byCast: Object.fromEntries(byCast) }
    if (filters.view !== null) {
      // スタッフの顧客閲覧認可後だけ集計ビューへ。検索と同じ全件条件で、
      // ページ/選択キャストに依存しない「対象人数」を取得する。
      const metricsClient = createAdminClient()
      const visitDateIds = filters.visitDate ? await fetchStaffStarVisitCustomerIds(metricsClient, filters.visitDate) : null
      const viewFilter = staffStarViewFilter(filters.view, today, filters.visitDay, filters.visitDate)
      const matched = await fetchAllPaginated<StarCountRow & { id: string | number }>((from, to) => {
        let query = metricsClient.from('customer_search_metrics_with_bottles')
          .select('id,cast_name,nomination_status,region,customer_rank').eq('is_starred', true)
        if (viewFilter) query = query.or(viewFilter)
        if (keyword) query = query.ilike('search_text_with_bottles', `%${keyword.replace(/[\\%_]/g, '\\$&')}%`)
        return query.order('id', { ascending: true }).range(from, to)
      })
      if (matched.length >= 100000) throw new Error('対象人数の取得上限を超えました')
      let filtered = visitDateIds === null ? matched : matched.filter(row => visitDateIds.has(String(row.id)))
      if (starCheck !== 'all') {
        const checked = await fetchAllPaginated<{ customer_id: string | number }>((from, to) => metricsClient.from('customer_star_cycles')
          .select('customer_id').is('ended_at', null).eq('last_checked_on', today).order('id').range(from, to))
        if (checked.length >= 100000) throw new Error('確認記録の上限を超えました')
        const ids = new Set(checked.map(row => String(row.customer_id)))
        filtered = filtered.filter(row => ids.has(String(row.id)) === (starCheck === 'checked'))
      }
      counts.matched = countStarredCustomers(filtered)
    }
    return NextResponse.json(counts, {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    console.error('GET /api/customers/star-counts error:', error)
    return NextResponse.json({ error: '⭐️のお客様の人数・当月売上を取得できませんでした' }, { status: 500 })
  }
}
