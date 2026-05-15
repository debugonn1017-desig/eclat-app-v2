'use client'

// ─────────────────────────────────────────────────────────────────────
//  MobileBottomNav v0.3.6
//  モバイル専用ボトムナビ（PC非表示は親側CSSで制御）
//  - ホーム / STEP / 検索 / お気に入り / メニュー
//  - 全機能有効化
//  - useMemo 禁止
// ─────────────────────────────────────────────────────────────────────

import { C } from '@/lib/colors'

type Props = {
  onHome: () => void
  onSteps: () => void
  onSearch: () => void
  onFavorites: () => void
}

type TabKey = 'home' | 'step' | 'search' | 'fav' | 'menu'

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'home',   label: 'ホーム',     icon: '📖' },
  { key: 'step',   label: 'STEP一覧',   icon: '🌸' },
  { key: 'search', label: '検索',       icon: '🔍' },
  { key: 'fav',    label: 'お気に入り', icon: '❤️' },
  { key: 'menu',   label: 'アプリへ',   icon: '☰' },
]

export default function MobileBottomNav({ onHome, onSteps, onSearch, onFavorites }: Props) {
  const handleClick = (key: TabKey) => {
    if (key === 'home') {
      onHome()
      return
    }
    if (key === 'step') {
      onSteps()  // セクションカードへスクロール
      return
    }
    if (key === 'search') {
      onSearch()
      return
    }
    if (key === 'fav') {
      onFavorites()
      return
    }
    if (key === 'menu') {
      // エクラ本体のホーム（ダッシュボード）へ
      if (typeof window !== 'undefined') {
        window.location.href = '/home'
      }
      return
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        background: C.white,
        borderTop: `1px solid ${C.border}`,
        boxShadow: '0 -2px 8px rgba(0,0,0,0.05)',
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 50,
        fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
      }}
      aria-label="教科書ボトムナビゲーション"
    >
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => handleClick(t.key)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            cursor: 'pointer',
            color: C.dark,
            padding: '6px 4px',
            fontFamily: 'inherit',
          }}
          aria-label={t.label}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">
            {t.icon}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>
            {t.label}
          </span>
        </button>
      ))}
    </div>
  )
}
