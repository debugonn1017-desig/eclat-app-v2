import { toJSTDateString } from './dateUtils'
import {
  calculateCastBowzuStats,
  type CastIssueShiftInput,
  type CastIssueVisitInput,
} from './castIssueVisibility'

export type CastIssueMonthlyCastInput = {
  id: string
  cast_name: string | null
  display_name: string | null
  cast_tier: string | null
  created_at: string
  target_sales: number
  target_work_days: number
}

export type CastIssueMonthlyCustomerInput = {
  id: string
  cast_name: string | null
  nomination_status: string | null
}

export type CastIssueMonthlyVisitInput = CastIssueVisitInput

export type CastIssueMonthlyHistoryInput = {
  id?: string | number
  cast_id: string
  changed_at: string
  new_status: string
}

export type CastIssueMonthlyExtensionInput = {
  id?: string | number
  cast_id: string
  sale_date: string
  amount_spent: number | string | null
}

export type CastIssueMonthlyFreeSeatingInput = {
  id?: string | number
  cast_id: string
  business_date: string
  seating_count: number | string | null
}

export type CastIssueMonthlyShiftInput = CastIssueShiftInput & {
  cast_id: string
}

export type CastIssueMonthlyRow = {
  cast_id: string
  cast_name: string
  cast_tier: string | null
  created_at: string
  sales: number
  target_sales: number
  achievement_rate: number
  honshimei_count: number
  banai_count: number
  free_seating_count: number
  bowzu_days: number
  bowzu_work_days: number
  current_bowzu_streak: number
  work_days: number
  target_work_days: number
  remaining_work_days: number
}

export type CastIssueMonthlyResult = {
  rows: CastIssueMonthlyRow[]
  summary: {
    sales: number
    target_sales: number
    achievement_rate: number
    honshimei_count: number
    banai_count: number
    free_seating_count: number
    bowzu_days: number
    work_days: number
    target_work_days: number
    remaining_work_days: number
  }
}

