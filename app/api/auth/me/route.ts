// GET /api/auth/me -> current user profile + permissions
import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { STAFF_PERMISSIONS } from '@/types'

export async function GET() {
  try {
    const profile = await getCurrentProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // For admin users, fetch their permissions
    let permissions: Record<string, boolean> = {}
    if (profile.role === 'admin') {
      if (profile.is_owner) {
        // Owner has all permissions
        for (const p of STAFF_PERMISSIONS) {
          permissions[p] = true
        }
      } else {
        const supabase = await createClient()
        const { data } = await supabase
          .from('staff_permissions')
          .select('permission, enabled')
          .eq('staff_id', profile.id)

        for (const p of STAFF_PERMISSIONS) {
          const found = data?.find(d => d.permission === p)
          permissions[p] = found?.enabled ?? false
        }
      }
    }

    return NextResponse.json({
      id: profile.id,
      role: profile.role,
      display_name: profile.display_name,
      is_owner: profile.is_owner,
      permissions,
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
