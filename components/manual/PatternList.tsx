'use client'

// ─────────────────────────────────────────────────────────────────────
//  PatternList v0.2.11
//  「パターン集」テーマ用のアコーディオン式パターン一覧
//   - rawMarkdown を ## で分割したセクションを受け取り
//   - 各セクションを開閉可能なカードで表示
//   - 中身は Markdown コンポーネントで描画 → チャット行は自動的にバブル化
//  純粋関数＋単純な useState のみ（React #300 安全）
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import Markdown from './Markdown'

type Section = { id: string; title: string; body: string }

type Props = {
  sections: Section[]
  accent?: 'pink' | 'beige'
}

const COLORS = {
  pink: { bg: '#FFF8FA', border: '#F4B0BF', label: '#D45060', headerBg: '#FFE8EE' },
  beige: { bg: '#FAF5E8', border: '#D4B58A', label: '#8C6F3A', headerBg: '#F4E8CC' },
}

export default function PatternList({ sections, accent = 'pink' }: Props) {
  if (!sections || sections.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sections.map((s, i) => (
        <PatternCard
          key={s.id}
          section={s}
          accent={accent}
          defaultOpen={i === 0}
          index={i + 1}
        />
      ))}
    </div>
  )
}

function PatternCard({
  section, accent, defaultOpen, index,
}: {
  section: Section
  accent: 'pink' | 'beige'
  defaultOpen: boolean
  index: number
}) {
  const [open, setOpen] = useState(defaultOpen)
  const c = COLORS[accent]
  return (
    <div style={{
      background: '#FFFFFF',
      border: `1px solid ${c.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: open ? `0 4px 14px ${accent === 'pink' ? 'rgba(232,135,154,0.15)' : 'rgba(184,153,104,0.15)'}` : 'none',
      transition: 'box-shadow 0.2s',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          background: open ? c.headerBg : c.bg,
          border: 'none',
          padding: '14px 16px',
          textAlign: 'left',
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{
            flexShrink: 0,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${accent === 'pink' ? '#F4B0BF' : '#D4B58A'} 0%, ${accent === 'pink' ? '#E8879A' : '#B89968'} 100%)`,
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 2px 4px ${accent === 'pink' ? 'rgba(232,135,154,0.3)' : 'rgba(184,153,104,0.3)'}`,
          }}>{index}</span>
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: c.label,
            letterSpacing: '0.02em',
            lineHeight: 1.5,
          }}>{section.title}</span>
        </div>
        <span style={{
          fontSize: 12,
          color: c.label,
          flexShrink: 0,
        }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>
      {open && (
        <div style={{
          padding: '16px 18px 18px',
          borderTop: `1px solid ${c.border}`,
          background: '#FFFFFF',
        }}>
          <Markdown source={section.body} />
        </div>
      )}
    </div>
  )
}
