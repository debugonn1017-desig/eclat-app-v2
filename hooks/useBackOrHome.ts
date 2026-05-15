'use client'

// ─────────────────────────────────────────────────────────────────────
//  useBackOrHome
//   ブラウザ履歴があれば router.back()、無ければ fallback URL（既定: /home）
//   全ページの「← 戻る」ボタンで使う共通フック
// ─────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

/**
 * 「戻る」ボタン用のハンドラを返す。
 * - 履歴に1個でも前がある → router.back()
 * - 履歴が空（直リンク等） → fallback URL へ
 *
 * @param fallback 履歴が無い時の遷移先（既定: '/home'）
 */
export function useBackOrHome(fallback: string = '/home'): () => void {
  const router = useRouter()
  return useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallback)
    }
  }, [router, fallback])
}
