export const STARRED_BANAI_VISIT_DAYS = [1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30] as const

export type StarNominationCount = { total: number; honshimei: number; banai: number }
export type StarCounts = { total: StarNominationCount; byCast: Record<string, StarNominationCount> }
export type StarCountRow = { cast_name: string | null; nomination_status: string | null }
const emptyCount = (): StarNominationCount => ({ total: 0, honshimei: 0, banai: 0 })

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
export function getStarredBanaiVisitDates(today: string): string[] {
  return STARRED_BANAI_VISIT_DAYS.map(days => {
    const date = new Date(`${today}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() - days)
    return date.toISOString().slice(0, 10)
  })
}

/** 場内だけを日数対象に限定。本指名・それ以外の既存分類はそのまま。 */
export function starredBanaiVisitFilter(today: string): string {
  return `nomination_status.is.null,nomination_status.neq.場内,and(nomination_status.eq.場内,metric_last_visit_date.in.(${getStarredBanaiVisitDates(today).join(',')}))`
}
