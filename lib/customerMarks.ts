export type CustomerMarks = { is_starred?: boolean; no_reply?: boolean }

// 基本情報の保存では、別画面で手動変更したマークを上書きしない。
export function customerDataWithoutMarks<T extends CustomerMarks>(data: T): Omit<T, keyof CustomerMarks> {
  const copy = { ...data }
  delete copy.is_starred
  delete copy.no_reply
  return copy
}

type SortRow = { starred: boolean; nomination?: string | null; lastVisitDate?: string | null }
// カテゴリ分けの後で呼ぶ。場内だけ星→最終来店順、それ以外は星→元順を維持。
export function compareStarredCustomers(a: SortRow, b: SortRow): number {
  return Number(b.starred) - Number(a.starred)
    || (a.nomination === '場内' && b.nomination === '場内'
      ? (b.lastVisitDate ?? '').localeCompare(a.lastVisitDate ?? '') : 0)
}
