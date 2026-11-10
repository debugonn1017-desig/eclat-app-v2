import type { createAdminClient } from './supabase/admin'
import { fetchAllPaginated } from './supabaseHelpers'

/** 認可後のみ。初回来店日のみ登録済みの⭐️場内を、追いかけ専用の対象として補う。 */
export async function fetchStaffStarInitialVisitCustomerIds(client: ReturnType<typeof createAdminClient>, date: string, today: string): Promise<Set<string>> {
  const candidates = await fetchAllPaginated<{ id: string | number }>((from, to) => client.from('customers')
    .select('id').eq('is_starred', true).eq('nomination_status', '場内').eq('first_visit_date', date)
    .or('customer_rank.is.null,customer_rank.neq.切れた').order('id', { ascending: true }).range(from, to))
  if (candidates.length >= 100000) throw new Error('初回来店日の対象者の取得上限を超えました')
  const actualIds = new Set<string>()
  let actualCount = 0
  for (let index = 0; index < candidates.length; index += 200) {
    const visits = await fetchAllPaginated<{ customer_id: string | number }>((from, to) => client.from('customer_visits')
      .select('customer_id').in('customer_id', candidates.slice(index, index + 200).map(customer => customer.id))
      .lte('visit_date', today).or('is_planned.is.null,is_planned.eq.false')
      .order('id', { ascending: true }).range(from, to))
    actualCount += visits.length
    if (visits.length >= 100000 || actualCount >= 100000) throw new Error('実来店の有無の取得上限を超えました')
    for (const visit of visits) actualIds.add(String(visit.customer_id))
  }
  return new Set(candidates.filter(customer => !actualIds.has(String(customer.id))).map(customer => String(customer.id)))
}

/** 指定日の実場内記録に、まだ実来店行がない初回来店日の⭐️場内だけを補完する。 */
export async function fetchStaffStarVisitCustomerIds(client: ReturnType<typeof createAdminClient>, date: string, today: string): Promise<Set<string>> {
  const visits = await fetchAllPaginated<{ customer_id: string | number }>((from, to) => client.from('customer_visits')
    .select('customer_id').eq('visit_date', date).eq('nomination_status_at_visit', '場内').or('is_planned.is.null,is_planned.eq.false')
    .order('id', { ascending: true }).range(from, to))
  if (visits.length >= 100000) throw new Error('指定日の実来店の取得上限を超えました')
  const firstVisitIds = await fetchStaffStarInitialVisitCustomerIds(client, date, today)
  return new Set([...visits.map(row => String(row.customer_id)), ...firstVisitIds])
}
