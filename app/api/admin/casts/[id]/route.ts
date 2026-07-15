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
//
// v0.3.51-hotfix (Codex 指摘反映):
//   - リネームと is_active / cast_tier の併用は 400 で拒否 (部分成功の防止)。
//     display_name だけは RPC v2 の引数として同一トランザクションで一緒に更新できる
//   - リネーム成功後は追加クエリを行わず、既知の値から応答を組み立てる
//     (後続クエリの失敗で「成功したのにエラー表示」になる食い違いを排除)
//   - CAST_NOT_FOUND は SQLSTATE 'P0002' の code 判定に変更
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

    // v0.3.51-hotfix: リネームは is_active / cast_tier と同時に受け付けない。
    //   RPC (リネーム) と通常 update は別トランザクションのため、後半だけ失敗すると
    //   「名前は変わったのにエラー表示」という部分成功が起きる。display_name のみ
    //   RPC v2 の引数で同一トランザクション更新できるので併用可。
    if (newCastName && (typeof body.is_active === 'boolean' || body.cast_tier !== undefined)) {
      return NextResponse.json(
        { error: '名前の変更は他の項目と同時には行えません' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Safety: only cast profiles can be modified via this endpoint
    // (prevents an admin accidentally disabling themselves here).
    const { data: existing, error: fetchErr } = await admin
      .from('profiles')
      .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
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
    //   admin_rename_cast() v2 が profiles (cast_name + display_name) と
    //   customers.cast_name を1トランザクションで更新。同名への変更は no-op。
    const current = existing as {
      id: string
      role: string
      cast_name: string | null
      display_name: string | null
      cast_tier: string | null
      is_active: boolean
      created_at: string
    }
    const isRename = !!newCastName && newCastName !== current.cast_name

    if (isRename) {
      const displayNameParam =
        typeof payload.display_name === 'string' ? payload.display_name : null
      const { data: renameData, error: renameErr } = await admin.rpc(
        'admin_rename_cast',
        { p_cast_id: id, p_new_name: newCastName, p_display_name: displayNameParam }
      )

      if (renameErr) {
        // 23505 = unique_violation (profiles_cast_name_unique)
        if (renameErr.code === '23505') {
          return NextResponse.json(
            { error: 'その名前は既に別のキャストが使っています' },
            { status: 409 }
          )
        }
        // P0002 = no_data_found (RPC v2 の CAST_NOT_FOUND)。message は後方互換の保険
        if (renameErr.code === 'P0002' || renameErr.message?.includes('CAST_NOT_FOUND')) {
          return NextResponse.json({ error: 'キャストが見つかりません' }, { status: 404 })
        }
        // v0.3.51-hotfix2: 55P03 = lock_not_available (lock_timeout 3秒超過) /
        //   40P01 = deadlock_detected。どちらも一時的な競合なので再試行を案内
        if (renameErr.code === '55P03' || renameErr.code === '40P01') {
          return NextResponse.json(
            { error: '他の処理と競合しました。数秒おいてからもう一度お試しください' },
            { status: 503 }
          )
        }
        console.error('PATCH /api/admin/casts/[id] rename error:', renameErr, {
          id,
          newCastName,
        })
        return NextResponse.json({ error: renameErr.message }, { status: 500 })
      }

      // returns table(old_name, updated_customers) → 1行の配列
      const row = Array.isArray(renameData) ? renameData[0] : renameData
      const renamedCustomers =
        row && typeof row.updated_customers === 'number' ? row.updated_customers : 0

      // v0.3.51-hotfix: リネーム成功後は追加クエリを行わない。
      //   (再取得が失敗すると「変更は確定したのに 500」という食い違いになるため、
      //    応答は既知の最終状態から組み立てる)
      return NextResponse.json({
        ...current,
        cast_name: newCastName,
        display_name: displayNameParam ?? current.display_name,
        renamed_customers: renamedCustomers,
      })
    }

    // ── 通常更新 (is_active / display_name / cast_tier) ──
    //   同名リネーム (no-op) で他に更新項目がない場合は現在の状態をそのまま返す
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ ...current, renamed_customers: 0 })
    }

    const { data, error } = await admin
      .from('profiles')
      .update(payload)
      .eq('id', id)
      .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
      .single()

    if (error) {
      console.error('PATCH /api/admin/casts/[id] update error:', error, { id, payload })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ...data, renamed_customers: 0 })
  } catch (err) {
    return errorResponse(err)
  }
}
