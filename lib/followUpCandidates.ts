import type { CustomerRank } from '../types'

export type FollowUpCandidateCustomer = {
  id: string
  customer_name: string | null
  nickname: string | null
  customer_rank: CustomerRank | null
  nomination_status: string | null
  region: string | null
}

export type FollowUpCandidateVisit = {
  customer_id: string
  visit_date: string
  amount_spent: number | null
}

export type FollowUpCandidate = FollowUpCandidateCustomer & {
  reasons: string[]
  days_since_last_visit: number | null
  typical_interval_days: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function dateToUtcMs(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(parsed) ? parsed : null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

/**
 * 自動候補を提示するだけの純粋関数。
 * customer_rank や顧客分類は一切変更せず、手動追加も行わない。
 */
export function buildFollowUpCandidates(
  customers: FollowUpCandidateCustomer[],
  visits: FollowUpCandidateVisit[],
  activeCustomerIds: ReadonlySet<string>,
  now = new Date(),
): FollowUpCandidate[] {
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const visitsByCustomer = new Map<string, FollowUpCandidateVisit[]>()

  for (const visit of visits) {
    const id = String(visit.customer_id)
    const list = visitsByCustomer.get(id)
    if (list) list.push(visit)
    else visitsByCustomer.set(id, [visit])
  }

  const candidates: FollowUpCandidate[] = []
  for (const customer of customers) {
    const customerId = String(customer.id)
    if (activeCustomerIds.has(customerId)) continue
    if (customer.customer_rank !== 'A' && customer.customer_rank !== 'B') continue

    const customerVisits = (visitsByCustomer.get(customerId) ?? [])
      .map(visit => ({ visit, ms: dateToUtcMs(visit.visit_date) }))
      .filter((entry): entry is { visit: FollowUpCandidateVisit; ms: number } => entry.ms !== null)
      .sort((a, b) => a.ms - b.ms)

    const reasons: string[] = []
    const uniqueVisitDays = [...new Set(customerVisits.map(entry => entry.ms))]
    const intervals: number[] = []
    for (let index = 1; index < uniqueVisitDays.length; index += 1) {
      intervals.push(Math.max(0, Math.round((uniqueVisitDays[index] - uniqueVisitDays[index - 1]) / DAY_MS)))
    }

    const typicalIntervalDays = uniqueVisitDays.length >= 3 ? median(intervals) : null
    const lastVisitMs = uniqueVisitDays.length > 0 ? uniqueVisitDays[uniqueVisitDays.length - 1] : null
    const daysSinceLastVisit = lastVisitMs === null
      ? null
      : Math.max(0, Math.floor((todayMs - lastVisitMs) / DAY_MS))

    if (daysSinceLastVisit === null) {
      reasons.push('来店記録がありません')
    } else if (typicalIntervalDays !== null && typicalIntervalDays > 0) {
      const threshold = Math.ceil(typicalIntervalDays * 1.5)
      if (daysSinceLastVisit > threshold) {
        reasons.push(`いつもの来店間隔（約${typicalIntervalDays}日）の1.5倍を超えています`)
      }
    } else {
      const fallbackDays = customer.customer_rank === 'A' ? 45 : 60
      if (daysSinceLastVisit > fallbackDays) {
        reasons.push(`${customer.customer_rank}ランクで最終来店から${daysSinceLastVisit}日経過しています`)
      }
    }

    const recentStart = todayMs - 60 * DAY_MS
    const previousStart = todayMs - 120 * DAY_MS
    const recent = customerVisits.filter(entry => entry.ms > recentStart && entry.ms <= todayMs)
    const previous = customerVisits.filter(entry => entry.ms > previousStart && entry.ms <= recentStart)

    if (previous.length >= 2) {
      if (recent.length <= previous.length * 0.5) {
        reasons.push('直近60日の来店回数が、その前の60日より50%以上減っています')
      }
      const recentSales = recent.reduce((sum, entry) => sum + (Number(entry.visit.amount_spent) || 0), 0)
      const previousSales = previous.reduce((sum, entry) => sum + (Number(entry.visit.amount_spent) || 0), 0)
      if (previousSales > 0 && recentSales <= previousSales * 0.5) {
        reasons.push('直近60日の売上が、その前の60日より50%以上減っています')
      }
    }

    if (reasons.length === 0) continue
    candidates.push({
      ...customer,
      id: customerId,
      reasons: [...new Set(reasons)],
      days_since_last_visit: daysSinceLastVisit,
      typical_interval_days: typicalIntervalDays,
    })
  }

  return candidates.sort((a, b) => {
    const aDays = a.days_since_last_visit ?? Number.MAX_SAFE_INTEGER
    const bDays = b.days_since_last_visit ?? Number.MAX_SAFE_INTEGER
    return bDays - aDays
  })
}
