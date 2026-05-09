/**
 * シンプルなインメモリキャッシュ（SWR風 stale-while-revalidate）
 *
 * - ページ遷移時にキャッシュがあれば即座に返す
 * - 裏で最新データを取得して更新
 * - タブ間で共有（グローバル変数）
 * - **TTL（有効期限）あり: デフォルト 5分** で自動失効
 *   設定変更後に古いデータが残り続ける問題を防ぐ
 */

type CacheEntry<T> = {
  data: T
  timestamp: number
}

// グローバルキャッシュストア（アプリ全体で共有）
const store = new Map<string, CacheEntry<unknown>>()

// 進行中のリクエストを追跡（重複リクエスト防止）
const inflight = new Map<string, Promise<unknown>>()

// デフォルト TTL: 5分（ms）
const DEFAULT_TTL_MS = 5 * 60 * 1000

/**
 * キャッシュからデータを取得（なければ null、期限切れなら null）
 */
export function getCache<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | null {
  const entry = store.get(key)
  if (!entry) return null
  // 期限切れチェック
  const age = Date.now() - entry.timestamp
  if (age > ttlMs) {
    store.delete(key)
    return null
  }
  return entry.data as T
}

/**
 * キャッシュにデータを保存
 */
export function setCache<T>(key: string, data: T): void {
  store.set(key, { data, timestamp: Date.now() })
}

/**
 * キャッシュを無効化
 */
export function invalidateCache(key: string): void {
  store.delete(key)
}

/**
 * パターンに一致するキャッシュをすべて無効化
 */
export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key)
    }
  }
}

/**
 * すべてのキャッシュを無効化（ノルマ・ランク基準など全画面に影響する変更時に使う）
 */
export function invalidateAllCache(): void {
  store.clear()
}

/**
 * fetchWithCache: stale-while-revalidate パターン
 *
 * 1. キャッシュがあれば即座に onData(cachedData) を呼ぶ
 * 2. キャッシュが「鮮度内（freshMs）」ならネットワーク呼び出しをスキップ
 *    キャッシュが古い場合のみバックグラウンドで再取得（revalidate）
 * 3. 同じキーの同時リクエストは1つにまとめる（dedup）
 *
 * ⚡ パフォーマンス対策（2026-05-09）:
 *   旧: キャッシュ有でも毎回 fetcher を呼んで再検証 → 同じデータを何度も
 *       取り直す（page mount → SalesAlertBanner mount で 2回フェッチ等）
 *   新: freshMs（デフォルト 30秒）以内ならキャッシュ即返却で fetcher 不要。
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  onData: (data: T) => void,
  ttlMs: number = DEFAULT_TTL_MS,
  freshMs: number = 30 * 1000, // 30秒以内は再フェッチしない
): Promise<T> {
  // 1. キャッシュがあれば（期限内のみ）即座に返す
  const cached = getCache<T>(key, ttlMs)
  const entry = store.get(key) as CacheEntry<T> | undefined
  if (cached !== null && entry) {
    onData(cached)
    // 鮮度内ならネットワーク呼び出しをスキップ
    const age = Date.now() - entry.timestamp
    if (age < freshMs) {
      return cached
    }
  }

  // 2. 同じキーのリクエストが進行中なら待つ（dedup）
  const existing = inflight.get(key)
  if (existing) {
    const result = await existing as T
    onData(result)
    return result
  }

  // 3. 新しいリクエストを実行
  const promise = fetcher()
  inflight.set(key, promise)

  try {
    const freshData = await promise
    setCache(key, freshData)
    onData(freshData)
    return freshData
  } finally {
    inflight.delete(key)
  }
}
