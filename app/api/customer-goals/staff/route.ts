import { NextResponse } from 'next/server'
import { starLogSession, StarLogError } from '@/lib/starLogServer'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { todayJST } from '@/lib/dateUtils'
import { GOAL_COLUMNS, validGoalMonth, goalMonthBounds, aggregateGoalVisits, type CustomerMonthlyGoal, type GoalVisit, type StaffCustomerGoalData, type StaffCustomerGoalItem } from '@/lib/starCustomerGoals'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
type CustomerRow = { id: number; cast_name: string | null }
type CastRow = { id: string; cast_name: string }

/** 表示中の顧客だけを一括取得する。担当が違う過去目標を顧客IDだけで結合しない。 */
export async function GET(request: Request) {
  try {
    const { client, profile, canEdit } = await starLogSession()
    if (profile.role !== 'admin') throw new StarLogError('スタッフ専用の一覧です', 403)
    const params = new URL(request.url).searchParams
    const month = params.get('month')
    if (!validGoalMonth(month)) throw new StarLogError('対象月が不正です', 400)
    const raw = params.get('customerIds')?.split(',') || []
    if (!raw.length || raw.length > 200 || raw.some(id => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) throw new StarLogError('お客様IDは1〜200件で指定してください', 400)
    const customerIds = [...new Set(raw)]
    const customers = await fetchAllPaginated<CustomerRow>((from, to) => client.from('customers')
      .select('id,cast_name').in('id', customerIds.map(Number)).eq('is_starred', true).order('id').range(from, to))
    const names = [...new Set(customers.map(c => c.cast_name).filter((name): name is string => !!name))]
    const casts = names.length ? await fetchAllPaginated<CastRow>((from, to) => client.from('profiles')
      .select('id,cast_name').in('cast_name', names).eq('role', 'cast').eq('is_active', true).order('id').range(from, to)) : []
    if (casts.length >= 100000) throw new Error('limit')
    const byName = new Map<string, CastRow[]>()
    for (const cast of casts) byName.set(cast.cast_name, [...(byName.get(cast.cast_name) || []), cast])
    const byId = new Map(customers.map(c => [String(c.id), c]))
    const items: Record<string, StaffCustomerGoalItem> = Object.fromEntries(customerIds.map(customerId => {
      const customer = byId.get(customerId), matches = customer?.cast_name ? byName.get(customer.cast_name) || [] : []
      return [customerId, { customerId, castId: matches.length === 1 ? matches[0].id : null, castName: customer?.cast_name || null,
        status: !customer || matches.length > 1 ? 'unavailable' : matches.length === 0 ? 'unassigned' : 'ready', goal: null, actual: null }]
    }))
    const resolvedIds = customerIds.filter(id => items[id].status === 'ready')
    if (resolvedIds.length) {
      const castIds = [...new Set(resolvedIds.map(id => items[id].castId!))]
      const goals = await fetchAllPaginated<CustomerMonthlyGoal>((from, to) => client.from('customer_monthly_goals')
        .select(GOAL_COLUMNS).in('customer_id', resolvedIds.map(Number)).in('cast_id', castIds)
        .eq('month', month + '-01').order('customer_id').order('cast_id').range(from, to))
      const { start, end } = goalMonthBounds(month), today = todayJST()
      const visits = await fetchAllPaginated<GoalVisit>((from, to) => client.from('customer_visits')
        .select('customer_id,visit_date,amount_spent,is_planned').in('customer_id', resolvedIds.map(Number))
        .gte('visit_date', start).lt('visit_date', end).lte('visit_date', today)
        .or('is_planned.is.null,is_planned.eq.false').order('id').range(from, to))
      if (goals.length >= 100000 || visits.length >= 100000) throw new Error('limit')
      const actuals = aggregateGoalVisits(resolvedIds, visits, month, today)
      for (const id of resolvedIds) items[id].actual = actuals[id]
      for (const goal of goals) {
        const item = items[String(goal.customer_id)]
        if (item?.status === 'ready' && item.castId === goal.cast_id && goal.month === month + '-01') item.goal = goal
      }
    }
    const data: StaffCustomerGoalData = { month, customerIds, canEdit, items }
    return NextResponse.json(data, { headers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof StarLogError ? error.message : '月別目標・実績を取得できませんでした。再取得してください' }, { status: error instanceof StarLogError ? error.status : 503, headers })
  }
}
