// 通知許可・登録・送信は呼び出し元の明示的な操作からだけ実行する。
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  return registration ? registration.pushManager.getSubscription() : null
}

export async function pushRequest(path: string, body: unknown) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '通知設定を保存できませんでした')
  return result as { userId?: string; ok?: boolean; delivered?: number; failed?: number }
}

export async function removeCurrentPushSubscription(): Promise<void> {
  const subscription = await currentPushSubscription()
  if (!subscription) return
  await pushRequest('/api/push/unsubscribe', { endpoint: subscription.endpoint })
  if (!await subscription.unsubscribe()) throw new Error('サーバー側の通知は停止しました。端末の解除を再度お試しください')
}

export async function stopPushOnLogout(): Promise<void> {
  const subscription = await currentPushSubscription()
  if (!subscription) return
  try {
    await fetch('/api/push/unsubscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }),
      signal: AbortSignal.timeout(5_000),
    })
  } finally {
    // 通信失敗時も端末を解除し、共有端末に前のログイン本人の通知が残るのを防ぐ。
    await subscription.unsubscribe()
  }
}

export async function readyPushWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
  const worker = registration.installing ?? registration.waiting
  if (!worker && registration.active) return registration
  if (!worker) throw new Error('通知の準備ができませんでした。再度お試しください')
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('通知の準備に時間がかかっています。再度お試しください')) }, 15_000)
    const cleanup = () => { window.clearTimeout(timer); worker.removeEventListener('statechange', change) }
    const change = () => {
      if (worker.state === 'activated') { cleanup(); resolve() }
      if (worker.state === 'redundant') { cleanup(); reject(new Error('通知の準備ができませんでした。再度お試しください')) }
    }
    worker.addEventListener('statechange', change)
    change()
  })
  return registration
}

export function vapidApplicationKey(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const buffer = new ArrayBuffer(raw.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index)
  return buffer
}
