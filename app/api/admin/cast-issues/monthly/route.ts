import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { daysAgoJST, getMonthEndDateJST, thisMonthJST, todayJST } from '@/lib/dateUtils'
import { buildCastIssueMonthly, type CastIssueMonthlyVisitInput } from '@/lib/castIssueMonthly'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { resolveCastTargetFull } from '@/lib/targetResolver'

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }
  if (message === 'FORBIDDEN') {
    return NextResponse.json({ error: '黒服・オーナーのみ閲覧できます' }, { status: 403 })
  }
  return NextResponse.json({ error: '月間一覧の取得に失敗しました' }, { status: 500 })
}

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 黒服・オーナー専用。課題見える化シートの全キャスト月間一覧。 */
export async function GET(request: Request) {
  try {
    await requireAdmin()
    const params = new URL(request.url).searchParams
    const month = params.get('month') ?? thisMonthJST()
    const currentMonth = thisMonthJST()
    if (!/^\d{4}-\d{2}$/.test(month) || month > currentMonth) {
      return NextResponse.json({ error: '対象月を正しく指定してください' }, { status: 400 })
    }

    const today = todayJST()
    const periodStart = `${month}-01`
    const periodEnd = month === currentMonth ? today : getMonthEndDateJST(month)
    const rollingPeriodStart = daysAgoJST(27)
    const admin = createAdminClient()
    const { data: castData, error: castError } = await admin
      .from('profiles')
      .select('id, cast_name, display_name, cast_tier, created_at')
      .eq('role', 'cast')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    if (castError) throw castError

    const rawCasts = (castData ?? []) as Array<{
      id: string
      cast_name: string | null
      display_name: string | null
      cast_tier: string | null
      created_at: string
    }>
    const castIds = rawCasts.map(cast => cast.id)
    const castNames = rawCasts.map(cast => cast.cast_name?.trim()).filter(Boolean) as string[]
    if (castIds.length === 0) {
      return NextResponse.json({
        period: { month, start: periodStart, end: periodEnd },
        rolling_period: { start: rollingPeriodStart, end: today },
        rows: [],
        summary: {
          sales: 0, target_sales: 0, achievement_rate: 0,
          honshimei_count: 0, banai_count: 0, free_seating_count: 0,
          bowzu_days: 0, work_days: 0, target_work_days: 0, remaining_work_days: 0,
        },
      }, { headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } })
    }

    const customers = castNames.length > 0
      ? await fetchAllPaginated<{
          id: string | number
          cast_name: string | null
          nomination_status: string | null
          region: string | null
        }>((from, to) => admin
          .from('customers')
          .select('id, cast_name, nomination_status, region')
          .in('cast_name', castNames)
          .order('id', { ascending: true })
          .range(from, to))
      : []
    const customerIds = customers.map(customer => String(customer.id))
    const customerIdChunks: string[][] = []
    for (let index = 0; index < customerIds.length; index += 200) {
      customerIdChunks.push(customerIds.slice(index, index + 200))
    }

    const historyStart = `${periodStart}T00:00:00+09:00`
    const historyEndExclusive = `${nextMonth(month)}-01T00:00:00+09:00`
    const [
      visitChunks,
      nominationHistory,
      extensionSales,
      freeSeatings,
      shifts,
      castTargetsResult,
      tierTargetsResult,
    ] = await Promise.all([
      Promise.all(customerIdChunks.map(ids =>
        fetchAllPaginated<CastIssueMonthlyVisitInput>((from, to) => admin
          .from('customer_visits')
          .select('id, customer_id, visit_date, amount_spent, is_planned, nomination_status_at_visit')
          .in('customer_id', ids)
          .lte('visit_date', today)
          .order('visit_date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to))
      )),
      fetchAllPaginated<{ id: string | number; cast_id: string; changed_at: string; new_status: string }>((from, to) => admin
        .from('nomination_history')
        .select('id, cast_id, changed_at, new_status')
        .in('cast_id', castIds)
        .gte('changed_at', historyStart)
        .lt('changed_at', historyEndExclusive)
        .order('changed_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)),
      fetchAllPaginated<{ id: string | number; cast_id: string; sale_date: string; amount_spent: number | null }>((from, to) => admin
        .from('cast_extension_sales')
        .select('id, cast_id, sale_date, amount_spent')
        .in('cast_id', castIds)
        .gte('sale_date', periodStart)
        .lte('sale_date', periodEnd)
        .order('sale_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)),
      fetchAllPaginated<{ id: string | number; cast_id: string; business_date: string; seating_count: number }>((from, to) => admin
        .from('cast_daily_free_seatings')
        .select('id, cast_id, business_date, seating_count')
        .in('cast_id', castIds)
        .gte('business_date', periodStart)
        .lte('business_date', periodEnd)
        .order('business_date', { ascending: true })
        .order('cast_id', { ascending: true })
        .range(from, to)),
      fetchAllPaginated<{ cast_id: string; shift_date: string; status: string }>((from, to) => admin
        .from('cast_shifts')
        .select('cast_id, shift_date, status')
        .in('cast_id', castIds)
        .lte('shift_date', periodEnd)
        .order('cast_id', { ascending: true })
        .order('shift_date', { ascending: true })
        .range(from, to)),
      admin.from('cast_targets').select('*').in('cast_id', castIds),
      admin.from('cast_tier_targets').select('*'),
    ])
    if (castTargetsResult.error) throw castTargetsResult.error
    if (tierTargetsResult.error) throw tierTargetsResult.error

    const castTargets = castTargetsResult.data ?? []
    const tierTargets = tierTargetsResult.data ?? []
    const casts = rawCasts.map(cast => {
      const target = resolveCastTargetFull(
        castTargets,
        tierTargets,
        cast.id,
        cast.cast_tier,
        month,
      )
      return {
        ...cast,
        target_sales: target.target_sales,
        target_work_days: target.target_work_days,
      }
    })
    const result = buildCastIssueMonthly({
      casts,
      customers: customers.map(customer => ({ ...customer, id: String(customer.id) })),
      visits: visitChunks.flat().map(visit => ({ ...visit, customer_id: String(visit.customer_id) })),
      nominationHistory,
      extensionSales,
      freeSeatings,
      shifts,
      periodStart,
      periodEnd,
      rollingPeriodStart,
      rollingPeriodEnd: today,
      today,
    })

    return NextResponse.json({
      period: { month, start: periodStart, end: periodEnd },
      rolling_period: { start: rollingPeriodStart, end: today },
      ...result,
    }, { headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } })
  } catch (error) {
    console.error('GET /api/admin/cast-issues/monthly error:', error)
    return errorResponse(error)
  }
}
