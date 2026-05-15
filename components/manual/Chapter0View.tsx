'use client'

// ─────────────────────────────────────────────────────────────────────
//  Chapter0View – 「接客のまえに」（第0章）の表示
//
//  仕様：
//   - data.chapter_0.sections（0-1〜0-7）を独立アコーディオンカードで表示
//   - 初期は 0-1 のみ展開、他は折りたたみ（自前トグル）
//   - 4所作（philosophy.actions）と やってはいけない3つ（philosophy.ngList）は
//     冒頭の専用カードで強調表示
//   - React #300 再発防止：useMemo 不使用、useState は静的リテラルのみ
// ─────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import type { ManualData } from '@/types/manual'
import Markdown from '@/components/manual/Markdown'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const TEXT = '#2D1B26'
const HEAD = '#3D2840'
const MUTED = '#6B5560'
const PINK = '#E8879A'
const PINK_LIGHT = '#F4B0BF'
const BORDER = '#F0DDE2'
const BG_SOFT = 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)'

type Props = {
  data: ManualData
  onBack: () => void
}

// 4所作（気遣い・尊敬・女性らしさ・次への期待）の色
const ACTION_COLORS: Array<{ bg: string; border: string; accent: string; emoji: string }> = [
  { bg: '#FFF1F4', border: '#F4B0BF', accent: '#C0405C', emoji: '🌸' }, // 気遣い
  { bg: '#FFF4E6', border: '#F0CFA8', accent: '#A87830', emoji: '✨' }, // 尊敬
  { bg: '#F8F0FA', border: '#D4BFE0', accent: '#8E5BB0', emoji: '💗' }, // 女性らしさ
  { bg: '#E8F4F8', border: '#A8C8D8', accent: '#3E6F95', emoji: '🌙' }, // 次への期待
]

// ─── 内部：1セクションのアコーディオンカード ─────────────────────
function SectionCard({
  id,
  title,
  body,
  defaultOpen,
}: {
  id: string
  title: string
  body: string
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen)
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        boxShadow: '0 2px 8px rgba(232,135,154,0.06)',
        overflow: 'hidden',
        fontFamily: READ_FONT,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textAlign: 'left',
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#FFFFFF',
              background: `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT})`,
              padding: '3px 9px',
              borderRadius: 100,
              letterSpacing: '0.05em',
              flexShrink: 0,
            }}
          >
            {id}
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: HEAD,
              letterSpacing: '0.02em',
              lineHeight: 1.5,
            }}
          >
            {title}
          </span>
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 12,
            color: PINK,
            fontWeight: 700,
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open ? (
        <div
          style={{
            padding: '4px 18px 18px',
            borderTop: `1px solid ${BORDER}`,
            background: '#FFFCFD',
          }}
        >
          <Markdown source={body} />
        </div>
      ) : null}
    </div>
  )
}

// ─── 本体 ──────────────────────────────────────────────────────
export default function Chapter0View({ data, onBack }: Props) {
  const chapter = data.chapter_0
  const sections = chapter?.sections ?? []
  const actions = data.philosophy?.actions ?? []
  const ngList = data.philosophy?.ngList ?? []

  return (
    <div
      style={{
        padding: 16,
        fontFamily: READ_FONT,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {/* 戻る */}
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            color: PINK,
            fontSize: 12,
            fontWeight: 700,
            padding: '7px 14px',
            borderRadius: 10,
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
          }}
        >
          ← 戻る
        </button>
      </div>

      {/* ヒーロー：タイトル */}
      <div
        style={{
          background: BG_SOFT,
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: '18px 20px',
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.3em',
            color: PINK,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          接客のまえに
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: HEAD,
            lineHeight: 1.5,
            letterSpacing: '0.02em',
          }}
        >
          {chapter?.title || '第0章 はじめに'}
        </div>
      </div>

      {/* 4所作カード */}
      {actions.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: PINK,
              letterSpacing: '0.25em',
              padding: '0 4px',
            }}
          >
            🌸 4つの所作
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 10,
            }}
          >
            {actions.map((a, i) => {
              const col = ACTION_COLORS[i % ACTION_COLORS.length]!
              return (
                <div
                  key={`act-${i}`}
                  style={{
                    background: col.bg,
                    border: `1px solid ${col.border}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 14,
                      fontWeight: 700,
                      color: col.accent,
                      letterSpacing: '0.04em',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{col.emoji}</span>
                    <span>{a.name}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: TEXT,
                      lineHeight: 1.7,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {a.explain}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* やってはいけない3つ */}
      {ngList.length > 0 ? (
        <div
          style={{
            background: '#FFF0F0',
            border: '1px solid #E0A0A0',
            borderRadius: 12,
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#B04848',
              letterSpacing: '0.25em',
              marginBottom: 10,
            }}
          >
            ⚠ やってはいけない3つ
          </div>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {ngList.map((ng, i) => (
              <li
                key={`ng-${i}`}
                style={{
                  fontSize: 13,
                  color: '#7A3030',
                  lineHeight: 1.7,
                  letterSpacing: '0.02em',
                  paddingLeft: 18,
                  position: 'relative',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 2,
                    top: '0.6em',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#C05050',
                  }}
                />
                {ng}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 各セクション */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: PINK,
            letterSpacing: '0.25em',
            padding: '0 4px',
          }}
        >
          📖 本文
        </div>
        {sections.length === 0 ? (
          <div
            style={{
              background: '#FFFFFF',
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: 18,
              color: MUTED,
              fontSize: 13,
              fontFamily: READ_FONT,
            }}
          >
            <Markdown source={chapter?.rawMarkdown ?? ''} />
          </div>
        ) : (
          sections.map((sec, i) => {
            const id = sec.id || sec.no || `0-${i + 1}`
            const body = sec.body || sec.content || ''
            return (
              <SectionCard
                key={`sec-${id}-${i}`}
                id={id}
                title={sec.title}
                body={body}
                defaultOpen={i === 0}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
