'use client'

// PC / モバイル ビュー切替トグル
//   各ページのヘッダーに置く小さなボタン。
//   useViewMode().toggle() を呼び、現在モードに応じて表示を切り替える。
//   localStorage に保存されるので次回も維持される。
import { useViewMode } from '@/hooks/useViewMode'
import { C } from '@/lib/colors'

interface Props {
  /** 配置時の追加スタイル */
  style?: React.CSSProperties
}

export default function ViewModeToggle({ style }: Props) {
  const { isPC, toggle, ready } = useViewMode()
  if (!ready) return null
  return (
    <button
      onClick={toggle}
      title={isPC ? 'モバイル表示に切替え' : 'PC表示に切替え'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#FFF',
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: '5px 10px',
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.1em',
        color: C.pinkMuted,
        cursor: 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {isPC ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <line x1="12" y1="18" x2="12" y2="18" />
          </svg>
          MOBILE
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          PC
        </>
      )}
    </button>
  )
}
