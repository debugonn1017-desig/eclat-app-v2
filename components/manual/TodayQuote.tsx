'use client'

// ─────────────────────────────────────────────────────────────────────
//  TodayQuote – 日替わりひとことカード
//  - 初期表示は INITIAL_QUOTE（SSR/CSR一致）
//  - マウント後 useEffect で getTodayQuote() に置換（hydration安全）
//  - useMemo 禁止、useState 初期値は静的リテラル（import済み定数）
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { INITIAL_QUOTE, getTodayQuote } from '@/lib/manual-quotes'

export default function TodayQuote() {
  const [quote, setQuote] = useState<string>(INITIAL_QUOTE)

  useEffect(() => {
    setQuote(getTodayQuote())
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)',
        border: '1px solid #FFDAE4',
        borderRadius: 18,
        padding: '14px 16px',
        boxShadow: '0 6px 18px rgba(232,135,154,0.08)',
      }}
    >
      <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }} aria-hidden="true">
        🌸
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 9,
            letterSpacing: '0.28em',
            color: '#E8879A',
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          TODAY&apos;S WORD
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: '#3D2D38',
            lineHeight: 1.5,
            fontFamily: '"Hiragino Sans", -apple-system, sans-serif',
          }}
        >
          {quote}
        </div>
      </div>
    </div>
  )
}
