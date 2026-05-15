'use client'

// ─────────────────────────────────────────────────────────────────────
//  Markdown レンダラ（v0.2.7 純粋関数版）
//
//  React error #300 を絶対に再発させない設計：
//   - useState / useMemo / useEffect 一切なし（純粋関数 + JSX）
//   - props も {source: string} のみ
//   - SSR / CSR で完全に同じ出力
//
//  対応記法：
//   - # / ## / ### / #### 見出し
//   - - / * 箇条書き
//   - 1. 2. 3. 番号付き
//   - > 引用
//   - **太字**（桜アクセント）
//   - `code`
//   - --- 水平線
//   - | a | b | テーブル
//   - 通常段落（行末改行は <br/>）
// ─────────────────────────────────────────────────────────────────────

import { stripFrontmatter } from '@/lib/manual-helpers'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const TEXT = '#2D1B26'
const TEXT_MUTED = '#6B5560'
const HEAD = '#3D2840'
const ACCENT = '#C0405C'
const PINK = '#E8879A'
const PINK_LIGHT = '#F4B0BF'
const PINK_BG = '#FFF8FA'
const BORDER = '#F0DDE2'

// ─── インライン書式（**太字** / `code`） ──────────────────────
function InlineFormat({ text, keyPrefix = '' }: { text: string; keyPrefix?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((p, i) => {
        const k = `${keyPrefix}-${i}`
        if (p.startsWith('**') && p.endsWith('**')) {
          return (
            <strong key={k} style={{ color: ACCENT, fontWeight: 700 }}>
              {p.slice(2, -2)}
            </strong>
          )
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return (
            <code key={k} style={{
              background: '#FFF0F4', color: ACCENT,
              padding: '2px 7px', borderRadius: 5,
              fontSize: '0.92em', fontWeight: 600,
              fontFamily: 'ui-monospace, "SF Mono", monospace',
            }}>
              {p.slice(1, -1)}
            </code>
          )
        }
        return <span key={k}>{p}</span>
      })}
    </>
  )
}

// ─── 1ブロック描画（見出し、リスト、引用、段落） ─────────────
type BlockProps = { block: string; index: number }

function renderHeading(level: 1 | 2 | 3 | 4, text: string, key: string) {
  const styles: Record<number, React.CSSProperties> = {
    1: { fontSize: 22, fontWeight: 700, color: HEAD, margin: '28px 0 14px', lineHeight: 1.4, letterSpacing: '0.02em' },
    2: { fontSize: 18, fontWeight: 700, color: HEAD, margin: '24px 0 10px', lineHeight: 1.45, letterSpacing: '0.02em', borderBottom: `2px solid ${PINK_LIGHT}`, paddingBottom: 8 },
    3: { fontSize: 15, fontWeight: 700, color: HEAD, margin: '20px 0 8px', lineHeight: 1.5, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 10 },
    4: { fontSize: 13.5, fontWeight: 700, color: HEAD, margin: '16px 0 6px', lineHeight: 1.55, letterSpacing: '0.02em' },
  }
  const tag = ['h1', 'h2', 'h3', 'h4'][level - 1]
  const inner = level === 3
    ? <><span style={{ display: 'inline-block', width: 3, height: 14, background: PINK, borderRadius: 1.5 }} /><InlineFormat text={text} keyPrefix={key} /></>
    : <InlineFormat text={text} keyPrefix={key} />
  // 動的タグ
  return tag === 'h1' ? <h1 key={key} style={{ ...styles[level], fontFamily: READ_FONT }}>{inner}</h1>
    : tag === 'h2' ? <h2 key={key} style={{ ...styles[level], fontFamily: READ_FONT }}>{inner}</h2>
    : tag === 'h3' ? <h3 key={key} style={{ ...styles[level], fontFamily: READ_FONT }}>{inner}</h3>
    : <h4 key={key} style={{ ...styles[level], fontFamily: READ_FONT }}>{inner}</h4>
}

// チャット行検出： [N] キャスト：「○○」  /  [N] お客様：「○○」
// マッチしたら { speaker, text } を返す
const CHAT_LINE_RE = /^\s*\[(\d+)\]\s*(キャスト|お客様|あなた)\s*[：:]\s*[「『]?([^」』]+?)[」』]?\s*$/

