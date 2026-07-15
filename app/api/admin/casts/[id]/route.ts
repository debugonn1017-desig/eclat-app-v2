// Admin-only: update a single cast profile.
//   PATCH /api/admin/casts/[id]
//     body: { is_active?: boolean, display_name?: string, cast_name?: string, cast_tier?: string | null }
//
// Used to toggle 退店/復帰 (is_active) or rename a cast.
// We do NOT expose DELETE here — soft-delete via is_active=false instead,
// so existing customer rows keep their cast_name reference.
//
// v0.3.51: cast_name の変更は DB 関数 admin_rename_cast() (20260715 migration) 経由。
//   profiles.cast_name と customers.cast_name (担当顧客の紐づけ) を
//   1トランザクションで一斉更新する。profiles だけ変えると担当顧客が
//   集計から消え、RLS 不一致でキャスト本人からも見えなくなるため。
//   成功時はレスポンスに renamed_customers (更新した顧客数) を含める。
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

function errorResponse(err: unknown) {
  const msg = err instanceof Error ? err.message : 'Unknown error'
  if (msg === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }
  if (msg === 'FORBIDDEN') {
    return NextResponse.json({ error: 'この操作の権限がありません' }, { status: 403 })
  }
  return NextResponse.json({ error: msg }, { status: 500 })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('キャスト.アカウント管理')

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
    // v0.3.51: cast_name は payload に入れず、DB 関数 admin_rename_cast で処理する
    //   (customers.cast_name との一斉更新をトランザクションで保証するため)
    const newCastName =
      typeof body.cast_name === 'string' ? body.cast_name.trim() : ''
    if (body.cast_tier !== undefined) {
      // null means "未設定", string means a valid tier
      payload.cast_tier = body.cast_tier === null ? null : String(body.cast_tier)
    }

    if (Object.keys(payload).length === 0 && !newCastName) {
      return NextResponse.json({ error: '更新する項目がありません' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Safety: only cast profiles can be modified via this endpoint
    // (prevents an admin accidentally disabling themselves here).
    const { data: existing, error: fetchErr } = await admin
      .from('profiles')
      .select('id, role, cast_name')
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

    // ── v0.3.51: 名前変更 (源氏名リネーム) ─────────────────────
    //   admin_rename_cast() が profiles + customers を1トランザクションで更新。
    //   同名への変更は no-op としてスキップする。
    const oldCastName = (existing as { cast_name: string | null }).cast_name
    let renamedCustomers = 0
    if (newCastName && newCastName !== oldCastName) {
      const { data: renameData, error: renameErr } = await admin.rpc(
        'admin_rename_cast',
        { p_cast_id: id, p_new_name: newCastName }
      )

      if (renameErr) {
        // 23505 = unique_violation (profiles_cast_name_unique)
        if (renameErr.code === '23505') {
          return NextResponse.json(
            { error: 'その名前は既に別のキャストが使っています' },
            { status: 409 }
          )
        }
        if (renameErr.message?.includes('CAST_NOT_FOUND')) {
          return NextResponse.json({ error: 'キャストが見つかりません' }, { status: 404 })
        }
        console.error('PATCH /api/admin/casts/[id] rename error:', renameErr, {
          id,
          newCastName,
        })
        return NextResponse.json({ error: renameErr.message }, { status: 500 })
      }

      // returns table(old_name, updated_customers) → 1行の配列
      const row = Array.isArray(renameData) ? renameData[0] : renameData
      renamedCustomers =
        row && typeof row.updated_customers === 'number' ? row.updated_customers : 0
    }

    // ── その他の項目 (is_active / display_name / cast_tier) は従来どおり ──
    if (Object.keys(payload).length > 0) {
      const { error } = await admin
        .from('profiles')
        .update(payload)
        .eq('id', id)

      if (error) {
        console.error('PATCH /api/admin/casts/[id] update error:', error, { id, payload })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    // 最終状態を返す (リネームのみ / 通常更新のみ / 両方、いずれも同じ形)
    const { data, error } = await admin
      .from('profiles')
      .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
      .eq('id', id)
      .single()

    if (error) {
      console.error('PATCH /api/admin/casts/[id] reload error:', error, { id })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ...data, renamed_customers: renamedCustomers })
  } catch (err) {
    return errorResponse(err)
  }
}
