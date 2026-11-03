import { NextResponse } from 'next/server'
import { StarLogError, starCustomerId, starLogSession } from '@/lib/starLogServer'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { GOAL_COLUMNS, type CustomerMonthlyGoal } from '@/lib/starCustomerGoals'
import type { CustomerGoalHistoryData } from '@/lib/customerGoalHistory'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
type HistoryCast = { id: string; cast_name: string | null; display_name: string | null; is_active: boolean }

/** 通常の目標・実績とは別に、現在の有効担当以外が保存した月別目標を管理者だけが読む。 */
export async function GET(request: Request) {
  try {
    const { client, profile } = await starLogSession()
    if (!profile.is_active) throw new StarLogError('ログインしてください', 401)
    if (profile.role !== 'admin') throw new StarLogError('目標履歴はスタッフ・管理者専用です', 403)
    const customerId = String(starCustomerId(new URL(request.url).searchParams.get('customerId') || ''))
    const { data: customer, error } = await client.from('customers').select('id,cast_name').eq('id', Number(customerId)).maybeSingle()
    if (error) throw error
    if (!customer) throw new StarLogError('お客様を表示できません', 404)
    // 担当名が重複する場合も現在候補を履歴へ混ぜない。未割当なら保存済みの全担当を履歴とする。
    const current = customer.cast_name ? await fetchAllPaginated<{ id: string }>((from, to) => client.from('profiles')
      .select('id').eq('cast_name', customer.cast_name).eq('role', 'cast').eq('is_active', true).order('id').range(from, to)) : []
    if (current.length >= 100000) throw new Error('limit')
    const currentIds = new Set(current.map(cast => cast.id))
    const saved = await fetchAllPaginated<CustomerMonthlyGoal>((from, to) => client.from('customer_monthly_goals')
      .select(GOAL_COLUMNS).eq('customer_id', Number(customerId)).order('month', { ascending: false }).order('cast_id').range(from, to))
    if (saved.length >= 100000) throw new Error('limit')
    const historical = saved.filter(goal => !currentIds.has(goal.cast_id))
    const castIds = [...new Set(historical.map(goal => goal.cast_id))], casts: HistoryCast[] = []
    for (let index = 0; index < castIds.length; index += 200) {
      const batch = await fetchAllPaginated<HistoryCast>((from, to) => client.from('profiles')
        .select('id,cast_name,display_name,is_active').in('id', castIds.slice(index, index + 200)).eq('role', 'cast').order('id').range(from, to))
      if (batch.length >= 100000) throw new Error('limit')
      casts.push(...batch)
    }
    const byId = new Map(casts.map(cast => [cast.id, cast]))
    if (historical.some(goal => !byId.has(goal.cast_id))) throw new Error('履歴の担当情報を取得できませんでした')
    const data: CustomerGoalHistoryData = { customerId, items: historical.map(goal => {
      const cast = byId.get(goal.cast_id)!
      return { castId: goal.cast_id, castName: cast.display_name || cast.cast_name || '担当名未設定', castActive: cast.is_active,
        month: goal.month, targetSales: goal.target_sales, targetVisits: goal.target_visits, note: goal.note, updatedAt: goal.updated_at }
    }) }
    return NextResponse.json(data, { headers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof StarLogError ? error.message : '旧担当の目標履歴を取得できませんでした。再取得してください' }, { status: error instanceof StarLogError ? error.status : 503, headers })
  }
}
