// POST /api/push/subscribe — Web Push 購読登録
//   フロントから渡された PushSubscription を Supabase に保存

import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const profile = await getCurrentProfile()
    if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json() as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
      userAgent?: string
    }
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: profile.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: body.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      }, { onConflict: 'user_id,endpoint' })
    if (error) {
      console.error('subscribe error', error)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('subscribe exception', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
