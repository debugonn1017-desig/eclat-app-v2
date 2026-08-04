export const FOLLOW_UP_NEXT_ACTIONS = [
  'LINE',
  '電話',
  '来店相談',
  '同伴相談',
  'その他',
] as const

export type FollowUpNextAction = typeof FOLLOW_UP_NEXT_ACTIONS[number]

export type FollowUpTiming = 'overdue' | 'today' | 'thisWeek' | 'later' | 'unscheduled'

export const FOLLOW_UP_ACTIONS = [
  '営業連絡',
  '関係値づくり',
  '来店斡旋',
  '同伴斡旋',
  'アフター斡旋',
  'プライベートで関係値づくり',
] as const

export type FollowUpActionItem = typeof FOLLOW_UP_ACTIONS[number]

export const RETURN_VISIT_DEADLINE_PRESETS = [
  { value: 'tomorrow', label: '明日' },
  { value: 'within_3_days', label: '3日以内' },
  { value: 'within_1_week', label: '1週間以内' },
  { value: 'within_2_weeks', label: '2週間以内' },
  { value: 'within_1_month', label: '1ヶ月以内' },
  { value: 'within_2_months', label: '2ヶ月以内' },
  { value: 'within_3_months', label: '3ヶ月以内' },
  { value: 'within_6_months', label: '半年以内' },
] as const

export type ReturnVisitDeadlinePreset = typeof RETURN_VISIT_DEADLINE_PRESETS[number]['value']

export const SALES_CONTACT_INTERVALS = [
  { days: 1, label: '毎日' },
  { days: 2, label: '2日以上空けない' },
  { days: 3, label: '3日以上空けない' },
  { days: 7, label: '1週間以上空けない' },
  { days: 14, label: '2週間以上空けない' },
  { days: 30, label: '1ヶ月以上空けない' },
] as const

export type SalesContactIntervalDays = typeof SALES_CONTACT_INTERVALS[number]['days']

export type FollowUpDeadlineStatus = 'overdue' | 'today' | 'upcoming' | 'unscheduled'

export type FollowUpDeadlineInfo = {
  status: FollowUpDeadlineStatus
  daysRemaining: number | null
  label: string
}

export type FollowUpRegionGroup = 'fukuoka' | 'outside' | 'unset'

export const FOLLOW_UP_SORT_OPTIONS = [
  { value: 'priority', label: '対応優先順' },
  { value: 'addedNewest', label: '追加が新しい順' },
  { value: 'addedOldest', label: '追加が古い順' },
  { value: 'contactOldest', label: '最終連絡が古い順（未連絡優先）' },
  { value: 'contactNewest', label: '最終連絡が新しい順' },
  { value: 'returnDeadline', label: '再来店期限が近い順' },
  { value: 'salesDeadline', label: '営業連絡期限が近い順' },
  { value: 'customerName', label: 'お客様名順' },
] as const

export type FollowUpSortKey = typeof FOLLOW_UP_SORT_OPTIONS[number]['value']

export type FollowUpSortableItem = {
  activated_at: string
  last_contacted_at: string | null
  return_visit_deadline: string | null
  sales_contact_interval_days: SalesContactIntervalDays | null
  customer: {
    customer_name: string | null
    nickname: string | null
  }
}

export function isFollowUpNextAction(value: unknown): value is FollowUpNextAction {
  return typeof value === 'string'
    && (FOLLOW_UP_NEXT_ACTIONS as readonly string[]).includes(value)
}

export function isFollowUpActionItem(value: unknown): value is FollowUpActionItem {
  return typeof value === 'string'
    && (FOLLOW_UP_ACTIONS as readonly string[]).includes(value)
}

export function isFollowUpActionItems(value: unknown): value is FollowUpActionItem[] {
  return Array.isArray(value)
    && value.every(isFollowUpActionItem)
    && new Set(value).size === value.length
}

export function isReturnVisitDeadlinePreset(
  value: unknown,
): value is ReturnVisitDeadlinePreset {
  return typeof value === 'string'
    && RETURN_VISIT_DEADLINE_PRESETS.some(option => option.value === value)
}

export function isSalesContactIntervalDays(
  value: unknown,
): value is SalesContactIntervalDays {
  return typeof value === 'number'
    && SALES_CONTACT_INTERVALS.some(option => option.days === value)
}

export function classifyFollowUpRegion(region: unknown): FollowUpRegionGroup {
  if (typeof region !== 'string' || region.trim() === '') return 'unset'
  return region.trim() === '福岡県' ? 'fukuoka' : 'outside'
}

export function getJstDateString(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function dateToDayNumber(value: string): number {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / (24 * 60 * 60 * 1000))
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function addMonthsClamped(value: string, months: number): string {
  const [year, month, day] = value.split('-').map(Number)
  const targetMonthIndex = month - 1 + months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonthIndex + 1, 0)).getUTCDate()
  const date = new Date(Date.UTC(targetYear, normalizedMonthIndex, Math.min(day, lastDay)))
  return date.toISOString().slice(0, 10)
}

