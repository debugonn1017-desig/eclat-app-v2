// Staff permission + status management (owner only).
//   PATCH /api/admin/staff/:staffId -> toggle permission or update active status
//   DELETE /api/admin/staff/:staffId -> deactivate staff member
import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    await requireOwner()
    const { staffId } = await params

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: '不正なリクエスト' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Toggle permission
    if (body.permission && typeof body.enabled === 'boolean') {
      const { error } = await admin
        .from('staff_permissions')
        .upsert(
          {
            staff_id: staffId,
            permission: body.permission,
            enabled: body.enabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'staff_id,permission' }
        )

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    // Toggle active status
    if (typeof body.is_active === 'boolean') {
      const { error } = await admin
        .from('profiles')
        .update({ is_active: body.is_active })
        .eq('id', staffId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    // Update credentials
    if (body.new_password || body.new_email) {
      const updates: Record<string, string> = {}
      if (body.new_password) updates.password = body.new_password
      if (body.new_email) updates.email = body.new_email

      const { error } = await admin.auth.admin.updateUserById(staffId, updates)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: '更新内容がありません' }, { status: 400 })
  } catch (err) {
    return errorResponse(err)
  }
}
