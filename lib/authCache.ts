// ─────────────────────────────────────────────────────────────────
//  /api/auth/me のクライアント側キャッシュ
// ─────────────────────────────────────────────────────────────────
//  問題: 17ファイルで /api/auth/me を呼んでて、ページ切替ごとに
//  Supabase に往復する → 200〜500ms × ページ数 = 体感的に重い
//
//  対策: sessionStorage に 5分キャッシュ（タブ閉じたらクリアされる）
//  ログイン直後とログアウト時にだけ無効化すれば十分。
// ─────────────────────────────────────────────────────────────────

type MeProfile = {
  id: string
  role: string
  display_name: string | null
  is_owner: boolean
  permissions?: Record<string, boolean>
}

const CACHE_KEY = 'eclat_me_v1'
const TTL_MS = 5 * 60 * 1000 // 5分

type CacheEntry = { data: MeProfile; timestamp: number }

function getStored(): CacheEntry | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CacheEntry
  } catch {
    return null
  }
}

function setStored(data: MeProfile): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }))
  } catch { /* ignore */ }
}

/**
 * /api/auth/me を取得。キャッシュあれば即座に返す（5分有効）。
 * ログイン直後やログアウト時は invalidateMe() で無効化。
 */
export async function fetchMe(): Promise<MeProfile | null> {
  // キャッシュチェック
  const stored = getStored()
  if (stored && Date.now() - stored.timestamp < TTL_MS) {
    return stored.data
  }
  // フェッチ
  try {
    const res = await fetch('/api/auth/me')
    if (!res.ok) return null
    const data = (await res.json()) as MeProfile
    setStored(data)
    return data
  } catch (e) {
    console.error('[fetchMe]', e)
    return null
  }
}

/** ログアウト・権限変更時にキャッシュを無効化 */
export function invalidateMe(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch { /* ignore */ }
}
