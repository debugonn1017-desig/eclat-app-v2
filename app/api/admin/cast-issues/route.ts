import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { daysAgoJST, getMonthEndDateJST, thisMonthJST, todayJST } from '@/lib/dateUtils'
import { resolveCastTargetFull } from '@/lib/targetResolver'
import { getEligibleCustomerStaffOptions } from '@/lib/customerStaffServer'
import {
  buildCastIssueVisibility,
  calculateCastBowzuStats,
  type CastIssueCustomerInput,
  type CastIssueFollowUpMetaInput,
  type CastIssueNominationInput,
  type CastIssueShiftInput,
  type CastIssueVisitInput,
} from '@/lib/castIssueVisibility'

type CastOption = {
  id: string
  cast_name: string | null
  display_name: string | null
  cast_tier: string | null
  created_at: string
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }
  if (message === 'FORBIDDEN') {
    return NextResponse.json({ error: '黒服・オーナーのみ閲覧できます' }, { status: 403 })
  }
  return NextResponse.json({ error: '課題見える化シートの取得に失敗しました' }, { status: 500 })
}

/**
 * 黒服・オーナー専用「課題見える化シート」。
 * 画面で選択したキャスト1人分だけを集計し、全キャスト分の来店履歴を一括取得しない。
 */
export async function GET(request: Request) {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const searchParams = new URL(request.url).searchParams
    const requestedCastId = searchParams.get('castId')
    const requestedMode = searchParams.get('periodMode')
    const requestedMonth = searchParams.get('month')

    const { data: castData, error: castError } = await admin
      .from('profiles')
      .select('id, cast_name, display_name, cast_tier, created_at')
      .eq('role', 'cast')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    if (castError) throw castError
    const casts = (castData ?? []) as CastOption[]
    const selectedCast = requestedCastId
      ? casts.find(cast => cast.id === requestedCastId) ?? null
      : casts[0] ?? null
    if (requestedCastId && !selectedCast) {
      return NextResponse.json({ error: '指定したキャストが見つかりません' }, { status: 404 })
    }

    const today = todayJST()
    const currentMonth = thisMonthJST()
    const periodMode = requestedMode === 'month' ? 'month' : 'rolling'
    if (periodMode === 'month' && (!requestedMonth || !/^\d{4}-\d{2}$/.test(requestedMonth))) {
      return NextResponse.json({ error: '対象月を正しく指定してください' }, { status: 400 })
    }
    if (periodMode === 'month' && (requestedMonth as string) > currentMonth) {
      return NextResponse.json({ error: '未来の月は選択できません' }, { status: 400 })
    }
    const targetMonth = periodMode === 'month' ? requestedMonth as string : currentMonth
    const periodStart = periodMode === 'month' ? `${targetMonth}-01` : daysAgoJST(27)
    const periodEnd = periodMode === 'month'
      ? (targetMonth === currentMonth ? today : getMonthEndDateJST(targetMonth))
      : today
    if (!selectedCast) {
      return NextResponse.json({
        period: { mode: periodMode, month: targetMonth, start: periodStart, end: periodEnd },
        casts,
        selected_cast: null,
        summary: {
          period_honshimei_customer_count: 0,
          period_honshimei_visit_count: 0,
          period_honshimei_sales: 0,
          month_sales: 0,
          sales_difference: 0,
          sales_achievement_rate: 0,
          overdue_customer_count: 0,
          banai_acquired_count: 0,
          target_sales: 0,
          target_work_days: 0,
          current_work_days: 0,
          period_work_days: 0,
          period_bowzu_days: 0,
          current_bowzu_streak: 0,
        },
        sections: { recent_honshimei: [], overdue_honshimei: [], recent_banai: [] },
      }, { headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } })
    }

    const customers: CastIssueCustomerInput[] = selectedCast.cast_name
      ? await fetchAllPaginated<CastIssueCustomerInput>((from, to) =>
          admin
            .from('customers')
            .select('id, customer_name, nickname, nomination_status, customer_rank, region, age_group, last_contact_date, has_customer_staff')
            .eq('cast_name', selectedCast.cast_name as string)
            .order('id', { ascending: true })
            .range(from, to)
        )
      : []
    const customerIds = customers.map(customer => String(customer.id))

    const idChunks: string[][] = []
    for (let index = 0; index < customerIds.length; index += 200) {
      idChunks.push(customerIds.slice(index, index + 200))
    }

    const visitResults = await Promise.all(idChunks.map(ids =>
      fetchAllPaginated<CastIssueVisitInput>((from, to) =>
        admin
          .from('customer_visits')
          .select('id, customer_id, visit_date, visit_time, amount_spent, is_planned, nomination_status_at_visit, companion_honshimei, companion_banai')
          .in('customer_id', ids)
          .order('visit_date', { ascending: false })
          .order('visit_time', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false })
          .range(from, to)
      )
    ))
    const visits = visitResults.flat().map(visit => ({
      ...visit,
      customer_id: String(visit.customer_id),
    }))

    const [
      nominationHistoryChunks,
      followUps,
      castTargetsResult,
      tierTargetsResult,
      shifts,
      assignmentChunks,
      eligibleCustomerStaff,
    ] = await Promise.all([
      Promise.all(idChunks.map(ids =>
        fetchAllPaginated<CastIssueNominationInput>((from, to) =>
          admin
            .from('nomination_history')
            .select('customer_id, changed_at, old_status, new_status')
            .in('customer_id', ids)
            .order('changed_at', { ascending: false })
            .range(from, to)
        )
      )),
      fetchAllPaginated<{
        customer_id: string | number
        next_actions: string[] | null
        return_visit_deadline: string | null
      }>((from, to) =>
        admin
          .from('customer_follow_ups')
          .select('customer_id, next_actions, return_visit_deadline')
          .eq('cast_id', selectedCast.id)
          .eq('is_active', true)
          .range(from, to)
      ),
      admin.from('cast_targets').select('*').eq('cast_id', selectedCast.id),
      selectedCast.cast_tier
        ? admin.from('cast_tier_targets').select('*').eq('tier', selectedCast.cast_tier)
        : Promise.resolve({ data: [], error: null }),
      fetchAllPaginated<CastIssueShiftInput>((from, to) =>
        admin
          .from('cast_shifts')
          .select('shift_date, status')
          .eq('cast_id', selectedCast.id)
          .lte('shift_date', today)
          .order('shift_date', { ascending: true })
          .range(from, to)
      ),
      Promise.all(idChunks.map(ids =>
        fetchAllPaginated<{ customer_id: string | number; staff_id: string }>((from, to) =>
          admin
            .from('customer_staff_assignments')
            .select('customer_id, staff_id')
            .in('customer_id', ids)
            .order('created_at', { ascending: true })
            .range(from, to)
        )
      )),
      getEligibleCustomerStaffOptions(),
    ])
    if (castTargetsResult.error) throw castTargetsResult.error
    if (tierTargetsResult.error) throw tierTargetsResult.error

    const normalizedHistory = nominationHistoryChunks.flat().map(row => ({
      ...row,
      customer_id: String(row.customer_id),
    }))
    const activeFollowUpIds = new Set(followUps.map(row => String(row.customer_id)))
    const followUpMetaByCustomer = new Map<string, CastIssueFollowUpMetaInput>(
      followUps.map(row => [String(row.customer_id), {
        next_actions: Array.isArray(row.next_actions) ? row.next_actions : [],
        return_visit_deadline: row.return_visit_deadline,
      }]),
    )
    const staffNameById = new Map(
      eligibleCustomerStaff.map(staff => [staff.id, staff.display_name]),
    )
    const customerStaffNamesByCustomer = new Map<string, string[]>()
    for (const row of assignmentChunks.flat()) {
      const customerId = String(row.customer_id)
      const staffName = staffNameById.get(String(row.staff_id))
      if (!staffName) continue
      const names = customerStaffNamesByCustomer.get(customerId) ?? []
      names.push(staffName)
      customerStaffNamesByCustomer.set(customerId, names)
    }
    const result = buildCastIssueVisibility({
      customers: customers.map(customer => ({ ...customer, id: String(customer.id) })),
      visits,
      nominationHistory: normalizedHistory,
      activeFollowUpCustomerIds: activeFollowUpIds,
      followUpMetaByCustomer,
      customerStaffNamesByCustomer,
      periodStart,
      periodEnd,
      today,
    })
    const target = resolveCastTargetFull(
      castTargetsResult.data ?? [],
      tierTargetsResult.data ?? [],
      selectedCast.id,
      selectedCast.cast_tier,
      targetMonth,
    )
    const monthSales = visits
      .filter(visit => (
        visit.is_planned !== true
        && visit.visit_date.startsWith(`${targetMonth}-`)
        && visit.visit_date <= periodEnd
      ))
      .reduce((sum, visit) => sum + (Number(visit.amount_spent) || 0), 0)
    const currentWorkDays = shifts.filter(shift => (
      shift.shift_date.startsWith(`${targetMonth}-`)
      && shift.shift_date <= periodEnd
      && (shift.status === '出勤' || shift.status === '来客出勤')
    )).length
    const bowzuStats = calculateCastBowzuStats({
      shifts,
      visits,
      honshimeiCustomerIds: new Set(
        customers
          .filter(customer => customer.nomination_status === '本指名')
          .map(customer => String(customer.id)),
      ),
      periodStart,
      periodEnd,
      today,
    })

    return NextResponse.json({
      period: { mode: periodMode, month: targetMonth, start: periodStart, end: periodEnd },
      casts,
      selected_cast: selectedCast,
      summary: {
        ...result.summary,
        target_sales: target.target_sales,
        month_sales: monthSales,
        sales_difference: target.target_sales - monthSales,
        sales_achievement_rate: target.target_sales > 0
          ? Math.round((monthSales / target.target_sales) * 100)
          : 0,
        target_work_days: target.target_work_days,
        current_work_days: currentWorkDays,
        ...bowzuStats,
      },
      sections: {
        recent_honshimei: result.recent_honshimei,
        overdue_honshimei: result.overdue_honshimei,
        recent_banai: result.recent_banai,
      },
    }, { headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } })
  } catch (error) {
    console.error('GET /api/admin/cast-issues error:', error)
    return errorResponse(error)
  }
}
