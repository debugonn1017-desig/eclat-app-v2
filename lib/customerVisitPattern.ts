export const VISIT_PATTERN_SAMPLE_LIMIT = 10
export const VISIT_TIME_PRIORITY = [20, 21, 22, 23, 0] as const

export type VisitPatternHour = typeof VISIT_TIME_PRIORITY[number]

export type CustomerVisitPattern = {
  sampleVisitCount: number
  weekdayCodes: number[]
  earlyHour: VisitPatternHour | null
  earlyHourCount: number
  earlyHourLastVisitDate: string | null
  usualHour: VisitPatternHour | null
  usualHourCount: number
}

export type CustomerVisitPatternRow = {
  id?: string | number | null
  customer_id: string | number
  visit_date: string
  visit_time?: string | null
  is_planned?: boolean | null
}

export type CustomerSortKey =
  | 'standard'
  | 'earlyTime'
  | 'lastVisitOldest'
  | 'lastVisitNewest'
  | 'totalSpent'
  | 'visitCount'
  | 'avgSpend'
  | 'name'
  | 'rank'
  | 'lastContact'
  | 'nomination'

export const CUSTOMER_SORT_OPTIONS: ReadonlyArray<{ key: CustomerSortKey; label: string }> = [
  { key: 'standard', label: '標準' },
  { key: 'earlyTime', label: '早い時間の実績' },
  { key: 'lastVisitOldest', label: '最終来店が古い' },
  { key: 'lastVisitNewest', label: '最終来店が新しい' },
  { key: 'totalSpent', label: '累計売上が高い' },
  { key: 'visitCount', label: '来店回数が多い' },
  { key: 'avgSpend', label: '客単価が高い' },
  { key: 'name', label: 'お客様名' },
]

export const CUSTOMER_SEARCH_SORT_OPTIONS: ReadonlyArray<{ key: Exclude<CustomerSortKey, 'standard'>; label: string }> = [
  { key: 'name', label: 'お客様名' },
  { key: 'earlyTime', label: '早い時間の実績' },
  { key: 'lastVisitOldest', label: '最終来店が古い' },
  { key: 'lastVisitNewest', label: '最終来店が新しい' },
  { key: 'totalSpent', label: '累計売上が高い' },
  { key: 'visitCount', label: '来店回数が多い' },
  { key: 'avgSpend', label: '客単価が高い' },
  { key: 'rank', label: 'ランク' },
  { key: 'lastContact', label: '最終連絡' },
  { key: 'nomination', label: '指名状況' },
]

const WEEKDAY_LABELS: Record<number, string> = {
  1: '月',
  2: '火',
  3: '水',
  4: '木',
  5: '金',
  6: '土',
  7: '日',
}

function parseVisitHour(value: string | null | undefined): VisitPatternHour | null {
  if (!value) return null
  const match = /^(\d{1,2}):/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  return VISIT_TIME_PRIORITY.includes(hour as VisitPatternHour)
    ? hour as VisitPatternHour
    : null
}

function getIsoWeekday(dateValue: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateValue)
  if (!match) return null
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  const weekday = date.getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export function buildCustomerVisitPatterns(
  rows: CustomerVisitPatternRow[],
  sampleLimit = VISIT_PATTERN_SAMPLE_LIMIT,
): Record<string, CustomerVisitPattern> {
  const byCustomer = new Map<string, CustomerVisitPatternRow[]>()
  for (const row of rows) {
    if (row.is_planned === true) continue
    const key = String(row.customer_id)
    const list = byCustomer.get(key)
    if (list) list.push(row)
    else byCustomer.set(key, [row])
  }

  const result: Record<string, CustomerVisitPattern> = {}
  for (const [customerId, customerRows] of byCustomer) {
    const recent = [...customerRows]
      .sort((a, b) => {
        const byDate = b.visit_date.localeCompare(a.visit_date)
        if (byDate !== 0) return byDate
        const byTime = (b.visit_time ?? '').localeCompare(a.visit_time ?? '')
        if (byTime !== 0) return byTime
        return String(b.id ?? '').localeCompare(String(a.id ?? ''))
      })
      .slice(0, sampleLimit)

    const weekdayStats = new Map<number, { count: number; lastDate: string }>()
    const hourStats = new Map<VisitPatternHour, { count: number; lastDate: string }>()
    for (const row of recent) {
      const weekday = getIsoWeekday(row.visit_date)
      if (weekday !== null) {
        const previous = weekdayStats.get(weekday)
        weekdayStats.set(weekday, {
          count: (previous?.count ?? 0) + 1,
          lastDate: previous && previous.lastDate > row.visit_date ? previous.lastDate : row.visit_date,
        })
      }
      const hour = parseVisitHour(row.visit_time)
      if (hour !== null) {
        const previous = hourStats.get(hour)
        hourStats.set(hour, {
          count: (previous?.count ?? 0) + 1,
          lastDate: previous && previous.lastDate > row.visit_date ? previous.lastDate : row.visit_date,
        })
      }
    }

    const weekdayCodes = [...weekdayStats.entries()]
      .sort((a, b) =>
        b[1].count - a[1].count
        || b[1].lastDate.localeCompare(a[1].lastDate)
        || a[0] - b[0])
      .slice(0, 2)
      .map(([weekday]) => weekday)

    const earlyHour = VISIT_TIME_PRIORITY.find(hour => hourStats.has(hour)) ?? null
    const usualEntry = [...hourStats.entries()]
      .sort((a, b) =>
        b[1].count - a[1].count
        || b[1].lastDate.localeCompare(a[1].lastDate)
        || VISIT_TIME_PRIORITY.indexOf(a[0]) - VISIT_TIME_PRIORITY.indexOf(b[0]))[0]

    result[customerId] = {
      sampleVisitCount: recent.length,
      weekdayCodes,
      earlyHour,
      earlyHourCount: earlyHour === null ? 0 : hourStats.get(earlyHour)?.count ?? 0,
      earlyHourLastVisitDate: earlyHour === null ? null : hourStats.get(earlyHour)?.lastDate ?? null,
      usualHour: usualEntry?.[0] ?? null,
      usualHourCount: usualEntry?.[1].count ?? 0,
    }
  }
  return result
}

export function formatPatternWeekdays(weekdayCodes: number[]): string | null {
  const labels = weekdayCodes
    .map(code => WEEKDAY_LABELS[code])
    .filter((label): label is string => Boolean(label))
  return labels.length > 0 ? `${labels.join('・')}曜日` : null
}

export function getEarlyTimeSort(pattern: CustomerVisitPattern | null | undefined): number {
  if (pattern?.earlyHour == null) return VISIT_TIME_PRIORITY.length
  const index = VISIT_TIME_PRIORITY.indexOf(pattern.earlyHour)
  return index >= 0 ? index : VISIT_TIME_PRIORITY.length
}
