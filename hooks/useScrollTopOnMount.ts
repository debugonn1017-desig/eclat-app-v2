'use client'

// ─────────────────────────────────────────────────────────────────────
//  useScrollTopOnMount
//   ページマウント時（または deps 変化時）に画面最上部へスクロール
//   全ページの先頭 useEffect に1行で挿入する
// ─────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'

/**
 * マウント時（または deps 変化時）に画面最上部へスクロール。
 * behavior: 'auto' で瞬間移動。requestAnimationFrame で DOM 描画後に確実実行。
 *
 * @param deps スクロールをリセットする依存配列（既定: []）
 */
export function useScrollTopOnMount(deps: React.DependencyList = []): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'auto' })
      if (document.documentElement) document.documentElement.scrollTop = 0
      if (document.body) document.body.scrollTop = 0
    })
    return () => cancelAnimationFrame(id)
  }, deps)
}