function parseChatLine(line: string): { speaker: 'cast' | 'customer'; text: string } | null {
  const m = line.match(CHAT_LINE_RE)
  if (!m) return null
  const role = m[2]!
  const text = m[3]!.trim()
  if (role === 'お客様') return { speaker: 'customer', text }
  return { speaker: 'cast', text }
}

function renderChatBlock(lines: string[], key: string): React.ReactNode {
  // chat 行と非chat行を分離。chatブロックを最大限まとめる
  const chats: { speaker: 'cast' | 'customer'; text: string }[] = []
  for (const ln of lines) {
    const p = parseChatLine(ln)
    if (p) chats.push(p)
  }
  if (chats.length === 0) return null
  return (
    <div key={key} style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      background: '#FFFAFC',
      border: `1px solid ${BORDER}`,
      borderRadius: 14,
      padding: '14px 12px',
      fontFamily: READ_FONT,
    }}>
      {chats.map((c, i) => {
        if (c.speaker === 'customer') {
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              justifyContent: 'flex-start',
            }}>
              <div aria-hidden style={{
                width: 26, height: 26, borderRadius: '50%',
                background: '#FFFFFF',
                border: `1px solid ${BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, flexShrink: 0, marginTop: 2,
              }}>👤</div>
              <div style={{
                background: '#F0F0F0',
                padding: '10px 14px',
                borderRadius: '14px 14px 14px 4px',
                maxWidth: '78%',
                fontSize: 13.5, color: TEXT, lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
              }}>{c.text}</div>
            </div>
          )
        }
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            justifyContent: 'flex-end',
          }}>
            <div style={{
              background: `linear-gradient(135deg, ${PINK_LIGHT} 0%, ${PINK} 100%)`,
              padding: '10px 14px',
              borderRadius: '14px 14px 4px 14px',
              maxWidth: '78%',
              fontSize: 13.5, color: '#FFFFFF', lineHeight: 1.7,
              fontWeight: 500, whiteSpace: 'pre-wrap',
              boxShadow: '0 2px 6px rgba(232,135,154,0.25)',
            }}>{c.text}</div>
            <div aria-hidden style={{
              width: 26, height: 26, borderRadius: '50%',
              background: '#FFFFFF',
              border: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, flexShrink: 0, marginTop: 2,
            }}>🌸</div>
          </div>
        )
      })}
    </div>
  )
}

function renderBlock({ block, index }: BlockProps): React.ReactNode {
  const trimmed = block.trim()
  if (!trimmed) return null
  const key = `b-${index}`

  // チャット行ブロック（[1] キャスト：「...」が1行以上含まれる場合）
  const blockLines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
  if (blockLines.length > 0 && blockLines.every(l => CHAT_LINE_RE.test(l))) {
    return renderChatBlock(blockLines, key)
  }

  // 水平線
  if (/^---+$/.test(trimmed)) {
    return (
      <hr key={key} style={{
        margin: '20px 0',
        border: 'none',
        borderTop: `1px solid ${PINK_LIGHT}`,
      }} />
    )
  }

  // 見出し（深い→浅いの順で判定）
  if (trimmed.startsWith('#### ')) return renderHeading(4, trimmed.replace(/^####\s+/, ''), key)
  if (trimmed.startsWith('### '))  return renderHeading(3, trimmed.replace(/^###\s+/, ''), key)
  if (trimmed.startsWith('## '))   return renderHeading(2, trimmed.replace(/^##\s+/, ''), key)
  if (trimmed.startsWith('# '))    return renderHeading(1, trimmed.replace(/^#\s+/, ''), key)

  // 引用
  if (trimmed.startsWith('> ')) {
    const lines = trimmed.split('\n').map(l => l.replace(/^>\s?/, '')).join('\n')
    return (
      <blockquote key={key} style={{
        margin: 0,
        padding: '12px 16px',
        borderLeft: `3px solid ${PINK}`,
        background: PINK_BG,
        borderRadius: '0 10px 10px 0',
        fontSize: 13.5, color: TEXT_MUTED,
        lineHeight: 1.9,
        fontFamily: READ_FONT,
        whiteSpace: 'pre-wrap',
      }}>
        <InlineFormat text={lines} keyPrefix={key} />
      </blockquote>
    )
  }

  // テーブル：行が全て `|` で区切られている
  const lines = trimmed.split('\n')
  if (lines.length >= 2 && lines.every(l => l.includes('|')) && /^\s*\|?[-:|\s]+\|[-:|\s]*\|?\s*$/.test(lines[1] ?? '')) {
    const headers = lines[0]!.split('|').map(s => s.trim()).filter(Boolean)
    const rows = lines.slice(2).map(l => l.split('|').map(s => s.trim()).filter((_, i, arr) => !(i === 0 && _ === '') && !(i === arr.length - 1 && _ === '')))
    return (
      <div key={key} style={{ overflowX: 'auto', margin: '4px 0' }}>
        <table style={{
          borderCollapse: 'collapse',
          width: '100%',
          fontSize: 13,
          fontFamily: READ_FONT,
        }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={{
                  background: PINK_BG,
                  border: `1px solid ${BORDER}`,
                  padding: '8px 12px',
                  textAlign: 'left',
                  color: HEAD,
                  fontWeight: 700,
                }}>
                  <InlineFormat text={h} keyPrefix={`${key}-th-${i}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    border: `1px solid ${BORDER}`,
                    padding: '8px 12px',
                    color: TEXT,
                    lineHeight: 1.7,
                    verticalAlign: 'top',
                  }}>
                    <InlineFormat text={cell} keyPrefix={`${key}-td-${ri}-${ci}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // 番号付きリスト（全行が「1. 2. 3.」形式）
  if (lines.every(l => /^\d+\.\s/.test(l.trim()))) {
    const items = lines.map(l => l.trim().replace(/^\d+\.\s*/, ''))
    return (
      <ol key={key} style={{
        listStyle: 'none', padding: 0, margin: 0,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {items.map((it, j) => (
          <li key={j} style={{
            fontSize: 14, color: TEXT, lineHeight: 1.9,
            letterSpacing: '0.02em',
            fontFamily: READ_FONT,
            paddingLeft: 34, position: 'relative',
          }}>
            <span style={{
              position: 'absolute', left: 0, top: '0.15em',
              fontSize: 11, fontWeight: 700,
              color: '#FFF',
              background: `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT})`,
              width: 22, height: 22, borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 5px rgba(232,135,154,0.35)',
            }}>{j + 1}</span>
            <InlineFormat text={it} keyPrefix={`${key}-${j}`} />
          </li>
        ))}
      </ol>
    )
  }

  // 箇条書き（全行が「- 」「* 」形式）
  if (lines.every(l => /^[-*]\s+/.test(l.trim()))) {
    const items = lines.map(l => l.trim().replace(/^[-*]\s*/, ''))
    return (
      <ul key={key} style={{
        listStyle: 'none', padding: 0, margin: 0,
        display: 'flex', flexDirection: 'column', gap: 9,
      }}>
        {items.map((it, j) => (
          <li key={j} style={{
            fontSize: 14, color: TEXT, lineHeight: 1.85,
            letterSpacing: '0.02em',
            fontFamily: READ_FONT,
            paddingLeft: 18, position: 'relative',
          }}>
            <span style={{
              position: 'absolute', left: 2, top: '0.7em',
              width: 6, height: 6, borderRadius: '50%',
              background: PINK,
            }} />
            <InlineFormat text={it} keyPrefix={`${key}-${j}`} />
          </li>
        ))}
      </ul>
    )
  }

  // 通常の段落（HTMLコメントは捨てる）
  if (/^<!--[\s\S]*-->$/.test(trimmed)) return null
  return (
    <p key={key} style={{
      fontSize: 14, color: TEXT, lineHeight: 1.95,
      letterSpacing: '0.02em', margin: 0,
      fontFamily: READ_FONT,
      whiteSpace: 'pre-wrap',
    }}>
      <InlineFormat text={trimmed} keyPrefix={key} />
    </p>
  )
}

// ─── 本体 ────────────────────────────────────────────────────
export default function Markdown({ source }: { source: string | undefined | null }) {
  const clean = stripFrontmatter(source)
  if (!clean) {
    return (
      <p style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: READ_FONT }}>
        本文がまだ収録されていません。
      </p>
    )
  }
  // ## や - は連続行で1ブロックにまとめたいが、空行で区切るシンプル方式
  const blocks = clean.split(/\n\n+/)
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 16,
      fontFamily: READ_FONT,
    }}>
      {blocks.map((block, i) => renderBlock({ block, index: i }))}
    </div>
  )
}
