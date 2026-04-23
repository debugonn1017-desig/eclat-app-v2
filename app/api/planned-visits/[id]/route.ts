// 来店予定の個別操作
//   PATCH  /api/planned-visits/[id] -> 編集・ステータス変更
//   DELETE /api/planned-visits/[id] -> 削除
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser()
    const supabase = await createClient()
    const { id } = await params

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
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser()
    const supabase = await createClient()
    const { id } = await params

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
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
