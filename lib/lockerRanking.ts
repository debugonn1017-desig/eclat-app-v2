import { businessDateJST, getMonthEndDateJST } from './dateUtils'
import { getMonthlyNominationMetrics } from './castPerformance'
import { calculateCastBowzuStats, type CastIssueVisitInput } from './castIssueVisibility'

export type LockerRankingRow = {
  castId: string
  castName: string
  rank: number
  sales: number
  honshimei: number
  banai: number
  douhan: number
  bowzuDays: number
  bowzuStreak: number
}
export type LockerBowzuCard = { castId: string; castName: string; streak: number }
export type LockerRankingData = {
  month: string
  periodStart: string
  periodEnd: string
  businessDate: string
  previousBusinessDate: string
  rows: LockerRankingRow[]
  previousDayBowzu: LockerBowzuCard[]
}
export type LockerRankingPeriod = Pick<LockerRankingData, 'month' | 'periodStart' | 'periodEnd' | 'businessDate' | 'previousBusinessDate'>
export type LockerRankingCast = { id: string; cast_name: string | null; display_name: string | null; cast_tier: string | null }
export type LockerRankingCustomer = { id: string | number; cast_name: string | null; nomination_status: string | null; first_visit_date: string | null }
export type LockerRankingVisit = Omit<CastIssueVisitInput, 'customer_id'> & { customer_id: string | number; has_douhan?: boolean | null }
export type LockerRankingExtension = { cast_id: string; sale_date: string; amount_spent: number | string | null }
export type LockerRankingShift = { cast_id: string; shift_date: string; status: string }

export function lockerRankingPeriod(month: string | null | undefined, now: Date = new Date()): LockerRankingPeriod {
  const businessDate = businessDateJST(now), currentMonth = businessDate.slice(0, 7)
  const selected = month ?? currentMonth
  if (!/^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(selected) || selected > currentMonth) throw new Error('対象月を正しく指定してください')
  const previous = new Date(businessDate + 'T00:00:00Z')
  previous.setUTCDate(previous.getUTCDate() - 1)
  return { month: selected, periodStart: selected + '-01', periodEnd: selected === currentMonth ? businessDate : getMonthEndDateJST(selected), businessDate, previousBusinessDate: previous.toISOString().slice(0, 10) }
}

function money(value: number | string | null): number {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) throw new Error('売上の値を確認できませんでした')
  return number
}
const inPeriod = (date: string, period: LockerRankingPeriod) => date >= period.periodStart && date <= period.periodEnd
const compareName = (a: { castName: string; castId: string }, b: { castName: string; castId: string }) => a.castName.localeCompare(b.castName, 'ja') || a.castId.localeCompare(b.castId)
const PREVIOUS_DAY_EXCLUDED_TIERS = new Set(['新人', '新人層', 'C', 'C層'])

