import { diffDaysJST, toJSTDateString } from './dateUtils'
import {
  buildCustomerVisitPatterns,
  type CustomerVisitPattern,
} from './customerVisitPattern'

export const CAST_ISSUE_REGION_GROUPS = ['fukuoka', 'outside', 'unset'] as const
export type CastIssueRegionGroup = (typeof CAST_ISSUE_REGION_GROUPS)[number]

export const CAST_ISSUE_LOCAL_CUSTOMER_GOAL = 15
export const CAST_ISSUE_VISITS_PER_CUSTOMER_GOAL = 3
export const CAST_ISSUE_TARGET_VISIT_COUNT = 45

export type CastIssueCustomerInput = {
  id: string
  customer_name: string | null
  nickname: string | null
  nomination_status: string | null
  customer_rank: string | null
  region: string | null
  age_group?: string | null
  last_contact_date?: string | null
  has_customer_staff?: boolean | null
}

export type CastIssueVisitInput = {
  id?: string | number | null
  customer_id: string
  visit_date: string
  visit_time?: string | null
  amount_spent: number | string | null
  is_planned?: boolean | null
  nomination_status_at_visit?: string | null
  companion_honshimei?: string | null
  companion_banai?: string | null
}

export type CastIssueShiftInput = {
  shift_date: string
  status: string
}

export type CastIssueBowzuStats = {
  period_work_days: number
  period_bowzu_days: number
  current_bowzu_streak: number
}

export type CastIssueNominationInput = {
  customer_id: string
  changed_at: string
  old_status?: string | null
  new_status: string
}

export type CastIssueCustomerBase = CastIssueCustomerInput & {
  region_group: CastIssueRegionGroup
  follow_up_active: boolean
  follow_up_next_actions: string[]
  follow_up_return_visit_deadline: string | null
  lifetime_visit_count: number
  lifetime_sales: number
  lifetime_average_spend: number
  lifetime_last_visit_date: string | null
  lifetime_days_since_last_visit: number | null
  visit_pattern: CustomerVisitPattern | null
  latest_companion_honshimei: string
  latest_companion_banai: string
  customer_staff_names: string[]
}

export type CastIssueFollowUpMetaInput = {
  next_actions?: string[] | null
  return_visit_deadline?: string | null
}

export type RecentHonshimeiCustomer = CastIssueCustomerBase & {
  period_visits: number
  period_sales: number
  period_average_spend: number
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
    period_honshimei_customer_count: number
    period_honshimei_visit_count: number
    period_honshimei_sales: number
    overdue_customer_count: number
    banai_acquired_count: number
  }
}

export type CastIssuePriorityResult = {
  localCustomers: RecentHonshimeiCustomer[]
  qualityUnmetCustomers: RecentHonshimeiCustomer[]
  frequencyUnmetCustomers: RecentHonshimeiCustomer[]
  banaiMissingFollowUpCustomers: RecentBanaiCustomer[]
  summary: {
    local_customer_goal: number
    local_customer_count: number
    local_customer_shortfall: number
    target_average_spend: number
    quality_met_customer_count: number
    quality_unmet_customer_count: number
    three_visit_customer_count: number
    three_visit_customer_shortfall: number
    under_three_visit_customer_count: number
    banai_customer_count: number
    banai_follow_up_customer_count: number
    banai_follow_up_missing_count: number
  }
}

export type CastIssueSectionKey = keyof Omit<CastIssueVisibilityResult, 'summary'>
export type CastIssueCustomer = RecentHonshimeiCustomer | OverdueHonshimeiCustomer | RecentBanaiCustomer
export type CastIssueSortKey =
  | 'period_visits_desc'
  | 'period_sales_desc'
  | 'period_average_desc'
  | 'lifetime_visits_desc'
  | 'lifetime_sales_desc'
  | 'last_visit_desc'
  | 'last_visit_asc'
  | 'overdue_desc'
  | 'acquired_desc'
  | 'acquired_asc'
  | 'follow_up_first'

function compareName(a: CastIssueCustomer, b: CastIssueCustomer): number {
  const aName = a.customer_name?.trim() || a.nickname?.trim() || ''
  const bName = b.customer_name?.trim() || b.nickname?.trim() || ''
  return aName.localeCompare(bName, 'ja') || a.id.localeCompare(b.id)
}

