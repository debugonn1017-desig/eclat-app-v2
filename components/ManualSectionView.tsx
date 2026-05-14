'use client'

// ─────────────────────────────────────────────────────────────────────
//  ManualSectionView – 教科書セクションの本文表示（v0.2.1）
//
//  セクションごとに、JSON 上の正しいデータを引いて表示する：
//   - before:    chapter_0.rawMarkdown 全文
//   - step1〜5:  manuals(STEP=同じ)、actions/conversations/themes(同 STEP)
//                を統合して並べる
//   - topics44:  manuals 全44件
//   - irokoi:    extras_groups.irokoi（dict）の description + links を辿って
//                philosophy_files の rawMarkdown を展開
//   - cast-type: castTypes 4タイプのカード
//
//  軽量 Markdown レンダラを自前実装。
// ─────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { C } from '@/lib/colors'
import type {
  ManualData, ManualItem,
  PhilosophyFile, ThemeDoc,
} from '@/types/manual'
import ManualDetailView from '@/components/manual/ManualDetailView'
import ThemeDetailView, { stripFrontmatter, ReadableMarkdown } from '@/components/manual/ThemeDetailView'

type SectionId =
  | 'before'
  | 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'step6' | 'step7'
  | 'topics44' | 'irokoi' | 'cast-type'

const TITLE_MAP: Record<SectionId, string> = {
  'before': '🌸 接客のまえに',
  'step1': '☕ STEP1 基礎接客',
  'step2': '🥃 STEP2 ドリンク営業',
  'step3': '📱 STEP3 連絡先交換',
  'step4': '✨ STEP4 場内指名・延長',
  'step5': '🥂 STEP5 アフター',
  'step6': '💌 STEP6 営業連絡',
  'step7': '🎯 STEP7 初リピート完成',
  'topics44': '💬 情報をとる 44項目',
  'irokoi': '💖 色恋の鉄則',
  'cast-type': '🎀 キャストタイプ別アレンジ',
}

// step を正規化（"STEP1" / 1 / "1" → "STEP1"）
function normalizeStep(s: string | number): string {
  if (typeof s === 'number') return `STEP${s}`
  if (/^\d+$/.test(s)) return `STEP${s}`
  return s
}

// 読み物用の共通トークン（MiniMarkdown と一覧カードで共有）
const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const TEXT_COLOR = '#2D1B26'
const TEXT_MUTED = '#6B5560'
const HEAD_COLOR = '#3D2840'
const ACCENT = '#C0405C'
// 互換エイリアス（後方の関数で参照される）
const HEAD = HEAD_COLOR
const MUTED = TEXT_MUTED

// ─── Markdown レンダラ（v0.2.3 読み物UI再設計） ───────────────────
//  方針：「真剣に読む」用途で最大の可読性を確保
//   - 本文色 #2D1B26（深く落ち着いた色）/ 装飾色は最小限
//   - 見出しのグラデ文字を撤廃（読みづらいため）→ 濃ダーク色のベタ
//   - 行間 1.95、段落間 18px、フォントサイズ 14.5px
//   - 本文フォントは Hiragino Sans 優先（Zen Maru Gothic は丸すぎて長文に不向き）
//   - リストドット小さく、太字も控えめのアンダーライン

