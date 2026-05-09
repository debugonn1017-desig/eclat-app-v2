// 来店予定の個別操作
//   PATCH  /api/planned-visits/[id] -> 編集・ステータス変更
//   DELETE /api/planned-visits/[id] -> 削除
import { NextResponse } from 'next/server'
import { requireUser, checkPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * 来店予定が操作者のスコープに入っているか検証する。
 * スタッフは「顧客.編集」権限が必要、キャストは自分の顧客のみ。
 */
async function verifyOwnership(plannedVisitId: number) {
  const profile = await requireUser()
  if (profile.role === 'admin') {
    if (!profile.is_owner) {
      const allowed = await checkPermission('顧客.編集')
      if (!allowed) throw new Error('FORBIDDEN')
    }
    return profile
  }
  // キャストは予定の顧客が自分の担当か確認
  const supabase = await createClient()
  const { data: pv } = await supabase
    .from('planned_visits')
    .select('customer_id, customers!inner(cast_name)')
    .eq('id', plannedVisitId)
    .single() as { data: { customer_id: number; customers: { cast_name: string } | { cast_name: string }[] } | null }
  if (!pv) throw new Error('NOT_FOUND')
  const c = Array.isArray(pv.customers) ? pv.customers[0] : pv.customers
  if (c?.cast_name !== profile.cast_name) throw new Error('FORBIDDEN')
  return profile
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await verifyOwnership(Number(id))
    const supabase = await createClient()

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '不正なリクエスト' }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    // 編集可能フィールド
    if (body.planned_date !== undefined) payload.planned_date = body.planned_date
    if (body.planned_time !== undefined) payload.planned_time = body.planned_time || null
    if (body.party_size !== undefined) payload.party_size = body.party_size ? Number(body.party_size) : null
    if (body.has_douhan !== undefined) payload.has_douhan = typeof body.has_douhan === 'boolean' ? body.has_douhan : null
    if (body.memo !== undefined) payload.memo = body.memo || null

    // ステータス変更
    if (body.status === 'キャンセル') {
      payload.status = 'キャンセル'
    }
    if (body.status === '来店済み') {
      payload.status = '来店済み'
      if (body.visit_id) payload.visit_id = body.visit_id
    }
    if (body.status === '予定') {
      payload.status = '予定'
      payload.visit_id = null
    }

    const { data, error } = await supabase
      .from('planned_visits')
      .update(payload)
      .eq('id', Number(id))
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'この操作の権限がありません' }, { status: 403 })
    }
    if (msg === 'NOT_FOUND') {
      return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await verifyOwnership(Number(id))
    const supabase = await createClient()

    const { error } = await supabase
      .from('planned_visits')
      .delete()
      .eq('id', Number(id))

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'この操作の権限がありません' }, { status: 403 })
    }
    if (msg === 'NOT_FOUND') {
      return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
