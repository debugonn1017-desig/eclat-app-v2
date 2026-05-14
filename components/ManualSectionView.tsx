'use client'

// ─────────────────────────────────────────────────────────────────────
//  ManualSectionView – 教科書セクションの本文表示
//
//  v0.2 スコープ：
//   - 「接客のまえに」（chapter_0）：rawMarkdown を整形して表示
//   - STEP1〜5：該当する manuals[] を一覧表示、各カードで反応パターン展開
//   - 44項目：manuals 全件をカテゴリ別に
//   - 色恋鉄則：extras_groups.irokoi の rawMarkdown 表示
//   - キャストタイプ別アレンジ：castTypes + typeVariations
//
//  軽量 Markdown レンダラを自前実装（外部依存なし）。
//  # 見出し / ## 小見出し / **太字** / 段落 のみサポート。
// ─────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { C } from '@/lib/colors'
import type { ManualData, ManualItem } from '@/types/manual'

type SectionId =
  | 'before' | 'step1' | 'step3' | 'step4' | 'step5'
  | 'topics44' | 'irokoi' | 'cast-type'

const TITLE_MAP: Record<SectionId, string> = {
  'before': '🌸 接客のまえに',
  'step1': '☕ STEP1 基礎接客',
  'step3': '📱 STEP3 連絡先交換',
  'step4': '✨ STEP4 場内・延長',
  'step5': '🥂 STEP5 アフター',
  'topics44': '💬 情報をとる 44項目',
  'irokoi': '💖 色恋の鉄則',
  'cast-type': '🎀 キャストタイプ別アレンジ',
}

