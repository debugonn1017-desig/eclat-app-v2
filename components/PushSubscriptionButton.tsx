'use client'

// 🔔 通知購読ボタン
//   ホーム画面等に配置。クリックで通知許可リクエスト → 購読登録 → DB 保存。
//   既に購読済みなら「通知ON」状態を表示。

import { useEffect, useState } from 'react'
import { C } from '@/lib/colors'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

// urlBase64 を ArrayBuffer に変換（VAPID用、PushManager.subscribe applicationServerKey）
function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const padded = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const buf = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i)
  return buf
}

export default function PushSubscriptionButton() {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscribed, setSubscribed] = useState<boolean>(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // 状況確認
  useEffect(() => {
    const init = async () => {
      const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      setSupported(ok)
      if (!ok) return
      setPermission(Notification.permission)
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        if (reg) {
          const sub = await reg.pushManager.getSubscription()
          setSubscribed(!!sub)
        }
      } catch { /* noop */ }
    }
    init()
  }, [])

  const handleSubscribe = async () => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      // 1) Service Worker 登録
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // 2) Notification 許可
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setMessage('通知が許可されませんでした。ブラウザの設定から許可してください。')
        setBusy(false)
        return
      }

      // 3) 購読
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        if (!VAPID_PUBLIC_KEY) {
          setMessage('VAPID 公開鍵が設定されていません（管理者にご連絡ください）')
          setBusy(false)
          return
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
        })
      }

      // 4) サーバーに登録
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      })
      if (!res.ok) {
        setMessage('購読登録に失敗しました')
        setBusy(false)
        return
      }
      setSubscribed(true)
      setMessage('通知を有効化しました 🎉 必要なら下の「テスト送信」で確認できます。')
    } catch (e) {
      console.error(e)
      setMessage('エラーが発生しました')
    } finally {
      setBusy(false)
    }
  }

  const handleUnsubscribe = async () => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      if (reg) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          })
          await sub.unsubscribe()
        }
      }
      setSubscribed(false)
      setMessage('通知をオフにしました')
    } catch (e) {
      console.error(e)
      setMessage('エラーが発生しました')
    } finally {
      setBusy(false)
    }
  }

  const handleTest = async () => {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const json = await res.json()
      if (json.ok && json.delivered > 0) {
        setMessage(`テスト送信完了（${json.delivered}件配信）`)
      } else {
        setMessage('テスト送信失敗。購読状態を確認してください。')
      }
    } catch {
      setMessage('テスト送信エラー')
    } finally {
      setBusy(false)
    }
  }

  if (supported === null) return null
  if (!supported) {
    return (
      <div style={{
        padding: '8px 12px', background: '#F5F0F2', borderRadius: 8,
        fontSize: 11, color: C.pinkMuted,
      }}>
        ⚠️ お使いのブラウザはプッシュ通知に未対応です。Safari の場合は「ホーム画面に追加」してから開いてください。
      </div>
    )
  }

  return (
    <div style={{
      padding: '10px 14px',
      background: subscribed ? 'linear-gradient(135deg, #E1F5EE 0%, #C8EBDB 100%)' : '#FFF',
      border: `1px solid ${subscribed ? '#A0D9BC' : C.border}`,
      borderRadius: 12,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16 }}>🔔</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: subscribed ? '#0F6E56' : C.dark, flex: 1 }}>
          {subscribed ? 'プッシュ通知 ON' : 'プッシュ通知を受け取る'}
        </span>
        {!subscribed ? (
          <button
            onClick={handleSubscribe}
            disabled={busy}
            style={{
              padding: '6px 14px', borderRadius: 18,
              background: C.pink, color: '#FFF', fontSize: 11, fontWeight: 600,
              border: 'none', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}
          >{busy ? '処理中...' : '通知を許可'}</button>
        ) : (
          <>
            <button
              onClick={handleTest}
              disabled={busy}
              style={{
                padding: '6px 12px', borderRadius: 18,
                background: '#FFF', color: C.dark, fontSize: 10, fontWeight: 500,
                border: `1px solid ${C.border}`, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}
            >テスト送信</button>
            <button
              onClick={handleUnsubscribe}
              disabled={busy}
              style={{
                padding: '6px 12px', borderRadius: 18,
                background: 'transparent', color: '#888', fontSize: 10,
                border: `1px solid ${C.border}`, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}
            >解除</button>
          </>
        )}
      </div>
      {message && (
        <div style={{ fontSize: 10, color: subscribed ? '#0F6E56' : C.pinkMuted }}>
          {message}
        </div>
      )}
      {permission === 'denied' && (
        <div style={{ fontSize: 10, color: '#C53030' }}>
          ⚠️ 通知がブロックされています。ブラウザ/iOSの設定から許可してください。
        </div>
      )}
    </div>
  )
}
