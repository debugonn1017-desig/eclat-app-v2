'use client'

// ─────────────────────────────────────────────────────────────────────
//  SideNav – PC専用サイドナビ（モバイル非表示は親側CSSで制御）
//  - 11セクションを縦並びボタンで表示
//  - active セクションは桜ピンク背景＋白文字
//  - 上部にロゴ＋バージョン、下部に検索バー・お気に入り・設定
// ─────────────────────────────────────────────────────────────────────
import { SECTIONS, type SectionId } from './sections'
import SearchBar from './SearchBar'

type Props = {
  activeSection: SectionId | null
  onNavigate: (id: SectionId) => void
}

export default function SideNav({ activeSection, onNavigate }: Props) {
  return (
    <div
      style={{
        width: '100%',
        padding: 16,
        background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFAFC 100%)',
        border: '1px solid #F0DDE2',
        borderRadius: 18,
        boxShadow: '0 6px 18px rgba(232,135,154,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      {/* ロゴ＋バージョン */}
      <div
        style={{
          padding: '4px 6px 10px',
          borderBottom: '1px solid #F0DDE2',
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            letterSpacing: '0.04em',
          }}
        >
          📖 教科書
        </div>
        <div
          style={{
            fontSize: 9,
            color: '#B0909A',
            marginTop: 3,
            letterSpacing: '0.18em',
            fontWeight: 600,
          }}
        >
          v0.2.7 BETA
        </div>
      </div>

      {/* セクション一覧 */}
      <nav
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
        aria-label="教科書セクション"
      >
        {SECTIONS.map((s) => {
          const active = activeSection === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onNavigate(s.id)}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '9px 10px',
                background: active
                  ? 'linear-gradient(135deg, #E8879A 0%, #F4B0BF 100%)'
                  : 'transparent',
                color: active ? '#FFFFFF' : '#3D2D38',
                border: 'none',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                transition: 'background 0.18s ease',
                boxShadow: active ? '0 4px 10px rgba(232,135,154,0.25)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  ;(e.currentTarget as HTMLButtonElement).style.background = '#FFF0F3'
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                }
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }} aria-hidden="true">
                {s.emoji}
              </span>
              <span style={{ lineHeight: 1.35, flex: 1, minWidth: 0 }}>{s.title}</span>
            </button>
          )
        })}
      </nav>

      {/* 下部ユーティリティ */}
      <div
        style={{
          paddingTop: 12,
          borderTop: '1px solid #F0DDE2',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <SearchBar />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            type="button"
            disabled
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              background: 'transparent',
              border: 'none',
              color: '#B0909A',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'not-allowed',
              textAlign: 'left',
              fontFamily: 'inherit',
              borderRadius: 10,
            }}
            aria-label="お気に入り（v0.3で実装予定）"
          >
            <span aria-hidden="true">❤️</span>
            <span>お気に入り</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, letterSpacing: '0.12em', color: '#C8A8B0' }}>v0.3</span>
          </button>
          <button
            type="button"
            disabled
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              background: 'transparent',
              border: 'none',
              color: '#B0909A',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'not-allowed',
              textAlign: 'left',
              fontFamily: 'inherit',
              borderRadius: 10,
            }}
            aria-label="設定（v0.3で実装予定）"
          >
            <span aria-hidden="true">⚙️</span>
            <span>設定</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, letterSpacing: '0.12em', color: '#C8A8B0' }}>v0.3</span>
          </button>
        </div>
      </div>
    </div>
  )
}
