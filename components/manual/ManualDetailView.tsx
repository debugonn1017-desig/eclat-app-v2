'use client'

// ─────────────────────────────────────────────────────────────────────
//  ManualDetailView – 教科書の「1項目を1画面で集中して見る」詳細ビュー
//
//  v0.2.4 でモックアップ準拠：
//   - detail-head：ヒーロー（タグ・タイトル・purpose）
//   - serif-hero：ピンクグラデの巨大セリフカード
//   - reaction-accordion：pill タップで LINE 風吹き出し展開（謙遜/自慢/自虐 3色分け）
//   - info-card：取れる情報・なぜ効くか・基準（独立白カード + アイコン）
//   - related-links：色恋鉄則・キャストタイプ別への導線
// ─────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { C } from '@/lib/colors'
import type { ManualItem, ManualReaction } from '@/types/manual'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const TEXT = '#2D1B26'
const HEAD = '#3D2840'
const MUTED = '#6B5560'
const PINK_DEEP = '#D45060'

// 反応タイプの色分け
const REACTION_STYLES: Record<string, { bg: string; label: string }> = {
  kenson:  { bg: 'linear-gradient(135deg, #B585A0, #D49AB8)', label: '謙遜' },
  jiman:   { bg: 'linear-gradient(135deg, #D49066, #E8A87C)', label: '自慢' },
  jigyaku: { bg: 'linear-gradient(135deg, #8FA9D6, #B5C5E5)', label: '自虐' },
}

// ─── ヒーロー：セリフ ─────────────────────────────────────────────
function SerifHero({ text }: { text: string }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.pink} 0%, ${C.pinkLight} 100%)`,
      color: '#FFF',
      borderRadius: 20,
      padding: '22px 22px 24px',
      boxShadow: '0 8px 22px rgba(232,135,154,0.28)',
      position: 'relative',
      overflow: 'hidden',
      marginBottom: 28,
    }}>
      {/* 右上の白い光 */}
      <span aria-hidden style={{
        position: 'absolute', top: -30, right: -30,
        width: 130, height: 130,
        background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 70%)',
        pointerEvents: 'none',
      }} />
      {/* 左下の桜 */}
      <span aria-hidden style={{
        position: 'absolute', bottom: -20, left: -10,
        fontSize: 90, opacity: 0.1, transform: 'rotate(20deg)',
        pointerEvents: 'none',
      }}>🌸</span>

      <div style={{
        fontSize: 9, letterSpacing: '0.32em', fontWeight: 700,
        color: 'rgba(255,255,255,0.9)', marginBottom: 10,
      }}>
        SERIF（持ち上げの一言）
      </div>
      <div style={{
        fontSize: 19, fontWeight: 600,
        lineHeight: 1.7, letterSpacing: '0.02em',
        fontFamily: READ_FONT,
        position: 'relative', zIndex: 1,
      }}>
        「{text}」
      </div>
    </div>
  )
}

// ─── reaction-accordion：pill タップで吹き出し展開 ─────────────────
function ReactionAccordion({
  reaction, index, total,
}: { reaction: ManualReaction; index: number; total: number }) {
  const [open, setOpen] = useState(false)
  const style = REACTION_STYLES[reaction.type ?? 'kenson'] ?? REACTION_STYLES.kenson
  const label = reaction.label || style.label

  // 時刻のダミー（21:30 から 2分ずつ）
  const baseMin = 30 + (index * 2)
  const customerTime = `21:${String(baseMin).padStart(2, '0')}`
  const castTime = `21:${String(baseMin + 1).padStart(2, '0')}`

  return (
    <div style={{
      background: '#FFF',
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 12,
      boxShadow: '0 2px 6px rgba(232,135,154,0.06)',
    }}>
      {/* サマリー pill */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          background: 'transparent', border: 'none',
          padding: '12px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: style.bg,
            color: '#FFF',
            padding: '4px 14px', borderRadius: 100,
            fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}>{label}</span>
          <span style={{ fontSize: 10, color: MUTED, letterSpacing: '0.06em' }}>
            {index + 1}/{total}
          </span>
        </span>
        <span style={{
          fontSize: 10, color: C.pink,
          transition: 'transform 0.2s',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>▶</span>
      </button>

      {/* 展開部 */}
      {open && (
        <div style={{
          padding: '4px 14px 16px',
          borderTop: `1px solid ${C.border}`,
          background: '#FFFAFC',
        }}>
          {/* 日付ラベル */}
          {index === 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
              <span style={{
                background: '#FFF0F3',
                color: MUTED,
                fontSize: 10,
                padding: '3px 12px', borderRadius: 100,
                letterSpacing: '0.04em',
              }}>本日 21:30</span>
            </div>
          )}

          {/* お客様（左） */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #E8E8E8, #C4C4C4)',
              color: '#FFF', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
            }}>客</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, color: MUTED, marginBottom: 3, letterSpacing: '0.04em' }}>
                お客様
              </div>
              <div style={{
                display: 'inline-block',
                background: '#ECEFF1',
                color: '#3D2D38',
                padding: '10px 14px',
                borderRadius: 14, borderBottomLeftRadius: 4,
                fontSize: 14, lineHeight: 1.65,
                maxWidth: '92%',
                fontFamily: READ_FONT,
                letterSpacing: '0.02em',
              }}>{reaction.text}</div>
              <div style={{ fontSize: 9, color: MUTED, marginTop: 4, letterSpacing: '0.04em' }}>
                {customerTime}
              </div>
            </div>
          </div>

          {/* キャスト（右） */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: 'row-reverse' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
              color: '#FFF', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700,
            }}>🌸</div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
              <div style={{ fontSize: 9.5, color: MUTED, marginBottom: 3, letterSpacing: '0.04em' }}>
                わたし
              </div>
              <div style={{
                display: 'inline-block',
                background: `linear-gradient(135deg, #FF95B8, ${C.pink})`,
                color: '#FFF',
                padding: '10px 14px',
                borderRadius: 14, borderBottomRightRadius: 4,
                fontSize: 14, lineHeight: 1.65,
                maxWidth: '92%',
                fontFamily: READ_FONT,
                letterSpacing: '0.02em',
                boxShadow: '0 3px 10px rgba(232,135,154,0.32)',
                textAlign: 'left',
              }}>{reaction.reply}</div>
              <div style={{ fontSize: 9, color: MUTED, marginTop: 4, letterSpacing: '0.04em' }}>
                <span style={{ color: '#5BA0FF', marginRight: 2 }}>✓✓</span>
                {castTime}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── info-card：📥 取れる情報 / 💎 なぜ効くか / 🎯 基準 ─────────────
