import { NextResponse } from 'next/server'
import { starLogSession, StarLogError } from '@/lib/starLogServer'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { todayJST } from '@/lib/dateUtils'
import { GOAL_COLUMNS, GOAL_UUID, validGoalMonth, goalMonthBounds, validateCustomerGoal, aggregateGoalVisits, type CustomerGoalInput, type CustomerMonthlyGoal, type GoalVisit } from '@/lib/starCustomerGoals'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
async function session(castId: string, write = false) {
  if (!GOAL_UUID.test(castId)) throw new StarLogError('キャストが不正です', 400)
  const auth = await starLogSession(write)
  if (auth.profile.role === 'cast' && auth.profile.id !== castId) throw new StarLogError('担当の範囲外です', 403)
  const { data: cast, error } = await auth.client.from('profiles').select('id,cast_name,role,is_active').eq('id', castId).maybeSingle()
  if (error) throw error
  if (!cast || cast.role !== 'cast' || !cast.cast_name || !cast.is_active) throw new StarLogError('キャストを表示できません', 404)
  return { ...auth, cast }
}
function failure(error: unknown) {
  const status = error instanceof StarLogError ? error.status : 503
  const message = error instanceof StarLogError ? error.message : '月別目標・実績を取得または保存できませんでした。再取得してください'
  return NextResponse.json({ error: message }, { status, headers })
}
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams, castId = p.get('castId') || '', month = p.get('month')
    if (!validGoalMonth(month)) throw new StarLogError('対象月が不正です', 400)
    const { client, cast, canEdit } = await session(castId)
    const ids = (await fetchAllPaginated<{ id: number }>((from, to) => client.from('customers').select('id').eq('cast_name', cast.cast_name).eq('is_starred', true).order('id').range(from, to))).map(c => String(c.id))
    if (ids.length >= 100000) throw new Error('limit')
    const goals: CustomerMonthlyGoal[] = []
    const { start, end } = goalMonthBounds(month), today = todayJST()
    const visits: GoalVisit[] = []
    // 200件ごとのID指定と1000行ずつのページング。失敗を0件として扱わない。
    for (let index = 0; index < ids.length; index += 200) {
      const customerIds = ids.slice(index, index + 200)
      // 保存済みの過去行は消さず、通常一覧には現在の⭐️・担当ペアだけを返す。
      const currentGoals = await fetchAllPaginated<CustomerMonthlyGoal>((from, to) => client.from('customer_monthly_goals')
        .select(GOAL_COLUMNS).eq('cast_id', castId).eq('month', month + '-01').in('customer_id', customerIds).order('customer_id').range(from, to))
      if (currentGoals.length >= 100000) throw new Error('limit')
      goals.push(...currentGoals)
      const batch = await fetchAllPaginated<GoalVisit>((from, to) => client.from('customer_visits')
        .select('customer_id,visit_date,amount_spent,is_planned').in('customer_id', customerIds)
        .gte('visit_date', start).lt('visit_date', end).lte('visit_date', today)
        .or('is_planned.is.null,is_planned.eq.false').order('id').range(from, to))
      if (batch.length >= 100000) throw new Error('limit')
      visits.push(...batch)
    }
    return NextResponse.json({ castId, month, goals, actuals: aggregateGoalVisits(ids, visits, month, today), customerIds: ids, canEdit }, { headers })
  } catch (error) { return failure(error) }
}
export async function PUT(request: Request) {
  try {
    let body: unknown
    try { body = await request.json() } catch { throw new StarLogError('入力の形式が不正です', 400) }
    const invalid = validateCustomerGoal(body)
    if (invalid) throw new StarLogError(invalid, 400)
    const b = body as CustomerGoalInput
    const { client, cast } = await session(b.castId, true)
    const { data: customer, error } = await client.from('customers').select('id,is_starred').eq('id', Number(b.customerId)).eq('cast_name', cast.cast_name).maybeSingle()
    if (error) throw error
    if (!customer) throw new StarLogError('担当が変更されたか、お客様を編集できません', 403)
    if (!customer.is_starred) throw new StarLogError('⭐️が解除されています。入力を控えて一覧を更新してください', 409)
    const fields = { target_sales: b.targetSales, target_visits: b.targetVisits, note: b.note.trim() }
    const result = b.expectedRevision === 0
      ? await client.from('customer_monthly_goals').insert({ cast_id: b.castId, customer_id: Number(b.customerId), month: b.month + '-01', ...fields }).select(GOAL_COLUMNS).maybeSingle()
      : await client.from('customer_monthly_goals').update(fields).eq('cast_id', b.castId).eq('customer_id', Number(b.customerId)).eq('month', b.month + '-01').eq('revision', b.expectedRevision).select(GOAL_COLUMNS).maybeSingle()
    if (result.error) {
      if (result.error.code === '23505') throw new StarLogError('別の人が目標を保存しました。入力を控えて最新の内容を読み直してください', 409)
      if (result.error.code === '42501') throw new StarLogError('目標を編集できません。権限・担当・⭐️の状態を確認してください', 403)
      throw result.error
    }
    if (!result.data) throw new StarLogError('目標が変更されています。入力を控えて最新の内容を読み直してください', 409)
    return NextResponse.json({ goal: result.data }, { headers })
  } catch (error) { return failure(error) }
}
