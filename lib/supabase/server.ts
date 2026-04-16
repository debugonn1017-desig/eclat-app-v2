// Server-side Supabase client for Route Handlers, Server Components, and Server Actions.
// Uses @supabase/ssr so the user's auth cookies are forwarded to PostgREST,
// which means RLS policies run as the logged-in user.
//
// In Next.js 16, `cookies()` is async and must be awaited.
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Route Handlers can call set; Server Components cannot.
            // When invoked from a Server Component, ignore the error —
            // proxy.ts will refresh the session on the next request.
          }
        },
      },
    }
  )
}
