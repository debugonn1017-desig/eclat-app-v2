'use client'

// ─────────────────────────────────────────────────────────────────────
//  ThemeDetailView – テーマ詳細（行動/会話タブ切替）
//
//  各テーマは `themes[i]` で定義され、action_id / conv_id で
//  actions[] / conversations[] に紐付く。
//  上部に pill タブ「🎤 会話」「🏃 行動」、タブで本文切替。
// ─────────────────────────────────────────────────────────────────────
import { useState, useMemo, type ReactNode } from 'react'
import { C } from '@/lib/colors'
import type { ManualData, ThemeDoc } from '@/types/manual'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const TEXT = '#2D1B26'
const HEAD = C.dark
const MUTED = C.dark2
const ACCENT = '#C0405C'
const PINK_DEEP = C.danger

// rawMarkdown 冒頭の frontmatter を除去
function stripFrontmatter(md: string): string {
  const trimmed = md.replace(/^\s*\n+/, '')
  // 先頭ブロックが key: value で並び、---で終わる場合は除去
  const head = trimmed.substring(0, 400)
  if (/^(title|step|side|author|status|updated|id|filename|category):/m.test(head)) {
    const endIdx = trimmed.indexOf('\n---\n')
    if (endIdx > 0 && endIdx < 600) {
      return trimmed.substring(endIdx + 5).replace(/^\s*\n+/, '')
    }
    // 標準 YAML 風
    if (trimmed.startsWith('---\n')) {
      const e = trimmed.indexOf('\n---\n', 4)
      if (e > 0) return trimmed.substring(e + 5).replace(/^\s*\n+/, '')
    }
  }
  return md
}

