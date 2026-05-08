// POST /api/push/send — 管理者によるカスタム通知送信
//   target_type: 'all' | 'cast_all' | 'staff_all' | 'tier' | 'individual'

import { NextResponse } from 'next/server'
import { requirePermission, type Profile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUsers } from '@/lib/push'

type Body = {
  title: string
  body: string
  url?: string
  target_type: 'all' | 'cast_all' | 'staff_all' | 'tier' | 'individual'
  target_tier?: string
  target_user_ids?: string[]
}

export async function POST(req: Request) {
  try {
    // 通知.送信 権限を持つ管理者のみ送信可能（オーナーは常に通る）
    let profile: Profile
    try {
      profile = await requirePermission('通知.送信')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown'
      const status = msg === 'UNAUTHENTICATED' ? 401 : 403
      return NextResponse.json({ error: msg }, { status })
    }

    const body = await req.json() as Body
    if (!body.title || !body.body) {
      return NextResponse.json({ error: 'Missing title/body' }, { status: 400 })
    }

    const supabase = await createClient()

    // 送信先ユーザーIDを集める
    let userIds: string[] = []
    switch (body.target_type) {
      case 'all': {
        const { data } = await supabase.from('profiles').select('id').eq('is_active', true)
        userIds = (data ?? []).map((r: { id: string }) => r.id)
        break
      }
      case 'cast_all': {
        const { data } = await supabase.from('profiles').select('id')
          .eq('role', 'cast').eq('is_active', true)
        userIds = (data ?? []).map((r: { id: string }) => r.id)
        break
      }
      case 'staff_all': {
        const { data } = await supabase.from('profiles').select('id')
          .eq('role', 'admin').eq('is_active', true)
        userIds = (data ?? []).map((r: { id: string }) => r.id)
        break
      }
      case 'tier': {
        if (!body.target_tier) {
          return NextResponse.json({ error: 'Missing target_tier' }, { status: 400 })
        }
        const { data } = await supabase.from('profiles').select('id')
          .eq('role', 'cast').eq('is_active', true).eq('cast_tier', body.target_tier)
        userIds = (data ?? []).map((r: { id: string }) => r.id)
        break
      }
      case 'individual': {
        if (!body.target_user_ids || body.target_user_ids.length === 0) {
          return NextResponse.json({ error: 'Missing target_user_ids' }, { status: 400 })
        }
        userIds = body.target_user_ids
        break
      }
      default:
        return NextResponse.json({ error: 'Invalid target_type' }, { status: 400 })
    }

    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, delivered: 0, failed: 0, recipients: 0 })
    }

    // 配信
    const result = await sendPushToUsers(supabase, userIds, {
      title: body.title,
      body: body.body,
      url: body.url,
    })

    // 履歴に記録
    await supabase.from('push_notifications').insert({
      title: body.title,
      body: body.body,
      url: body.url ?? null,
      target_type: body.target_type,
      target_tier: body.target_tier ?? null,
      target_user_ids: body.target_type === 'individual' ? body.target_user_ids ?? [] : null,
      sent_by: profile.id,
      delivered_count: result.delivered,
      failed_count: result.failed,
      is_auto: false,
    })

    return NextResponse.json({
      ok: true,
      delivered: result.delivered,
      failed: result.failed,
      recipients: userIds.length,
    })
  } catch (e) {
    console.error('send push exception', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
