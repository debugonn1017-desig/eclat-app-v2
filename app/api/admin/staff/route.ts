// Staff management endpoints (owner only).
//   GET  /api/admin/staff  -> list all staff (admin-role users) with permissions
//   POST /api/admin/staff  -> create a new staff member
import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { STAFF_PERMISSIONS } from '@/types'

function errorResponse(err: unknown) {
  const msg = err instanceof Error ? err.message : 'Unknown error'
  if (msg === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }
  if (msg === 'FORBIDDEN') {
    return NextResponse.json({ error: 'オーナーのみ実行できます' }, { status: 403 })
  }
  return NextResponse.json({ error: msg }, { status: 500 })
}

export async function GET() {
  try {
    await requireOwner()
    const admin = createAdminClient()

    // Get all admin-role profiles
    const { data: profiles, error: pErr } = await admin
      .from('profiles')
      .select('id, role, display_name, is_owner, is_active, created_at')
      .eq('role', 'admin')
      .order('is_owner', { ascending: false })
      .order('created_at', { ascending: true })

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 })
    }

    // Get all permissions
    const { data: perms } = await admin
      .from('staff_permissions')
      .select('staff_id, permission, enabled')

    // Get emails from auth
    const { data: authData } = await admin.auth.admin.listUsers()
    const emailMap = new Map<string, string>()
    if (authData?.users) {
      for (const u of authData.users) {
        if (u.email) emailMap.set(u.id, u.email)
      }
    }

    // Build response
    const result = (profiles ?? []).map(p => {
      const staffPerms: Record<string, boolean> = {}
      for (const perm of STAFF_PERMISSIONS) {
        const found = perms?.find(
          sp => sp.staff_id === p.id && sp.permission === perm
        )
        staffPerms[perm] = found?.enabled ?? false
      }

      return {
        id: p.id,
        display_name: p.display_name,
        email: emailMap.get(p.id) ?? '',
        is_owner: p.is_owner,
        is_active: p.is_active,
        created_at: p.created_at,
        permissions: staffPerms,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    await requireOwner()

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
    }

    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'メールアドレスが不正です' }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'パスワードは8文字以上で設定してください' }, { status: 400 })
    }
    if (!displayName) {
      return NextResponse.json({ error: '表示名は必須です' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1) Create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createErr || !created?.user) {
      const msg = createErr?.message || 'ユーザー作成に失敗しました'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const userId = created.user.id

    // 2) Insert profile with role=admin, is_owner=false
    const { error: profileErr } = await admin
      .from('profiles')
      .insert([{
        id: userId,
        role: 'admin',
        display_name: displayName,
        cast_name: null,
        is_active: true,
        is_owner: false,
      }])

    if (profileErr) {
      // Rollback auth user
      await admin.auth.admin.deleteUser(userId).catch(() => {})
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    // 3) Insert default permissions (all disabled)
    const permRows = STAFF_PERMISSIONS.map(perm => ({
      staff_id: userId,
      permission: perm,
      enabled: false,
    }))

    await admin.from('staff_permissions').insert(permRows)

    return NextResponse.json({ id: userId, display_name: displayName }, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
