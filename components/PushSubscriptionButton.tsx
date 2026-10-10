'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { C } from '@/lib/colors'
import { currentPushSubscription, pushRequest, readyPushWorker, removeCurrentPushSubscription, vapidApplicationKey } from '@/lib/pushClient'

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

export default function PushSubscriptionButton({ accountId }: { accountId: string }) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [configured, setConfigured] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [checkVersion, setCheckVersion] = useState(0)
  const running = useRef(false)

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      const available = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && (!ios || standalone)
      setSupported(available)
      if (!available) return
      setPermission(Notification.permission)
      try {
        const [subscription, response] = await Promise.all([
          currentPushSubscription(), fetch('/api/push/subscribe', { cache: 'no-store', signal: AbortSignal.timeout(15_000) }),
        ])
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '通知設定を取得できませんでした')
        if (result.userId !== accountId) throw new Error('ログインが変わりました。ページを再読み込みしてください')
        if (cancelled) return
        setConfigured(result.configured === true && !!PUBLIC_KEY)
        // ブラウザ側だけでなく、ログイン本人にサーバー登録済みかも確認する。
        setSubscribed(Notification.permission === 'granted' && !!subscription && Array.isArray(result.endpoints) && result.endpoints.includes(subscription.endpoint))
        setChecked(true)
        setMessage(null)
      } catch (error) {
        if (!cancelled) { setChecked(false); setMessage(error instanceof Error ? error.message : '通知設定を取得できませんでした') }
      }
    }
    void init()
    return () => { cancelled = true }
  }, [accountId, checkVersion])

  const run = async (action: () => Promise<void>) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setMessage(null)
    try { await action() }
    catch (error) { setMessage(error instanceof Error ? error.message : '通知設定を変更できませんでした。再度お試しください') }
    finally { running.current = false; setBusy(false) }
  }
  const subscribe = () => run(async () => {
    // Safari/iPhoneは直接のタップが必要。Worker登録などのawaitより先に許可を求める。
    const granted = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setPermission(granted)
    if (granted !== 'granted') { setMessage('通知はオフのままです。許可するときは端末・ブラウザの通知設定をご確認ください'); return }
    const registration = await readyPushWorker()
    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: vapidApplicationKey(PUBLIC_KEY),
    })
    const result = await pushRequest('/api/push/subscribe', { ...subscription.toJSON(), userAgent: navigator.userAgent })
    if (result.userId !== accountId) throw new Error('ログインが変わりました。ページを再読み込みしてください')
    setSubscribed(true)
    setMessage('この端末の携帯通知をオンにしました。テストで確認できます')
  })
  const unsubscribe = () => run(async () => {
    await removeCurrentPushSubscription()
    setSubscribed(false)
    setMessage('この端末の携帯通知をオフにしました')
  })
  const test = () => run(async () => {
    const subscription = await currentPushSubscription()
    if (!subscription) throw new Error('通知登録が見つかりません。オンにし直してください')
    const result = await pushRequest('/api/push/test', { endpoint: subscription.endpoint })
    setMessage(result.ok && (result.delivered ?? 0) > 0
      ? 'テストを送信しました。端末の通知をご確認ください'
      : 'テストを配信できませんでした。通知をオフ→オンにして再登録してください')
  })
  const buttonStyle = { minHeight: 34, padding: '6px 12px', borderRadius: 8, border: '1px solid ' + C.border,
    background: C.white, color: C.dark2, fontSize: 11, fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer' }

  return <section aria-label="携帯への通知設定" style={{ border: '1px solid ' + C.border, borderRadius: 12, background: C.white, padding: '12px 14px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <h2 style={{ margin: 0, color: C.dark, fontSize: 13 }}>🔔 携帯への通知</h2>
      <span style={{ color: subscribed ? C.success : C.dark2, background: subscribed ? C.successBg : C.miniBg,
        borderRadius: 12, padding: '3px 8px', fontSize: 10, fontWeight: 700 }}>{supported === null ? '確認中' : subscribed ? 'オン' : 'オフ'}</span>
    </div>
    <p style={{ margin: '6px 0 10px', color: C.dark2, fontSize: 11, lineHeight: 1.7 }}>
      ログイン中のアカウント宛のお知らせを、この端末で受け取ります。
    </p>
    {supported === false ? <p style={{ margin: 0, color: C.dark2, fontSize: 11, lineHeight: 1.7 }}>
      iPhoneは共有メニューから「ホーム画面に追加」し、そのアイコンで開いてください。Androidは通知対応のブラウザで開いてください。
    </p> : supported === null ? <p style={{ fontSize: 11, margin: 0, color: C.dark2 }}>通知設定を確認中…</p> : <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {!checked ? <button type="button" onClick={() => setCheckVersion(value => value + 1)} style={buttonStyle}>設定を再確認</button> : !subscribed ?
          <button type="button" onClick={subscribe} disabled={busy || !configured || permission === 'denied'}
            style={{ ...buttonStyle, background: C.pink, color: C.white, fontWeight: 700, opacity: !configured || permission === 'denied' ? 0.5 : 1 }}>
            {busy ? '設定中…' : '携帯通知をオンにする'}
          </button> : <>
            <button type="button" onClick={test} disabled={busy || !configured} style={buttonStyle}>テスト通知</button>
            <button type="button" onClick={unsubscribe} disabled={busy} style={buttonStyle}>オフにする</button>
          </>}
        <Link href="/announcements" prefetch={false} style={{ fontSize: 11, color: C.pinkDeep, padding: 8 }}>お知らせ一覧</Link>
      </div>
      {checked && !configured && <p style={{ fontSize: 11, color: C.dark2, margin: '8px 0 0' }}>携帯通知は準備中です。管理者にご連絡ください。</p>}
      {permission === 'denied' && <p style={{ fontSize: 11, color: C.danger, margin: '8px 0 0' }}>通知がブロックされています。端末・ブラウザの通知設定から許可してください。</p>}
    </>}
    {message && <p role="status" style={{ margin: '8px 0 0', fontSize: 11, lineHeight: 1.7, color: C.dark2 }}>{message}</p>}
  </section>
}
