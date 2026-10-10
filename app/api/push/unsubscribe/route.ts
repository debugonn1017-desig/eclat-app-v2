import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isSafePushEndpoint } from '@/lib/pushValidation'

export async function POST(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 })
  const input = await request.json().catch(() => null)
  if (!isSafePushEndpoint(input?.endpoint)) return NextResponse.json({ error: '端末を指定してください' }, { status: 400 })
  const supabase = await createClient()
  const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', profile.id).eq('endpoint', input.endpoint)
  if (error) return NextResponse.json({ error: '通知を解除できませんでした。再度お試しください' }, { status: 503 })
  return NextResponse.json({ ok: true })
}