function MiniMarkdown({ source }: { source: string }) {
  const blocks = useMemo(() => source.split(/\n\n+/), [source])
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 18,
      fontFamily: READ_FONT,
    }}>
      {blocks.map((block, i) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        // ### 小見出し
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} style={{
              fontSize: 14.5, fontWeight: 700, color: HEAD_COLOR,
              letterSpacing: '0.02em', margin: '16px 0 4px',
              lineHeight: 1.55,
              fontFamily: READ_FONT,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                display: 'inline-block', width: 3, height: 14,
                background: C.pink, borderRadius: 1.5,
              }} />
              {trimmed.replace(/^### /, '')}
            </h4>
          )
        }
        // ## セクション見出し
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} style={{
              fontSize: 17, fontWeight: 700, color: HEAD_COLOR,
              letterSpacing: '0.02em', margin: '24px 0 8px',
              lineHeight: 1.5,
              fontFamily: READ_FONT,
              borderBottom: `2px solid ${C.pinkLight}`,
              paddingBottom: 8,
            }}>
              {trimmed.replace(/^## /, '')}
            </h3>
          )
        }
        // # 大見出し
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={i} style={{
              fontSize: 21, fontWeight: 700, color: HEAD_COLOR,
              letterSpacing: '0.02em', margin: '28px 0 12px',
              lineHeight: 1.45,
              fontFamily: READ_FONT,
            }}>
              {trimmed.replace(/^# /, '')}
            </h2>
          )
        }

        // 引用 >
        if (trimmed.startsWith('> ')) {
          const lines = trimmed.split('\n').map(l => l.replace(/^>\s?/, '')).join('\n')
          return (
            <blockquote key={i} style={{
              margin: 0,
              padding: '14px 18px',
              borderLeft: `3px solid ${C.pink}`,
              background: '#FFF8FA',
              borderRadius: '0 10px 10px 0',
              fontSize: 14, color: TEXT_MUTED,
              lineHeight: 1.95,
              fontFamily: READ_FONT,
              fontStyle: 'normal',
              whiteSpace: 'pre-wrap',
            }}>
              <InlineFormat text={lines} />
            </blockquote>
          )
        }

        // リスト
        if (trimmed.split('\n').every(l => l.trim().startsWith('-') || l.trim().startsWith('*'))) {
          const items = trimmed.split('\n').map(l => l.trim().replace(/^[-*]\s*/, ''))
          return (
            <ul key={i} style={{
              listStyle: 'none', padding: 0, margin: 0,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {items.map((it, j) => (
                <li key={j} style={{
                  fontSize: 14.5, color: TEXT_COLOR, lineHeight: 1.9,
                  letterSpacing: '0.02em',
                  fontFamily: READ_FONT,
                  paddingLeft: 18, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: 2, top: '0.72em',
                    width: 6, height: 6, borderRadius: '50%',
                    background: C.pink,
                  }} />
                  <InlineFormat text={it} />
                </li>
              ))}
            </ul>
          )
        }

        // 番号付きリスト (1. 2. 3.)
        if (trimmed.split('\n').every(l => /^\d+\.\s/.test(l.trim()))) {
          const items = trimmed.split('\n').map(l => l.trim().replace(/^\d+\.\s*/, ''))
          return (
            <ol key={i} style={{
              listStyle: 'none', padding: 0, margin: 0,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {items.map((it, j) => (
                <li key={j} style={{
                  fontSize: 14.5, color: TEXT_COLOR, lineHeight: 1.9,
                  letterSpacing: '0.02em',
                  fontFamily: READ_FONT,
                  paddingLeft: 30, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: 0, top: '0.1em',
                    fontSize: 12, fontWeight: 700,
                    color: '#FFF',
                    background: C.pink,
                    width: 20, height: 20, borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{j + 1}</span>
                  <InlineFormat text={it} />
                </li>
              ))}
            </ol>
          )
        }

        // 通常の段落
        return (
          <p key={i} style={{
            fontSize: 14.5, color: TEXT_COLOR, lineHeight: 1.95,
            letterSpacing: '0.02em', margin: 0,
            fontFamily: READ_FONT,
            whiteSpace: 'pre-wrap',
          }}>
            <InlineFormat text={trimmed} />
          </p>
        )
      })}
    </div>
  )
}

function InlineFormat({ text }: { text: string }) {
  // **太字** と `コード` 両対応
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return (
            <strong key={i} style={{
              color: ACCENT, fontWeight: 700,
            }}>
              {p.slice(2, -2)}
            </strong>
          )
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return (
            <code key={i} style={{
              background: '#FFF0F4',
              color: ACCENT,
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: '0.92em',
              fontWeight: 600,
              fontFamily: 'inherit',
            }}>
              {p.slice(1, -1)}
            </code>
          )
        }
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

// ─── 44項目の一覧カード（タップで詳細画面に遷移） ────────────────
function ManualItemListCard({
  m, onOpen,
}: { m: ManualItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{
        background: '#FFF',
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: '14px 16px',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: '0 2px 6px rgba(232,135,154,0.06)',
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%',
      }}
    >
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
        color: '#FFF',
        background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
        padding: '4px 10px', borderRadius: 8,
        flexShrink: 0,
      }}>{m.id.toUpperCase()}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: HEAD,
          letterSpacing: '0.02em', lineHeight: 1.5,
          fontFamily: READ_FONT,
        }}>{m.title}</div>
        {m.scene && (
          <div style={{
            fontSize: 11, color: MUTED, marginTop: 4,
            letterSpacing: '0.02em', fontFamily: READ_FONT,
          }}>📍 {m.scene}</div>
        )}
      </div>
      <span style={{ fontSize: 16, color: C.pink, flexShrink: 0 }}>→</span>
    </button>
  )
}

