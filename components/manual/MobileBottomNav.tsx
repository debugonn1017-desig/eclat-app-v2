'use client'

// ─────────────────────────────────────────────────────────────────────
//  MobileBottomNav – モバイル専用ボトムナビ（PC非表示は親側CSSで制御）
//  - 5タブ：ホーム / STEP / 検索 / お気に入り / メニュー
//  - 今は「ホーム」のみ機能、それ以外は v0.3 まで no-op
//  - useMemo 禁止
// ─────────────────────────────────────────────────────────────────────

type Tab = {
  key: string
  label: string
  icon: string
  enabled: boolean
}

const TABS: Tab[] = [
  { key: 'home', label: 'ホーム', icon: '📖', enabled: true },
  { key: 'step', label: 'STEP', icon: '🌸', enabled: false },
  { key: 'search', label: '検索', icon: '🔍', enabled: false },
  { key: 'fav', label: 'お気に入り', icon: '❤️', enabled: false },
  { key: 'menu', label: 'メニュー', icon: '☰', enabled: false },
]

type Props = {
  onHome: () => void
}

export default function MobileBottomNav({ onHome }: Props) {
  const handleClick = (key: string) => {
    if (key === 'home') onHome()
    // それ以外は v0.3 で実装（現状 no-op）
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        background: '#FFFFFF',
        borderTop: '1px solid #F0DDE2',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.05)',
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 50,
        fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
      }}
      aria-label="モバイルナビゲーション"
    >
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => handleClick(t.key)}
          disabled={!t.enabled}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            cursor: t.enabled ? 'pointer' : 'not-allowed',
            color: t.enabled ? '#3D2D38' : '#C8A8B0',
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
