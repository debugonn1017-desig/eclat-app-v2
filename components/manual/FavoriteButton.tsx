'use client'

// ─────────────────────────────────────────────────────────────────────
//  FavoriteButton – お気に入りトグル（v0.3.2 本実装）
//
//  - localStorage キー: 'eclat-manual-favorites'
//    格納形式: JSON 配列 [{ type: 'theme'|'manual', id: string }, ...]
//  - props: { targetType, targetId }
//  - 同ファイルから useFavorites() フックも export
//
//  React #300 安全：
//   - useState 初期値はすべて静的（false / [] / 0）
//   - useEffect でマウント後に localStorage を読んで反映（hydration安全）
//   - useMemo は使わない
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'

export type FavoriteType = 'theme' | 'manual'

export type FavoriteEntry = {
  type: FavoriteType
  id: string
}

const STORAGE_KEY = 'eclat-manual-favorites'

// ─── localStorage I/O ────────────────────────────────────────────────
function readFavorites(): FavoriteEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: FavoriteEntry[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const t = (item as { type?: unknown }).type
      const id = (item as { id?: unknown }).id
      if ((t === 'theme' || t === 'manual') && typeof id === 'string' && id) {
        out.push({ type: t, id })
      }
    }
    return out
  } catch {
    return []
  }
}

function writeFavorites(list: FavoriteEntry[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    // 同タブ内の他コンポーネントへ通知
    window.dispatchEvent(new CustomEvent('eclat-favorites-changed'))
  } catch {
    /* noop */
  }
}

function entriesEqual(a: FavoriteEntry, b: FavoriteEntry): boolean {
  return a.type === b.type && a.id === b.id
}

// ─── useFavorites フック ─────────────────────────────────────────────
export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([])

  // 初期ロード + 他コンポーネント/他タブからの変更を反映
  useEffect(() => {
    if (typeof window === 'undefined') return
    setFavorites(readFavorites())

    const onChange = () => setFavorites(readFavorites())
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFavorites(readFavorites())
    }
    window.addEventListener('eclat-favorites-changed', onChange as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('eclat-favorites-changed', onChange as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const isFavorite = useCallback(
    (type: FavoriteType, id: string): boolean => {
      for (const f of favorites) {
        if (f.type === type && f.id === id) return true
      }
      return false
    },
    [favorites]
  )

  const toggle = useCallback((type: FavoriteType, id: string) => {
    const current = readFavorites()
    const target: FavoriteEntry = { type, id }
    let next: FavoriteEntry[]
    if (current.some((f) => entriesEqual(f, target))) {
      next = current.filter((f) => !entriesEqual(f, target))
    } else {
      next = [...current, target]
    }
    writeFavorites(next)
    setFavorites(next)
  }, [])

  return { favorites, isFavorite, toggle }
}

// ─── FavoriteButton 本体 ─────────────────────────────────────────────
type Props = {
  targetType: FavoriteType
  targetId: string
}

export default function FavoriteButton({ targetType, targetId }: Props) {
  const [isFav, setIsFav] = useState<boolean>(false)

  // マウント後に状態を読み込み（SSR/CSR の hydration 不一致を避ける）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const list = readFavorites()
    setIsFav(list.some((f) => f.type === targetType && f.id === targetId))

    const onChange = () => {
      const cur = readFavorites()
      setIsFav(cur.some((f) => f.type === targetType && f.id === targetId))
    }
    window.addEventListener('eclat-favorites-changed', onChange as EventListener)
    return () => {
      window.removeEventListener('eclat-favorites-changed', onChange as EventListener)
    }
  }, [targetType, targetId])

  const handleToggle = () => {
    const current = readFavorites()
    const target: FavoriteEntry = { type: targetType, id: targetId }
    let next: FavoriteEntry[]
    if (current.some((f) => entriesEqual(f, target))) {
      next = current.filter((f) => !entriesEqual(f, target))
      setIsFav(false)
    } else {
      next = [...current, target]
      setIsFav(true)
    }
    writeFavorites(next)
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isFav ? 'お気に入りから外す' : 'お気に入りに追加'}
      aria-pressed={isFav}
      style={{
        background: isFav ? '#FFE8EE' : '#FFFFFF',
        border: `1px solid ${isFav ? '#F4B0BF' : '#F0DDE2'}`,
        cursor: 'pointer',
        padding: '6px 10px',
        borderRadius: 100,
        fontSize: 14,
        lineHeight: 1,
        transition: 'background 0.18s ease, border-color 0.18s ease',
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: isFav ? '#C0405C' : '#B0909A',
        fontWeight: 600,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 14 }}>
        {isFav ? '♥' : '♡'}
      </span>
      <span style={{ fontSize: 11, letterSpacing: '0.04em' }}>
        {isFav ? 'お気に入り中' : 'お気に入り'}
      </span>
    </button>
  )
}
