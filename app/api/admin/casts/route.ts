// Admin-only cast management endpoints.
//   GET  /api/admin/casts   -> list all cast profiles (active + inactive)
//   POST /api/admin/casts   -> create a new cast auth user + profile row
//
// Every handler calls requireAdmin() first. The POST path uses the
// service-role client to create the auth user, and inserts the
// profiles row with role='cast'.
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function errorResponse(err: unknown) {
  const msg = err instanceof Error ? err.message : 'Unknown error'
  if (msg === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }
  if (msg === 'FORBIDDEN') {
    return NextResponse.json({ error: '管理者のみ実行できます' }, { status: 403 })
  }
  return NextResponse.json({ error: msg }, { status: 500 })
}

export async function GET() {
  try {
    await requireAdmin()
    const supabase = await createClient()

    // All cast profiles (active + inactive) for the admin UI.
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
      .eq('role', 'cast')
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('GET /api/admin/casts error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
    }

    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const castName = typeof body.cast_name === 'string' ? body.cast_name.trim() : ''
    const displayName =
      typeof body.display_name === 'string' ? body.display_name.trim() : ''

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'メールアドレスが不正です' }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'パスワードは8文字以上で設定してください' },
        { status: 400 }
      )
    }
    if (!castName) {
      return NextResponse.json({ error: 'キャスト名は必須です' }, { status: 400 })
    }

    const admin = createAdminClient()

    // 1) Create the auth user. email_confirm:true skips the confirmation email
    //    so the cast can log in immediately.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createErr || !created?.user) {
      console.error('admin.createUser error:', createErr)
      const msg = createErr?.message || 'ユーザー作成に失敗しました'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const userId = created.user.id

    // 2) Insert the profiles row. If this fails we roll back the auth user
    //    so we don't leave a dangling account with no profile.
    const profilePayload = {
      id: userId,
      role: 'cast' as const,
      cast_name: castName,
      display_name: displayName || castName,
      is_active: true,
    }

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .insert([profilePayload])
      .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
      .single()

    if (profileErr) {
      console.error('profiles insert error:', profileErr)
      // rollback
      await admin.auth.admin.deleteUser(userId).catch((e) => {
        console.error('rollback deleteUser failed:', e)
      })
      return NextResponse.json({ error: profileErr.message }, { status: 500 })
    }

    return NextResponse.json(profile, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