// ─── action / conversation / philosophy_file（rawMarkdown 持ち、frontmatter除去） ─────
function DocCard({ doc, badge }: {
  doc: { id: string; title: string; subtitle?: string; rawMarkdown?: string }
  badge: string
}) {
  return (
    <details style={{
      background: '#FFFFFF',
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '14px 16px',
      boxShadow: '0 2px 6px rgba(232,135,154,0.06)',
    }}>
      <summary style={{
        cursor: 'pointer',
        fontSize: 14, fontWeight: 600, color: HEAD,
        letterSpacing: '0.02em',
        display: 'flex', alignItems: 'center', gap: 10,
        listStyle: 'none',
        fontFamily: READ_FONT,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          color: '#FFF',
          background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
          padding: '4px 10px', borderRadius: 8,
          flexShrink: 0,
        }}>{badge}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{doc.title}</span>
        <span style={{ fontSize: 12, color: C.pink, flexShrink: 0 }}>▾</span>
      </summary>

      <div style={{ marginTop: 18 }}>
        {doc.subtitle && (
          <p style={{
            fontSize: 12, color: MUTED,
            marginBottom: 14, letterSpacing: '0.02em',
            fontFamily: READ_FONT,
          }}>{doc.subtitle}</p>
        )}
        {doc.rawMarkdown ? (
          <ReadableMarkdown source={doc.rawMarkdown} />
        ) : (
          <p style={{ fontSize: 13, color: MUTED }}>
            本文がまだ収録されていません。
          </p>
        )}
      </div>
    </details>
  )
}

