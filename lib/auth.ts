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
    .select('id, role, cast_name, display_name, is_active')
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

/** Verifies the caller is any active user, returns the profile. */
export async function requireUser(): Promise<Profile> {
  const p = await getCurrentProfile()
  if (!p) throw new Error('UNAUTHENTICATED')
  return p
}
