// Service-role Supabase client. Bypasses RLS. Use ONLY on the server
// for trusted operations (e.g. admin-only cast management) AFTER verifying
// that the caller is actually an admin.
//
// We type the schema loosely as `any` because we don't generate Database
// types. Without this, insert()/update() argument types collapse to `never`.
import { createClient, SupabaseClient } from '@supabase/supabase-js'

type AnyDb = any // eslint-disable-line @typescript-eslint/no-explicit-any

let cached: SupabaseClient<AnyDb, 'public', AnyDb> | null = null

export function createAdminClient(): SupabaseClient<AnyDb, 'public', AnyDb> {
  if (cached) return cached
  cached = createClient<AnyDb, 'public', AnyDb>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  return cached
}