/** 地域グループを変えずに、各一覧の中だけを並び替える。 */
export function sortCastIssueCustomers<T extends CastIssueCustomer>(
  items: readonly T[],
  sortKey: CastIssueSortKey,
): T[] {
  const rows = [...items]
  rows.sort((a, b) => {
    let compared = 0
    switch (sortKey) {
      case 'period_visits_desc':
        compared = ((b as RecentHonshimeiCustomer).period_visits ?? 0) - ((a as RecentHonshimeiCustomer).period_visits ?? 0)
        break
      case 'period_sales_desc':
        compared = ((b as RecentHonshimeiCustomer).period_sales ?? 0) - ((a as RecentHonshimeiCustomer).period_sales ?? 0)
        break
      case 'period_average_desc':
        compared = ((b as RecentHonshimeiCustomer).period_average_spend ?? 0) - ((a as RecentHonshimeiCustomer).period_average_spend ?? 0)
        break
      case 'lifetime_visits_desc':
        compared = b.lifetime_visit_count - a.lifetime_visit_count
        break
      case 'lifetime_sales_desc':
        compared = b.lifetime_sales - a.lifetime_sales
        break
      case 'last_visit_desc':
        compared = (b.lifetime_last_visit_date ?? '').localeCompare(a.lifetime_last_visit_date ?? '')
        break
      case 'last_visit_asc':
        compared = a.lifetime_last_visit_date
          ? b.lifetime_last_visit_date
            ? a.lifetime_last_visit_date.localeCompare(b.lifetime_last_visit_date)
            : 1
          : b.lifetime_last_visit_date ? -1 : 0
        break
      case 'overdue_desc':
        compared = ((b as OverdueHonshimeiCustomer).overdue_days ?? 0) - ((a as OverdueHonshimeiCustomer).overdue_days ?? 0)
        break
      case 'acquired_desc':
        compared = ((b as RecentBanaiCustomer).acquired_date ?? '').localeCompare((a as RecentBanaiCustomer).acquired_date ?? '')
        break
      case 'acquired_asc':
        compared = ((a as RecentBanaiCustomer).acquired_date ?? '').localeCompare((b as RecentBanaiCustomer).acquired_date ?? '')
        break
      case 'follow_up_first':
        compared = Number(b.follow_up_active) - Number(a.follow_up_active)
        break
    }
    return compared || compareName(a, b)
  })
  return rows
}

export function classifyCastIssueRegion(region: string | null | undefined): CastIssueRegionGroup {
  const normalized = typeof region === 'string' ? region.trim() : ''
  if (!normalized) return 'unset'
  return normalized === '福岡県' ? 'fukuoka' : 'outside'
}

/**
 * 会議で確認する4つの優先課題を、すでに期間判定済みの一覧から作る。
 *
 * - 数・質・月3回来店は、対象期間に本指名で実来店した福岡県のお客様だけを対象にする
 * - 設定単価は設定売上÷45（15人×月3回）を円単位で四捨五入する
 * - 場内は対象期間の獲得者全員を対象に、現在追いかけ中かを判定する
 */
export function buildCastIssuePriority(args: {
  recentHonshimei: readonly RecentHonshimeiCustomer[]
  recentBanai: readonly RecentBanaiCustomer[]
  targetSales: number
}): CastIssuePriorityResult {
  const localCustomers = args.recentHonshimei.filter(
    customer => customer.region_group === 'fukuoka',
  )
  const targetAverageSpend = args.targetSales > 0
    ? Math.round(args.targetSales / CAST_ISSUE_TARGET_VISIT_COUNT)
    : 0
  const qualityUnmetCustomers = targetAverageSpend > 0
    ? localCustomers.filter(customer => customer.period_average_spend < targetAverageSpend)
    : []
  const qualityMetCustomerCount = targetAverageSpend > 0
    ? localCustomers.length - qualityUnmetCustomers.length
    : 0
  const threeVisitCustomers = localCustomers.filter(
    customer => customer.period_visits >= CAST_ISSUE_VISITS_PER_CUSTOMER_GOAL,
  )
  const frequencyUnmetCustomers = localCustomers.filter(
    customer => customer.period_visits < CAST_ISSUE_VISITS_PER_CUSTOMER_GOAL,
  )
  const banaiMissingFollowUpCustomers = args.recentBanai.filter(
    customer => !customer.follow_up_active,
  )

  return {
    localCustomers,
    qualityUnmetCustomers,
    frequencyUnmetCustomers,
    banaiMissingFollowUpCustomers,
    summary: {
      local_customer_goal: CAST_ISSUE_LOCAL_CUSTOMER_GOAL,
      local_customer_count: localCustomers.length,
      local_customer_shortfall: Math.max(0, CAST_ISSUE_LOCAL_CUSTOMER_GOAL - localCustomers.length),
      target_average_spend: targetAverageSpend,
      quality_met_customer_count: qualityMetCustomerCount,
      quality_unmet_customer_count: qualityUnmetCustomers.length,
      three_visit_customer_count: threeVisitCustomers.length,
      three_visit_customer_shortfall: Math.max(0, CAST_ISSUE_LOCAL_CUSTOMER_GOAL - threeVisitCustomers.length),
      under_three_visit_customer_count: frequencyUnmetCustomers.length,
      banai_customer_count: args.recentBanai.length,
      banai_follow_up_customer_count: args.recentBanai.length - banaiMissingFollowUpCustomers.length,
      banai_follow_up_missing_count: banaiMissingFollowUpCustomers.length,
    },
  }
}

