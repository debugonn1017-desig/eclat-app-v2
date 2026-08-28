import { diffDaysJST } from './dateUtils'

export const CAST_ISSUE_REGION_GROUPS = ['fukuoka', 'outside', 'unset'] as const
export type CastIssueRegionGroup = (typeof CAST_ISSUE_REGION_GROUPS)[number]

export type CastIssueCustomerInput = {
  id: string
  customer_name: string | null
  nickname: string | null
  nomination_status: string | null
  customer_rank: string | null
  region: string | null
}

export type CastIssueVisitInput = {
  customer_id: string
  visit_date: string
  amount_spent: number | string | null
  is_planned?: boolean | null
}

export type CastIssueNominationInput = {
  customer_id: string
  changed_at: string
  new_status: string
}

export type CastIssueCustomerBase = CastIssueCustomerInput & {
  region_group: CastIssueRegionGroup
  follow_up_active: boolean
}

export type RecentHonshimeiCustomer = CastIssueCustomerBase & {
  four_week_visits: number
  four_week_sales: number
  average_spend: number
  last_visit_date: string
  days_since_last_visit: number
}

export type OverdueHonshimeiCustomer = CastIssueCustomerBase & {
  average_cycle_days: number
  last_visit_date: string
  days_since_last_visit: number
  overdue_days: number
  total_visit_count: number
}

export type RecentBanaiCustomer = CastIssueCustomerBase & {
  acquired_date: string
  days_since_acquisition: number
}

export type CastIssueVisibilityResult = {
  recent_honshimei: RecentHonshimeiCustomer[]
  overdue_honshimei: OverdueHonshimeiCustomer[]
  recent_banai: RecentBanaiCustomer[]
  summary: {
    four_week_customer_count: number
    four_week_sales: number
    overdue_customer_count: number
    banai_acquired_count: number
  }
}

export function classifyCastIssueRegion(region: string | null | undefined): CastIssueRegionGroup {
  const normalized = typeof region === 'string' ? region.trim() : ''
  if (!normalized) return 'unset'
  return normalized === '福岡県' ? 'fukuoka' : 'outside'
}

function numericAmount(value: number | string | null): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function actualVisits(visits: CastIssueVisitInput[]): CastIssueVisitInput[] {
  return visits.filter(visit => visit.is_planned !== true && /^\d{4}-\d{2}-\d{2}$/.test(visit.visit_date))
}

export function calculateAverageVisitCycle(visits: CastIssueVisitInput[]): number | null {
  const dates = actualVisits(visits)
    .map(visit => visit.visit_date)
    .sort((a, b) => b.localeCompare(a))
  if (dates.length < 2) return null

  const intervals: number[] = []
  for (let index = 0; index < dates.length - 1; index += 1) {
    const days = diffDaysJST(dates[index], dates[index + 1])
    if (days > 0) intervals.push(days)
  }
  if (intervals.length === 0) return null
  return Math.round(intervals.reduce((sum, days) => sum + days, 0) / intervals.length)
}

function customerBase(
  customer: CastIssueCustomerInput,
  activeFollowUpIds: ReadonlySet<string>,
): CastIssueCustomerBase {
  return {
    ...customer,
    region_group: classifyCastIssueRegion(customer.region),
    follow_up_active: activeFollowUpIds.has(customer.id),
  }
}

/**
 * 「課題見える化シート」の3一覧を作る純粋関数。
 * - 直近4週間は periodStart〜today の両端を含む
 * - 周期遅れは既存顧客詳細と同じ「正の日数差の全期間平均」を使い、7日以上の遅れを対象にする
 * - 場内獲得は履歴を顧客単位で最新1件にまとめる
 */