export function calculateReturnVisitDeadline(
  preset: ReturnVisitDeadlinePreset,
  today = getJstDateString(),
): string {
  switch (preset) {
    case 'tomorrow':
      return addDays(today, 1)
    case 'within_3_days':
      return addDays(today, 3)
    case 'within_1_week':
      return addDays(today, 7)
    case 'within_2_weeks':
      return addDays(today, 14)
    case 'within_1_month':
      return addMonthsClamped(today, 1)
    case 'within_2_months':
      return addMonthsClamped(today, 2)
    case 'within_3_months':
      return addMonthsClamped(today, 3)
    case 'within_6_months':
      return addMonthsClamped(today, 6)
  }
}

export function resolveReturnVisitDeadline(
  preset: ReturnVisitDeadlinePreset | null,
  currentPreset: ReturnVisitDeadlinePreset | null,
  currentDeadline: string | null,
  today = getJstDateString(),
): string | null {
  if (preset === null) return null
  if (preset === currentPreset && currentDeadline) return currentDeadline
  return calculateReturnVisitDeadline(preset, today)
}

export function getDeadlineInfo(
  deadline: string | null,
  today = getJstDateString(),
): FollowUpDeadlineInfo {
  if (!deadline) {
    return { status: 'unscheduled', daysRemaining: null, label: '期限未設定' }
  }
  const diff = dateToDayNumber(deadline) - dateToDayNumber(today)
  if (diff < 0) {
    return { status: 'overdue', daysRemaining: diff, label: `${Math.abs(diff)}日超過` }
  }
  if (diff === 0) {
    return { status: 'today', daysRemaining: 0, label: '今日まで' }
  }
  return { status: 'upcoming', daysRemaining: diff, label: `あと${diff}日` }
}

export function getSalesContactDeadline(
  lastContactedAt: string | null,
  activatedAt: string,
  intervalDays: SalesContactIntervalDays | null,
): string | null {
  if (intervalDays === null) return null
  const baseDate = getJstDateString(new Date(lastContactedAt ?? activatedAt))
  return addDays(baseDate, intervalDays)
}

function compareOptionalIso(
  left: string | null,
  right: string | null,
  ascending: boolean,
  nullsFirst: boolean,
): number {
  if (left === right) return 0
  if (left === null) return nullsFirst ? -1 : 1
  if (right === null) return nullsFirst ? 1 : -1
  return ascending ? left.localeCompare(right) : right.localeCompare(left)
}

function getFollowUpUrgencyDate(item: FollowUpSortableItem): string | null {
  const salesDeadline = getSalesContactDeadline(
    item.last_contacted_at,
    item.activated_at,
    item.sales_contact_interval_days,
  )
  return [item.return_visit_deadline, salesDeadline]
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null
}

function compareActivatedNewest(
  left: FollowUpSortableItem,
  right: FollowUpSortableItem,
): number {
  return right.activated_at.localeCompare(left.activated_at)
}

export function sortFollowUpItems<T extends FollowUpSortableItem>(
  items: readonly T[],
  sortKey: FollowUpSortKey,
): T[] {
  return [...items].sort((left, right) => {
    let difference = 0
    switch (sortKey) {
      case 'priority':
        difference = compareOptionalIso(
          getFollowUpUrgencyDate(left),
          getFollowUpUrgencyDate(right),
          true,
          false,
        )
        break
      case 'addedNewest':
        difference = compareActivatedNewest(left, right)
        break
      case 'addedOldest':
        difference = left.activated_at.localeCompare(right.activated_at)
        break
      case 'contactOldest':
        difference = compareOptionalIso(
          left.last_contacted_at,
          right.last_contacted_at,
          true,
          true,
        )
        break
      case 'contactNewest':
        difference = compareOptionalIso(
          left.last_contacted_at,
          right.last_contacted_at,
          false,
          false,
        )
        break
      case 'returnDeadline':
        difference = compareOptionalIso(
          left.return_visit_deadline,
          right.return_visit_deadline,
          true,
          false,
        )
        break
      case 'salesDeadline': {
        const leftDeadline = getSalesContactDeadline(
          left.last_contacted_at,
          left.activated_at,
          left.sales_contact_interval_days,
        )
        const rightDeadline = getSalesContactDeadline(
          right.last_contacted_at,
          right.activated_at,
          right.sales_contact_interval_days,
        )
        difference = compareOptionalIso(leftDeadline, rightDeadline, true, false)
        break
      }
      case 'customerName': {
        const leftName = left.customer.customer_name?.trim()
          || left.customer.nickname?.trim()
          || 'お名前未登録'
        const rightName = right.customer.customer_name?.trim()
          || right.customer.nickname?.trim()
          || 'お名前未登録'
        difference = leftName.localeCompare(rightName, 'ja')
        break
      }
    }
    if (difference !== 0) return difference
    return compareActivatedNewest(left, right)
  })
}

export function classifyFollowUpTiming(
  nextContactDate: string | null,
  today = getJstDateString(),
): FollowUpTiming {
  if (!nextContactDate) return 'unscheduled'
  const diff = dateToDayNumber(nextContactDate) - dateToDayNumber(today)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  // 「今週」は次の7日間ではなく、表示上の日本語どおり今週の日曜まで。
  const todayDay = new Date(`${today}T00:00:00Z`).getUTCDay()
  const daysUntilSunday = (7 - todayDay) % 7
  if (diff <= daysUntilSunday) return 'thisWeek'
  return 'later'
}