function numericAmount(value: number | string | null): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function actualVisits(visits: CastIssueVisitInput[]): CastIssueVisitInput[] {
  return visits.filter(visit => visit.is_planned !== true && /^\d{4}-\d{2}-\d{2}$/.test(visit.visit_date))
}

function nominationStatusAtPeriodEnd(
  customer: CastIssueCustomerInput,
  history: readonly CastIssueNominationInput[],
  periodEnd: string,
): string | null {
  const ordered = [...history].sort((a, b) => a.changed_at.localeCompare(b.changed_at))
  const latestBeforeEnd = [...ordered].reverse().find(row => (
    toJSTDateString(new Date(row.changed_at)) <= periodEnd
  ))
  if (latestBeforeEnd) return latestBeforeEnd.new_status
  const earliestAfterEnd = ordered.find(row => (
    toJSTDateString(new Date(row.changed_at)) > periodEnd && row.old_status != null
  ))
  return earliestAfterEnd?.old_status ?? customer.nomination_status
}

/**
 * 課題見える化シートの「ボウズ」を集計する。
 *
 * - 出勤・来客出勤の日だけを母数にする
 * - 実績保存時に「本指名」と固定された実来店が1件もなければボウズ
 * - 場内・フリーの来店、予定来店は本指名来店として数えない
 * - 営業途中の当日を誤ってボウズにしないため、today より前の出勤だけを確定対象にする
 * - 連続日数は休みを飛ばし、直近の確定出勤日から本指名来店があった出勤日までを数える
 */
