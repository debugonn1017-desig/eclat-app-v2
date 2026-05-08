// POST /api/push/test — 自分自身にテスト通知を送る

import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUsers } from '@/lib/push'

export async function POST() {
  try {
    const profile = await getCurrentProfile()
    if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const supabase = await createClient()
    const result = await sendPushToUsers(supabase, [profile.id], {
      title: '🔔 テスト通知',
      body: 'Éclat の通知が正常に届いています。',
      url: '/',
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('test push exception', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