// ─── 軽量 Markdown レンダラ ─────────────────────────────────────
function InlineFormat({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={i} style={{ color: ACCENT, fontWeight: 700 }}>{p.slice(2, -2)}</strong>
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return (
            <code key={i} style={{
              background: '#FFF0F4', color: ACCENT,
              padding: '2px 6px', borderRadius: 4,
              fontSize: '0.92em', fontWeight: 600,
              fontFamily: 'inherit',
            }}>{p.slice(1, -1)}</code>
          )
        }
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

function ReadableMarkdown({ source }: { source: string }) {
  const blocks = useMemo(() => stripFrontmatter(source).split(/\n\n+/), [source])
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 18,
      fontFamily: READ_FONT,
    }}>
      {blocks.map((block, i) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} style={{
              fontSize: 14.5, fontWeight: 700, color: HEAD,
              letterSpacing: '0.02em', margin: '12px 0 4px',
              lineHeight: 1.55,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ width: 3, height: 14, background: C.pink, borderRadius: 1.5 }} />
              {trimmed.replace(/^### /, '')}
            </h4>
          )
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} style={{
              fontSize: 17, fontWeight: 700, color: HEAD,
              letterSpacing: '0.02em', margin: '20px 0 6px',
              lineHeight: 1.5,
              borderBottom: `2px solid ${C.pinkLight}`,
              paddingBottom: 6,
            }}>
              {trimmed.replace(/^## /, '')}
            </h3>
          )
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={i} style={{
              fontSize: 20, fontWeight: 700, color: HEAD,
              letterSpacing: '0.02em', margin: '20px 0 8px',
              lineHeight: 1.45,
            }}>
              {trimmed.replace(/^# /, '')}
            </h2>
          )
        }
        if (trimmed.startsWith('> ')) {
          const lines = trimmed.split('\n').map(l => l.replace(/^>\s?/, '')).join('\n')
          return (
            <blockquote key={i} style={{
              margin: 0, padding: '12px 16px',
              borderLeft: `3px solid ${C.pink}`,
              background: C.bgLight,
              borderRadius: '0 10px 10px 0',
              fontSize: 14, color: MUTED,
              lineHeight: 1.9, whiteSpace: 'pre-wrap',
            }}>
              <InlineFormat text={lines} />
            </blockquote>
          )
        }
        // リスト
        if (trimmed.split('\n').every(l => l.trim().startsWith('-') || l.trim().startsWith('*'))) {
          const items = trimmed.split('\n').map(l => l.trim().replace(/^[-*]\s*/, ''))
          return (
            <ul key={i} style={{ listStyle: 'none', padding: 0, margin: 0,
              display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((it, j) => (
                <li key={j} style={{
                  fontSize: 14.5, color: TEXT, lineHeight: 1.85,
                  letterSpacing: '0.02em',
                  paddingLeft: 18, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: 2, top: '0.7em',
                    width: 6, height: 6, borderRadius: '50%', background: C.pink,
                  }} />
                  <InlineFormat text={it} />
                </li>
              ))}
            </ul>
          )
        }
        // 番号付きリスト
        if (trimmed.split('\n').every(l => /^\d+\.\s/.test(l.trim()))) {
          const items = trimmed.split('\n').map(l => l.trim().replace(/^\d+\.\s*/, ''))
          return (
            <ol key={i} style={{ listStyle: 'none', padding: 0, margin: 0,
              display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((it, j) => (
                <li key={j} style={{
                  fontSize: 14.5, color: TEXT, lineHeight: 1.85,
                  letterSpacing: '0.02em',
                  paddingLeft: 30, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: 0, top: '0.1em',
                    fontSize: 12, fontWeight: 700, color: '#FFF',
                    background: C.pink, width: 20, height: 20, borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{j + 1}</span>
                  <InlineFormat text={it} />
                </li>
              ))}
            </ol>
          )
        }
        return (
          <p key={i} style={{
            fontSize: 14.5, color: TEXT, lineHeight: 1.95,
            letterSpacing: '0.02em', margin: 0,
            whiteSpace: 'pre-wrap',
          }}>
            <InlineFormat text={trimmed} />
          </p>
        )
      })}
    </div>
  )
}

// ─── テーマ詳細メイン ────────────────────────────────────────
export default function ThemeDetailView({
  theme, data, onBack, isPC,
}: {
  theme: ThemeDoc
  data: ManualData
  onBack: () => void
  isPC: boolean
}) {
  const action = theme.action_id ? data.actions.find(a => a.id === theme.action_id) : null
  const conv = theme.conv_id ? data.conversations.find(c => c.id === theme.conv_id) : null

  // 初期タブ：会話があればそちら、なければ行動
  const [tab, setTab] = useState<'conv' | 'action'>(conv ? 'conv' : 'action')

  const currentContent: ReactNode = (() => {
    if (tab === 'conv') {
      if (!conv) return <EmptyTabMsg label="会話マニュアル" />
      return <ReadableMarkdown source={conv.rawMarkdown ?? ''} />
    }
    if (!action) return <EmptyTabMsg label="行動マニュアル" />
    return <ReadableMarkdown source={action.rawMarkdown ?? ''} />
  })()

  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: 18,
      padding: isPC ? '28px 40px 36px' : '20px 18px 28px',
      boxShadow: '0 8px 24px rgba(120, 60, 90, 0.08)',
      marginBottom: 24,
      maxWidth: isPC ? 760 : '100%',
      marginLeft: 'auto', marginRight: 'auto',
    }}>
      {/* 戻る */}
      <button onClick={onBack} style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        color: C.pink,
        fontSize: 12, fontWeight: 600,
        padding: '7px 14px', borderRadius: 10,
        cursor: 'pointer', fontFamily: 'inherit',
        marginBottom: 18,
      }}>← STEP一覧に戻る</button>

      {/* タグ + タイトル */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{
            background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
            color: '#FFF', fontSize: 10, fontWeight: 700,
            padding: '3px 10px', borderRadius: 100,
            letterSpacing: '0.08em',
          }}>{typeof theme.step === 'number' ? `STEP${theme.step}` : theme.step}</span>
        </div>
        <h2 style={{
          fontSize: isPC ? 22 : 19, fontWeight: 700,
          color: HEAD, margin: '0 0 6px',
          letterSpacing: '0.02em', lineHeight: 1.4,
          fontFamily: READ_FONT,
        }}>{theme.title}</h2>
        {theme.subtitle && (
          <p style={{
            fontSize: 12.5, color: MUTED, margin: 0,
            lineHeight: 1.6, letterSpacing: '0.02em',
            fontFamily: READ_FONT,
          }}>{theme.subtitle}</p>
        )}
      </div>

      {/* タブ pill：🎤会話 / 🏃行動 */}
      <div style={{
        background: '#FFF0F3',
        borderRadius: 100,
        padding: 4,
        display: 'flex',
        marginBottom: 24,
      }}>
        <button
          onClick={() => setTab('conv')}
          disabled={!conv}
          style={{
            flex: 1, padding: '10px 12px',
            background: tab === 'conv'
              ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
              : 'transparent',
            color: tab === 'conv' ? '#FFF' : (conv ? MUTED : '#D8C0C8'),
            border: 'none', borderRadius: 100,
            fontSize: 12.5, fontWeight: 700,
            letterSpacing: '0.05em',
            cursor: conv ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            boxShadow: tab === 'conv' ? '0 3px 10px rgba(232,135,154,0.32)' : 'none',
            transition: 'all 0.2s',
          }}
        >🎤 会話マニュアル</button>
        <button
          onClick={() => setTab('action')}
          disabled={!action}
          style={{
            flex: 1, padding: '10px 12px',
            background: tab === 'action'
              ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
              : 'transparent',
            color: tab === 'action' ? '#FFF' : (action ? MUTED : '#D8C0C8'),
            border: 'none', borderRadius: 100,
            fontSize: 12.5, fontWeight: 700,
            letterSpacing: '0.05em',
            cursor: action ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            boxShadow: tab === 'action' ? '0 3px 10px rgba(232,135,154,0.32)' : 'none',
            transition: 'all 0.2s',
          }}
        >🏃 行動マニュアル</button>
      </div>

      {/* 本文 */}
      <div>{currentContent}</div>
    </div>
  )
}

function EmptyTabMsg({ label }: { label: string }) {
  return (
    <div style={{
      padding: '40px 20px', textAlign: 'center',
      color: MUTED, fontSize: 13,
      fontFamily: READ_FONT,
    }}>
      このテーマには{label}が用意されていません。
      <br />もう一方のタブをご覧ください。
    </div>
  )
}

export { stripFrontmatter, ReadableMarkdown }
