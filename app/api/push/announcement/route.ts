import { NextResponse } from 'next/server'
import { requirePermission, checkPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPushConfigured, sendPushToUsers } from '@/lib/push'
import type { Announcement } from '@/types'

// 任意の本文・宛先は受け取らない。保存済みのお知らせとその対象者だけを配信する。
export async function POST(request: Request) {
  try {
    const profile = await requirePermission('通知.送信')
    await requirePermission('お知らせ.投稿')
    if (!isPushConfigured()) return NextResponse.json({ error: '携帯通知は準備中です。お知らせの保存は完了しています' }, { status: 503 })
    const input = await request.json().catch(() => null)
    if (!/^\d+$/.test(String(input?.id ?? ''))) return NextResponse.json({ error: 'お知らせを指定してください' }, { status: 400 })
    const session = await createClient()
    const { data, error } = await session.from('announcements').select('*').eq('id', String(input.id)).maybeSingle()
    if (error) return NextResponse.json({ error: 'お知らせを確認できませんでした' }, { status: 503 })
    const announcement = data as Announcement | null
    if (!announcement || !announcement.is_active) return NextResponse.json({ error: '有効なお知らせが見つかりません' }, { status: 404 })
    if (announcement.created_by !== profile.id && !profile.is_owner && !await checkPermission('お知らせ.管理')) {
      return NextResponse.json({ error: '自分が投稿したお知らせのみ配信できます' }, { status: 403 })
    }
    const admin = createAdminClient()
    let recipients = admin.from('profiles').select('id').eq('is_active', true).order('id', { ascending: true })
    if (announcement.target_type === 'individual') {
      const ids = (Array.isArray(announcement.target_cast_ids) ? announcement.target_cast_ids : [])
        .filter(id => typeof id === 'string' && /^[\da-f-]{36}$/i.test(id))
      if (ids.length === 0) return NextResponse.json({ ok: true, delivered: 0, failed: 0 })
      recipients = recipients.eq('role', 'cast').in('id', ids)
    } else if (announcement.target_type !== 'all') {
      return NextResponse.json({ error: '対象者の指定を確認してください' }, { status: 400 })
    }
    const userIds: string[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data: users, error: usersError } = await recipients.range(offset, offset + 999)
      if (usersError) return NextResponse.json({ error: '配信対象を確認できませんでした' }, { status: 503 })
      userIds.push(...(users ?? []).map(user => user.id))
      if ((users ?? []).length < 1000) break
    }
    const result = await sendPushToUsers(admin, userIds, {
      title: `Éclat｜${announcement.title}`,
      // ロック画面に個別のお知らせ本文が出ないよう本文はアプリ内で確認する。
      body: '店舗から新しいお知らせがあります。タップして内容をご確認ください。',
      url: '/announcements', tag: `eclat-announcement-${String(announcement.id)}`,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'UNAUTHENTICATED') return NextResponse.json({ error: 'ログインしてください' }, { status: 401 })
    if (code === 'FORBIDDEN') return NextResponse.json({ error: 'お知らせ投稿・通知送信の権限が必要です' }, { status: 403 })
    return NextResponse.json({ error: '携帯通知を配信できませんでした。お知らせの保存は完了しています' }, { status: 503 })
  }
}