function InfoCard({
  icon, label, body,
}: { icon: string; label: string; body: string }) {
  return (
    <div style={{
      background: '#FFF',
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '14px 16px',
      marginBottom: 12,
      boxShadow: '0 2px 6px rgba(232,135,154,0.06)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: PINK_DEEP,
          letterSpacing: '0.25em',
        }}>{label}</span>
      </div>
      <div style={{
        fontSize: 14, color: TEXT,
        lineHeight: 1.85, letterSpacing: '0.02em',
        fontFamily: READ_FONT,
      }}>{body}</div>
    </div>
  )
}

// ─── related-links：詳細ページの末尾 ─────────────────────────────
function RelatedLinks({ isPC, onIrokoi, onCastType }: {
  isPC: boolean
  onIrokoi: () => void
  onCastType: () => void
}) {
  const links = [
    { icon: '💖', title: '色恋の鉄則', sub: '5つの基本ルール', onClick: onIrokoi },
    { icon: '🎀', title: 'キャストタイプ別', sub: '自分らしい言い回し', onClick: onCastType },
  ]
  return (
    <>
      <div style={{
        fontSize: 10, fontWeight: 700,
        color: PINK_DEEP, letterSpacing: '0.3em',
        marginTop: 36, marginBottom: 14,
      }}>
        🌸 関連で読む
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isPC ? 'repeat(2, 1fr)' : '1fr',
        gap: 10,
      }}>
        {links.map((l, i) => (
          <button key={i} onClick={l.onClick} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px',
            background: '#FFF',
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            cursor: 'pointer',
            fontFamily: 'inherit', textAlign: 'left',
            boxShadow: '0 2px 6px rgba(232,135,154,0.06)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}>
            <span style={{ fontSize: 24 }}>{l.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: HEAD,
                letterSpacing: '0.02em',
              }}>{l.title}</div>
              <div style={{
                fontSize: 11, color: MUTED, marginTop: 2,
                letterSpacing: '0.02em',
              }}>{l.sub}</div>
            </div>
            <span style={{ fontSize: 14, color: C.pink }}>→</span>
          </button>
        ))}
      </div>
    </>
  )
}