// ─── 軽量 Markdown レンダラ ─────────────────────────────────────────
function MiniMarkdown({ source }: { source: string }) {
  // # / ## / ### / 段落 / **太字** / リスト(-) を簡易的にHTML化
  const blocks = useMemo(() => source.split(/\n\n+/), [source])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {blocks.map((block, i) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        // 見出し
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} style={{
              fontSize: 13, fontWeight: 700, color: C.pink,
              letterSpacing: '0.08em', margin: '10px 0 2px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                display: 'inline-block', width: 3, height: 12,
                background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                borderRadius: 2,
              }} />
              {trimmed.replace(/^### /, '')}
            </h4>
          )
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} style={{
              fontSize: 15, fontWeight: 700, color: C.dark,
              letterSpacing: '0.06em', margin: '12px 0 4px',
              background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              {trimmed.replace(/^## /, '')}
            </h3>
          )
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={i} style={{
              fontSize: 18, fontWeight: 700, color: C.dark,
              letterSpacing: '0.05em', margin: '14px 0 6px',
              background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              {trimmed.replace(/^# /, '')}
            </h2>
          )
        }

        // リスト
        if (trimmed.split('\n').every(l => l.trim().startsWith('-'))) {
          const items = trimmed.split('\n').map(l => l.trim().replace(/^-\s*/, ''))
          return (
            <ul key={i} style={{
              listStyle: 'none', padding: 0, margin: 0,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {items.map((it, j) => (
                <li key={j} style={{
                  fontSize: 12.5, color: C.dark, lineHeight: 1.7,
                  letterSpacing: '0.03em',
                  paddingLeft: 18, position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', left: 0, top: '0.55em',
                    width: 6, height: 6, borderRadius: '50%',
                    background: C.pinkLight,
                  }} />
                  <InlineFormat text={it} />
                </li>
              ))}
            </ul>
          )
        }

        // 段落
        return (
          <p key={i} style={{
            fontSize: 12.5, color: C.dark, lineHeight: 1.85,
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

// インライン書式（**太字** のみ）
function InlineFormat({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return (
            <strong key={i} style={{ color: C.pink, fontWeight: 700 }}>
              {p.slice(2, -2)}
            </strong>
          )
        }
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

// ─── 44項目カード ───────────────────────────────────────────────
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
        {/* シーン・目的 */}
        <div style={{
          display: 'grid', gridTemplateColumns: '64px 1fr',
          gap: 6, fontSize: 11,
        }}>
          <span style={{ color: C.pinkMuted, fontWeight: 600 }}>シーン</span>
          <span style={{ color: C.dark, lineHeight: 1.55 }}>{m.scene}</span>
          <span style={{ color: C.pinkMuted, fontWeight: 600 }}>目的</span>
          <span style={{ color: C.dark, lineHeight: 1.55 }}>{m.purpose}</span>
        </div>

        {/* セリフ */}
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

        {/* 反応パターン（LINE風吹き出し） */}
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
                {/* お客様 = 左、グレー寄り */}
                <div style={{
                  alignSelf: 'flex-start', maxWidth: '85%',
                  background: '#FFFFFF',
                  border: `1px solid ${C.border}`,
                  borderRadius: 14, borderTopLeftRadius: 4,
                  padding: '8px 12px',
                  fontSize: 12, color: C.dark, lineHeight: 1.55,
                }}>{r.text}</div>
                {/* キャスト = 右、ピンク */}
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

        {/* 取れる情報 / なぜ / 基準 */}
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
  // セクション → 該当データを抽出
  const filteredManuals = useMemo(() => {
    if (sectionId === 'topics44') return data.manuals
    const stepMap: Record<string, string> = {
      'step1': 'STEP1',
      'step3': 'STEP3',
      'step4': 'STEP4',
      'step5': 'STEP5',
    }
    const targetStep = stepMap[sectionId]
    if (!targetStep) return []
    return data.manuals.filter(m => m.step === targetStep)
  }, [sectionId, data.manuals])

  const irokoiFiles = data.extras_groups?.irokoi ?? []

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

      {/* セクション別本文 */}
      {sectionId === 'before' && (
        <MiniMarkdown source={data.chapter_0.rawMarkdown} />
      )}

      {sectionId === 'irokoi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {irokoiFiles.length === 0 ? (
            <p style={{ fontSize: 12, color: C.pinkMuted }}>
              色恋鉄則のデータがまだ収録されていません。
            </p>
          ) : (
            irokoiFiles.map((f) => (
              <div key={f.id}>
                <h3 style={{
                  fontSize: 16, fontWeight: 700,
                  background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '0.04em',
                  marginBottom: 4,
                }}>{f.title}</h3>
                {f.subtitle && (
                  <p style={{ fontSize: 11, color: C.pinkMuted, marginBottom: 12 }}>{f.subtitle}</p>
                )}
                {f.rawMarkdown && <MiniMarkdown source={f.rawMarkdown} />}
              </div>
            ))
          )}
        </div>
      )}

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
              <div style={{
                fontSize: 26, marginBottom: 6,
              }}>{ct.icon}</div>
              <div style={{
                fontSize: 15, fontWeight: 700, color: C.dark,
                marginBottom: 4,
              }}>{ct.name}</div>
              {ct.tagline && (
                <div style={{ fontSize: 11, color: C.pink, fontStyle: 'italic', marginBottom: 8 }}>
                  「{ct.tagline}」
                </div>
              )}
              {ct.feature && (
                <div style={{ fontSize: 11.5, color: C.dark, lineHeight: 1.6, marginBottom: 6 }}>
                  <span style={{ color: C.pinkMuted, fontWeight: 700, marginRight: 4 }}>特徴</span>
                  {ct.feature}
                </div>
              )}
              {ct.weapon && (
                <div style={{ fontSize: 11.5, color: C.dark, lineHeight: 1.6, marginBottom: 6 }}>
                  <span style={{ color: C.pinkMuted, fontWeight: 700, marginRight: 4 }}>武器</span>
                  {ct.weapon}
                </div>
              )}
              {ct.strong && (
                <div style={{ fontSize: 11, color: C.dark, lineHeight: 1.6, marginBottom: 4 }}>
                  <span style={{ color: C.pink, fontWeight: 700, marginRight: 4 }}>得意</span>
                  {ct.strong}
                </div>
              )}
              {ct.weak && (
                <div style={{ fontSize: 11, color: C.dark, lineHeight: 1.6 }}>
                  <span style={{ color: C.danger, fontWeight: 700, marginRight: 4 }}>苦手</span>
                  {ct.weak}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* STEP1〜5 / 44項目 */}
      {(sectionId === 'step1' || sectionId === 'step3' || sectionId === 'step4' || sectionId === 'step5' || sectionId === 'topics44') && (
        <>
          {filteredManuals.length === 0 ? (
            <p style={{ fontSize: 12, color: C.pinkMuted, padding: '20px 0' }}>
              このステップのコンテンツはまだ準備中です。
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                fontSize: 11, color: C.pinkMuted,
                letterSpacing: '0.05em', marginBottom: 4,
              }}>
                全 {filteredManuals.length} 項目（カードをタップで詳細＋反応パターン展開）
              </div>
              {filteredManuals.map((m) => (
                <ManualItemCard key={m.id} m={m} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
