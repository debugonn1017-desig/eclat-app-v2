'use client'

// ─────────────────────────────────────────────────────────────────────
//  ThemeDetailView – テーマ詳細（会話/行動 タブ切替）
//  v0.2.6 モックアップ準拠の根本作り直し
//
//  方針：
//   - すべてのセクションはデフォルト折りたたみ
//   - 要約だけ表示、「詳しく見る」ボタンで全文展開
//   - セリフHero、反応パターン、ポイント、取れる情報、なぜ効くか、基準
//   - rawMarkdown を ## 見出しで分割して要約抽出
// ─────────────────────────────────────────────────────────────────────
import { useState, useMemo } from 'react'
import { C } from '@/lib/colors'
import type { ManualData, ThemeDoc, ActionDoc, ConversationDoc } from '@/types/manual'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const TEXT = '#2D1B26'
const HEAD = '#3D2840'
const MUTED = '#6B5560'
const ACCENT = '#C0405C'
const PINK_DEEP = '#D45060'

// ─── frontmatter 除去 ────────────────────────────────────────
export function stripFrontmatter(md: string): string {
  if (!md) return ''
  const trimmed = md.replace(/^\s*\n+/, '')
  const head = trimmed.substring(0, 400)
  if (/^(title|step|side|author|status|updated|id|filename|category):/m.test(head)) {
    const endIdx = trimmed.indexOf('\n---\n')
    if (endIdx > 0 && endIdx < 600) {
      return trimmed.substring(endIdx + 5).replace(/^\s*\n+/, '')
    }
    if (trimmed.startsWith('---\n')) {
      const e = trimmed.indexOf('\n---\n', 4)
      if (e > 0) return trimmed.substring(e + 5).replace(/^\s*\n+/, '')
    }
  }
  return md
}

// ─── ## 見出しで分割してセクション辞書を作る ─────────────────
type Section = {
  title: string  // 見出し（例: "目的"）
  body: string   // 本文
}
function parseSections(md: string): { intro: string; sections: Section[] } {
  const clean = stripFrontmatter(md ?? '')
  if (!clean) return { intro: '', sections: [] }

  // 先頭の # タイトル行を捨てる
  const noH1 = clean.replace(/^#\s+[^\n]+\n+/, '')

  const lines = noH1.split('\n')
  let intro = ''
  const sections: Section[] = []
  let current: Section | null = null

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current)
      current = { title: line.replace(/^##\s+/, '').trim(), body: '' }
    } else if (current) {
      current.body += line + '\n'
    } else {
      intro += line + '\n'
    }
  }
  if (current) sections.push(current)

  // body trim
  for (const s of sections) {
    s.body = s.body.trim()
  }
  return { intro: intro.trim(), sections }
}

// 要約：本文の最初の段落だけ取得（最大160文字）
function makeSummary(body: string, maxLen = 160): string {
  if (!body) return ''
  // 最初の段落（**太字**除去）
  const first = body.split(/\n\n+/)[0] ?? ''
  const plain = first
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/\n/g, ' ')
    .trim()
  if (plain.length <= maxLen) return plain
  return plain.substring(0, maxLen) + '…'
}

