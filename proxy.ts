// Next.js 16 renamed middleware to "proxy".
// Runs on every request to refresh the Supabase session cookie and
// redirect unauthenticated users to /login.
import { updateSession } from '@/lib/supabase/middleware'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - /api (routes handle their own auth — we don't want to redirect fetch() to HTML)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico and any file with an extension (images, fonts, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
