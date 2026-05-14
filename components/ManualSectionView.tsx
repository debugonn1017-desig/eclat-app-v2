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
import { useMemo } from 'react'
import { C } from '@/lib/colors'
import type {
  ManualData, ManualItem,
  ActionDoc, ConversationDoc,
  PhilosophyFile,
} from '@/types/manual'

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

// ─── 軽量 Markdown レンダラ（v0.2.2 可読性向上版） ────────────────
//  - 行間 line-height を 2.0 に
//  - 段落間 gap を 22 に
//  - フォントサイズ 14 で読みやすく
//  - 見出しは下線＋十分な上下マージン
//  - リスト項目間隔を広めに、桜色ドット強化
//  - **太字** はピンクで強調、フォントウェイト 700
function MiniMarkdown({ source }: { source: string }) {
  const blocks = useMemo(() => source.split(/\n\n+/), [source])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {blocks.map((block, i) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        // ### 小見出し
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} style={{
              fontSize: 14, fontWeight: 700, color: C.pink,
              letterSpacing: '0.06em', margin: '18px 0 4px',
              display: 'flex', alignItems: 'center', gap: 10,
              lineHeight: 1.5,
            }}>
              <span style={{
                display: 'inline-block', width: 4, height: 14,
                background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                borderRadius: 2,
              }} />
              {trimmed.replace(/^### /, '')}
            </h4>
          )
        }
        // ## セクション見出し
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} style={{
              fontSize: 17, fontWeight: 700,
              letterSpacing: '0.05em', margin: '24px 0 8px',
              background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              borderBottom: `1px solid ${C.pinkLight}`,
              paddingBottom: 8,
              lineHeight: 1.5,
            }}>
              {trimmed.replace(/^## /, '')}
            </h3>
          )
        }
        // # 大見出し
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={i} style={{
              fontSize: 22, fontWeight: 700,
              letterSpacing: '0.04em', margin: '28px 0 10px',
              background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1.4,
            }}>
              {trimmed.replace(/^# /, '')}
            </h2>
          )
        }

        // 引用 > (まれ)
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote key={i} style={{
              margin: 0,
              padding: '12px 16px',
              borderLeft: `4px solid ${C.pinkLight}`,
              background: 'rgba(255, 232, 238, 0.5)',
              borderRadius: '0 12px 12px 0',
              fontSize: 14, color: C.dark,
              lineHeight: 2.0,
              fontStyle: 'italic',
            }}>
              <InlineFormat text={trimmed.replace(/^>\s*/, '')} />
            </blockquote>
          )
        }

        // リスト
        if (trimmed.split('\n').every(l => l.trim().startsWith('-') || l.trim().startsWith('*'))) {
          const items = trimmed.split('\n').map(l => l.trim().replace(/^[-*]\s*/, ''))
          return (
            <ul key={i} style={{
              listStyle: 'none', padding: 0, margin: 0,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {items.map((it, j) => (
                <li key={j} style={{
                  fontSize: 14, color: C.dark, lineHeight: 1.95,
                  letterSpacing: '0.03em',
                  paddingLeft: 22, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: 4, top: '0.6em',
                    width: 8, height: 8, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                    boxShadow: '0 1px 3px rgba(232,135,154,0.3)',
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
              counterReset: 'list-counter',
            }}>
              {items.map((it, j) => (
                <li key={j} style={{
                  fontSize: 14, color: C.dark, lineHeight: 1.95,
                  letterSpacing: '0.03em',
                  paddingLeft: 32, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: 0, top: 0,
                    fontSize: 12, fontWeight: 700,
                    color: '#FFF',
                    background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                    width: 22, height: 22, borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(232,135,154,0.25)',
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
            fontSize: 14, color: C.dark, lineHeight: 2.0,
            letterSpacing: '0.04em', margin: 0,
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
              color: C.pink, fontWeight: 700,
              background: 'linear-gradient(180deg, transparent 60%, rgba(232,135,154,0.18) 60%)',
              padding: '0 2px',
            }}>
              {p.slice(2, -2)}
            </strong>
          )
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return (
            <code key={i} style={{
              background: 'rgba(232,135,154,0.12)',
              color: C.pink,
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: '0.9em',
              fontFamily: 'inherit',
              fontWeight: 600,
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

// ─── 44項目カード ─────────────────────────────────────────────────
function ManualItemCard({ m }: { m: ManualItem }) {
  return (
    <details style={{
      background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: '14px 16px',
      boxShadow: '0 6px 16px rgba(232,135,154,0.08)',
    }}>
      <summary style={{
        cursor: 'pointer',
        fontSize: 13, fontWeight: 700, color: C.dark,
        letterSpacing: '0.03em',
        display: 'flex', alignItems: 'center', gap: 8,
        listStyle: 'none',
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          color: '#FFF',
          background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
          padding: '3px 8px', borderRadius: 8,
          flexShrink: 0,
        }}>{m.id.toUpperCase()}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{m.title}</span>
        <span style={{ fontSize: 12, color: C.pinkMuted, flexShrink: 0 }}>▾</span>
      </summary>

      <div style={{
        marginTop: 14,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '64px 1fr',
          gap: 6, fontSize: 11,
        }}>
          <span style={{ color: C.pinkMuted, fontWeight: 600 }}>シーン</span>
          <span style={{ color: C.dark, lineHeight: 1.55 }}>{m.scene}</span>
          <span style={{ color: C.pinkMuted, fontWeight: 600 }}>目的</span>
          <span style={{ color: C.dark, lineHeight: 1.55 }}>{m.purpose}</span>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)',
          border: `1px solid ${C.pinkLight}`,
          borderRadius: 14,
          padding: '12px 14px',
        }}>
          <div style={{
            fontSize: 9, letterSpacing: '0.22em',
            color: C.pink, fontWeight: 700, marginBottom: 6,
          }}>SERIF</div>
          <div style={{
            fontSize: 13, color: C.dark,
            fontWeight: 600, lineHeight: 1.7,
            letterSpacing: '0.03em',
          }}>「{m.serif}」</div>
        </div>

        {m.reactions && m.reactions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              fontSize: 9, letterSpacing: '0.22em',
              color: C.pink, fontWeight: 700,
            }}>REACTIONS</div>
            {m.reactions.map((r, i) => (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '8px 12px',
                background: 'rgba(255,250,252,0.7)',
                border: `1px solid ${C.border}`,
                borderRadius: 12,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: C.pinkMuted,
                  letterSpacing: '0.1em',
                }}>{r.label}</div>
                <div style={{
                  alignSelf: 'flex-start', maxWidth: '85%',
                  background: '#FFFFFF',
                  border: `1px solid ${C.border}`,
                  borderRadius: 14, borderTopLeftRadius: 4,
                  padding: '8px 12px',
                  fontSize: 12, color: C.dark, lineHeight: 1.55,
                }}>{r.text}</div>
                <div style={{
                  alignSelf: 'flex-end', maxWidth: '85%',
                  background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                  color: '#FFF',
                  borderRadius: 14, borderTopRightRadius: 4,
                  padding: '8px 12px',
                  fontSize: 12, lineHeight: 1.55,
                  boxShadow: '0 3px 10px rgba(232,135,154,0.22)',
                }}>{r.reply}</div>
              </div>
            ))}
          </div>
        )}

        {m.info && (
          <div style={{ fontSize: 11.5, color: C.dark, lineHeight: 1.7 }}>
            <span style={{ color: C.pink, fontWeight: 700, letterSpacing: '0.08em', marginRight: 6 }}>取れる情報</span>
            {m.info}
          </div>
        )}
        {m.why && (
          <div style={{ fontSize: 11.5, color: C.dark, lineHeight: 1.7 }}>
            <span style={{ color: C.pink, fontWeight: 700, letterSpacing: '0.08em', marginRight: 6 }}>なぜ効くか</span>
            {m.why}
          </div>
        )}
        {m.standard && (
          <div style={{ fontSize: 11.5, color: C.dark, lineHeight: 1.7 }}>
            <span style={{ color: C.pink, fontWeight: 700, letterSpacing: '0.08em', marginRight: 6 }}>迷ったときの基準</span>
            {m.standard}
          </div>
        )}
      </div>
    </details>
  )
}

// ─── action / conversation / philosophy_file（rawMarkdown 持ち） ─────
function DocCard({ doc, badge }: {
  doc: { id: string; title: string; subtitle?: string; rawMarkdown?: string }
  badge: string
}) {
  return (
    <details style={{
      background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: '14px 16px',
      boxShadow: '0 6px 16px rgba(232,135,154,0.08)',
    }}>
      <summary style={{
        cursor: 'pointer',
        fontSize: 13, fontWeight: 700, color: C.dark,
        letterSpacing: '0.03em',
        display: 'flex', alignItems: 'center', gap: 8,
        listStyle: 'none',
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          color: '#FFF',
          background: `linear-gradient(135deg, ${C.pinkMuted}, ${C.pinkLight})`,
          padding: '3px 8px', borderRadius: 8,
          flexShrink: 0,
        }}>{badge}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{doc.title}</span>
        <span style={{ fontSize: 12, color: C.pinkMuted, flexShrink: 0 }}>▾</span>
      </summary>

      <div style={{ marginTop: 14 }}>
        {doc.subtitle && (
          <p style={{
            fontSize: 11, color: C.pinkMuted,
            marginBottom: 10, letterSpacing: '0.04em',
          }}>{doc.subtitle}</p>
        )}
        {doc.rawMarkdown ? (
          <MiniMarkdown source={doc.rawMarkdown} />
        ) : (
          <p style={{ fontSize: 12, color: C.pinkMuted }}>
            本文がまだ収録されていません。
          </p>
        )}
      </div>
    </details>
  )
}

// ─── メイン: セクション切替 ─────────────────────────────────────
export default function ManualSectionView({
  sectionId,
  data,
  onBack,
  isPC,
}: {
  sectionId: SectionId
  data: ManualData
  onBack: () => void
  isPC: boolean
}) {
  // STEPセクション → 該当する manuals + actions + conversations を集約
  const stepBundle = useMemo(() => {
    const stepMap: Record<string, string> = {
      'step1': 'STEP1',
      'step2': 'STEP2',
      'step3': 'STEP3',
      'step4': 'STEP4',
      'step5': 'STEP5',
      'step6': 'STEP6',
      'step7': 'STEP7',
    }
    const targetStep = stepMap[sectionId]
    if (!targetStep) return null

    const matchedManuals = data.manuals.filter(m => normalizeStep(m.step) === targetStep)
    const matchedActions = (data.actions ?? []).filter((a: ActionDoc) =>
      normalizeStep(a.step) === targetStep)
    const matchedConvs = (data.conversations ?? []).filter((c: ConversationDoc) =>
      normalizeStep(c.step) === targetStep)
    return { matchedManuals, matchedActions, matchedConvs }
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
      background: 'rgba(255,255,255,0.85)',
      border: `1px solid ${C.border}`,
      borderRadius: 22,
      padding: isPC ? '24px 28px' : '20px 18px',
      boxShadow: '0 14px 36px rgba(232,135,154,0.14)',
      marginBottom: 24,
    }}>
      {/* 上部：戻る + タイトル */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 18, flexWrap: 'wrap',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255,255,255,0.85)',
            border: `1px solid ${C.border}`,
            color: C.pink,
            fontSize: 11, fontWeight: 600,
            letterSpacing: '0.1em',
            padding: '7px 14px',
            borderRadius: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 2px 6px rgba(232,135,154,0.12)',
          }}
        >
          ← 一覧に戻る
        </button>
        <h2 style={{
          fontSize: isPC ? 20 : 17, fontWeight: 700,
          margin: 0, letterSpacing: '0.03em',
          background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          {TITLE_MAP[sectionId]}
        </h2>
      </div>

      {/* 接客のまえに */}
      {sectionId === 'before' && (
        <MiniMarkdown source={data.chapter_0.rawMarkdown} />
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
          {data.manuals.map((m) => <ManualItemCard key={m.id} m={m} />)}
        </div>
      )}

      {/* STEP1〜5：manuals + actions + conversations を統合 */}
      {stepBundle && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* 会話マニュアル */}
          {stepBundle.matchedConvs.length > 0 && (
            <section>
              <div style={{
                fontSize: 10, letterSpacing: '0.28em',
                color: C.pink, fontWeight: 700, marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  display: 'inline-block', width: 3, height: 12,
                  background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                  borderRadius: 2,
                }} />
                会話マニュアル（{stepBundle.matchedConvs.length}件）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stepBundle.matchedConvs.map((c) => (
                  <DocCard key={c.id} doc={c} badge="会話" />
                ))}
              </div>
            </section>
          )}

          {/* 行動マニュアル */}
          {stepBundle.matchedActions.length > 0 && (
            <section>
              <div style={{
                fontSize: 10, letterSpacing: '0.28em',
                color: C.pink, fontWeight: 700, marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  display: 'inline-block', width: 3, height: 12,
                  background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                  borderRadius: 2,
                }} />
                行動マニュアル（{stepBundle.matchedActions.length}件）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stepBundle.matchedActions.map((a) => (
                  <DocCard key={a.id} doc={a} badge="所作" />
                ))}
              </div>
            </section>
          )}

          {/* 情報をとる質問集（manuals）— STEP1 のときだけ大量にあるが、他STEPでも該当があれば表示 */}
          {stepBundle.matchedManuals.length > 0 && (
            <section>
              <div style={{
                fontSize: 10, letterSpacing: '0.28em',
                color: C.pink, fontWeight: 700, marginBottom: 10,
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
                {stepBundle.matchedManuals.map((m) => <ManualItemCard key={m.id} m={m} />)}
              </div>
            </section>
          )}

          {stepBundle.matchedConvs.length === 0 &&
           stepBundle.matchedActions.length === 0 &&
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
