'use client'

// ─────────────────────────────────────────────────────────────────────
//  SearchBar – 教科書検索バー（v0.3.2 で機能化）
//  - 制御コンポーネント：value / onChange を親から受ける
//  - 虫眼鏡SVGアイコン左、クリアボタン×は value が空でない時のみ表示
//  - 桜色のソフト枠
//  React #300 安全：useState / useMemo / useEffect 一切なし
// ─────────────────────────────────────────────────────────────────────

type Props = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export default function SearchBar({ value, onChange, placeholder }: Props) {
  const ph = placeholder ?? 'セリフ・キーワードで検索...'
  const hasValue = value.length > 0

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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ph}
        style={{
          width: '100%',
          padding: '12px 44px 12px 44px',
          background: 'rgba(255,255,255,0.95)',
          border: '1px solid #F0DDE2',
          borderRadius: 16,
          fontSize: 13,
          color: '#3D2D38',
          fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {hasValue ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="検索をクリア"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: '#FFF0F3',
            border: '1px solid #F0DDE2',
            borderRadius: '50%',
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            color: '#E8879A',
            fontSize: 14,
            lineHeight: 1,
            fontFamily: 'inherit',
            fontWeight: 700,
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
