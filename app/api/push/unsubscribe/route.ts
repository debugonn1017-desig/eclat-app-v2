// POST /api/push/unsubscribe — 購読解除

import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const profile = await getCurrentProfile()
    if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json() as { endpoint?: string }
    const supabase = await createClient()

    if (body.endpoint) {
      // 特定 endpoint のみ削除
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', profile.id)
        .eq('endpoint', body.endpoint)
      if (error) {
        console.error('unsubscribe (single) error', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      // 全削除
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', profile.id)
      if (error) {
        console.error('unsubscribe (all) error', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('unsubscribe exception', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
