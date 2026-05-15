'use client'

// ─────────────────────────────────────────────────────────────────────
//  SearchBar – UIだけの検索バー（機能はv0.3で実装）
//  - disabled な input
//  - 虫眼鏡SVGアイコン左に配置
//  - 桜色のソフト枠
// ─────────────────────────────────────────────────────────────────────

export default function SearchBar() {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#E8879A"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        type="text"
        disabled
        placeholder="教科書全体を検索（v0.3 で実装予定）"
        style={{
          width: '100%',
          padding: '12px 16px 12px 44px',
          background: 'rgba(255,255,255,0.85)',
          border: '1px solid #F0DDE2',
          borderRadius: 16,
          fontSize: 12.5,
          color: '#6B5060',
          fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
          outline: 'none',
          boxSizing: 'border-box',
          cursor: 'not-allowed',
        }}
      />
    </div>
  )
}
