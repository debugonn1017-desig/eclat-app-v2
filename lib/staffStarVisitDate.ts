import type { createAdminClient } from './supabase/admin'
import { fetchAllPaginated } from './supabaseHelpers'

/** スタッフの顧客閲覧認可後のみ使用。最終来店ではなく、指定日の実来店を重複なしで返す。 */
export async function fetchStaffStarVisitCustomerIds(client: ReturnType<typeof createAdminClient>, date: string): Promise<Set<string>> {
  const visits = await fetchAllPaginated<{ customer_id: string | number }>((from, to) => client.from('customer_visits')
    .select('customer_id').eq('visit_date', date).or('is_planned.is.null,is_planned.eq.false')
    .order('id', { ascending: true }).range(from, to))
  if (visits.length >= 100000) throw new Error('指定日の実来店の取得上限を超えました')
  return new Set(visits.map(row => String(row.customer_id)))
}
