import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPushConfigured } from '@/lib/push'
import { isSafePushEndpoint, validPushKeys } from '@/lib/pushValidation'

export async function GET() {
  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 })
  const supabase = await createClient()
  const { data, error } = await supabase.from('push_subscriptions').select('endpoint').eq('user_id', profile.id)
  if (error) return NextResponse.json({ error: '通知設定を取得できませんでした' }, { status: 503 })
  return NextResponse.json({ userId: profile.id, configured: isPushConfigured(), endpoints: (data ?? []).map(row => row.endpoint) },
    { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 })
  if (!isPushConfigured()) return NextResponse.json({ error: '携帯通知は準備中です。管理者にご連絡ください' }, { status: 503 })
  const input = await request.json().catch(() => null)
  if (!isSafePushEndpoint(input?.endpoint) || !validPushKeys(input?.keys)) {
    return NextResponse.json({ error: 'この端末の通知登録を確認できませんでした' }, { status: 400 })
  }
  // 旧テーブルにはUPDATEのRLSがない。認証後、IDをサーバーで固定した自己購読だけをupsert。
  // 同じ端末を別アカウントで使う場合、同一のendpoint・暗号鍵の旧紐付けを解除する。
  const supabase = createAdminClient()
  const { error: cleanupError } = await supabase.from('push_subscriptions').delete()
    .eq('endpoint', input.endpoint).eq('p256dh', input.keys.p256dh).eq('auth', input.keys.auth).neq('user_id', profile.id)
  if (cleanupError) return NextResponse.json({ error: '通知登録に失敗しました。再度お試しください' }, { status: 503 })
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: profile.id, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth,
    user_agent: typeof input.userAgent === 'string' ? input.userAgent.slice(0, 512) : null,
  }, { onConflict: 'user_id,endpoint' })
  if (error) return NextResponse.json({ error: '通知登録に失敗しました。再度お試しください' }, { status: 503 })
  return NextResponse.json({ ok: true, userId: profile.id })
}