// ─── テーマ一覧カード（STEP内、タップで詳細） ─────────────────────
function ThemeListCard({
  theme, hasConv, hasAction, onOpen,
}: {
  theme: ThemeDoc
  hasConv: boolean
  hasAction: boolean
  onOpen: () => void
}) {
  return (
    <button onClick={onOpen} style={{
      background: '#FFF',
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '14px 16px',
      textAlign: 'left',
      cursor: 'pointer',
      fontFamily: 'inherit',
      boxShadow: '0 2px 6px rgba(232,135,154,0.06)',
      display: 'flex', alignItems: 'center', gap: 12,
      width: '100%',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 700, color: HEAD,
          letterSpacing: '0.02em', lineHeight: 1.5,
          fontFamily: READ_FONT,
        }}>{theme.title}</div>
        {theme.subtitle && (
          <div style={{
            fontSize: 11.5, color: MUTED, marginTop: 4,
            letterSpacing: '0.02em',
            fontFamily: READ_FONT, lineHeight: 1.5,
          }}>{theme.subtitle}</div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {hasConv && (
            <span style={{
              fontSize: 9.5, fontWeight: 700,
              color: '#FFF',
              background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
              padding: '3px 8px', borderRadius: 100,
              letterSpacing: '0.05em',
            }}>🎤 会話</span>
          )}
          {hasAction && (
            <span style={{
              fontSize: 9.5, fontWeight: 700,
              color: '#FFF',
              background: 'linear-gradient(135deg, #D49066, #E8A87C)',
              padding: '3px 8px', borderRadius: 100,
              letterSpacing: '0.05em',
            }}>🏃 行動</span>
          )}
        </div>
      </div>
      <span style={{ fontSize: 16, color: C.pink, flexShrink: 0 }}>→</span>
    </button>
  )
}

// ─── メイン: セクション切替 ─────────────────────────────────────
export default function ManualSectionView({
  sectionId,
  data,
  onBack,
  isPC,
  onJumpSection,
}: {
  sectionId: SectionId
  data: ManualData
  onBack: () => void
  isPC: boolean
  onJumpSection?: (id: SectionId) => void
}) {
  // タップで詳細画面に遷移する manual id / theme key
  const [openManualId, setOpenManualId] = useState<string | null>(null)
  const [openThemeKey, setOpenThemeKey] = useState<string | null>(null)
  const openManual = openManualId
    ? data.manuals.find(m => m.id === openManualId) ?? null
    : null
  const openTheme = openThemeKey
    ? data.themes.find(t => t.key === openThemeKey) ?? null
    : null

  // 詳細表示中はそちらに切替
  if (openManual) {
    return (
      <ManualDetailView
        item={openManual}
        onBack={() => setOpenManualId(null)}
        isPC={isPC}
        onJumpIrokoi={() => { setOpenManualId(null); onJumpSection?.('irokoi') }}
        onJumpCastType={() => { setOpenManualId(null); onJumpSection?.('cast-type') }}
      />
    )
  }
  if (openTheme) {
    return (
      <ThemeDetailView
        theme={openTheme}
        data={data}
        onBack={() => setOpenThemeKey(null)}
        isPC={isPC}
      />
    )
  }

  // STEPセクション → 該当する themes（テーマ一覧）と manuals（質問項目）を集約
  const stepBundle = useMemo(() => {
    const stepMap: Record<string, string> = {
      'step1': 'STEP1', 'step2': 'STEP2', 'step3': 'STEP3', 'step4': 'STEP4',
      'step5': 'STEP5', 'step6': 'STEP6', 'step7': 'STEP7',
    }
    const targetStep = stepMap[sectionId]
    if (!targetStep) return null
    const matchedThemes = (data.themes ?? [])
      .filter(t => normalizeStep(t.step) === targetStep)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    const matchedManuals = data.manuals.filter(m => normalizeStep(m.step) === targetStep)
    return { matchedThemes, matchedManuals }
  }, [sectionId, data])

  // irokoi → links を辿って philosophy_files から本文取得
  const irokoiBundle = useMemo(() => {
    if (sectionId !== 'irokoi') return null
    const group = data.extras_groups?.irokoi
    if (!group) return { group: null, files: [] as PhilosophyFile[] }
    const ids = group.links
      .filter(l => l.target_type === 'philosophy_file')
      .map(l => l.target)
    const files = ids
      .map(id => data.philosophy_files.find(f => f.id === id))
      .filter((f): f is PhilosophyFile => !!f)
    return { group, files }
  }, [sectionId, data])

  return (
    <div style={{
      background: '#FFFFFF',
      border: `1px solid ${C.border}`,
      borderRadius: 18,
      padding: isPC ? '32px 40px 40px' : '22px 20px 28px',
      boxShadow: '0 8px 24px rgba(120, 60, 90, 0.08)',
      marginBottom: 24,
      // 本文の最大幅を制限して読みやすく（一行が長過ぎないように）
      maxWidth: isPC ? 760 : '100%',
      marginLeft: 'auto', marginRight: 'auto',
    }}>
      {/* 上部：戻る + タイトル */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 24, flexWrap: 'wrap',
        paddingBottom: 16, borderBottom: `1px solid ${C.border}`,
      }}>
        <button
          onClick={onBack}
          style={{
            background: '#FFFFFF',
            border: `1px solid ${C.border}`,
            color: C.pink,
            fontSize: 12, fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 10,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ← 一覧に戻る
        </button>
        <h2 style={{
          fontSize: isPC ? 22 : 19, fontWeight: 700,
          margin: 0, letterSpacing: '0.02em',
          color: HEAD_COLOR,
          fontFamily: READ_FONT,
          lineHeight: 1.35,
        }}>
          {TITLE_MAP[sectionId]}
        </h2>
      </div>

      {/* 接客のまえに */}
      {sectionId === 'before' && (
        <ReadableMarkdown source={data.chapter_0.rawMarkdown} />
      )}

      {/* 色恋の鉄則：dict 構造から links を辿る */}
      {sectionId === 'irokoi' && irokoiBundle && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {irokoiBundle.group && (
            <div style={{
              background: 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)',
              border: `1px solid ${C.pinkLight}`,
              borderRadius: 16,
              padding: '14px 16px',
            }}>
              {irokoiBundle.group.icon && (
                <div style={{ fontSize: 22, marginBottom: 4 }}>{irokoiBundle.group.icon}</div>
              )}
              <div style={{
                fontSize: 15, fontWeight: 700, color: C.dark,
                marginBottom: 2,
              }}>{irokoiBundle.group.title}</div>
              {irokoiBundle.group.subtitle && (
                <div style={{
                  fontSize: 11, color: C.pink, fontStyle: 'italic',
                  marginBottom: 8,
                }}>{irokoiBundle.group.subtitle}</div>
              )}
              {irokoiBundle.group.description && (
                <div style={{
                  fontSize: 12, color: C.dark, lineHeight: 1.7,
                }}>{irokoiBundle.group.description}</div>
              )}
            </div>
          )}
          {irokoiBundle.files.length === 0 ? (
            <p style={{ fontSize: 12, color: C.pinkMuted }}>
              色恋鉄則のデータがまだ収録されていません。
            </p>
          ) : (
            irokoiBundle.files.map((f) => (
              <DocCard key={f.id} doc={f} badge="鉄則" />
            ))
          )}
        </div>
      )}

      {/* キャストタイプ別 */}
      {sectionId === 'cast-type' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isPC ? 'repeat(2, 1fr)' : '1fr',
          gap: 14,
        }}>
          {data.castTypes.map((ct) => (
            <div key={ct.id} style={{
              background: 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)',
              border: `1px solid ${C.pinkLight}`,
              borderRadius: 18,
              padding: '16px 18px',
              boxShadow: '0 6px 16px rgba(232,135,154,0.08)',
            }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>{ct.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 4 }}>{ct.name}</div>
              {ct.tagline && (
                <div style={{ fontSize: 11, color: C.pink, fontStyle: 'italic', marginBottom: 8 }}>「{ct.tagline}」</div>
              )}
              {ct.feature && <div style={{ fontSize: 11.5, color: C.dark, lineHeight: 1.6, marginBottom: 6 }}>
                <span style={{ color: C.pinkMuted, fontWeight: 700, marginRight: 4 }}>特徴</span>{ct.feature}
              </div>}
              {ct.weapon && <div style={{ fontSize: 11.5, color: C.dark, lineHeight: 1.6, marginBottom: 6 }}>
                <span style={{ color: C.pinkMuted, fontWeight: 700, marginRight: 4 }}>武器</span>{ct.weapon}
              </div>}
              {ct.strong && <div style={{ fontSize: 11, color: C.dark, lineHeight: 1.6, marginBottom: 4 }}>
                <span style={{ color: C.pink, fontWeight: 700, marginRight: 4 }}>得意</span>{ct.strong}
              </div>}
              {ct.weak && <div style={{ fontSize: 11, color: C.dark, lineHeight: 1.6 }}>
                <span style={{ color: C.danger, fontWeight: 700, marginRight: 4 }}>苦手</span>{ct.weak}
              </div>}
            </div>
          ))}
        </div>
      )}

      {/* 44項目（全件） */}
      {sectionId === 'topics44' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            fontSize: 11, color: C.pinkMuted,
            letterSpacing: '0.05em', marginBottom: 4,
          }}>
            全 {data.manuals.length} 項目（カードをタップで詳細＋反応パターン展開）
          </div>
          {data.manuals.map((m) => <ManualItemListCard key={m.id} m={m} onOpen={() => setOpenManualId(m.id)} />)}
        </div>
      )}

      {/* STEPセクション：テーマ一覧（タップで会話/行動切替詳細） + 質問項目 */}
      {stepBundle && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* テーマ一覧 */}
          {stepBundle.matchedThemes.length > 0 && (
            <section>
              <div style={{
                fontSize: 10, letterSpacing: '0.28em',
                color: C.pink, fontWeight: 700, marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  display: 'inline-block', width: 3, height: 12,
                  background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                  borderRadius: 2,
                }} />
                テーマ一覧（{stepBundle.matchedThemes.length}件・タップで会話/行動 切替）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stepBundle.matchedThemes.map((t) => (
                  <ThemeListCard
                    key={t.key}
                    theme={t}
                    hasConv={!!(t.conv_id && data.conversations.find(c => c.id === t.conv_id))}
                    hasAction={!!(t.action_id && data.actions.find(a => a.id === t.action_id))}
                    onOpen={() => setOpenThemeKey(t.key)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 情報をとる質問集（STEP1で大量） */}
          {stepBundle.matchedManuals.length > 0 && (
            <section>
              <div style={{
                fontSize: 10, letterSpacing: '0.28em',
                color: C.pink, fontWeight: 700, marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  display: 'inline-block', width: 3, height: 12,
                  background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                  borderRadius: 2,
                }} />
                情報をとる質問集（{stepBundle.matchedManuals.length}件）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stepBundle.matchedManuals.map((m) =>
                  <ManualItemListCard key={m.id} m={m} onOpen={() => setOpenManualId(m.id)} />
                )}
              </div>
            </section>
          )}

          {stepBundle.matchedThemes.length === 0 &&
           stepBundle.matchedManuals.length === 0 && (
            <p style={{ fontSize: 12, color: C.pinkMuted, padding: '20px 0' }}>
              このステップのコンテンツはまだ準備中です。
            </p>
          )}
        </div>
      )}
    </div>
  )
}
