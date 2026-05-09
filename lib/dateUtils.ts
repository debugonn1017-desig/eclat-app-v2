// ─────────────────────────────────────────────────────────────────
//  日付ユーティリティ（JST 固定）
// ─────────────────────────────────────────────────────────────────
//  問題: JavaScript の Date は UTC ベースで動くため、
//  - new Date('2026-05-09')        → UTC の 2026-05-09 00:00 として解釈
//  - .toISOString().slice(0, 10)   → UTC ベースで日付を返す
//  - 日本時間で 2026-05-10 00:30 でも UTC では 2026-05-09 15:30
//
//  → 月境目・日境目の集計や「今日」判定がズレる原因。
//
//  本ライブラリは「日本時間（JST = UTC+9）」固定で日付を扱う。
// ─────────────────────────────────────────────────────────────────

const JST_OFFSET_HOURS = 9
const JST_OFFSET_MS = JST_OFFSET_HOURS * 60 * 60 * 1000

/** 「今日（日本時間）の YYYY-MM-DD」を返す */
export function todayJST(): string {
  return toJSTDateString(new Date())
}

/** 「今月（日本時間）の YYYY-MM」を返す */
export function thisMonthJST(): string {
  return toJSTDateString(new Date()).slice(0, 7)
}

/** Date を JST 換算で 'YYYY-MM-DD' に整形 */
export function toJSTDateString(d: Date): string {
  // UTC ms → JST ms
  const jst = new Date(d.getTime() + JST_OFFSET_MS)
  // toISOString は UTC ベース。JST に+9した時点で JST の時刻が UTC として
  // 表現されるので、そのまま slice すれば JST の日付になる。
  return jst.toISOString().slice(0, 10)
}

/** Date を JST 換算で 'YYYY-MM' に整形 */
export function toJSTMonthString(d: Date): string {
  return toJSTDateString(d).slice(0, 7)
}

/** 'YYYY-MM-DD' を JST 0:00 として解釈した Date を返す（演算用） */
export function parseJSTDate(s: string): Date {
  // 'YYYY-MM-DD' を UTC として new Date すると UTC 0:00 になる。
  // それを -9h すれば JST 0:00 (UTC では前日 15:00) になる。
  // しかしここでは「JST 0:00」を表す Date を返したい。
  // そのまま new Date(s) で UTC 0:00 を返し、呼び出し側は時差を意識して使う。
  return new Date(s + 'T00:00:00+09:00')
}

/** 'YYYY-MM' から月末日 'YYYY-MM-DD' を返す（JST） */
export function getMonthEndDateJST(month: string): string {
  const [y, m] = month.split('-').map(Number)
  // JST 月末 = 翌月 1日 JST から 1日引いた日
  // new Date(y, m, 0) は ローカル時刻で「翌月 0日目 = 月末」を返す
  // ローカルが JST でなくてもこれは月の最終日の日付値が取れる
  const lastDay = new Date(y, m, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

/** N日前の JST 日付 'YYYY-MM-DD' */
export function daysAgoJST(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return toJSTDateString(d)
}

/** N日後の JST 日付 */
export function daysLaterJST(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return toJSTDateString(d)
}

/** 2つの YYYY-MM-DD の日数差を返す（a - b）。同日なら 0 */
export function diffDaysJST(a: string, b: string): number {
  const aMs = parseJSTDate(a).getTime()
  const bMs = parseJSTDate(b).getTime()
  return Math.round((aMs - bMs) / (24 * 60 * 60 * 1000))
}

/** 月末日の Date オブジェクト（JST）を返す。レポート集計で使う */
export function endOfMonthJST(month: string): Date {
  return parseJSTDate(getMonthEndDateJST(month))
}

/** 月初日の Date オブジェクト（JST）を返す */
export function startOfMonthJST(month: string): Date {
  return parseJSTDate(`${month}-01`)
}
