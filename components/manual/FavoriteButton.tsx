'use client'

// ─────────────────────────────────────────────────────────────────────
//  FavoriteButton – お気に入りトグル（UIだけ・本格機能はv0.3）
//  - 内部 useState の初期値は false（静的リテラル）
//  - useEffect でマウント後に localStorage を読んで反映（hydration安全）
//  - クリックで切り替え＋localStorage 保存
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'

type Props = {
  manualId: string
}

const STORAGE_KEY = 'eclat_manual_favorites_v1'

function readFavSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    /* noop */
  }
  return new Set()
}

function writeFavSet(set: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  } catch {
    /* noop */
  }
}

export default function FavoriteButton({ manualId }: Props) {
  const [isFav, setIsFav] = useState<boolean>(false)

  useEffect(() => {
    const set = readFavSet()
    setIsFav(set.has(manualId))
  }, [manualId])

  const toggle = () => {
    const set = readFavSet()
    if (set.has(manualId)) {
      set.delete(manualId)
      setIsFav(false)
    } else {
      set.add(manualId)
      setIsFav(true)
    }
    writeFavSet(set)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isFav ? 'お気に入りから外す' : 'お気に入りに追加'}
      aria-pressed={isFav}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 6,
        borderRadius: 10,
        fontSize: 20,
        lineHeight: 1,
        transition: 'background 0.18s ease',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = '#FFF0F3'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      <span aria-hidden="true">{isFav ? '❤️' : '🤍'}</span>
    </button>
  )
}
