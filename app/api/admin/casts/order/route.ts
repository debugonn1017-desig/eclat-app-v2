import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { castManagementRosterKey, isCastManagementOrder, validCastManagementOrder } from '@/lib/castManagementOrder'
import type { CastManagementRow } from '@/types'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const columns = 'ordered_cast_ids, revision'
const unavailable = () => json({ error: '共通の並び順を読み込めません。DB設定と通信状態を確認してください。' }, 503)

function failure(error: unknown) {
  if (error instanceof Error && error.message === 'UNAUTHENTICATED') return json({ error: 'ログインが必要です' }, 401)
  if (error instanceof Error && error.message === 'FORBIDDEN') return json({ error: 'この操作の権限がありません' }, 403)
  console.error('cast management order:', error)
  return unavailable()
}

async function roster() {
  const db = await createClient()
  const { data, error } = await db.from('profiles')
    .select('id, cast_name, display_name, cast_tier, is_active').eq('role', 'cast')
  if (error || !data) throw new Error('CAST_ROSTER_UNAVAILABLE')
  return { db, rows: data as CastManagementRow[] }
}

export async function GET() {
  try {
    await requirePermission('キャスト.閲覧')
    const { db, rows } = await roster()
    const { data, error } = await db.from('cast_management_order').select(columns).eq('id', true).maybeSingle()
    if (error || !data) return unavailable()
    return json({ orderedCastIds: data.ordered_cast_ids, revision: data.revision, rosterKey: castManagementRosterKey(rows) })
  } catch (error) { return failure(error) }
}

export async function PUT(request: Request) {
  try {
    const actor = await requirePermission('キャスト.アカウント管理')
    const body: unknown = await request.json().catch(() => null)
    if (!isCastManagementOrder(body)) return json({ error: '並び順の指定が不正です' }, 400)
    const { rows } = await roster()
    const rosterKey = castManagementRosterKey(rows)
    if (body.rosterKey !== rosterKey) return json({ error: 'キャスト名簿が更新されています。最新の一覧を読み込んでから並び替えてください。' }, 409)
    if (!validCastManagementOrder(rows, body.orderedCastIds)) return json({ error: '全員を含め、同じキャスト層の中だけで並び替えてください。' }, 400)

    // 認可・名簿検証後だけservice-roleを使用。同時編集はrevisionの条件付き更新で拒否。
    const admin = createAdminClient()
    const { data, error } = await admin.from('cast_management_order').update({
      ordered_cast_ids: body.orderedCastIds,
      revision: body.revision + 1,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    }).eq('id', true).eq('revision', body.revision).select(columns).maybeSingle()
    if (error) return unavailable()
    if (!data) return json({ error: '別のスタッフが並び順を保存しました。最新の一覧を読み込んでからやり直してください。' }, 409)
    return json({ orderedCastIds: data.ordered_cast_ids, revision: data.revision, rosterKey })
  } catch (error) { return failure(error) }
}
