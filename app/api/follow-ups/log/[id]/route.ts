import { NextResponse } from 'next/server'
import { checkPermission, getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await getCurrentProfile()
    if (!profile) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    if (profile.role === 'admin' && !profile.is_owner) {
      const allowed = await checkPermission('顧客.編集')
      if (!allowed) return NextResponse.json({ error: '顧客.編集の権限がありません' }, { status: 403 })
    }
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || (body as { action?: unknown }).action !== 'void') {
      return NextResponse.json({ error: '操作内容が不正です' }, { status: 400 })
    }
    const { id } = await params
    const supabase = await createClient()
    const { data: log, error: logError } = await supabase
      .from('follow_up_activity_logs')
      .select('id, event_type, actor_user_id, event_at, voided_at')
      .eq('id', id)
      .maybeSingle()
    if (logError) throw logError
    if (!log) return NextResponse.json({ error: '担当者チェックが見つかりません' }, { status: 404 })
    if (log.event_type !== 'check' || log.voided_at) {
      return NextResponse.json({ error: 'この記録は取り消せません' }, { status: 400 })
    }
    if (log.actor_user_id !== profile.id) {
      return NextResponse.json({ error: '自分が保存したチェックだけ取り消せます' }, { status: 403 })
    }
    if (Date.now() - new Date(log.event_at).getTime() > 60_000) {
      return NextResponse.json({ error: '取り消し可能時間を過ぎています' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('follow_up_activity_logs')
      .update({ voided_at: now, voided_by: profile.id })
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH /api/follow-ups/log/[id] error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : '担当者チェックを取り消せませんでした',
    }, { status: 500 })
  }
}
