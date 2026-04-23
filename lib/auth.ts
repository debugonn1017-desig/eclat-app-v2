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

/** Check if current admin user has a specific permission */
export async function checkPermission(permission: string): Promise<boolean> {
  const p = await getCurrentProfile()
  if (!p) return false
  if (p.is_owner) return true
  if (p.role !== 'admin') return false

  const supabase = await createClient()
  const { data } = await supabase
    .from('staff_permissions')
    .select('enabled')
    .eq('staff_id', p.id)
    .eq('permission', permission)
    .maybeSingle()

  return data?.enabled ?? false
}

/**
 * Verifies the caller is an admin with a specific permission.
 * Owner always passes. Cast users are rejected (use requireUser for cast).
 * Throws UNAUTHENTICATED / FORBIDDEN on failure.
 */
export async function requirePermission(permission: string): Promise<Profile> {
  const p = await getCurrentProfile()
  if (!p) throw new Error('UNAUTHENTICATED')
  if (p.role !== 'admin') throw new Error('FORBIDDEN')
  if (p.is_owner) return p

  const supabase = await createClient()
  const { data } = await supabase
    .from('staff_permissions')
    .select('enabled')
    .eq('staff_id', p.id)
    .eq('permission', permission)
    .maybeSingle()

  if (!data?.enabled) throw new Error('FORBIDDEN')
  return p
}
