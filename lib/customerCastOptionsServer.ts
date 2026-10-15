import type { SupabaseClient } from '@supabase/supabase-js'
import type { CastManagementRow } from '@/types'
import type { CustomerCastOption } from './customerCastOptions'
import { groupCastManagementRows } from './castManagementOrder'
import { fetchAllPaginated } from './supabaseHelpers'

/** 呼び出し側でスタッフの顧客閲覧権限を確認してから使用する。 */
export async function loadCustomerCastOptions(db: SupabaseClient, orderDb: SupabaseClient): Promise<CustomerCastOption[]> {
  // プロフィールの可視範囲はセッションRLSを維持する。
  const rows = await fetchAllPaginated<CastManagementRow>((from, to) => db.from('profiles')
    .select('id, cast_name, display_name, cast_tier, is_active, joined_at, training_start_date')
    .eq('role', 'cast').not('cast_name', 'is', null).order('id').range(from, to))
  // 顧客閲覧のみのスタッフも保存順を利用できるよう、認可後に順序の1列だけ読む。
  // 管理APIの権限・テーブルのRLSを緩めず、revisionや更新者も公開しない。
  const { data, error } = await orderDb.from('cast_management_order')
    .select('ordered_cast_ids').eq('id', true).maybeSingle()
  if (error || !data || !Array.isArray(data.ordered_cast_ids)) throw new Error('キャストの共通並び順を取得できませんでした')
  if (rows.length >= 100000) throw new Error('キャスト一覧の取得上限を超えました')
  return groupCastManagementRows(rows, data.ordered_cast_ids).flatMap(group => group.rows)
    .filter((row): row is CastManagementRow & { cast_name: string } => Boolean(row.cast_name))
    .map(row => ({ id: row.id, cast_name: row.cast_name, display_name: row.display_name,
      cast_tier: row.cast_tier, is_active: row.is_active }))
}
