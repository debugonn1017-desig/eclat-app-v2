import type { Customer } from '@/types'

export type CustomerMonthlyGoal = {
  cast_id: string; customer_id: number; month: string
  target_sales: number | null; target_visits: number | null; note: string
  revision: number; updated_at: string
}
export type CustomerGoalActual = { sales: number; visits: number }
export type CustomerGoalData = {
  castId: string; month: string; goals: CustomerMonthlyGoal[]
  actuals: Record<string, CustomerGoalActual>; customerIds: string[]; canEdit: boolean
}
export type CustomerGoalInput = {
  castId: string; customerId: string; month: string; targetSales: number | null
  targetVisits: number | null; note: string; expectedRevision: number
}
export const GOAL_CATEGORIES = ['県内顧客', '県外顧客', '県内場内', '県外場内', 'その他・地域未設定', '切れたお客様'] as const
export type GoalCategory = typeof GOAL_CATEGORIES[number]
export const GOAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const GOAL_COLUMNS = 'cast_id,customer_id,month,target_sales,target_visits,note,revision,updated_at'

export function validGoalMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(value)
}
export function goalMonthBounds(month: string) {
  if (!validGoalMonth(month)) throw new Error('対象月が不正です')
  const [year, m] = month.split('-').map(Number)
  return { start: month + '-01', end: new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10) }
}
export function validateCustomerGoal(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '目標の形式が不正です'
  const b = value as Record<string, unknown>
  const fields = ['castId', 'customerId', 'month', 'targetSales', 'targetVisits', 'note', 'expectedRevision']
  if (Object.keys(b).some(k => !fields.includes(k))) return '目標以外の項目は保存できません'
  if (typeof b.castId !== 'string' || !GOAL_UUID.test(b.castId)) return 'キャストが不正です'
  if (typeof b.customerId !== 'string' || !/^[1-9]\d*$/.test(b.customerId) || !Number.isSafeInteger(Number(b.customerId))) return 'お客様が不正です'
  if (!validGoalMonth(b.month)) return '対象月を選んでください'
  for (const [field, maximum] of [['targetSales', 99999999], ['targetVisits', 999]] as const) {
    const n = b[field]
    if (n !== null && (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || n > maximum)) return field === 'targetSales' ? '目標売上は0〜99,999,999円の整数で入力してください' : '目標来店回数は0〜999回の整数で入力してください'
  }
  if (typeof b.note !== 'string' || b.note.length > 2000) return '備考は2000文字以内で入力してください'
  if (typeof b.expectedRevision !== 'number' || !Number.isSafeInteger(b.expectedRevision) || b.expectedRevision < 0 || b.expectedRevision > 2147483646) return '目標を読み直してください'
  return null
}
/** 顧客KPIの定義とは独立した、⭐️目標一覧の指名×地域分類。ランクCも欠落させない。 */
export function customerGoalCategory(c: Pick<Customer, 'customer_rank' | 'nomination_status' | 'region'>): GoalCategory {
  if (c.customer_rank === '切れた') return '切れたお客様'
  if (c.nomination_status === '場内') return c.region === '福岡県' ? '県内場内' : '県外場内'
  if (c.nomination_status !== '本指名' || !c.region) return 'その他・地域未設定'
  return c.region === '福岡県' ? '県内顧客' : '県外顧客'
}
export function goalDifference(target: number | null | undefined, actual: number) {
  if (target == null) return { remaining: null, exceeded: 0, achieved: false }
  return { remaining: Math.max(0, target - actual), exceeded: Math.max(0, actual - target), achieved: actual >= target }
}
export function sumCustomerGoals(ids: readonly string[], goals: ReadonlyMap<string, CustomerMonthlyGoal>, actuals: Record<string, CustomerGoalActual>) {
  return [...new Set(ids)].reduce((sum, id) => {
    const g = goals.get(id), a = actuals[id]
    sum.targetSales += g?.target_sales ?? 0; sum.targetVisits += g?.target_visits ?? 0
    sum.sales += a?.sales ?? 0; sum.visits += a?.visits ?? 0
    if (g?.target_sales == null || g?.target_visits == null) sum.unset++
    return sum
  }, { targetSales: 0, targetVisits: 0, sales: 0, visits: 0, unset: 0 })
}
export type GoalVisit = { customer_id: string | number; visit_date: string; amount_spent: number | string | null; is_planned: boolean | null }
export function aggregateGoalVisits(ids: readonly string[], visits: readonly GoalVisit[], month: string, today: string): Record<string, CustomerGoalActual> {
  const { start, end } = goalMonthBounds(month)
  const result = Object.fromEntries(ids.map(id => [id, { sales: 0, visits: 0 }])) as Record<string, CustomerGoalActual>
  for (const v of visits) {
    const id = String(v.customer_id), date = v.visit_date.slice(0, 10)
    if (!Object.hasOwn(result, id) || v.is_planned === true || date < start || date >= end || date > today) continue
    const amount = Number(v.amount_spent ?? 0)
    if (!Number.isFinite(amount)) throw new Error('来店金額の形式を確認してください')
    result[id].sales += amount; result[id].visits++
  }
  return result
}

export type GoalReportRow = {
  id: string; name: string; region: string; occupation: string; category: GoalCategory
  targetSales: number | null; targetVisits: number | null; sales: number; visits: number
  note: string; lastVisit: string | null; checked: boolean | null; checkedBy: string | null
}
export type GoalReport = { castName: string; month: string; today: string; rows: GoalReportRow[] }
