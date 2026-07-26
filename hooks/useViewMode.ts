'use client'

import { useState, useEffect, useCallback } from 'react'

type ViewMode = 'mobile' | 'pc'

const STORAGE_KEY = 'eclat-view-mode'
const VIEW_MODE_EVENT = 'eclat-view-mode-change'

export function useViewMode() {
  const [mode, setMode] = useState<ViewMode>('mobile')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ViewMode | null
      if (saved === 'pc' || saved === 'mobile') {
        setMode(saved)
      } else {
        // 画面幅が 768px 以上なら自動でPCモード
        if (window.innerWidth >= 768) {
          setMode('pc')
        }
      }
    } catch {
      // localStorage not available
    }
    setReady(true)

    // 同じ画面内で複数の useViewMode が使われていても、
    // アカウントメニューからの切替を即時に全コンポーネントへ反映する。
    const syncMode = (event: Event) => {
      const next = (event as CustomEvent<ViewMode>).detail
      if (next === 'pc' || next === 'mobile') setMode(next)
    }
    window.addEventListener(VIEW_MODE_EVENT, syncMode)
    return () => window.removeEventListener(VIEW_MODE_EVENT, syncMode)
  }, [])

  const toggle = useCallback(() => {
    const next = mode === 'mobile' ? 'pc' : 'mobile'
    setMode(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // noop
    }
    window.dispatchEvent(new CustomEvent<ViewMode>(VIEW_MODE_EVENT, { detail: next }))
  }, [mode])

  return { mode, toggle, isPC: mode === 'pc', ready }
}