export function calculateCastBowzuStats(args: {
  shifts: CastIssueShiftInput[]
  visits: CastIssueVisitInput[]
  honshimeiCustomerIds: ReadonlySet<string>
  periodStart: string
  periodEnd?: string
  today: string
}): CastIssueBowzuStats {
  const periodEnd = args.periodEnd ?? args.today
  const workedDates = Array.from(new Set(
    args.shifts
      .filter(shift => (
        (shift.status === '出勤' || shift.status === '来客出勤')
        && /^\d{4}-\d{2}-\d{2}$/.test(shift.shift_date)
        && shift.shift_date < args.today
        && shift.shift_date <= periodEnd
      ))
      .map(shift => shift.shift_date),
  )).sort((a, b) => a.localeCompare(b))

  const honshimeiVisitDates = new Set(
    actualVisits(args.visits)
      .filter(visit => (
        visit.nomination_status_at_visit === '本指名'
        || (
          visit.nomination_status_at_visit == null
          && args.honshimeiCustomerIds.has(String(visit.customer_id))
        )
      ))
      .filter(visit => visit.visit_date <= periodEnd)
      .map(visit => visit.visit_date),
  )
  const periodWorkedDates = workedDates.filter(date => date >= args.periodStart)
  const periodBowzuDays = periodWorkedDates.filter(
    date => !honshimeiVisitDates.has(date),
  ).length

  let currentBowzuStreak = 0
  for (let index = workedDates.length - 1; index >= 0; index -= 1) {
    if (honshimeiVisitDates.has(workedDates[index])) break
    currentBowzuStreak += 1
  }

  return {
    period_work_days: periodWorkedDates.length,
    period_bowzu_days: periodBowzuDays,
    current_bowzu_streak: currentBowzuStreak,
  }
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
  visits: CastIssueVisitInput[],
  today: string,
  visitPattern: CustomerVisitPattern | null,
  followUpMeta: CastIssueFollowUpMetaInput | undefined,
  customerStaffNames: string[],
): CastIssueCustomerBase {
  const sortedVisits = [...visits].sort((a, b) => (
    b.visit_date.localeCompare(a.visit_date)
    || (b.visit_time ?? '').localeCompare(a.visit_time ?? '')
    || String(b.id ?? '').localeCompare(String(a.id ?? ''))
  ))
  const lifetimeSales = sortedVisits.reduce(
    (sum, visit) => sum + numericAmount(visit.amount_spent),
    0,
  )
  const lifetimeLastVisitDate = sortedVisits[0]?.visit_date ?? null
  const companionVisit = sortedVisits.find(visit => (
    Boolean(visit.companion_honshimei?.trim()) || Boolean(visit.companion_banai?.trim())
  ))
  return {
    ...customer,
    region_group: classifyCastIssueRegion(customer.region),
    follow_up_active: activeFollowUpIds.has(customer.id),
    follow_up_next_actions: followUpMeta?.next_actions?.filter(Boolean) ?? [],
    follow_up_return_visit_deadline: followUpMeta?.return_visit_deadline ?? null,
    lifetime_visit_count: sortedVisits.length,
    lifetime_sales: lifetimeSales,
    lifetime_average_spend: sortedVisits.length > 0
      ? Math.round(lifetimeSales / sortedVisits.length)
      : 0,
    lifetime_last_visit_date: lifetimeLastVisitDate,
    lifetime_days_since_last_visit: lifetimeLastVisitDate
      ? Math.max(0, diffDaysJST(today, lifetimeLastVisitDate))
      : null,
    visit_pattern: visitPattern,
    latest_companion_honshimei: companionVisit?.companion_honshimei?.trim() ?? '',
    latest_companion_banai: companionVisit?.companion_banai?.trim() ?? '',
    customer_staff_names: customerStaffNames,
  }
}

/**
 * 「課題見える化シート」の3一覧を作る純粋関数。
 * - 直近4週間は periodStart〜today の両端を含む
 * - 周期遅れは「本指名」かつ「切れた以外」のお客様を対象にし、
 *   既存顧客詳細と同じ「正の日数差の全期間平均」で7日以上の遅れを判定する
 * - 場内獲得は履歴を顧客単位で最新1件にまとめる
 */