// ─── メイン：1項目の詳細画面 ─────────────────────────────────────
export default function ManualDetailView({
  item,
  onBack,
  isPC,
  onJumpIrokoi,
  onJumpCastType,
}: {
  item: ManualItem
  onBack: () => void
  isPC: boolean
  onJumpIrokoi: () => void
  onJumpCastType: () => void
}) {
  return (
    <div style={{
      background: '#FFFFFF',
      border: `1px solid ${C.border}`,
      borderRadius: 18,
      padding: isPC ? '28px 36px 36px' : '20px 18px 28px',
      boxShadow: '0 8px 24px rgba(120, 60, 90, 0.08)',
      marginBottom: 24,
      maxWidth: isPC ? 760 : '100%',
      marginLeft: 'auto', marginRight: 'auto',
    }}>
      {/* 戻るボタン */}
      <div style={{ marginBottom: 18 }}>
        <button
          onClick={onBack}
          style={{
            background: '#FFFFFF',
            border: `1px solid ${C.border}`,
            color: C.pink,
            fontSize: 12, fontWeight: 600,
            padding: '7px 14px',
            borderRadius: 10,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ← 一覧に戻る
        </button>
      </div>

      {/* detail-head：タグ + タイトル + purpose */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8,
          marginBottom: 14,
        }}>
          <span style={{
            background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
            color: '#FFF', fontSize: 10, fontWeight: 700,
            padding: '3px 10px', borderRadius: 100,
            letterSpacing: '0.08em',
          }}>{item.step}</span>
          {item.scene && (
            <span style={{
              background: '#FFF0F3',
              color: PINK_DEEP, fontSize: 10, fontWeight: 600,
              padding: '3px 10px', borderRadius: 100,
              letterSpacing: '0.04em',
              border: `1px solid ${C.pinkLight}`,
            }}>📍 {item.scene}</span>
          )}
        </div>
        <h2 style={{
          fontSize: isPC ? 24 : 21, fontWeight: 700,
          color: HEAD, margin: '0 0 8px',
          letterSpacing: '0.02em', lineHeight: 1.4,
          fontFamily: READ_FONT,
        }}>
          {item.title}
        </h2>
        {item.purpose && (
          <p style={{
            fontSize: 13, color: MUTED,
            margin: 0, lineHeight: 1.7,
            letterSpacing: '0.02em',
            fontFamily: READ_FONT,
          }}>
            {item.purpose}
          </p>
        )}
      </div>

      {/* serif-hero */}
      <SerifHero text={item.serif} />

      {/* 反応パターン */}
      {item.reactions && item.reactions.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 10, fontWeight: 700,
            color: PINK_DEEP, letterSpacing: '0.3em',
            marginBottom: 14,
          }}>
            🌸 反応パターン（{item.reactions.length}件）
          </div>
          {item.reactions.map((r, i) => (
            <ReactionAccordion key={i} reaction={r} index={i} total={item.reactions.length} />
          ))}
        </section>
      )}

      {/* info-cards */}
      {item.info && (
        <InfoCard icon="📥" label="取れる情報・派生" body={item.info} />
      )}
      {item.why && (
        <InfoCard icon="💎" label="なぜ効くか" body={item.why} />
      )}
      {item.standard && (
        <InfoCard icon="🎯" label="迷った時の基準" body={item.standard} />
      )}

      {/* keywords */}
      {item.keywords && item.keywords.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          marginTop: 20,
        }}>
          {item.keywords.map((k, i) => (
            <span key={i} style={{
              fontSize: 10, color: PINK_DEEP, fontWeight: 600,
              background: '#FFF0F3',
              border: `1px solid ${C.pinkLight}`,
              padding: '3px 10px', borderRadius: 100,
              letterSpacing: '0.04em',
            }}>#{k}</span>
          ))}
        </div>
      )}

      {/* related-links */}
      <RelatedLinks
        isPC={isPC}
        onIrokoi={onJumpIrokoi}
        onCastType={onJumpCastType}
      />
    </div>
  )
}
