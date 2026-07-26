import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const profile = await getCurrentProfile()
    if (!profile) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    if (profile.role !== 'cast') {
      return NextResponse.json({ applicable: false, daily_enabled: false })
    }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('follow_up_notification_preferences')
      .select('daily_enabled')
      .eq('user_id', profile.id)
      .maybeSingle()
    if (error) throw error
    return NextResponse.json({
      applicable: true,
      daily_enabled: data?.daily_enabled ?? true,
    }, {
      headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' },
    })
  } catch (error) {
    console.error('GET /api/follow-ups/notification-settings error:', error)
    return NextResponse.json({ error: '通知設定の取得に失敗しました' }, { status: 500 })
  }
}
export async function PATCH(request: Request) {
  try {
    const profile = await getCurrentProfile()
    if (!profile) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    if (profile.role !== 'cast') {
      return NextResponse.json({ error: 'キャスト本人だけが変更できます' }, { status: 403 })
    }
    const body = await request.json().catch(() => null)
    const dailyEnabled = (body as { dailyEnabled?: unknown } | null)?.dailyEnabled
    if (typeof dailyEnabled !== 'boolean') {
      return NextResponse.json({ error: '通知設定が不正です' }, { status: 400 })
    }
    const supabase = await createClient()
    const { error } = await supabase
      .from('follow_up_notification_preferences')
      .upsert({
        user_id: profile.id,
        daily_enabled: dailyEnabled,
      }, { onConflict: 'user_id' })
    if (error) throw error
    return NextResponse.json({ daily_enabled: dailyEnabled })
  } catch (error) {
    console.error('PATCH /api/follow-ups/notification-settings error:', error)
    return NextResponse.json({ error: '通知設定の保存に失敗しました' }, { status: 500 })
  }
}
