'use client'

// ─────────────────────────────────────────────────────────────────────
//  ReactionBubbles
//  3つの反応パターン（謙遜/自慢/自虐など）をLINE風吹き出しで表示
//  純粋関数コンポーネント（useState/useMemo/useEffect一切なし）
// ─────────────────────────────────────────────────────────────────────

import { getReactionStyle } from '@/lib/manual-helpers'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'

type Reaction = {
  type?: string
  label: string
  text: string
  reply: string
}

type Props = { reactions: Reaction[] }

export default function ReactionBubbles({ reactions }: Props) {
  if (!reactions || reactions.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        fontFamily: READ_FONT,
      }}
    >
      {reactions.map((r, i) => {
        const style = getReactionStyle(r.type)
        return (
          <div
            key={`r-${i}`}
            style={{
              background: style.bg,
              border: `1px solid ${style.border}`,
              borderRadius: 14,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* ラベル */}
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: style.accent,
                letterSpacing: '0.05em',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{style.emoji}</span>
              <span>[{r.label}]</span>
              {r.type ? (
                <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 600 }}>
                  {r.type}
                </span>
              ) : null}
            </div>

            {/* 客の吹き出し（左寄せ・グレー） */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 6,
                justifyContent: 'flex-start',
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  border: `1px solid ${style.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                👤
              </div>
              <div
                style={{
                  background: '#F0F0F0',
                  color: '#2D1B26',
                  padding: '10px 14px',
                  borderRadius: '16px 16px 16px 4px',
                  maxWidth: '70%',
                  fontSize: 13.5,
                  lineHeight: 1.7,
                  letterSpacing: '0.02em',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {r.text}
              </div>
            </div>

            {/* キャストの返し（右寄せ・桜ピンク） */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 6,
                justifyContent: 'flex-end',
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #F4B0BF 0%, #E8879A 100%)',
                  color: '#FFFFFF',
                  padding: '10px 14px',
                  borderRadius: '16px 16px 4px 16px',
                  maxWidth: '70%',
                  fontSize: 13.5,
                  lineHeight: 1.7,
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                  whiteSpace: 'pre-wrap',
                  boxShadow: '0 2px 6px rgba(232,135,154,0.25)',
                }}
              >
                {r.reply}
              </div>
              <div
                aria-hidden
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  border: '1px solid #F0DDE2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                🌸
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
