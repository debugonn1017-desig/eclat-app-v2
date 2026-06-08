// Data Access Layer (DAL) for authentication.
// Always use these helpers from Server Components / Route Handlers /
// Server Actions to read the current user + role, never trust the client.
import { createClient } from '@/lib/supabase/server'

export type UserRole = 'admin' | 'cast'

export type Profile = {
  id: string
  role: UserRole
  cast_name: string | null
  display_name: string | null
  is_active: boolean
  is_owner: boolean
}

/**
 * Returns the current user's profile, or null if not logged in / inactive.
 * Inactive cast members are treated as logged out.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, cast_name, display_name, is_active, is_owner')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !data) return null
  if (!data.is_active) return null

  return data as Profile
}

/** Verifies the caller is an active admin, returns the profile. */
export async function requireAdmin(): Promise<Profile> {
  const p = await getCurrentProfile()
  if (!p) throw new Error('UNAUTHENTICATED')
  if (p.role !== 'admin') throw new Error('FORBIDDEN')
  return p
}

/** Verifies the caller is the owner (拓馬), returns the profile. */
export async function requireOwner(): Promise<Profile> {
  const p = await getCurrentProfile()
  if (!p) throw new Error('UNAUTHENTICATED')
  if (!p.is_owner) throw new Error('FORBIDDEN')
  return p
}

/** Verifies the caller is any active user, returns the profile. */
export async function requireUser(): Promise<Profile> {
  const p = await getCurrentProfile()
  if (!p) throw new Error('UNAUTHENTICATED')
  return p
}

// 子 → 親 の包含関係（v6: types/index.ts の PERMISSION_INCLUDES の逆引き）
//   どれか1つでも親が enabled なら子は OK と判定する。
const PERMISSION_PARENTS: Record<string, string[]> = {
  '顧客.閲覧': ['顧客.編集', '顧客.全店分析'],
  'キャスト.閲覧': ['キャスト.アカウント管理'],
  'KPI.閲覧': ['KPI.詳細分析'],
  'シフト.閲覧': ['シフト.管理'],
  '売上.閲覧': ['売上.入力'],
  'お知らせ.閲覧': ['お知らせ.投稿', 'お知らせ.管理'],
  'お知らせ.投稿': ['お知らせ.管理'],
  'レポート.閲覧': ['レポート.出力', 'レポート.全店ビュー'],
}

/** Check if current admin user has a specific permission.
 *  上位権限の包含も考慮する（例: 'お知らせ.管理' を持っていれば 'お知らせ.閲覧' も true）。
 */
export async function checkPermission(permission: string): Promise<boolean> {
  const p = await getCurrentProfile()
  if (!p) return false
  if (p.is_owner) return true
  if (p.role !== 'admin') return false

  const supabase = await createClient()
  // チェック対象の権限 + その親権限（あれば）すべてを 1 クエリで取得
  const requiredKeys = [permission, ...(PERMISSION_PARENTS[permission] ?? [])]
  const { data } = await supabase
    .from('staff_permissions')
    .select('permission, enabled')
    .eq('staff_id', p.id)
    .in('permission', requiredKeys)

  if (!data) return false
  return data.some(row => row.enabled === true)
}

/**
 * Verifies the caller is an admin with a specific permission.
 * Owner always passes. Cast users are rejected (use requireUser for cast).
 * 上位権限の包含も考慮する。
 * Throws UNAUTHENTICATED / FORBIDDEN on failure.
 */
export async function requirePermission(permission: string): Promise<Profile> {
  const p = await getCurrentProfile()
  if (!p) throw new Error('UNAUTHENTICATED')
  if (p.role !== 'admin') throw new Error('FORBIDDEN')
  if (p.is_owner) return p

  const supabase = await createClient()
  const requiredKeys = [permission, ...(PERMISSION_PARENTS[permission] ?? [])]
  const { data } = await supabase
    .from('staff_permissions')
    .select('permission, enabled')
    .eq('staff_id', p.id)
    .in('permission', requiredKeys)

  if (!data || !data.some(row => row.enabled === true)) {
    throw new Error('FORBIDDEN')
  }
  return p
}

/**
 * Verifies the caller is an admin with at least ONE of the given permissions.
 * Owner always passes. Cast users are rejected.
 * 上位権限の包含も考慮する。
 * 例: requireAnyPermission(['キャスト.アカウント管理', 'お知らせ.投稿'])
 */
export async function requireAnyPermission(permissions: string[]): Promise<Profile> {
  const p = await getCurrentProfile()
  if (!p) throw new Error('UNAUTHENTICATED')
  if (p.role !== 'admin') throw new Error('FORBIDDEN')
  if (p.is_owner) return p

  const supabase = await createClient()
  // 包含親も含めた候補キー全部
  const allKeys = new Set<string>()
  for (const perm of permissions) {
    allKeys.add(perm)
    for (const parent of PERMISSION_PARENTS[perm] ?? []) allKeys.add(parent)
  }
  const { data } = await supabase
    .from('staff_permissions')
    .select('permission, enabled')
    .eq('staff_id', p.id)
    .in('permission', [...allKeys])

  if (!data || !data.some(row => row.enabled === true)) {
    throw new Error('FORBIDDEN')
  }
  return p
}
