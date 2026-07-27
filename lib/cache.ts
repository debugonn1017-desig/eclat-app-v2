/**
 * シンプルなインメモリキャッシュ（SWR風 stale-while-revalidate）
 *
 * - ページ遷移時にキャッシュがあれば即座に返す
 * - 裏で最新データを取得して更新
 * - 同じ画面タブ内で共有（モジュール変数）
 * - ログインユーザーIDで名前空間を分離し、別アカウントへ引き継がない
 * - **TTL（有効期限）あり: デフォルト 5分** で自動失効
 *   設定変更後に古いデータが残り続ける問題を防ぐ
 */

type CacheEntry<T> = {
  data: T
  timestamp: number
}

// 現在のログインユーザー。未確認中はキャッシュを読み書きしない。
let activeScope: string | null = null

// グローバルキャッシュストア（同一ブラウザタブ内で共有）
const store = new Map<string, CacheEntry<unknown>>()

// 進行中のリクエストを追跡（重複リクエスト防止）
const inflight = new Map<string, Promise<unknown>>()

// デフォルト TTL: 5分（ms）
const DEFAULT_TTL_MS = 5 * 60 * 1000

function scopePrefix(scope: string): string {
  return `user:${scope}:`
}

function scopedKey(key: string, scope: string = activeScope ?? ''): string | null {
  return scope ? `${scopePrefix(scope)}${key}` : null
}

/**
 * 認証済みユーザーをキャッシュの名前空間に設定する。
 * ユーザーが変わった場合は、表示中データも含めて全キャッシュを破棄する。
 */
export function setCacheScope(userId: string): void {
  if (!userId || activeScope === userId) return
  activeScope = userId
  store.clear()
  inflight.clear()
}

/** ログアウト・セッション不一致時にキャッシュと名前空間を破棄する。 */
export function clearCacheScope(): void {
  activeScope = null
  store.clear()
  inflight.clear()
}

/**
 * キャッシュからデータを取得（なければ null、期限切れなら null）
 */
export function getCache<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | null {
  const internalKey = scopedKey(key)
  if (!internalKey) return null
  const entry = store.get(internalKey)
  if (!entry) return null
  // 期限切れチェック
  const age = Date.now() - entry.timestamp
  if (age > ttlMs) {
    store.delete(internalKey)
    return null
  }
  return entry.data as T
}

/**
 * キャッシュにデータを保存
 */
export function setCache<T>(key: string, data: T): void {
  const internalKey = scopedKey(key)
  if (!internalKey) return
  store.set(internalKey, { data, timestamp: Date.now() })
}

/**
 * キャッシュを無効化
 */
export function invalidateCache(key: string): void {
  const internalKey = scopedKey(key)
  if (internalKey) store.delete(internalKey)
}

/**
 * パターンに一致するキャッシュをすべて無効化
 */
export function invalidateCacheByPrefix(prefix: string): void {
  if (!activeScope) return
  const internalPrefix = `${scopePrefix(activeScope)}${prefix}`
  for (const key of store.keys()) {
    if (key.startsWith(internalPrefix)) {
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
 * 狙い撃ち無効化ヘルパー（パフォーマンス重要）
 * ⚡ 全キャストのキャッシュをクリアすると、別画面を開くたびに巨大な再フェッチが発生する。
 *    変更の影響範囲を絞ったキー単位で無効化する。
 *
 * 実際のキー形式:
 *   - `castPage:{castId}:{month}`  キャスト個別ページ
 *   - `castsKPI:{month}`           成績一覧（ランキング）
 *   - `customerDetail:{customerId}` 顧客詳細パネル
 *   - `cast:{castId}`              個別キャストプロフィール
 */

/** 特定キャストの castPage キャッシュをクリア（全月） */
export function invalidateCastPage(castId: string): void {
  if (!activeScope) return
  const prefix = `${scopePrefix(activeScope)}castPage:${castId}:`
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** 特定キャストの castPage キャッシュをクリア（指定月のみ） */
export function invalidateCastPageMonth(castId: string, month: string): void {
  invalidateCache(`castPage:${castId}:${month}`)
}

/** 成績一覧（ランキング）の指定月のキャッシュをクリア */
export function invalidateCastsKPI(month: string): void {
  invalidateCache(`castsKPI:${month}`)
}

/** すべての成績一覧キャッシュをクリア（層変更等で全月の達成率に影響する場合） */
export function invalidateAllCastsKPI(): void {
  if (!activeScope) return
  const prefix = `${scopePrefix(activeScope)}castsKPI:`
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** 個別キャストのプロフィールキャッシュをクリア */
export function invalidateCast(castId: string): void {
  invalidateCache(`cast:${castId}`)
}

/** 顧客詳細のキャッシュをクリア */
export function invalidateCustomerDetail(customerId: string): void {
  invalidateCache(`customerDetail:${customerId}`)
}

/** 'YYYY-MM-DD' から月キー 'YYYY-MM' を取り出すヘルパー */
export function extractMonth(dateStr: string): string {
  return dateStr.slice(0, 7)
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
  const scope = activeScope
  // 認証ユーザーが未確認の間は、別ユーザーのデータを再利用しない。
  if (!scope) {
    const data = await fetcher()
    onData(data)
    return data
  }
  const internalKey = scopedKey(key, scope)!

  // 1. キャッシュがあれば（期限内のみ）即座に返す
  const cached = getCache<T>(key, ttlMs)
  const entry = store.get(internalKey) as CacheEntry<T> | undefined
  if (cached !== null && entry) {
    onData(cached)
    // 鮮度内ならネットワーク呼び出しをスキップ
    const age = Date.now() - entry.timestamp
    if (age < freshMs) {
      return cached
    }
  }

  // 2. 同じキーのリクエストが進行中なら待つ（dedup）
  const existing = inflight.get(internalKey)
  if (existing) {
    const result = await existing as T
    if (activeScope === scope) onData(result)
    return result
  }

  // 3. 新しいリクエストを実行
  const promise = fetcher()
  inflight.set(internalKey, promise)

  try {
    const freshData = await promise
    // リクエスト中にログアウト・別ユーザーへ切り替わった場合は捨てる。
    if (activeScope === scope) {
      store.set(internalKey, { data: freshData, timestamp: Date.now() })
      onData(freshData)
    }
    return freshData
  } finally {
    inflight.delete(internalKey)
  }
}