// ─── インライン書式（**太字** / `code`） ──────────────────────
function InlineFormat({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**'))
          return <strong key={i} style={{ color: ACCENT, fontWeight: 700 }}>{p.slice(2, -2)}</strong>
        if (p.startsWith('`') && p.endsWith('`'))
          return <code key={i} style={{
            background: '#FFF0F4', color: ACCENT,
            padding: '2px 6px', borderRadius: 4,
            fontSize: '0.92em', fontWeight: 600,
          }}>{p.slice(1, -1)}</code>
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

// ─── 読み物用 Markdown レンダラ（全文展開用） ──────────────────
export function ReadableMarkdown({ source }: { source: string }) {
  const blocks = useMemo(() => stripFrontmatter(source ?? '').split(/\n\n+/), [source])
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 16,
      fontFamily: READ_FONT,
    }}>
      {blocks.map((block, i) => {
        const trimmed = block.trim()
        if (!trimmed) return null
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} style={{
              fontSize: 14, fontWeight: 700, color: HEAD,
              margin: '8px 0 2px', lineHeight: 1.5,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 3, height: 13, background: C.pink, borderRadius: 1.5 }} />
              {trimmed.replace(/^###\s+/, '')}
            </h4>
          )
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} style={{
              fontSize: 16, fontWeight: 700, color: HEAD,
              margin: '14px 0 4px', lineHeight: 1.5,
              borderBottom: `2px solid ${C.pinkLight}`, paddingBottom: 6,
            }}>{trimmed.replace(/^##\s+/, '')}</h3>
          )
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={i} style={{
              fontSize: 18, fontWeight: 700, color: HEAD,
              margin: '14px 0 6px', lineHeight: 1.45,
            }}>{trimmed.replace(/^#\s+/, '')}</h2>
          )
        }
        if (trimmed.startsWith('> ')) {
          const lines = trimmed.split('\n').map(l => l.replace(/^>\s?/, '')).join('\n')
          return (
            <blockquote key={i} style={{
              margin: 0, padding: '10px 14px',
              borderLeft: `3px solid ${C.pink}`,
              background: '#FFF8FA', borderRadius: '0 8px 8px 0',
              fontSize: 13.5, color: MUTED, lineHeight: 1.85,
              whiteSpace: 'pre-wrap',
            }}><InlineFormat text={lines} /></blockquote>
          )
        }
        if (trimmed.split('\n').every(l => l.trim().startsWith('-') || l.trim().startsWith('*'))) {
          const items = trimmed.split('\n').map(l => l.trim().replace(/^[-*]\s*/, ''))
          return (
            <ul key={i} style={{ listStyle: 'none', padding: 0, margin: 0,
              display: 'flex', flexDirection: 'column', gap: 7 }}>
              {items.map((it, j) => (
                <li key={j} style={{
                  fontSize: 14, color: TEXT, lineHeight: 1.85,
                  paddingLeft: 16, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: 2, top: '0.7em',
                    width: 5, height: 5, borderRadius: '50%', background: C.pink,
                  }} />
                  <InlineFormat text={it} />
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} style={{
            fontSize: 14, color: TEXT, lineHeight: 1.9,
            margin: 0, whiteSpace: 'pre-wrap',
          }}>
            <InlineFormat text={trimmed} />
          </p>
        )
      })}
    </div>
  )
}

// ─── 折りたたみセクション ──────────────────────────────────────
function CollapsibleSection({
  icon, label, summary, fullBody,
}: {
  icon: string
  label: string
  summary: string
  fullBody: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      background: '#FFF',
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      marginBottom: 10,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 15 }}>{icon}</span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: PINK_DEEP, letterSpacing: '0.22em',
          }}>{label}</span>
        </div>
        {summary && (
          <p style={{
            fontSize: 13.5, color: TEXT,
            lineHeight: 1.8, margin: 0,
            letterSpacing: '0.02em', fontFamily: READ_FONT,
          }}>{summary}</p>
        )}
      </div>
      {fullBody && fullBody !== summary && (
        <>
          <button
            onClick={() => setOpen(!open)}
            style={{
              width: '100%',
              background: open ? '#FFF8FA' : '#FFFAFC',
              border: 'none',
              borderTop: `1px solid ${C.border}`,
              padding: '10px 14px',
              fontSize: 11.5, fontWeight: 600,
              color: C.pink, cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.05em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            {open ? '▲ 閉じる' : '▼ 詳しく見る'}
          </button>
          {open && (
            <div style={{
              padding: '16px 18px 18px',
              borderTop: `1px solid ${C.border}`,
              background: '#FFFAFC',
            }}>
              <ReadableMarkdown source={fullBody} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── セリフHero（折りたたみ可能、デフォルト閉じ） ─────────────────
function SerifHero({ body }: { body: string }) {
  const [open, setOpen] = useState(false)
  // 本文の最初の「」内を抽出するか、最初の段落
  const matched = body.match(/「([^」]+)」/)
  const headline = matched ? matched[1] : body.split(/\n\n+/)[0]?.substring(0, 80) ?? ''

  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.pink} 0%, ${C.pinkLight} 100%)`,
      color: '#FFF',
      borderRadius: 16,
      marginBottom: 14,
      boxShadow: '0 6px 18px rgba(232,135,154,0.25)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <span aria-hidden style={{
        position: 'absolute', top: -20, right: -20,
        width: 100, height: 100,
        background: 'radial-gradient(circle, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{ padding: '16px 18px' }}>
        <div style={{
          fontSize: 9, letterSpacing: '0.3em', fontWeight: 700,
          color: 'rgba(255,255,255,0.85)', marginBottom: 8,
        }}>💗 SERIF（持ち上げの一言）</div>
        <div style={{
          fontSize: 16, fontWeight: 600, lineHeight: 1.7,
          fontFamily: READ_FONT,
          letterSpacing: '0.02em',
          position: 'relative', zIndex: 1,
        }}>「{headline}」</div>
      </div>
      {body && body.length > 100 && (
        <>
          <button
            onClick={() => setOpen(!open)}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.18)',
              color: '#FFF', border: 'none',
              padding: '10px 14px',
              fontSize: 11.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              letterSpacing: '0.05em',
              borderTop: '1px solid rgba(255,255,255,0.3)',
            }}
          >{open ? '▲ 閉じる' : '▼ 詳しく見る（バリエーション・基準）'}</button>
          {open && (
            <div style={{
              padding: '14px 18px 18px',
              background: 'rgba(255,255,255,0.96)',
              color: TEXT,
            }}>
              <ReadableMarkdown source={body} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── 本体 ────────────────────────────────────────────────────
export default function ThemeDetailView({
  theme, data, onBack, isPC,
}: {
  theme: ThemeDoc
  data: ManualData
  onBack: () => void
  isPC: boolean
}) {
  const action: ActionDoc | undefined = theme.action_id
    ? data.actions.find(a => a.id === theme.action_id)
    : undefined
  const conv: ConversationDoc | undefined = theme.conv_id
    ? data.conversations.find(c => c.id === theme.conv_id)
    : undefined

  const [tab, setTab] = useState<'conv' | 'action'>(conv ? 'conv' : 'action')
  const [showAll, setShowAll] = useState(false)

  const currentDoc = tab === 'conv' ? conv : action
  const rawMd = currentDoc?.rawMarkdown ?? ''
  const { sections } = useMemo(() => parseSections(rawMd), [rawMd])

  // セクション分類：セリフ系/それ以外
  const serifSection = sections.find(s =>
    /セリフ|ひと言|スクリプト|台本/i.test(s.title)
  )

  // セクションに対するアイコン・並び順
  const SECTION_ICON: Record<string, string> = {
    'このページを見る場面': '📍',
    '目的': '🎯',
    '基本の考え方': '💡',
    '返ってくる反応と引き立ての返し': '💬',
    '反応パターン': '💬',
    '取れる情報・派生': '📥',
    '取れる情報': '📥',
    'なぜ効くか': '💎',
    '迷ったときの基準': '⚖️',
    '迷ったとき': '⚖️',
    '注意点': '⚠️',
    '手順': '🏃',
    '手順・所作': '🏃',
    'まとめ': '🌸',
  }
  function pickIcon(title: string): string {
    for (const k of Object.keys(SECTION_ICON)) {
      if (title.includes(k)) return SECTION_ICON[k]
    }
    return '📖'
  }

  // 表示用：セリフ以外
  const otherSections = sections.filter(s => s !== serifSection)

  return (
    <div style={{
      background: '#FFFFFF',
      border: `1px solid ${C.border}`,
      borderRadius: 18,
      padding: isPC ? '24px 36px 32px' : '18px 16px 24px',
      boxShadow: '0 8px 24px rgba(120, 60, 90, 0.08)',
      marginBottom: 24,
      maxWidth: isPC ? 760 : '100%',
      marginLeft: 'auto', marginRight: 'auto',
    }}>
      {/* 戻る */}
      <button onClick={onBack} style={{
        background: '#FFFFFF',
        border: `1px solid ${C.border}`,
        color: C.pink,
        fontSize: 12, fontWeight: 600,
        padding: '7px 14px', borderRadius: 10,
        cursor: 'pointer', fontFamily: 'inherit',
        marginBottom: 14,
      }}>← STEP一覧に戻る</button>

      {/* パンくず */}
      <div style={{
        fontSize: 11, color: PINK_DEEP, fontWeight: 600,
        letterSpacing: '0.08em', marginBottom: 6,
      }}>
        {typeof theme.step === 'number' ? `STEP${theme.step}` : theme.step}
        {' / '}
        {tab === 'conv' ? '会話マニュアル' : '行動マニュアル'}
      </div>

      {/* タイトル */}
      <h2 style={{
        fontSize: isPC ? 22 : 19, fontWeight: 700,
        color: HEAD, margin: '0 0 14px',
        letterSpacing: '0.02em', lineHeight: 1.4,
        fontFamily: READ_FONT,
      }}>{theme.title}</h2>

      {/* タブ pill：🎤会話 / 🏃行動 */}
      <div style={{
        background: '#FFF0F3',
        borderRadius: 100, padding: 4,
        display: 'flex',
        marginBottom: 22,
      }}>
        <button
          onClick={() => { setTab('conv'); setShowAll(false) }}
          disabled={!conv}
          style={{
            flex: 1, padding: '10px 12px',
            background: tab === 'conv'
              ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
              : 'transparent',
            color: tab === 'conv' ? '#FFF' : (conv ? MUTED : '#D8C0C8'),
            border: 'none', borderRadius: 100,
            fontSize: 12.5, fontWeight: 700,
            cursor: conv ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            boxShadow: tab === 'conv' ? '0 3px 10px rgba(232,135,154,0.32)' : 'none',
            transition: 'all 0.2s',
          }}
        >🎤 会話マニュアル</button>
        <button
          onClick={() => { setTab('action'); setShowAll(false) }}
          disabled={!action}
          style={{
            flex: 1, padding: '10px 12px',
            background: tab === 'action'
              ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
              : 'transparent',
            color: tab === 'action' ? '#FFF' : (action ? MUTED : '#D8C0C8'),
            border: 'none', borderRadius: 100,
            fontSize: 12.5, fontWeight: 700,
            cursor: action ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            boxShadow: tab === 'action' ? '0 3px 10px rgba(232,135,154,0.32)' : 'none',
            transition: 'all 0.2s',
          }}
        >🏃 行動マニュアル</button>
      </div>

      {/* コンテンツが無い場合 */}
      {!currentDoc && (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          color: MUTED, fontSize: 13,
        }}>
          このテーマには{tab === 'conv' ? '会話マニュアル' : '行動マニュアル'}が用意されていません。
        </div>
      )}

      {/* セリフHero */}
      {currentDoc && serifSection && (
        <SerifHero body={serifSection.body} />
      )}

      {/* 各セクションを折りたたみカード化（要約のみ） */}
      {currentDoc && otherSections.length > 0 && (
        <div>
          <div style={{
            fontSize: 10, color: PINK_DEEP, fontWeight: 700,
            letterSpacing: '0.28em', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              display: 'inline-block', width: 3, height: 12,
              background: C.pink, borderRadius: 1.5,
            }} />
            ポイント（タップで詳しく見る）
          </div>
          {otherSections.map((s, i) => (
            <CollapsibleSection
              key={i}
              icon={pickIcon(s.title)}
              label={s.title}
              summary={makeSummary(s.body)}
              fullBody={s.body}
            />
          ))}
        </div>
      )}

      {/* 全文を読むトグル */}
      {currentDoc && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              width: '100%',
              background: showAll
                ? '#FFFAFC'
                : `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
              color: showAll ? C.pink : '#FFF',
              border: showAll ? `1px solid ${C.border}` : 'none',
              padding: '12px 16px',
              borderRadius: 12,
              fontSize: 12.5, fontWeight: 700,
              letterSpacing: '0.1em',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: showAll ? 'none' : '0 4px 12px rgba(232,135,154,0.28)',
            }}
          >
            {showAll ? '▲ 全文を閉じる' : '📖 全文を最初から最後まで読む'}
          </button>
          {showAll && (
            <div style={{
              marginTop: 16,
              padding: '20px 22px',
              background: '#FFFAFC',
              border: `1px solid ${C.border}`,
              borderRadius: 14,
            }}>
              <ReadableMarkdown source={rawMd} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
