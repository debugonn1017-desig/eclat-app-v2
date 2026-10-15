export const STARRED_BANAI_VISIT_DAYS = [1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30] as const
export const STAFF_STAR_VIEWS = [
  { value: 'banai', label: '場内・対象日' },
  { value: 'honshimei', label: '本指名' },
  { value: 'all', label: '⭐️全員' },
] as const
export type StaffStarView = typeof STAFF_STAR_VIEWS[number]['value']

export type StarNominationCount = { total: number; honshimei: number; banai: number }
export type StarCountSummary = { total: StarNominationCount; byCast: Record<string, StarNominationCount> }
export type StarCounts = StarCountSummary & { matched?: StarCountSummary }
export type StarCountRow = { cast_name: string | null; nomination_status: string | null }
const emptyCount = (): StarNominationCount => ({ total: 0, honshimei: 0, banai: 0 })

/** 日付は実来店のYYYY-MM-DD。JSTの暦日差（本日0・未来は負数）。 */
export function starredElapsedDays(today: string | null, lastVisit: string | null | undefined): number | null {
  if (!today || !lastVisit || !/^\d{4}-\d{2}-\d{2}$/.test(lastVisit)) return null
  const date = Date.parse(`${lastVisit}T00:00:00Z`)
  const now = Date.parse(`${today}T00:00:00Z`)
  if (!Number.isFinite(date) || !Number.isFinite(now) || new Date(date).toISOString().slice(0, 10) !== lastVisit) return null
  return Math.round((now - date) / 86_400_000)
}

/** キャスト本人の本日連絡。星のない人・切れた・未記録/本日/未来は対象外。 */
export function isStarredContactDue(customer: { is_starred?: boolean; nomination_status?: string | null; customer_rank?: string | null }, days: number | null): boolean {
  if (!customer.is_starred || customer.customer_rank === '切れた' || days === null || !Number.isSafeInteger(days) || days <= 0) return false
  if (customer.nomination_status === '場内') return (STARRED_BANAI_VISIT_DAYS as readonly number[]).includes(days)
  return customer.nomination_status === '本指名' && days % 3 === 0
}

/** 本日連絡の3分類は指名・ランクでなく地域別。地域なしはその他。 */
export function starredContactCategory(customer: { region?: string | null }): '県内' | '県外' | 'その他' {
  const region = customer.region?.trim()
  return !region ? 'その他' : region === '福岡県' ? '県内' : '県外'
}

/** 日数別→管理のキャスト順→DBの選択順。全件に適用してからページングする。 */
export function sortStarredCustomersByVisitDay<T extends { cast_name: unknown; metric_last_visit_date: string | null }>(rows: readonly T[], castNames: readonly string[], oldestFirst = false): T[] {
  return sortStarredCustomersByCast(rows, castNames).sort((a, b) => {
    if (a.metric_last_visit_date === b.metric_last_visit_date) return 0
    if (!a.metric_last_visit_date) return 1
    if (!b.metric_last_visit_date) return -1
    const order = b.metric_last_visit_date.localeCompare(a.metric_last_visit_date)
    return oldestFirst ? -order : order
  })
}

/** 名簿順が第一キー。同じ担当内は入力順（DBの選択された並び順）を維持。 */
export function sortStarredCustomersByCast<T extends { cast_name: unknown }>(rows: readonly T[], castNames: readonly string[]): T[] {
  const order = new Map<string, number>()
  for (const name of castNames) if (!order.has(name)) order.set(name, order.size)
  const nameOf = (row: T) => typeof row.cast_name === 'string' ? row.cast_name : ''
  return [...rows].sort((a, b) => {
    const aName = nameOf(a), bName = nameOf(b)
    const position = (order.get(aName) ?? order.size) - (order.get(bName) ?? order.size)
    if (position) return position
    if (aName === bName) return 0
    // 名簿にない担当は後方へまとめ、担当未設定は最後。
    if (!aName) return 1
    if (!bName) return -1
    return aName.localeCompare(bName, 'ja')
  })
}

/** 顧客行を1人として集計。来店回数・表示ページ・検索条件には依存しない。 */
export function countStarredCustomers(rows: readonly StarCountRow[]): StarCounts {
  const total = emptyCount()
  const byCast = new Map<string, StarNominationCount>()
  for (const row of rows) {
    const cast = row.cast_name ?? ''
    const count = byCast.get(cast) ?? emptyCount()
    for (const target of [total, count]) {
      target.total++
      if (row.nomination_status === '本指名') target.honshimei++
      if (row.nomination_status === '場内') target.banai++
    }
    byCast.set(cast, count)
  }
  return { total, byCast: Object.fromEntries(byCast) }
}

/** JSTの暦日から正確な対象日を生成。24時間経過やクライアントのTZに依存しない。 */
export function getStarredBanaiVisitDates(today: string, visitDay: number | null = null): string[] {
  return STARRED_BANAI_VISIT_DAYS.filter(days => visitDay === null || days === visitDay).map(days => {
    const date = new Date(`${today}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - days)
    return date.toISOString().slice(0, 10)
  })
}

/** スタッフの表示切替と単日の指定。範囲指定・任意の式を受け付けない。 */
export function parseStaffStarFilters(params: URLSearchParams):
  | { ok: true; view: StaffStarView | null; visitDay: number | null }
  | { ok: false; error: string } {
  const view = params.get('starredView')
  const day = params.get('starredVisitDay')
  if (view !== null && !STAFF_STAR_VIEWS.some(option => option.value === view)) return { ok: false, error: '不正な starredView' }
  if (day !== null && (view !== 'banai' || !STARRED_BANAI_VISIT_DAYS.some(value => String(value) === day))) return { ok: false, error: '不正な starredVisitDay' }
  return { ok: true, view: view as StaffStarView | null, visitDay: day === null ? null : Number(day) }
}

/** 検索・名簿の対象人数で同じ条件を使用。⭐️限定/認可は呼び出し側で必須。 */
export function staffStarViewFilter(view: StaffStarView, today: string, visitDay: number | null): string | null {
  if (view === 'banai') return `and(nomination_status.eq.場内,metric_last_visit_date.in.(${getStarredBanaiVisitDates(today, visitDay).join(',')}))`
  if (view === 'honshimei') return 'nomination_status.eq.本指名'
  return null
}

/** 場内だけを日数対象に限定。本指名・それ以外の既存分類はそのまま。 */
export function starredBanaiVisitFilter(today: string): string {
  return `nomination_status.is.null,nomination_status.neq.場内,and(nomination_status.eq.場内,metric_last_visit_date.in.(${getStarredBanaiVisitDates(today).join(',')}))`
}
