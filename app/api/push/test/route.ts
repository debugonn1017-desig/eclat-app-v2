import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isPushConfigured, sendPushToUsers } from '@/lib/push'
import { isSafePushEndpoint } from '@/lib/pushValidation'

export async function POST(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 })
  if (!isPushConfigured()) return NextResponse.json({ error: '携帯通知は準備中です' }, { status: 503 })
  const input = await request.json().catch(() => null)
  if (!isSafePushEndpoint(input?.endpoint)) return NextResponse.json({ error: '端末を指定してください' }, { status: 400 })
  try {
    const result = await sendPushToUsers(await createClient(), [profile.id], {
      title: 'Éclat｜通知の確認', body: 'この端末で店舗のお知らせを受け取れます。', url: '/announcements', tag: 'eclat-push-test',
    }, input.endpoint)
    return NextResponse.json({ ok: result.delivered > 0, ...result })
  } catch {
    return NextResponse.json({ error: 'テストを送信できませんでした' }, { status: 503 })
  }
}
