import { toJSTDateString } from './dateUtils'

type JoinDates = { joined_at?: string | null; training_start_date?: string | null }
export type CastTenure =
  | { status: 'elapsed'; years: number; months: number; days: number; joinedDate: string }
  | { status: 'future'; joinedDate: string }
  | { status: 'unset' }

const DAY_MS = 86_400_000

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

/** 設定・在籍期間表示と同じ入店日。未登録時だけ旧フィールドを参照する。 */
export function getCastJoinDate(cast: JoinDates): string | null {
  const value = cast.joined_at?.trim() || cast.training_start_date?.trim() || ''
  return parseDate(value) ? value : null
}

/** 入店日の暦上の月応当日。31日・閏日は移動先の月末に丸める。 */
function anniversary(start: Date, months: number): Date {
  const date = new Date(start)
  date.setUTCDate(1)
  date.setUTCMonth(start.getUTCMonth() + months)
  const monthEnd = new Date(date)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)
  monthEnd.setUTCDate(0)
  date.setUTCDate(Math.min(start.getUTCDate(), monthEnd.getUTCDate()))
  return date
}

/** 選択中の集計月ではなく、日本時間の今日までの経過期間。旧入店日も設定画面と同じ順で参照。 */
export function getCastTenure(cast: JoinDates, today = toJSTDateString(new Date())): CastTenure {
  const joinedDate = getCastJoinDate(cast)
  if (!joinedDate) return { status: 'unset' }
  const start = parseDate(joinedDate)
  const end = parseDate(today)
  if (!start || !end) return { status: 'unset' }
  if (start > end) return { status: 'future', joinedDate }

  let totalMonths = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth()
  if (anniversary(start, totalMonths) > end) totalMonths--
  const days = Math.round((end.getTime() - anniversary(start, totalMonths).getTime()) / DAY_MS)
  return { status: 'elapsed', joinedDate, years: Math.floor(totalMonths / 12), months: totalMonths % 12, days }
}

export function formatCastTenure(tenure: CastTenure): string {
  if (tenure.status === 'unset') return '入店日未設定'
  if (tenure.status === 'future') return `入店予定 ${tenure.joinedDate.replace(/-/g, '/')}`
  return `入店から${tenure.years}年${tenure.months}ヶ月${tenure.days}日経過中`
}
