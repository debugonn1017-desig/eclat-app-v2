'use client'

import { useState, useEffect, useCallback } from 'react'

type ViewMode = 'mobile' | 'pc'

const STORAGE_KEY = 'eclat-view-mode'

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
  }, [])

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'mobile' ? 'pc' : 'mobile'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // noop
      }
      return next
    })
  }, [])

  return { mode, toggle, isPC: mode === 'pc', ready }
}
