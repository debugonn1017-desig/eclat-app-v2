export const FOLLOW_UP_NEXT_ACTIONS = [
  'LINE',
  '電話',
  '来店相談',
  '同伴相談',
  'その他',
] as const

export type FollowUpNextAction = typeof FOLLOW_UP_NEXT_ACTIONS[number]

export type FollowUpTiming = 'overdue' | 'today' | 'thisWeek' | 'later' | 'unscheduled'

export function isFollowUpNextAction(value: unknown): value is FollowUpNextAction {
  return typeof value === 'string'
    && (FOLLOW_UP_NEXT_ACTIONS as readonly string[]).includes(value)
}

export function getJstDateString(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function dateToDayNumber(value: string): number {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / (24 * 60 * 60 * 1000))
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
