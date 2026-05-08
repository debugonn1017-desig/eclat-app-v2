'use client'

// 月切替コンポーネント
//   ‹ YYYY年M月 ›  形式で前月・翌月へ移動できる。
//   value="YYYY-MM" を受け取り、変化時に onChange で新しい "YYYY-MM" を返す。
//   表示文字列とロジックを共通化して、月次レポート系で使い回す。

import { CSSProperties } from 'react'
import { C } from '@/lib/colors'

interface Props {
  /** "YYYY-MM" */
  value: string
  /** 切替時に呼ばれる。新しい "YYYY-MM" を渡す */
  onChange: (next: string) => void
  /** 追加スタイル */
  style?: CSSProperties
  /** ラベルサイズ。デフォルト 'md' */
  size?: 'sm' | 'md' | 'lg'
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${y}年${m}月`
}

export default function MonthSwitcher({ value, onChange, style, size = 'md' }: Props) {
  const sizes = {
    sm: { padding: '5px 12px', fontSize: 12, arrowFontSize: 14 },
    md: { padding: '8px 16px', fontSize: 14, arrowFontSize: 18 },
    lg: { padding: '10px 18px', fontSize: 15, arrowFontSize: 20 },
  }[size]

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        background: '#FFF',
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: sizes.padding,
        fontWeight: 500,
        fontSize: sizes.fontSize,
        ...style,
      }}
    >
      <span
        onClick={() => onChange(shiftMonth(value, -1))}
        style={{
          cursor: 'pointer',
          color: C.pinkMuted,
          fontSize: sizes.arrowFontSize,
          userSelect: 'none',
          padding: '0 4px',
        }}
        title="前月"
      >
        ‹
      </span>
      <span style={{ color: C.dark, minWidth: 80, textAlign: 'center' }}>
        {formatMonthLabel(value)}
      </span>
      <span
        onClick={() => onChange(shiftMonth(value, 1))}
        style={{
          cursor: 'pointer',
          color: C.pinkMuted,
          fontSize: sizes.arrowFontSize,
          userSelect: 'none',
          padding: '0 4px',
        }}
        title="翌月"
      >
        ›
      </span>
    </div>
  )
}
