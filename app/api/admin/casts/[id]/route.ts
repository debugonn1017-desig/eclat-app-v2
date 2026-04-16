// Admin-only: update a single cast profile.
//   PATCH /api/admin/casts/[id]
//     body: { is_active?: boolean, display_name?: string, cast_name?: string }
//
// Used to toggle 退店/復帰 (is_active) or rename a cast.
// We do NOT expose DELETE here — soft-delete via is_active=false instead,
// so existing customer rows keep their cast_name reference.
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'IDが必要です' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
    }

    const payload: Record<string, unknown> = {}
    if (typeof body.is_active === 'boolean') payload.is_active = body.is_active
    if (typeof body.display_name === 'string') {
      const v = body.display_name.trim()
      if (v) payload.display_name = v
    }
    if (typeof body.cast_name === 'string') {
      const v = body.cast_name.trim()
      if (v) payload.cast_name = v
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: '更新する項目がありません' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Safety: only cast profiles can be modified via this endpoint
    // (prevents an admin accidentally disabling themselves here).
    const { data: existing, error: fetchErr } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr) {
      console.error('PATCH /api/admin/casts/[id] fetch error:', fetchErr)
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    if (!existing) {
      return NextResponse.json({ error: 'キャストが見つかりません' }, { status: 404 })
    }

    if ((existing as { role: string }).role !== 'cast') {
      return NextResponse.json(
        { error: '管理者アカウントはこの画面から変更できません' },
        { status: 400 }
      )
    }

    const { data, error } = await admin
      .from('profiles')
      .update(payload)
      .eq('id', id)
      .select('id, role, cast_name, display_name, is_active, created_at')
      .single()

    if (error) {
      console.error('PATCH /api/admin/casts/[id] update error:', error, { id, payload })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    return errorResponse(err)
  }
}
