// ─────────────────────────────────────────────────────────────────
//  /api/auth/me のクライアント側キャッシュ
// ─────────────────────────────────────────────────────────────────
//  問題: 17ファイルで /api/auth/me を呼んでて、ページ切替ごとに
//  Supabase に往復する → 200〜500ms × ページ数 = 体感的に重い
//
//  対策: sessionStorage に 5分キャッシュ（タブ閉じたらクリアされる）
//  ログイン直後とログアウト時にだけ無効化すれば十分。
//
//  v0.3.39 hotfix: 二重防御を追加
//    (1) cached me を返す前に Supabase session.user.id と cached.data.id を比較。
//        不一致なら invalidate して再取得 (UserChip 経由しないセッション切替対策)。
//    (2) fallback fetch には { cache: 'no-store' } を付与。
//        /api/auth/me 側が Cache-Control: private, max-age=60 を返すので、
//        ブラウザ HTTP キャッシュから古いユーザーの me が返るリスクを潰す。
//    (3) fetch 後も session.user.id と data.id の一致を確認。
//        明確に不一致なら setStored せず invalidate + null を返す (最強の安全側)。
// ─────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/client'

type MeProfile = {
  id: string
  role: string
  display_name: string | null
  // v0.3.43-A: クライアント側で profiles 再取得を不要にするため追加
  cast_name: string | null
  is_owner: boolean
  permissions?: Record<string, boolean>
}

// v0.3.43-A: cast_name フィールド追加に伴いキャッシュキーを v2 に上げる
//   デプロイ直後に古い v1 キャッシュ (cast_name 欠落) を拾うと
//   /home /calendar の cast ユーザー表示が壊れるためバンプ必須。
const CACHE_KEY = 'eclat_me_v2'
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
 *
 * v0.3.39 hotfix:
 *   ・cached を返す前に session.user.id との一致を確認
 *   ・fallback fetch は { cache: 'no-store' } (ブラウザ HTTP キャッシュ抑止)
 *   ・fetch 後も id 不一致なら setStored せず invalidate + null
 */
export async function fetchMe(): Promise<MeProfile | null> {
  // キャッシュチェック
  const stored = getStored()
  if (stored && Date.now() - stored.timestamp < TTL_MS) {
    // (1) cached me の id と現在の session.user.id を比較
    //   getSession() はローカル JWT 復号のみで API 往復なし (1-5ms)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const currentUserId = session?.user?.id
      if (currentUserId && currentUserId === stored.data.id) {
        return stored.data
      }
      // 不一致 or session 切断 → cache 破棄してフェッチへ
      invalidateMe()
    } catch {
      // session 検証自体が失敗 → 安全側に倒してフェッチへ
      invalidateMe()
    }
  }
  // フェッチ (2) cache: 'no-store' でブラウザ HTTP キャッシュも抑止
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as MeProfile
    // (3) fetch 後も session.user.id と data.id の一致を確認
    //   明確に不一致なら setStored せず null を返して安全側に倒す
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const currentUserId = session?.user?.id
      if (currentUserId && currentUserId !== data.id) {
        invalidateMe()
        return null
      }
      // 一致確認できた場合のみ setStored
      //   currentUserId が取れない (session 取得失敗等) は setStored せず
      //   data だけ返す → 次回 fetchMe で再検証される
      if (currentUserId === data.id) {
        setStored(data)
      }
    } catch {
      // session 再検証失敗 → invalidate + null で安全側
      invalidateMe()
      return null
    }
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
