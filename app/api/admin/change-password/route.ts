// Admin-only: change own password or a cast member's email/password.
//   POST /api/admin/change-password
//   body: { target_user_id?: string, new_password?: string, new_email?: string }
//
//   If target_user_id is omitted → change the admin's own password.
//   If target_user_id is set    → change that cast's email/password (admin only).

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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

export async function POST(request: Request) {
  try {
    const profile = await requireAdmin()

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
    }

    const { target_user_id, new_password, new_email } = body as {
      target_user_id?: string
      new_password?: string
      new_email?: string
    }

    // ── Self password change (admin changes own password) ──
    if (!target_user_id) {
      if (!new_password || typeof new_password !== 'string' || new_password.length < 8) {
        return NextResponse.json(
          { error: 'パスワードは8文字以上で入力してください' },
          { status: 400 }
        )
      }

      const supabase = await createClient()
      const { error } = await supabase.auth.updateUser({ password: new_password })

      if (error) {
        console.error('change-password (self) error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'パスワードを変更しました' })
    }

    // ── Admin changes a cast member's email/password ──
    if (!new_password && !new_email) {
      return NextResponse.json(
        { error: '変更するメールアドレスまたはパスワードを入力してください' },
        { status: 400 }
      )
    }

    if (new_password && (typeof new_password !== 'string' || new_password.length < 8)) {
      return NextResponse.json(
        { error: 'パスワードは8文字以上で入力してください' },
        { status: 400 }
      )
    }

    if (new_email && (typeof new_email !== 'string' || !new_email.includes('@'))) {
      return NextResponse.json(
        { error: '正しいメールアドレスを入力してください' },
        { status: 400 }
      )
    }

    // Prevent admin from modifying themselves through this path
    if (target_user_id === profile.id) {
      return NextResponse.json(
        { error: '管理者自身のアカウントはこの方法では変更できません' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Verify target is a cast member
    const { data: targetProfile, error: fetchErr } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', target_user_id)
      .maybeSingle()

    if (fetchErr || !targetProfile) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
    }

    if ((targetProfile as { role: string }).role !== 'cast') {
      return NextResponse.json(
        { error: '管理者アカウントはこの画面から変更できません' },
        { status: 400 }
      )
    }

    // Build update payload for Supabase Auth
    const authUpdate: Record<string, unknown> = {}
    if (new_password) authUpdate.password = new_password
    if (new_email) authUpdate.email = new_email

    const { error: updateErr } = await admin.auth.admin.updateUserById(
      target_user_id,
      authUpdate
    )

    if (updateErr) {
      console.error('change-password (cast) error:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: new_email && new_password
        ? 'メールアドレスとパスワードを変更しました'
        : new_email
        ? 'メールアドレスを変更しました'
        : 'パスワードを変更しました',
    })
  } catch (err) {
    return errorResponse(err)
  }
}
