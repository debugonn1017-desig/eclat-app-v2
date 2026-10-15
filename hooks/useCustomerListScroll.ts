'use client'

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { captureCustomerListScroll } from '@/lib/customerListScroll'

/** 保存後の再取得でのみ保持。絞り込み・ページ移動時のスクロールは変えない。 */
export function useCustomerListScroll(content: unknown, refreshing: boolean, scope = '') {
  const restore = useRef<{ apply: () => void; scope: string } | null>(null)
  const preserve = useCallback(() => { restore.current = { apply: captureCustomerListScroll(), scope } }, [scope])
  useLayoutEffect(() => {
    if (restore.current && restore.current.scope !== scope) restore.current = null
    if (!refreshing && restore.current) {
      restore.current.apply()
      restore.current = null
    }
  }, [content, refreshing, scope])
  useEffect(() => {
    // 通信中に利用者がスクロールした場合、その操作を優先して元へ引き戻さない。
    const cancel = () => { restore.current = null }
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) cancel()
    }
    window.addEventListener('wheel', cancel, { passive: true })
    window.addEventListener('touchmove', cancel, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('touchmove', cancel)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  return preserve
}