export function buildCastIssueVisibility(args: {
  customers: CastIssueCustomerInput[]
  visits: CastIssueVisitInput[]
  nominationHistory: CastIssueNominationInput[]
  activeFollowUpCustomerIds: ReadonlySet<string>
  periodStart: string
  today: string
}): CastIssueVisibilityResult {
  const {
    customers,
    nominationHistory,
    activeFollowUpCustomerIds,
    periodStart,
    today,
  } = args
  const visits = actualVisits(args.visits)
  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  const visitsByCustomer = new Map<string, CastIssueVisitInput[]>()
  for (const visit of visits) {
    if (!customerById.has(visit.customer_id)) continue
    const rows = visitsByCustomer.get(visit.customer_id) ?? []
    rows.push(visit)
    visitsByCustomer.set(visit.customer_id, rows)
  }

  const recentHonshimei: RecentHonshimeiCustomer[] = []
  const overdueHonshimei: OverdueHonshimeiCustomer[] = []
  const recentVisitorIds = new Set<string>()
  let fourWeekSales = 0

  for (const customer of customers) {
    const customerVisits = visitsByCustomer.get(customer.id) ?? []
    const recentVisits = customerVisits.filter(visit => (
      visit.visit_date >= periodStart && visit.visit_date <= today
    ))
    if (recentVisits.length > 0) {
      recentVisitorIds.add(customer.id)
      fourWeekSales += recentVisits.reduce((sum, visit) => sum + numericAmount(visit.amount_spent), 0)
    }

    if (customer.nomination_status !== '本指名') continue
    const base = customerBase(customer, activeFollowUpCustomerIds)

    if (recentVisits.length > 0) {
      const sales = recentVisits.reduce((sum, visit) => sum + numericAmount(visit.amount_spent), 0)
      const lastVisitDate = recentVisits.reduce(
        (latest, visit) => visit.visit_date > latest ? visit.visit_date : latest,
        recentVisits[0].visit_date,
      )
      recentHonshimei.push({
        ...base,
        four_week_visits: recentVisits.length,
        four_week_sales: sales,
        average_spend: Math.round(sales / recentVisits.length),
        last_visit_date: lastVisitDate,
        days_since_last_visit: Math.max(0, diffDaysJST(today, lastVisitDate)),
      })
    }

    const averageCycleDays = calculateAverageVisitCycle(customerVisits)
    if (averageCycleDays === null || customerVisits.length === 0) continue
    const lastVisitDate = customerVisits.reduce(
      (latest, visit) => visit.visit_date > latest ? visit.visit_date : latest,
      customerVisits[0].visit_date,
    )
    const daysSinceLastVisit = Math.max(0, diffDaysJST(today, lastVisitDate))
    const overdueDays = daysSinceLastVisit - averageCycleDays
    if (overdueDays < 7) continue
    overdueHonshimei.push({
      ...base,
      average_cycle_days: averageCycleDays,
      last_visit_date: lastVisitDate,
      days_since_last_visit: daysSinceLastVisit,
      overdue_days: overdueDays,
      total_visit_count: customerVisits.length,
    })
  }

  const latestBanaiByCustomer = new Map<string, string>()
  for (const history of nominationHistory) {
    if (history.new_status !== '場内') continue
    const changedDate = history.changed_at.slice(0, 10)
    if (changedDate < periodStart || changedDate > today) continue
    if (!customerById.has(history.customer_id)) continue
    const previous = latestBanaiByCustomer.get(history.customer_id)
    if (!previous || history.changed_at > previous) {
      latestBanaiByCustomer.set(history.customer_id, history.changed_at)
    }
  }
  const recentBanai: RecentBanaiCustomer[] = []
  for (const [customerId, changedAt] of latestBanaiByCustomer) {
    const customer = customerById.get(customerId)
    if (!customer) continue
    const acquiredDate = changedAt.slice(0, 10)
    recentBanai.push({
      ...customerBase(customer, activeFollowUpCustomerIds),
      acquired_date: acquiredDate,
      days_since_acquisition: Math.max(0, diffDaysJST(today, acquiredDate)),
    })
  }

  recentHonshimei.sort((a, b) => b.last_visit_date.localeCompare(a.last_visit_date) || b.four_week_sales - a.four_week_sales)
  overdueHonshimei.sort((a, b) => b.overdue_days - a.overdue_days || a.last_visit_date.localeCompare(b.last_visit_date))
  recentBanai.sort((a, b) => b.acquired_date.localeCompare(a.acquired_date))

  return {
    recent_honshimei: recentHonshimei,
    overdue_honshimei: overdueHonshimei,
    recent_banai: recentBanai,
    summary: {
      four_week_customer_count: recentVisitorIds.size,
      four_week_sales: fourWeekSales,
      overdue_customer_count: overdueHonshimei.length,
      banai_acquired_count: recentBanai.length,
    },
  }
}
