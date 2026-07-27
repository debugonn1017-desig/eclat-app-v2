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
