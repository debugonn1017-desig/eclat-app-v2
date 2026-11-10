/** ⭐️の追いかけだけに使う日付。実来店の回数・売上・最終来店日を変更しない。 */
export interface StarFollowUpCustomer {
  nomination_status?: string | null
  first_visit_date?: string | null
  customer_rank?: string | null
  is_starred?: boolean | null
}
export type StarFollowUpDateSource = 'visit' | 'first_visit' | null

export function validStarFollowUpDate(value: unknown, today: string): value is string {
  if (typeof value !== 'string' || !/^(20\d{2}|21\d{2})-\d{2}-\d{2}$/.test(value) || value > today) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** 実来店日を優先。実来店がない場内だけ、登録済みの初回来店日を基準にする。 */
export function starFollowUpDate(customer: StarFollowUpCustomer, actualLastVisit: string | null | undefined, today: string): string | null {
  if (actualLastVisit) return validStarFollowUpDate(actualLastVisit, today) ? actualLastVisit : null
  if (customer.nomination_status !== '場内' || customer.customer_rank === '切れた' || customer.is_starred === false) return null
  return validStarFollowUpDate(customer.first_visit_date, today) ? customer.first_visit_date : null
}

export function starFollowUpDateSource(customer: StarFollowUpCustomer, actualLastVisit: string | null | undefined, today: string): StarFollowUpDateSource {
  if (!starFollowUpDate(customer, actualLastVisit, today)) return null
  return actualLastVisit ? 'visit' : 'first_visit'
}
