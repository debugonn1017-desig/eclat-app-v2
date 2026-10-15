import { NextResponse } from 'next/server'
import { checkPermission, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { countStarredCustomers, parseStaffStarFilters, staffStarViewFilter, type StarCountRow, type StarCounts } from '@/lib/starredCustomers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getJstDateString } from '@/lib/followUpWorkflow'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

// スタッフの名簿用。顧客閲覧認可は必須。全員数はセッションRLS、対象数は
// 検索APIと同じ認可済みスタッフの全顧客範囲で集計する（キャストには返さない）。
// 名前・金額等は取得せず、⭐️顧客の担当/指名状況だけを全ページ集計する。
export async function GET(request: Request) {
  try {
    const profile = await requireUser()
    if (profile.role !== 'admin' || (!profile.is_owner && !(await checkPermission('顧客.閲覧')))) {
      return NextResponse.json({ error: '顧客.閲覧 の権限がありません' }, { status: 403 })
    }
    const params = new URL(request.url).searchParams
    const filters = parseStaffStarFilters(params)
    if (!filters.ok) return NextResponse.json({ error: filters.error }, { status: 400 })
    const keywordRaw = params.get('keyword')
    if (keywordRaw !== null && keywordRaw.length > 100) return NextResponse.json({ error: 'keyword は 100 文字以内で指定してください' }, { status: 400 })
    const keyword = keywordRaw?.trim()
    const client = await createClient()
    const rows: StarCountRow[] = []
    // 件数が1000以上でも切り捨てない。必ず同じid順でページングする。
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from('customers')
        .select('cast_name,nomination_status').eq('is_starred', true)
        .order('id', { ascending: true }).range(from, from + 999)
      if (error) throw error
      const batch = data ?? []
      rows.push(...batch)
      if (batch.length < 1000) break
    }
    const counts: StarCounts = countStarredCustomers(rows)
    if (filters.view !== null) {
      // スタッフの顧客閲覧認可後だけ集計ビューへ。検索と同じ全件条件で、
      // ページ/選択キャストに依存しない「対象人数」を取得する。
      const metricsClient = createAdminClient()
      const viewFilter = staffStarViewFilter(filters.view, getJstDateString(), filters.visitDay)
      const matched = await fetchAllPaginated<StarCountRow>((from, to) => {
        let query = metricsClient.from('customer_search_metrics_with_bottles')
          .select('cast_name,nomination_status').eq('is_starred', true)
        if (viewFilter) query = query.or(viewFilter)
        if (keyword) query = query.ilike('search_text_with_bottles', `%${keyword.replace(/[\\%_]/g, '\\$&')}%`)
        return query.order('id', { ascending: true }).range(from, to)
      })
      if (matched.length >= 100000) throw new Error('対象人数の取得上限を超えました')
      counts.matched = countStarredCustomers(matched)
    }
    return NextResponse.json(counts, {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    console.error('GET /api/customers/star-counts error:', error)
    return NextResponse.json({ error: '⭐️のお客様の人数を取得できませんでした' }, { status: 500 })
  }
}
