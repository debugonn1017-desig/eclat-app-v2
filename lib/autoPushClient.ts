// ─────────────────────────────────────────────────────────────────
//  クライアント側から /api/auto-push/check を fire-and-forget で呼ぶ
//
//  使い方: 来店記録保存後 / シフト保存後 / 場内延長保存後 等で
//          triggerAutoPushCheck(castId) を呼ぶだけ。
//
//  「エラーが出てもユーザー操作には影響しない」設計 = 失敗しても無視。
//  サーバー側で全体オフ / 既送信 のときは何も配信されない。
// ─────────────────────────────────────────────────────────────────

export async function triggerAutoPushCheck(castId: string, month?: string): Promise<void> {
  if (!castId) return
  try {
    // fire-and-forget で良いが、await でエラーログを出せるようにしておく
    const res = await fetch('/api/auto-push/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ castId, month }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.warn('[autoPushCheck] non-OK:', res.status, txt)
    }
  } catch (e) {
    console.warn('[autoPushCheck] failed:', e)
  }
}