export function buildCastIssueVisibility(args: {
  customers: CastIssueCustomerInput[]
  visits: CastIssueVisitInput[]
  nominationHistory: CastIssueNominationInput[]
  activeFollowUpCustomerIds: ReadonlySet<string>
  followUpMetaByCustomer?: ReadonlyMap<string, CastIssueFollowUpMetaInput>
  customerStaffNamesByCustomer?: ReadonlyMap<string, string[]>
  periodStart: string
  periodEnd?: string
  today: string
}): CastIssueVisibilityResult {
  const {
    customers,
    nominationHistory,
    activeFollowUpCustomerIds,
    followUpMetaByCustomer = new Map(),
    customerStaffNamesByCustomer = new Map(),
    periodStart,
    today,
  } = args
  const periodEnd = args.periodEnd ?? today
  const visits = actualVisits(args.visits).filter(visit => visit.visit_date <= periodEnd)
  const visitPatterns = buildCustomerVisitPatterns(visits)
  const historyByCustomer = new Map<string, CastIssueNominationInput[]>()
  for (const history of nominationHistory) {
    const rows = historyByCustomer.get(history.customer_id) ?? []
    rows.push(history)
    historyByCustomer.set(history.customer_id, rows)
  }
  const periodCustomers = customers.map(customer => ({
    ...customer,
    nomination_status: nominationStatusAtPeriodEnd(
      customer,
      historyByCustomer.get(customer.id) ?? [],
      periodEnd,
    ),
  }))
  const customerById = new Map(periodCustomers.map(customer => [customer.id, customer]))
  const visitsByCustomer = new Map<string, CastIssueVisitInput[]>()
  for (const visit of visits) {
    if (!customerById.has(visit.customer_id)) continue
    const rows = visitsByCustomer.get(visit.customer_id) ?? []
    rows.push(visit)
    visitsByCustomer.set(visit.customer_id, rows)
  }

  const recentHonshimei: RecentHonshimeiCustomer[] = []
  const overdueHonshimei: OverdueHonshimeiCustomer[] = []
  const periodHonshimeiCustomerIds = new Set<string>()
  let periodHonshimeiVisitCount = 0
  let periodHonshimeiSales = 0

  for (const customer of periodCustomers) {
    const customerVisits = visitsByCustomer.get(customer.id) ?? []
    const periodHonshimeiVisits = customerVisits.filter(visit => (
      visit.visit_date >= periodStart
      && visit.visit_date <= periodEnd
      && (
        visit.nomination_status_at_visit === '本指名'
        || (visit.nomination_status_at_visit == null && customer.nomination_status === '本指名')
      )
    ))
    if (periodHonshimeiVisits.length > 0) {
      periodHonshimeiCustomerIds.add(customer.id)
      periodHonshimeiVisitCount += periodHonshimeiVisits.length
      periodHonshimeiSales += periodHonshimeiVisits.reduce(
        (sum, visit) => sum + numericAmount(visit.amount_spent),
        0,
      )
    }

    const base = customerBase(
      customer,
      activeFollowUpCustomerIds,
      customerVisits,
      periodEnd,
      visitPatterns[customer.id] ?? null,
      followUpMetaByCustomer.get(customer.id),
      customerStaffNamesByCustomer.get(customer.id) ?? [],
    )

    if (periodHonshimeiVisits.length > 0) {
      const sales = periodHonshimeiVisits.reduce((sum, visit) => sum + numericAmount(visit.amount_spent), 0)
      const lastVisitDate = periodHonshimeiVisits.reduce(
        (latest, visit) => visit.visit_date > latest ? visit.visit_date : latest,
        periodHonshimeiVisits[0].visit_date,
      )
      recentHonshimei.push({
        ...base,
        period_visits: periodHonshimeiVisits.length,
        period_sales: sales,
        period_average_spend: Math.round(sales / periodHonshimeiVisits.length),
        last_visit_date: lastVisitDate,
        days_since_last_visit: Math.max(0, diffDaysJST(periodEnd, lastVisitDate)),
      })
    }

    if (customer.nomination_status !== '本指名' || customer.customer_rank === '切れた') continue
    const averageCycleDays = calculateAverageVisitCycle(customerVisits)
    if (averageCycleDays === null || customerVisits.length === 0) continue
    const lastVisitDate = customerVisits.reduce(
      (latest, visit) => visit.visit_date > latest ? visit.visit_date : latest,
      customerVisits[0].visit_date,
    )
    const daysSinceLastVisit = Math.max(0, diffDaysJST(periodEnd, lastVisitDate))
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
    const changedDate = toJSTDateString(new Date(history.changed_at))
    if (changedDate < periodStart || changedDate > periodEnd) continue
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
    const acquiredDate = toJSTDateString(new Date(changedAt))
    recentBanai.push({
      ...customerBase(
        customer,
        activeFollowUpCustomerIds,
        visitsByCustomer.get(customer.id) ?? [],
        periodEnd,
        visitPatterns[customer.id] ?? null,
        followUpMetaByCustomer.get(customer.id),
        customerStaffNamesByCustomer.get(customer.id) ?? [],
      ),
      acquired_date: acquiredDate,
      days_since_acquisition: Math.max(0, diffDaysJST(periodEnd, acquiredDate)),
    })
  }

  recentHonshimei.sort((a, b) => b.period_sales - a.period_sales || b.last_visit_date.localeCompare(a.last_visit_date))
  overdueHonshimei.sort((a, b) => b.overdue_days - a.overdue_days || a.last_visit_date.localeCompare(b.last_visit_date))
  recentBanai.sort((a, b) => b.acquired_date.localeCompare(a.acquired_date))

  return {
    recent_honshimei: recentHonshimei,
    overdue_honshimei: overdueHonshimei,
    recent_banai: recentBanai,
    summary: {
      period_honshimei_customer_count: periodHonshimeiCustomerIds.size,
      period_honshimei_visit_count: periodHonshimeiVisitCount,
      period_honshimei_sales: periodHonshimeiSales,
      overdue_customer_count: overdueHonshimei.length,
      banai_acquired_count: recentBanai.length,
    },
  }
}
