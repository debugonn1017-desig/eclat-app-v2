'use client'

// ─────────────────────────────────────────────────────────────────────
//  InfoCard
//  折りたたみ式の汎用カード。structuredフィールドに使い回す。
//  useState は defaultOpen (静的リテラルprops) のみで React #300 安全
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import Markdown from '@/components/manual/Markdown'
import { makeSummary } from '@/lib/manual-helpers'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'

type Accent = 'default' | 'gold' | 'warning'

type Props = {
  icon: string
  label: string
  content: string
  defaultOpen?: boolean
  accent?: Accent
}

function getAccentStyle(accent: Accent): {
  background: string
  border: string
  borderLeft: string
  labelColor: string
} {
  if (accent === 'gold') {
    return {
      background: '#FAF5E8',
      border: '1px solid #E0CFA0',
      borderLeft: '4px solid #C0A050',
      labelColor: '#8C6F3A',
    }
  }
  if (accent === 'warning') {
    return {
      background: '#FFF0F0',
      border: '1px solid #E0A0A0',
      borderLeft: '1px solid #E0A0A0',
      labelColor: '#B04848',
    }
  }
  return {
    background: '#FFFFFF',
    border: '1px solid #F0DDE2',
    borderLeft: '1px solid #F0DDE2',
    labelColor: '#C0405C',
  }
}

export default function InfoCard({
  icon,
  label,
  content,
  defaultOpen,
  accent = 'default',
}: Props) {
  const [open, setOpen] = useState<boolean>(defaultOpen ?? false)

  if (!content || !content.trim()) return null

  const style = getAccentStyle(accent)
  const summary = makeSummary(content, 120)

  return (
    <div
      style={{
        background: style.background,
        border: style.border,
        borderLeft: style.borderLeft,
        borderRadius: 12,
        padding: 14,
        boxShadow: '0 2px 6px rgba(60,30,40,0.04)',
        fontFamily: READ_FONT,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* ラベル */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontWeight: 700,
          fontSize: 12,
          color: style.labelColor,
          letterSpacing: '0.22em',
        }}
      >
        <span style={{ fontSize: 15, letterSpacing: 0 }}>{icon}</span>
        <span>{label}</span>
      </div>

      {/* 本体 */}
      {open ? (
        <div style={{ marginTop: 2 }}>
          <Markdown source={content} />
        </div>
      ) : (
        <div
          style={{
            fontSize: 13,
            color: '#6B5560',
            lineHeight: 1.7,
            letterSpacing: '0.02em',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {summary}
        </div>
      )}

      {/* トグルボタン */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            background: 'transparent',
            border: 'none',
            color: style.labelColor,
            fontSize: 11.5,
            fontWeight: 700,
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 6,
            letterSpacing: '0.05em',
            fontFamily: READ_FONT,
          }}
        >
          {open ? '▲ 閉じる' : '▼ 詳しく見る'}
        </button>
      </div>
    </div>
  )
}