/** 全在籍の集計のみを返す。顧客情報・層は内部計算からレスポンスへ持ち出さない。 */
export function buildLockerRanking(args: {
  period: LockerRankingPeriod
  casts: readonly LockerRankingCast[]
  customers: readonly LockerRankingCustomer[]
  visits: readonly LockerRankingVisit[]
  extensionSales: readonly LockerRankingExtension[]
  shifts: readonly LockerRankingShift[]
}): LockerRankingData {
  const period = args.period, castByName = new Map<string, LockerRankingCast>(), normalizedNames = new Set<string>()
  const castIds = new Set<string>()
  for (const cast of args.casts) {
    if (castIds.has(cast.id)) throw new Error('キャストが重複しています')
    castIds.add(cast.id)
    const name = cast.cast_name?.trim()
    if (!name) continue
    if (normalizedNames.has(name)) throw new Error('同名の担当キャストを確認してください')
    normalizedNames.add(name)
    castByName.set(cast.cast_name!, cast)
  }
  const customerById = new Map<string, LockerRankingCustomer>(), customersByCast = new Map<string, LockerRankingCustomer[]>()
  for (const customer of args.customers) {
    const name = customer.cast_name, cast = name?.trim() ? castByName.get(name) : undefined
    if (!cast) continue
    const id = String(customer.id)
    if (customerById.has(id)) throw new Error('お客様が重複しています')
    customerById.set(id, customer)
    const group = customersByCast.get(cast.id) || []
    group.push(customer); customersByCast.set(cast.id, group)
  }
  const visitsByCast = new Map<string, CastIssueVisitInput[]>()
  const douhanByCast = new Map<string, number>(), extensionsByCast = new Map<string, number>()
  for (const visit of args.visits) {
    if (visit.is_planned === true || visit.visit_date > period.businessDate) continue
    const customer = customerById.get(String(visit.customer_id)), cast = customer?.cast_name?.trim() ? castByName.get(customer.cast_name) : undefined
    if (!cast) continue
    money(visit.amount_spent)
    const group = visitsByCast.get(cast.id) || []
    group.push({ ...visit, customer_id: String(visit.customer_id) }); visitsByCast.set(cast.id, group)
    if (inPeriod(visit.visit_date, period) && visit.has_douhan === true) douhanByCast.set(cast.id, (douhanByCast.get(cast.id) || 0) + 1)
  }
  for (const extension of args.extensionSales) {
    if (!castIds.has(extension.cast_id) || extension.sale_date > period.businessDate || !inPeriod(extension.sale_date, period)) continue
    extensionsByCast.set(extension.cast_id, (extensionsByCast.get(extension.cast_id) || 0) + money(extension.amount_spent))
  }
  const shiftsByCast = new Map<string, LockerRankingShift[]>()
  for (const shift of args.shifts) {
    if (castIds.has(shift.cast_id) && shift.shift_date <= period.businessDate) {
      const group = shiftsByCast.get(shift.cast_id) || []
      group.push(shift); shiftsByCast.set(shift.cast_id, group)
    }
  }
  const previousDayBowzu: LockerBowzuCard[] = []
  const rows: LockerRankingRow[] = args.casts.map(cast => {
    const castName = cast.display_name?.trim() || cast.cast_name?.trim() || '名前未設定'
    const customers = customersByCast.get(cast.id) || [], allVisits = visitsByCast.get(cast.id) || []
    const visits = allVisits.filter(visit => inPeriod(visit.visit_date, period))
    const metrics = getMonthlyNominationMetrics(customers, visits)
    const visitedIds = new Set(visits.map(visit => String(visit.customer_id)))
    const firstBanai = customers.filter(customer => customer.nomination_status === '場内' && customer.first_visit_date && inPeriod(customer.first_visit_date, period) && !visitedIds.has(String(customer.id))).length
    const sales = visits.reduce((sum, visit) => sum + money(visit.amount_spent), extensionsByCast.get(cast.id) || 0)
    if (!Number.isSafeInteger(sales)) throw new Error('売上の合計を確認できませんでした')
    const shifts = shiftsByCast.get(cast.id) || []
    const honshimeiCustomerIds = new Set(customers.filter(customer => customer.nomination_status === '本指名').map(customer => String(customer.id)))
    const bowzu = calculateCastBowzuStats({ shifts, visits: allVisits, honshimeiCustomerIds, periodStart: period.periodStart, periodEnd: period.periodEnd, today: period.businessDate })
    const previous = calculateCastBowzuStats({ shifts, visits: allVisits, honshimeiCustomerIds, periodStart: period.previousBusinessDate, periodEnd: period.previousBusinessDate, today: period.businessDate })
    if (!PREVIOUS_DAY_EXCLUDED_TIERS.has(cast.cast_tier?.trim() || '') && previous.period_work_days > 0 && previous.period_bowzu_days > 0) previousDayBowzu.push({ castId: cast.id, castName, streak: previous.current_bowzu_streak })
    return { castId: cast.id, castName, rank: 0, sales, honshimei: metrics.honshimeiVisits, banai: metrics.banaiVisits + firstBanai, douhan: douhanByCast.get(cast.id) || 0, bowzuDays: bowzu.period_bowzu_days, bowzuStreak: bowzu.current_bowzu_streak }
  }).sort((a, b) => b.sales - a.sales || a.castId.localeCompare(b.castId))
  rows.forEach((row, index) => { row.rank = index + 1 })
  previousDayBowzu.sort((a, b) => b.streak - a.streak || compareName(a, b))
  return { ...period, rows, previousDayBowzu }
}
