import type { Customer } from '@/types'
import type { StarCycle } from '@/lib/starLog'
import { classifyCustomersTab } from '@/lib/customerCategory'
import { starredElapsedDays } from '@/lib/starredCustomers'

export type StarredPrintRow = {
  id: string; name: string; nickname: string | null; nomination: string | null; rank: string | null
  region: string | null; lastVisit: string | null; days: number | null
  visitCount: number; averageSpend: number; totalSales: number
  startedOn: string | null; checkedOn: string | null; status: string | null; logAvailable: boolean
}
export type StarredPrintReport = {
  castName: string; asOf: string; sortLabel: string; count: number
  groups: { label: string; rows: StarredPrintRow[] }[]
}

/** 印刷は画面の検索・確認状況・折りたたみ・日数条件を使わず、閲覧中の担当の⭐️全員。 */
export function buildStarredPrintReport({ customers, starredIds, castName, displayName, today, sortLabel, compare, lastVisits, visitCounts, averageSpend, totalSales, cycles, logsReady }: {
  customers: readonly Customer[]; starredIds: ReadonlySet<string>; castName: string; displayName: string
  today: string; sortLabel: string; compare: (a: Customer, b: Customer) => number
  lastVisits: ReadonlyMap<string, string>; visitCounts: ReadonlyMap<string, number>
  averageSpend: ReadonlyMap<string, number>; totalSales: ReadonlyMap<string, number>
  cycles: ReadonlyMap<string, StarCycle>; logsReady: boolean
}): StarredPrintReport {
  const categories = ['県内顧客', '県外顧客', 'ランクC', 'その他', '場内', 'フリー', '切れた', '未分類']
  const groups = new Map<string, Customer[]>()
  const seen = new Set<string>()
  for (const customer of customers) {
    const id = String(customer.id)
    if (!starredIds.has(id) || customer.cast_name !== castName || seen.has(id)) continue
    seen.add(id)
    // 不正な指名区分も「全員」から黙って欠落させない。
    const category = classifyCustomersTab(customer) ?? '未分類'
    const list = groups.get(category) ?? []
    list.push(customer)
    groups.set(category, list)
  }
  return {
    castName: displayName || castName, asOf: today, sortLabel, count: seen.size,
    groups: categories.flatMap(label => {
      const customers = groups.get(label)
      if (!customers?.length) return []
      return [{ label: label === '切れた' ? '切れたお客様' : label, rows: [...customers].sort(compare).map(customer => {
        const id = String(customer.id), lastVisit = lastVisits.get(id) ?? null
        const cycle = logsReady ? cycles.get(id) : undefined
        return {
          id, name: customer.customer_name || customer.nickname || 'お名前未登録', nickname: customer.nickname || null,
          nomination: customer.nomination_status || null, rank: customer.customer_rank || null, region: customer.region || null,
          lastVisit, days: starredElapsedDays(today, lastVisit), visitCount: visitCounts.get(id) ?? 0,
          averageSpend: averageSpend.get(id) ?? 0, totalSales: totalSales.get(id) ?? 0,
          startedOn: cycle?.started_on ?? null, checkedOn: cycle?.last_checked_on ?? null,
          status: cycle?.last_status ?? null, logAvailable: logsReady,
        }
      }) }]
    }),
  }
}