function amount(value: number | string | null): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function inPeriod(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

/**
 * 課題見える化シートの「月間一覧」を全キャスト分まとめて作る。
 *
 * - 売上は顧客の実来店売上 + 場内延長売上
 * - 本指名本数は来店時点スナップショットを優先し、旧行だけ現在値で補完
 * - 場内本数は対象月に new_status='場内' となった履歴件数
 * - ボウズは既存のキャスト別画面と同じ純粋関数で計算
 */
export function buildCastIssueMonthly(args: {
  casts: CastIssueMonthlyCastInput[]
  customers: CastIssueMonthlyCustomerInput[]
  visits: CastIssueMonthlyVisitInput[]
  nominationHistory: CastIssueMonthlyHistoryInput[]
  extensionSales: CastIssueMonthlyExtensionInput[]
  freeSeatings: CastIssueMonthlyFreeSeatingInput[]
  shifts: CastIssueMonthlyShiftInput[]
  periodStart: string
  periodEnd: string
  today: string
}): CastIssueMonthlyResult {
  const customerById = new Map(args.customers.map(customer => [customer.id, customer]))
  const customerIdsByCastName = new Map<string, Set<string>>()
  for (const customer of args.customers) {
    const castName = customer.cast_name?.trim()
    if (!castName) continue
    const ids = customerIdsByCastName.get(castName) ?? new Set<string>()
    ids.add(customer.id)
    customerIdsByCastName.set(castName, ids)
  }

  const actualVisits = args.visits.filter(visit => (
    visit.is_planned !== true
    && /^\d{4}-\d{2}-\d{2}$/.test(visit.visit_date)
    && visit.visit_date <= args.periodEnd
  ))
  const visitsByCustomer = new Map<string, CastIssueMonthlyVisitInput[]>()
  for (const visit of actualVisits) {
    const customerId = String(visit.customer_id)
    if (!customerById.has(customerId)) continue
    const rows = visitsByCustomer.get(customerId) ?? []
    rows.push({ ...visit, customer_id: customerId })
    visitsByCustomer.set(customerId, rows)
  }

  const rows = args.casts.map(cast => {
    const castName = cast.cast_name?.trim() || cast.display_name?.trim() || '名前未設定'
    const customerIds = customerIdsByCastName.get(cast.cast_name?.trim() ?? '') ?? new Set<string>()
    const visits: CastIssueMonthlyVisitInput[] = []
    for (const customerId of customerIds) {
      visits.push(...(visitsByCustomer.get(customerId) ?? []))
    }
    const periodVisits = visits.filter(visit => inPeriod(visit.visit_date, args.periodStart, args.periodEnd))
    const customerSales = periodVisits.reduce((sum, visit) => sum + amount(visit.amount_spent), 0)
    const extensionSales = args.extensionSales
      .filter(item => item.cast_id === cast.id && inPeriod(item.sale_date, args.periodStart, args.periodEnd))
      .reduce((sum, item) => sum + amount(item.amount_spent), 0)
    const honshimeiCount = periodVisits.filter(visit => {
      if (visit.nomination_status_at_visit != null) {
        return visit.nomination_status_at_visit === '本指名'
      }
      return customerById.get(String(visit.customer_id))?.nomination_status === '本指名'
    }).length
    const banaiCount = args.nominationHistory.filter(history => (
      history.cast_id === cast.id
      && history.new_status === '場内'
      && inPeriod(toJSTDateString(new Date(history.changed_at)), args.periodStart, args.periodEnd)
    )).length
    const freeSeatingCount = args.freeSeatings
      .filter(item => item.cast_id === cast.id && inPeriod(item.business_date, args.periodStart, args.periodEnd))
      .reduce((sum, item) => sum + amount(item.seating_count), 0)
    const castShifts = args.shifts
      .filter(shift => shift.cast_id === cast.id)
      .map(({ shift_date, status }) => ({ shift_date, status }))
    const workDays = castShifts.filter(shift => (
      inPeriod(shift.shift_date, args.periodStart, args.periodEnd)
      && (shift.status === '出勤' || shift.status === '来客出勤')
    )).length
    const bowzu = calculateCastBowzuStats({
      shifts: castShifts,
      visits,
      honshimeiCustomerIds: new Set(
        [...customerIds].filter(customerId => customerById.get(customerId)?.nomination_status === '本指名'),
      ),
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      today: args.today,
    })
    const sales = customerSales + extensionSales
    const targetSales = Math.max(0, amount(cast.target_sales))
    const targetWorkDays = Math.max(0, Math.round(amount(cast.target_work_days)))

    return {
      cast_id: cast.id,
      cast_name: castName,
      cast_tier: cast.cast_tier,
      created_at: cast.created_at,
      sales,
      target_sales: targetSales,
      achievement_rate: targetSales > 0 ? Math.round((sales / targetSales) * 100) : 0,
      honshimei_count: honshimeiCount,
      banai_count: banaiCount,
      free_seating_count: freeSeatingCount,
      bowzu_days: bowzu.period_bowzu_days,
      bowzu_work_days: bowzu.period_work_days,
      current_bowzu_streak: bowzu.current_bowzu_streak,
      work_days: workDays,
      target_work_days: targetWorkDays,
      remaining_work_days: Math.max(0, targetWorkDays - workDays),
    }
  })

  const summary = rows.reduce<CastIssueMonthlyResult['summary']>((total, row) => ({
    sales: total.sales + row.sales,
    target_sales: total.target_sales + row.target_sales,
    achievement_rate: 0,
    honshimei_count: total.honshimei_count + row.honshimei_count,
    banai_count: total.banai_count + row.banai_count,
    free_seating_count: total.free_seating_count + row.free_seating_count,
    bowzu_days: total.bowzu_days + row.bowzu_days,
    work_days: total.work_days + row.work_days,
    target_work_days: total.target_work_days + row.target_work_days,
    remaining_work_days: total.remaining_work_days + row.remaining_work_days,
  }), {
    sales: 0,
    target_sales: 0,
    achievement_rate: 0,
    honshimei_count: 0,
    banai_count: 0,
    free_seating_count: 0,
    bowzu_days: 0,
    work_days: 0,
    target_work_days: 0,
    remaining_work_days: 0,
  })
  summary.achievement_rate = summary.target_sales > 0
    ? Math.round((summary.sales / summary.target_sales) * 100)
    : 0

  return { rows, summary }
}
