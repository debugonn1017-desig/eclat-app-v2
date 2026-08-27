import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  CUSTOMER_STAFF_PERMISSION,
  type CustomerStaffOption,
} from '@/lib/customerStaff'

export async function getEligibleCustomerStaffOptions(): Promise<CustomerStaffOption[]> {
  const admin = createAdminClient()
  const { data: permissionRows, error: permissionError } = await admin
    .from('staff_permissions')
    .select('staff_id')
    .eq('permission', CUSTOMER_STAFF_PERMISSION)
    .eq('enabled', true)

  if (permissionError) throw permissionError
  const ids = [...new Set((permissionRows ?? []).map(row => String(row.staff_id)))]
  if (ids.length === 0) return []

  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id, display_name, created_at')
    .in('id', ids)
    .eq('role', 'admin')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (profileError) throw profileError
  return (profiles ?? []).map(profile => ({
    id: String(profile.id),
    display_name: profile.display_name?.trim() || '名前未設定',
  }))
}

export async function validateCustomerStaffIds(staffIds: string[]): Promise<CustomerStaffOption[]> {
  if (staffIds.length === 0) return []
  const options = await getEligibleCustomerStaffOptions()
  const optionMap = new Map(options.map(option => [option.id, option]))
  const resolved = staffIds.map(id => optionMap.get(id)).filter(Boolean) as CustomerStaffOption[]
  if (resolved.length !== staffIds.length) throw new Error('CUSTOMER_STAFF_NOT_ELIGIBLE')
  return resolved
}

export async function getCustomerStaffAssignments(customerId: number): Promise<CustomerStaffOption[]> {
  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('customer_staff_assignments')
    .select('staff_id, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true })
  if (error) throw error
  if (!rows?.length) return []

  const ids = rows.map(row => String(row.staff_id))
  const eligible = await getEligibleCustomerStaffOptions()
  const eligibleMap = new Map(eligible.map(option => [option.id, option]))
  // 退職・権限解除済みの黒服は現在の担当者として返さない。
  // 行自体は履歴保持のため残し、次回の明示的な選択保存で sync が整理する。
  return ids.map(id => eligibleMap.get(id)).filter(Boolean) as CustomerStaffOption[]
}

export async function syncCustomerStaffAssignments(args: {
  customerId: number
  staffIds: string[]
  actorId: string
  validatedOptions?: CustomerStaffOption[]
}): Promise<CustomerStaffOption[]> {
  const options = args.validatedOptions ?? await validateCustomerStaffIds(args.staffIds)
  const admin = createAdminClient()
  const { error } = await admin.rpc('sync_customer_staff_assignments', {
    p_customer_id: args.customerId,
    p_staff_ids: args.staffIds,
    p_actor_id: args.actorId,
  })
  if (error) throw error
  return options
}

export function customerStaffErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (message === 'CUSTOMER_STAFF_IDS_INVALID') return 'お客様担当の選択内容が不正です'
  if (message === 'CUSTOMER_STAFF_IDS_TOO_MANY') return 'お客様担当は20人以内で選択してください'
  if (message === 'CUSTOMER_STAFF_NOT_ELIGIBLE') return '選択したお客様担当が無効になっています。画面を再読み込みしてください'
  return 'お客様担当の保存に失敗しました'
}
