/**
 * シンプルなインメモリキャッシュ（SWR風 stale-while-revalidate）
 *
 * - ページ遷移時にキャッシュがあれば即座に返す
 * - 裏で最新データを取得して更新
 * - タブ間で共有（グローバル変数）
 */

type CacheEntry<T> = {
  data: T
  timestamp: number
}

// グローバルキャッシュストア（アプリ全体で共有）
const store = new Map<string, CacheEntry<unknown>>()

// 進行中のリクエストを追跡（重複リクエスト防止）
const inflight = new Map<string, Promise<unknown>>()

/**
 * キャッシュからデータを取得（なければ null）
 */
export function getCache<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry) return null
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
 * fetchWithCache: stale-while-revalidate パターン
 *
 * 1. キャッシュがあれば即座に onData(cachedData) を呼ぶ
 * 2. 裏で fetcher() を実行
 * 3. 新しいデータが来たら onData(freshData) を呼ぶ
 *
 * 同じキーの同時リクエストは1つにまとめる（dedup）
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  onData: (data: T) => void,
): Promise<T> {
  // 1. キャッシュがあれば即座に返す
  const cached = getCache<T>(key)
  if (cached !== null) {
    onData(cached)
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
