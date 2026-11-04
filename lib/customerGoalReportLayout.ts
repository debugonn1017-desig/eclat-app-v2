import { C } from '@/lib/colors'
import { GOAL_CATEGORIES, goalDifference, type GoalCategory, type GoalReport, type GoalReportRow } from '@/lib/starCustomerGoals'

/** 承認済みのA4実寸。本文を小さくしても氏名・分類・メモの高さは保つ。 */
export const GOAL_REPORT_LAYOUT = {
  width: 794, height: 1123, margin: 22.7, rowHeight: 46, categoryHeight: 18,
  columns: [.26, .19, .12, .22, .21],
  font: { title: 14, month: 10, name: 12, category: 11, body: 9, actual: 10 },
  lineHeight: 12,
} as const

export const goalReportTheme = {
  ink: C.goalPrintInk, muted: C.goalPrintMuted, soft: C.goalPrintSoft,
  rule: C.goalPrintRule, headerRule: C.goalPrintHeaderRule, memoRule: C.goalPrintMemoRule,
  sales: C.goalPrintSales, visits: C.goalPrintVisits, remaining: C.goalPrintRemaining, achieved: C.goalPrintAchieved,
  dateInk: C.goalPrintDateInk, dateFill: C.goalPrintDateFill, dateBorder: C.goalPrintDateBorder,
  elapsedInk: C.goalPrintElapsedInk, elapsedFill: C.goalPrintElapsedFill, elapsedBorder: C.goalPrintElapsedBorder,
}

const categoryThemes: Record<GoalCategory, { subtitle: string; ink: string; fill: string }> = {
  '県内顧客': { subtitle: '本指名・福岡県', ink: C.goalPrintLocalInk, fill: C.goalPrintLocalFill },
  '県外顧客': { subtitle: '本指名・福岡県以外', ink: C.goalPrintRemoteInk, fill: C.goalPrintRemoteFill },
  '県内場内': { subtitle: '場内・福岡県', ink: C.goalPrintLocalBanaiInk, fill: C.goalPrintLocalBanaiFill },
  '県外場内': { subtitle: '場内・福岡県以外', ink: C.goalPrintRemoteBanaiInk, fill: C.goalPrintRemoteBanaiFill },
  'その他・地域未設定': { subtitle: '指名・地域未設定を含む', ink: C.goalPrintMuted, fill: C.goalPrintOtherFill },
  '切れたお客様': { subtitle: '保存済みの目標・備考', ink: C.goalPrintMuted, fill: C.goalPrintOtherFill },
}

export function goalReportGroups(report: GoalReport) {
  return GOAL_CATEGORIES.flatMap(category => {
    const rows = report.rows.filter(row => row.category === category)
    return rows.length ? [{ category, rows, ...categoryThemes[category] }] : []
  })
}

export function goalReportMetadata(row: GoalReportRow) {
  return [row.rank, row.castName ? `担当 ${row.castName}` : '', row.region || '地域未設定', row.occupation || '職業未設定'].filter(Boolean).join(' · ')
}

/** 年が違う入店日は年を省略しない。文字列の日付をタイムゾーン変換しない。 */
export function goalReportShortDate(lastVisit: string | null, today?: string) {
  if (!lastVisit) return '未記録'
  return /^\d{4}-\d{2}-\d{2}$/.test(lastVisit) && (!today || lastVisit.slice(0, 4) === today.slice(0, 4)) ? lastVisit.slice(5).replace('-', '/') : lastVisit.replaceAll('-', '/')
}

export function goalReportCheckLabel(row: GoalReportRow) {
  return row.checked === null ? '確認状況未取得' : row.checked ? `確認済${row.checkedBy ? ' · ' + row.checkedBy : ''}` : '本日未確認'
}

export function goalReportMetric(target: number | null | undefined, actual: number, unit: '円' | '回') {
  const value = (n: number) => unit === '円' ? '¥' + n.toLocaleString('ja-JP') : `${n}回`
  const diff = goalDifference(target, actual)
  const state = diff.remaining === null ? 'unset' : diff.exceeded ? 'exceeded' : diff.achieved ? 'achieved' : 'remaining'
  return {
    actual: value(actual), target: target == null ? '未設定' : value(target),
    label: state === 'remaining' ? '残り' : state === 'exceeded' ? '超過' : '',
    value: state === 'unset' ? '—' : state === 'achieved' ? '達成' : value(state === 'exceeded' ? diff.exceeded : diff.remaining!),
    state,
  } as const
}
