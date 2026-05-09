// ─────────────────────────────────────────────────────────────────
//  Supabase 取得系のユーティリティ
// ─────────────────────────────────────────────────────────────────
//  Supabase の PostgREST は1クエリの返却数に **暗黙の1000件制限** がある。
//  customer_visits や customers のように行数が多くなるテーブルを
//  単純な .select() で取ると、1000件超のデータが静かに切られる。
//
//  → 全件取りたい時は .range(from, to) でページングする必要がある。
//  このヘルパーで「ページング取得」を1関数にまとめる。
//
//  ⚠ 「全件必要」な処理にだけ使うこと。表示用の先頭N件取得は通常の
//  .limit() で十分。
// ─────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 1000

/**
 * Supabase クエリを 1000 件ずつページング取得して結合する。
 *
 * 使い方:
 *   const visits = await fetchAllPaginated<VisitRow>((from, to) =>
 *     supabase.from('customer_visits')
 *       .select('*')
 *       .in('customer_id', ids)
 *       .range(from, to)
 *   )
 *
 * fetcher: (from, to) を受け取って Supabase の query Promise を返す関数。
 *          毎回新しいクエリチェーンを組む必要があるので、関数として渡す。
 */
export async function fetchAllPaginated<T>(
  // Supabase の query builder は Promise ではなく PromiseLike (thenable) なので
  // PromiseLike で受ける（こうしないと TS2739 エラーが出る）
  fetcher: (from: number, to: number) => PromiseLike<{
    data: T[] | null
    error: { message?: string } | null
  }>,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  // 安全策: 最大10万件で打ち切る（無限ループ防止）
  const MAX_TOTAL = 100000
  while (all.length < MAX_TOTAL) {
    const to = from + pageSize - 1
    const { data, error } = await fetcher(from, to)
    if (error) {
      throw new Error(error.message ?? 'fetchAllPaginated error')
    }
    const batch = data ?? []
    all.push(...batch)
    if (batch.length < pageSize) break // これが最後のページ
    from += pageSize
  }
  return all
}
