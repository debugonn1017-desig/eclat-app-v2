import type { createAdminClient } from './supabase/admin'
import { fetchAllPaginated } from './supabaseHelpers'

/** 認可後のみ使用。指定日に「場内」と保存された実来店がある顧客を重複なしで返す。現在の指名区分では補完しない。 */
export async function fetchStaffStarVisitCustomerIds(client: ReturnType<typeof createAdminClient>, date: string): Promise<Set<string>> {
  const visits = await fetchAllPaginated<{ customer_id: string | number }>((from, to) => client.from('customer_visits')
    .select('customer_id').eq('visit_date', date).eq('nomination_status_at_visit', '場内').or('is_planned.is.null,is_planned.eq.false')
    .order('id', { ascending: true }).range(from, to))
  if (visits.length >= 100000) throw new Error('指定日の実来店の取得上限を超えました')
  return new Set(visits.map(row => String(row.customer_id)))
}
