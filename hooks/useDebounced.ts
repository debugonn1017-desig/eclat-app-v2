// ─────────────────────────────────────────────────────────────────
//  軽量デバウンスフック
//   入力値が一定時間変わらなければ反映する
//   検索ボックス・スライダー・フィルター入力で活用
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'

/**
 * 値が delay ms 変わらなければ返り値を更新する。
 *   const [q, setQ] = useState('')
 *   const debouncedQ = useDebounced(q, 300)
 *   useEffect(() => { search(debouncedQ) }, [debouncedQ])
 */
export function useDebounced<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
