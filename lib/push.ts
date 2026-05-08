// Web Push 送信ヘルパー（サーバーサイド）
// Supabase に保存された購読情報を取得して、web-push ライブラリ経由で配信。

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

// VAPID 設定（Vercel/Supabase の環境変数から）
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:noreply@example.com'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export type PushPayload = {
  title: string
  body: string
  url?: string                  // クリック時の遷移先
  icon?: string
  tag?: string                  // 同タグは上書き表示
  requireInteraction?: boolean  // ユーザー操作するまで消えない
  silent?: boolean
}

export type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * 指定されたユーザーIDたちの全購読に通知を送信。
 * 期限切れや無効化された購読(410/404)は自動で DB から削除する。
 */
export async function sendPushToUsers(
  supabase: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
): Promise<{ delivered: number; failed: number }> {
  if (userIds.length === 0) return { delivered: 0, failed: 0 }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('VAPID keys not configured')
    return { delivered: 0, failed: 0 }
  }

  // 全購読を取得
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)

  const list = (subs ?? []) as PushSubscriptionRow[]
  if (list.length === 0) return { delivered: 0, failed: 0 }

  let delivered = 0
  let failed = 0
  const expiredIds: string[] = []

  const json = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
    icon: payload.icon,
    tag: payload.tag,
    requireInteraction: payload.requireInteraction === true,
    silent: payload.silent === true,
    sentAt: Date.now(),
  })

  await Promise.all(
    list.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
        )
        delivered += 1
      } catch (err: unknown) {
        const e = err as { statusCode?: number }
        if (e.statusCode === 410 || e.statusCode === 404) {
          expiredIds.push(s.id)
        }
        failed += 1
      }
    }),
  )

  // 期限切れ購読の削除
  if (expiredIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expiredIds)
  }

  return { delivered, failed }
}
