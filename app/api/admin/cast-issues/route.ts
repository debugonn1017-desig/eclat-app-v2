import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { daysAgoJST, getMonthEndDateJST, thisMonthJST, todayJST } from '@/lib/dateUtils'
import { resolveCastTargetFull } from '@/lib/targetResolver'
import { getEligibleCustomerStaffOptions } from '@/lib/customerStaffServer'
import {
  buildCastIssueVisibility,
  type CastIssueCustomerInput,
  type CastIssueFollowUpMetaInput,
  type CastIssueNominationInput,
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
    const requestedCastId = new URL(request.url).searchParams.get('castId')

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
    const periodStart = daysAgoJST(27)
    const month = thisMonthJST()
    if (!selectedCast) {
      return NextResponse.json({
        period: { start: periodStart, end: today },
        casts,
        selected_cast: null,
        summary: {
          four_week_customer_count: 0,
          four_week_sales: 0,
          overdue_customer_count: 0,
          banai_acquired_count: 0,
          target_sales: 0,
          target_work_days: 0,
          current_work_days: 0,
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
          .select('id, customer_id, visit_date, visit_time, amount_spent, is_planned, companion_honshimei, companion_banai')
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
      nominationHistory,
      followUps,
      castTargetsResult,
      tierTargetsResult,
      shifts,
      assignmentChunks,
      eligibleCustomerStaff,
    ] = await Promise.all([
      fetchAllPaginated<CastIssueNominationInput>((from, to) =>
        admin
          .from('nomination_history')
          .select('customer_id, changed_at, new_status')
          .eq('cast_id', selectedCast.id)
          .eq('new_status', '場内')
          .gte('changed_at', `${periodStart}T00:00:00+09:00`)
          .lte('changed_at', `${today}T23:59:59+09:00`)
          .order('changed_at', { ascending: false })
          .range(from, to)
      ),
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
      fetchAllPaginated<{ status: string }>((from, to) =>
        admin
          .from('cast_shifts')
          .select('status')
          .eq('cast_id', selectedCast.id)
          .gte('shift_date', `${month}-01`)
          .lte('shift_date', getMonthEndDateJST(month))
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

    const normalizedHistory = nominationHistory.map(row => ({
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
      today,
    })
    const target = resolveCastTargetFull(
      castTargetsResult.data ?? [],
      tierTargetsResult.data ?? [],
      selectedCast.id,
      selectedCast.cast_tier,
      month,
    )
    const currentWorkDays = shifts.filter(shift => (
      shift.status === '出勤' || shift.status === '来客出勤'
    )).length

    return NextResponse.json({
      period: { start: periodStart, end: today },
      casts,
      selected_cast: selectedCast,
      summary: {
        ...result.summary,
        target_sales: target.target_sales,
        target_work_days: target.target_work_days,
        current_work_days: currentWorkDays,
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
