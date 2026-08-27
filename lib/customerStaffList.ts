export const CUSTOMER_STAFF_RANK_GROUPS = ['S', 'A', 'B', 'C', '切れた', '未設定'] as const

export type CustomerStaffRankGroup = typeof CUSTOMER_STAFF_RANK_GROUPS[number]
export type CustomerStaffRankFilter = 'all' | CustomerStaffRankGroup
export type CustomerStaffNominationFilter = 'all' | '本指名' | '場内' | 'フリー' | 'other'
export type CustomerStaffRegionFilter = 'all' | 'fukuoka' | 'outside' | 'unset'
export type CustomerStaffSortKey =
  | 'standard'
  | 'totalSpent'
  | 'visitCount'
  | 'avgSpend'
  | 'lastVisitNewest'
  | 'lastVisitOldest'
  | 'name'

export type CustomerStaffListRow = {
  id: string
  customer_name: string | null
  nickname: string | null
  nomination_status: string | null
  customer_rank: string | null
  region: string | null
  search_text: string | null
  total_spent: number
  visit_count: number
  avg_per_visit: number
  last_visit_date: string | null
}

export type CustomerStaffListFilters = {
  query: string
  rank: CustomerStaffRankFilter
  nomination: CustomerStaffNominationFilter
  region: CustomerStaffRegionFilter
}

const STANDARD_NOMINATIONS = new Set(['本指名', '場内', 'フリー'])

export function normalizeCustomerStaffSearchText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    .replace(/\s/gu, '')
}

export function getCustomerStaffRankGroup(value: string | null | undefined): CustomerStaffRankGroup {
  return CUSTOMER_STAFF_RANK_GROUPS.includes(value as CustomerStaffRankGroup)
    ? value as CustomerStaffRankGroup
    : '未設定'
}

export function filterCustomerStaffCustomers<T extends CustomerStaffListRow>(
  rows: readonly T[],
  filters: CustomerStaffListFilters,
): T[] {
  const needle = normalizeCustomerStaffSearchText(filters.query)

  return rows.filter(row => {
    if (needle) {
      const searchable = normalizeCustomerStaffSearchText(
        row.search_text ?? `${row.customer_name ?? ''} ${row.nickname ?? ''}`,
      )
      if (!searchable.includes(needle)) return false
    }

    if (filters.rank !== 'all' && getCustomerStaffRankGroup(row.customer_rank) !== filters.rank) {
      return false
    }

    if (filters.nomination !== 'all') {
      if (filters.nomination === 'other') {
        if (STANDARD_NOMINATIONS.has(row.nomination_status ?? '')) return false
      } else if (row.nomination_status !== filters.nomination) {
        return false
      }
    }

    if (filters.region !== 'all') {
      const region = typeof row.region === 'string' ? row.region.trim() : ''
      if (filters.region === 'fukuoka' && region !== '福岡県') return false
      if (filters.region === 'outside' && (!region || region === '福岡県')) return false
      if (filters.region === 'unset' && region) return false
    }

    return true
  })
}

export function sortCustomerStaffCustomers<T extends CustomerStaffListRow>(
  rows: readonly T[],
  sortKey: CustomerStaffSortKey,
): T[] {
  const sourceOrder = new Map(rows.map((row, index) => [row.id, index]))
  const fallback = (a: T, b: T) =>
    (sourceOrder.get(a.id) ?? 0) - (sourceOrder.get(b.id) ?? 0)

  return [...rows].sort((a, b) => {
    if (sortKey === 'totalSpent') {
      return b.total_spent - a.total_spent || fallback(a, b)
    }
    if (sortKey === 'visitCount') {
      return b.visit_count - a.visit_count || fallback(a, b)
    }
    if (sortKey === 'avgSpend') {
      return b.avg_per_visit - a.avg_per_visit || fallback(a, b)
    }
    if (sortKey === 'lastVisitNewest' || sortKey === 'lastVisitOldest') {
      if (a.last_visit_date === null && b.last_visit_date !== null) {
        return sortKey === 'lastVisitOldest' ? -1 : 1
      }
      if (a.last_visit_date !== null && b.last_visit_date === null) {
        return sortKey === 'lastVisitOldest' ? 1 : -1
      }
      if (a.last_visit_date && b.last_visit_date && a.last_visit_date !== b.last_visit_date) {
        return sortKey === 'lastVisitOldest'
          ? a.last_visit_date.localeCompare(b.last_visit_date)
          : b.last_visit_date.localeCompare(a.last_visit_date)
      }
      return fallback(a, b)
    }
    if (sortKey === 'name') {
      const aName = a.customer_name || a.nickname || 'お名前未登録'
      const bName = b.customer_name || b.nickname || 'お名前未登録'
      return aName.localeCompare(bName, 'ja') || fallback(a, b)
    }
    return fallback(a, b)
  })
}

export function groupCustomerStaffCustomers<T extends CustomerStaffListRow>(rows: readonly T[]) {
  const groups = new Map<CustomerStaffRankGroup, T[]>(
    CUSTOMER_STAFF_RANK_GROUPS.map(rank => [rank, []]),
  )
  for (const row of rows) {
    groups.get(getCustomerStaffRankGroup(row.customer_rank))?.push(row)
  }
  return CUSTOMER_STAFF_RANK_GROUPS.map(rank => ({ rank, items: groups.get(rank) ?? [] }))
}
