'use client'

// ─────────────────────────────────────────────────────────────────────
//  ReactionBubbles v0.2.9
//  3つの反応パターン（謙遜/自慢/自虐など）をLINE風吹き出しで表示
//   - customer / text どちらのフィールド名でも対応
//   - 吹き出し内のテキストもパース：
//       「（〜）」「（〜して）」括弧書きの指示文は別行・小さく
//       残りはセリフとして通常表示
//   - 「／」「/」で複数バリエーションを区切る場合は別バブルに分割
//  純粋関数コンポーネント（useState/useMemo/useEffect一切なし）
// ─────────────────────────────────────────────────────────────────────

import { getReactionStyle } from '@/lib/manual-helpers'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'

type Reaction = {
  type?: string
  label: string
  text?: string
  customer?: string  // ★ 新しいフィールド名にも対応
  reply: string
}

type Props = { reactions: Reaction[] }

// テキストを「指示文（括弧書き or 末尾コロン行）」と「セリフ本体」に分解
type Segment = { kind: 'note' | 'speech'; text: string }

function parseBubbleText(raw: string): Segment[] {
  if (!raw || !raw.trim()) return []
  const segments: Segment[] = []
  // 改行で行ごとに分解
  const lines = raw.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // 行全体が （...） で囲まれている → 指示
    if (/^[（(].+[）)]$/.test(line)) {
      const inner = line.replace(/^[（(]/, '').replace(/[）)]$/, '')
      segments.push({ kind: 'note', text: inner })
      continue
    }

    // 末尾が「：」or「:」 → 指示
    if (/[：:]$/.test(line)) {
      segments.push({ kind: 'note', text: line.replace(/[：:]$/, '：') })
      continue
    }

    // 1行に混在：先頭の (...) を抜き出し、残りをセリフに
    const mixMatch = line.match(/^[（(](.+?)[）)]\s*(.+)$/)
    if (mixMatch) {
      segments.push({ kind: 'note', text: mixMatch[1]! })
      segments.push({ kind: 'speech', text: mixMatch[2]! })
      continue
    }
    // 末尾の (...) を分離
    const tailMatch = line.match(/^(.+?)\s*[（(](.+?)[）)]$/)
    if (tailMatch) {
      segments.push({ kind: 'speech', text: tailMatch[1]! })
      segments.push({ kind: 'note', text: tailMatch[2]! })
      continue
    }

    // それ以外はセリフ
    segments.push({ kind: 'speech', text: line })
  }
  return segments
}

// 客のセリフは「／」「/」でバリエーション分割（複数バブルにする）
// ただし括弧（）内のスラッシュは保持する
function splitCustomerVariations(raw: string): string[] {
  if (!raw) return []
  const result: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of raw) {
    if (ch === '（' || ch === '(') {
      depth++
      buf += ch
    } else if (ch === '）' || ch === ')') {
      depth = Math.max(0, depth - 1)
      buf += ch
    } else if ((ch === '／' || ch === '/') && depth === 0) {
      if (buf.trim()) result.push(buf.trim())
      buf = ''
    } else {
      buf += ch
    }
  }
  if (buf.trim()) result.push(buf.trim())
  return result.length > 0 ? result : (raw.trim() ? [raw.trim()] : [])
}

// 吹き出し内 Segment 群をレンダリング
function BubbleContent({
  segments, color, textColor, noteColor,
}: {
  segments: Segment[]
  color: string
  textColor: string
  noteColor: string
}) {
  if (segments.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {segments.map((seg, i) => {
        if (seg.kind === 'note') {
          return (
            <div key={i} style={{
              fontSize: 11,
              color: noteColor,
              fontStyle: 'italic',
              lineHeight: 1.55,
              opacity: 0.9,
            }}>（{seg.text}）</div>
          )
        }
        return (
          <div key={i} style={{
            fontSize: 13.5,
            color: textColor,
            lineHeight: 1.7,
            letterSpacing: '0.02em',
            whiteSpace: 'pre-wrap',
            fontWeight: color === '#FFFFFF' ? 500 : 400,
          }}>{seg.text}</div>
        )
      })}
    </div>
  )
}

export default function ReactionBubbles({ reactions }: Props) {
  if (!reactions || reactions.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      fontFamily: READ_FONT,
    }}>
      {reactions.map((r, i) => {
        const style = getReactionStyle(r.type ?? r.label)
        const customerRaw = r.customer ?? r.text ?? ''
        const customerVariations = splitCustomerVariations(customerRaw)
        const replySegments = parseBubbleText(r.reply ?? '')

        return (
          <div key={`r-${i}`} style={{
            background: style.bg,
            border: `1px solid ${style.border}`,
            borderRadius: 14,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {/* ラベル */}
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: style.accent,
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span>{style.emoji}</span>
              <span>{r.label}</span>
              {r.type && r.type !== r.label ? (
                <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 600 }}>
                  ({r.type})
                </span>
              ) : null}
            </div>

            {/* お客様の吹き出し（左寄せ・グレー、バリエーションごとに分割） */}
            {customerVariations.length > 0 ? customerVariations.map((variant, vi) => {
              const segs = parseBubbleText(variant)
              if (segs.length === 0) return null
              return (
                <div key={`c-${vi}`} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  justifyContent: 'flex-start',
                }}>
                  <div aria-hidden style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: '#FFFFFF',
                    border: `1px solid ${style.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, flexShrink: 0, marginTop: 2,
                  }}>👤</div>
                  <div style={{
                    background: '#F0F0F0',
                    padding: '10px 14px',
                    borderRadius: '14px 14px 14px 4px',
                    maxWidth: '78%',
                  }}>
                    <BubbleContent
                      segments={segs}
                      color="#F0F0F0"
                      textColor="#2D1B26"
                      noteColor="#6B5560"
                    />
                  </div>
                </div>
              )
            }) : null}

            {/* キャストの返し（右寄せ・桜ピンク、indications も含む） */}
            {replySegments.length > 0 ? (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                justifyContent: 'flex-end',
              }}>
                <div style={{
                  background: 'linear-gradient(135deg, #F4B0BF 0%, #E8879A 100%)',
                  padding: '10px 14px',
                  borderRadius: '14px 14px 4px 14px',
                  maxWidth: '78%',
                  boxShadow: '0 2px 6px rgba(232,135,154,0.25)',
                }}>
                  <BubbleContent
                    segments={replySegments}
                    color="#FFFFFF"
                    textColor="#FFFFFF"
                    noteColor="rgba(255,255,255,0.85)"
                  />
                </div>
                <div aria-hidden style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#FFFFFF',
                  border: '1px solid #F0DDE2',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0, marginTop: 2,
                }}>🌸</div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
