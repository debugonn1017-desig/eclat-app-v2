// 購読先はブラウザのPush配信サービスだけ。任意URLへのサーバーリクエストを防ぐ。
export function isSafePushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false
    const host = url.hostname
    return host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com'
      || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com')
  } catch { return false }
}

export function validPushKeys(keys: unknown): keys is { p256dh: string; auth: string } {
  if (!keys || typeof keys !== 'object') return false
  const input = keys as Record<string, unknown>
  const decode = (value: unknown, length: number) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value) || value.length > 100) return null
    const bytes = Buffer.from(value, 'base64url')
    return bytes.length === length ? bytes : null
  }
  const point = decode(input.p256dh, 65)
  return point?.[0] === 4 && !!decode(input.auth, 16)
}
