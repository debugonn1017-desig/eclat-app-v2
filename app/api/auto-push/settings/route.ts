// ─────────────────────────────────────────────────────────────────
//  /api/auto-push/settings
//   ノルマ達成自動 Push の設定取得・更新
//
//  GET    → app_settings の auto_push_* 全件を JSON で返す
//  POST   → body の { key, value } を upsert（permission 「通知.自動配信設定」 必須）
//
//  認証:
//    GET    : ログイン済みなら誰でも (状態確認用)
//    POST   : is_owner または「通知.自動配信設定」権限
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requirePermission, requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_KEYS = new Set([
  'auto_push_enabled',
  'auto_push_type_sales',
  'auto_push_type_kokyaku',
  'auto_push_type_kengai',
  'auto_push_type_banai',
  'auto_push_type_workdays',
])

export async function GET() {
  try {
    await requireUser()
    const admin = createAdminClient()
    const { data } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', [...ALLOWED_KEYS])
    const settings: Record<string, string> = {}
    for (const r of (data ?? []) as { key: string; value: string }[]) {
      settings[r.key] = r.value
    }
    return NextResponse.json(settings)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    console.error('GET /api/auto-push/settings error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const me = await requirePermission('通知.自動配信設定')
    const body = await request.json().catch(() => ({}))
    const key = body.key as string | undefined
    const value = body.value as string | undefined
    if (!key || value == null) {
      return NextResponse.json({ error: 'key と value が必要です' }, { status: 400 })
    }
    if (!ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: '対象キーではありません' }, { status: 400 })
    }
    if (value !== 'true' && value !== 'false') {
      return NextResponse.json({ error: 'value は "true" または "false"' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('app_settings')
      .upsert(
        { key, value, updated_at: new Date().toISOString(), updated_by: me.id },
        { onConflict: 'key' },
      )
    if (error) throw error
    return NextResponse.json({ ok: true, key, value })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: '通知.自動配信設定 権限が必要です' }, { status: 403 })
    }
    console.error('POST /api/auto-push/settings error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
