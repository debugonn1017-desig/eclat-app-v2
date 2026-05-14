'use client'

// ─────────────────────────────────────────────────────────────────────
//  ManualHomeClient – COSTES キャスト教科書 Native 版 v0.1
//
//  仕様：~/Documents/EclatManual/_ChatGPT_UI_Project用/mockup_仕様メモ.md（P-11）
//  + メモリ project_manual_native_design.md
//
//  v0.1 スコープ（このセッション）：
//   - ホーム画面（タイトル + セクションカード + 検索バー + 今日のひとこと）
//   - 各セクションのリンク先（行動マニュアル / 会話マニュアル / 44項目 / 色恋鉄則 / etc.）は
//     v0.2 予定の「準備中」モーダル表示
//   - 既存の iframe 版（public/manual.html）は ?legacy=1 で残存（admin のみ）
//
//  v0.2 以降の予定：
//   - 各セクション本体の React 実装（LINE風吹き出し / バリエーションタブ / お気に入り）
//   - costes_manuals_data.json からデータ取得
//   - PC 3カラム化（左ナビ / 中央コンテンツ / 右補足）
// ─────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { C } from '@/lib/colors'
import BottomNav from '@/components/BottomNav'
import NotificationBell from '@/components/NotificationBell'
import UserChip from '@/components/UserChip'
import { useViewMode } from '@/hooks/useViewMode'

type Section = {
  id: string
  emoji: string
  title: string
  sub: string
  gradient: string
}

const SECTIONS: Section[] = [
  {
    id: 'before',
    emoji: '🌸',
    title: '接客のまえに',
    sub: '心構え・大切にしたい4つの気持ち',
    gradient: 'linear-gradient(135deg, #FFE8EE 0%, #FFC8D4 100%)',
  },
  {
    id: 'step1',
    emoji: '☕',
    title: 'STEP1 基礎接客',
    sub: '歩き方・名前交換・おしぼり・ドリンク作り',
    gradient: 'linear-gradient(135deg, #FFD0DE 0%, #F4B0BF 100%)',
  },
  {
    id: 'step3',
    emoji: '📱',
    title: 'STEP3 連絡先交換',
    sub: '交換のタイミング・登録名ルール（🩷🧡💙🤍）',
    gradient: 'linear-gradient(135deg, #FFCCD5 0%, #F299AE 100%)',
  },
  {
    id: 'step4',
    emoji: '✨',
    title: 'STEP4 場内・延長',
    sub: '場内指名・延長交渉・延長後の関係づくり',
    gradient: 'linear-gradient(135deg, #FFC8D4 0%, #ED93A8 100%)',
  },
  {
    id: 'step5',
    emoji: '🥂',
    title: 'STEP5 アフター',
    sub: '誘い方・お店終わりの会話・断られたとき',
    gradient: 'linear-gradient(135deg, #FFB8C8 0%, #E8879B 100%)',
  },
  {
    id: 'topics44',
    emoji: '💬',
    title: '情報をとる 44項目',
    sub: '年代・職業・家族・趣味・好み etc. の引き出し方',
    gradient: 'linear-gradient(135deg, #FFE0E8 0%, #F4A5B8 100%)',
  },
  {
    id: 'irokoi',
    emoji: '💖',
    title: '色恋の鉄則',
    sub: '5つの基本ルール・距離感・LINE・誘い方',
    gradient: 'linear-gradient(135deg, #FFC0CB 0%, #D45060 100%)',
  },
  {
    id: 'cast-type',
    emoji: '🎀',
    title: 'キャストタイプ別アレンジ',
    sub: '清楚 / 甘え / お姉さん / クール…自分らしい言い回し',
    gradient: 'linear-gradient(135deg, #FFE4ED 0%, #E8879A 100%)',
  },
]

// 今日のひとこと：日替わりで違うメッセージ
const QUOTES = [
  'あなたの一言で、お客様の1日が特別になります',
  '迷ったら「相手の名前を呼ぶ」だけでも空気が変わります',
  '沈黙は怖くない。一緒にいる時間そのものが価値です',
  '完璧じゃなくていい。心がこもっていれば伝わります',
  '今日のあなたは、昨日より少し優しい目になっています',
  'お客様の話を覚えていることが、何よりのプレゼントになります',
  'たまの「素」が、いちばん魅力的です',
]

export default function ManualHomeClient({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isPC } = useViewMode()
  const [searchQuery, setSearchQuery] = useState('')
  const [comingSoonSection, setComingSoonSection] = useState<string | null>(null)

  // 今日のひとこと（日付ベースでローテーション）
  const todaysQuote = useMemo(() => {
    const d = new Date()
    const idx = (d.getFullYear() * 365 + d.getMonth() * 31 + d.getDate()) % QUOTES.length
    return QUOTES[idx]
  }, [])

  // ?legacy=1 で admin が旧iframe版にフォールバック
  const showLegacy = searchParams.get('legacy') === '1'
  if (showLegacy && isAdmin) {
    return (
      <>
        <div style={{
          width: '100%',
          height: 'calc(100vh - 60px)',
          overflow: 'hidden',
          background: '#FFF8FA',
          position: 'relative',
        }}>
          <iframe
            src="/manual.html"
            style={{
              width: '100%', height: '100%',
              border: 'none', display: 'block',
            }}
            title="COSTES キャスト教科書 v0.1 BETA（iframe版）"
          />
          <button
            onClick={() => router.push('/manual')}
            style={{
              position: 'fixed', top: 14, left: 14, zIndex: 30,
              background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
              color: '#FFF', border: 'none', padding: '8px 14px',
              borderRadius: 14, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 12px rgba(232,135,154,0.32)',
            }}
          >
            ← Native版に戻る
          </button>
        </div>
        <BottomNav />
      </>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      paddingBottom: 96,
      fontFamily: 'var(--font-zen-maru), -apple-system, "Hiragino Sans", sans-serif',
      position: 'relative',
      overflow: 'hidden',
      background:
        'radial-gradient(at 20% 10%, rgba(255, 224, 235, 0.55) 0%, transparent 42%),' +
        'radial-gradient(at 80% 92%, rgba(255, 240, 245, 0.55) 0%, transparent 42%),' +
        'linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 50%, #FFF8FA 100%)',
    }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: 'linear-gradient(160deg, #FFF1F4 0%, #FFFAFC 60%, #FFFFFF 100%)',
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
        boxShadow: '0 4px 14px rgba(232,135,154,0.06)',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button
              onClick={() => router.push('/home')}
              style={{
                background: 'transparent', border: 'none', color: C.pink,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 16 }}>←</span> ホーム
            </button>
            <div style={{
              fontSize: isPC ? 18 : 15, fontWeight: 700,
              background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              <span style={{ marginRight: 6 }}>📖</span>COSTES キャスト教科書
            </div>
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.1em',
              color: '#FFF',
              background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
              padding: '2px 6px', borderRadius: 6,
              flexShrink: 0,
            }}>v0.1</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <NotificationBell />
            <UserChip />
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: 1100, margin: '0 auto',
        padding: isPC ? '24px 24px 0' : '20px 16px 0',
        position: 'relative', zIndex: 1,
      }}>
        {/* ─── 今日のひとこと（やわらか） ─── */}
        <div style={{
          background: 'linear-gradient(135deg, #FFE8EE 0%, #FFFAFC 100%)',
          border: '1px solid rgba(255, 218, 228, 0.7)',
          borderRadius: 18,
          padding: isPC ? '16px 20px' : '14px 16px',
          marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 6px 18px rgba(232,135,154,0.08)',
        }}>
          <span style={{ fontSize: 24 }}>🌸</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9, letterSpacing: '0.28em',
              color: C.pink, fontWeight: 700, marginBottom: 4,
            }}>TODAY&apos;S WORD</div>
            <div style={{
              fontSize: isPC ? 14 : 12.5, color: C.dark,
              fontWeight: 600, lineHeight: 1.5,
              letterSpacing: '0.02em',
            }}>
              {todaysQuote}
            </div>
          </div>
        </div>

        {/* ─── 検索バー ─── */}
        <div style={{
          marginBottom: 24,
          position: 'relative',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke={C.pinkMuted} strokeWidth="1.7"
            style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="教科書全体を検索（v0.2 で実装予定）"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.85)',
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: '12px 16px 12px 44px',
              fontSize: 13, color: C.dark,
              letterSpacing: '0.04em',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              boxShadow: '0 4px 12px rgba(232,135,154,0.08)',
              cursor: 'not-allowed',
              opacity: 0.7,
            }}
          />
        </div>

        {/* ─── セクションカードグリッド ─── */}
        <div style={{
          fontSize: 10, letterSpacing: '0.28em',
          color: C.pink, fontWeight: 700,
          marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            display: 'inline-block', width: 3, height: 12,
            background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
            borderRadius: 2,
          }} />
          LEARN BY CHAPTER
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isPC ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
          gap: isPC ? 16 : 12,
          marginBottom: 28,
        }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setComingSoonSection(s.title)}
              className="eclat-manual-section-card"
              style={{
                background: s.gradient,
                border: 'none',
                borderRadius: 18,
                padding: isPC ? '20px 16px' : '16px 14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                color: '#FFF',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 8px 22px rgba(232,135,154,0.22), inset 0 3px 8px rgba(255,255,255,0.35), inset 0 -3px 8px rgba(212,80,96,0.18)',
                transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s',
                minHeight: isPC ? 130 : 110,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}
            >
              {/* 装飾：左上の白い光 */}
              <span aria-hidden style={{
                position: 'absolute',
                top: '12%', left: '12%',
                width: 16, height: 16,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 70%)',
                pointerEvents: 'none',
              }} />
              <div style={{
                fontSize: isPC ? 30 : 26,
                filter: 'drop-shadow(0 2px 3px rgba(120,40,60,0.18))',
              }}>{s.emoji}</div>
              <div>
                <div style={{
                  fontSize: isPC ? 13.5 : 12.5, fontWeight: 700,
                  letterSpacing: '0.04em', lineHeight: 1.3,
                  textShadow: '0 1px 2px rgba(120,40,60,0.18)',
                }}>{s.title}</div>
                <div style={{
                  fontSize: isPC ? 10 : 9.5, fontWeight: 500,
                  color: 'rgba(255,255,255,0.92)',
                  marginTop: 4, lineHeight: 1.45,
                  textShadow: '0 1px 2px rgba(120,40,60,0.18)',
                }}>{s.sub}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ─── お気に入り（v0.2） ─── */}
        <div style={{
          background: 'rgba(255,255,255,0.7)',
          border: `1px dashed ${C.pinkLight}`,
          borderRadius: 16,
          padding: '14px 18px',
          marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
          color: C.pinkMuted,
        }}>
          <span style={{ fontSize: 18 }}>❤️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.dark, letterSpacing: '0.05em' }}>
              お気に入り
            </div>
            <div style={{ fontSize: 10.5, marginTop: 2, letterSpacing: '0.02em' }}>
              気に入った言い回しをブックマーク（v0.2 で実装予定）
            </div>
          </div>
        </div>

        {/* ─── admin 限定：旧 iframe 版にフォールバック ─── */}
        {isAdmin && (
          <div style={{
            background: 'linear-gradient(135deg, #FFFAFC 0%, #FFFFFF 100%)',
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: '14px 18px',
            marginBottom: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9, letterSpacing: '0.22em',
                color: C.pinkMuted, fontWeight: 700,
              }}>
                ADMIN ONLY
              </div>
              <div style={{ fontSize: 12, color: C.dark, marginTop: 4, fontWeight: 600 }}>
                旧 v0.1 BETA（iframe版）で全文を読む
              </div>
              <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 2 }}>
                Native版実装中は、こちらで完全版を確認できます
              </div>
            </div>
            <button
              onClick={() => router.push('/manual?legacy=1')}
              style={{
                background: 'rgba(255,255,255,0.95)',
                border: `1px solid ${C.pink}`,
                color: C.pink,
                fontSize: 11, fontWeight: 600,
                letterSpacing: '0.15em',
                padding: '8px 16px',
                borderRadius: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(232,135,154,0.12)',
              }}
            >
              旧版を開く →
            </button>
          </div>
        )}
      </div>

      {/* ─── 準備中モーダル ─── */}
      {comingSoonSection && (
        <div
          onClick={() => setComingSoonSection(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(120, 60, 90, 0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
            animation: 'eclat-manual-fade 0.18s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
              borderRadius: 22,
              padding: '28px 24px',
              maxWidth: 360, width: '100%',
              boxShadow: '0 20px 60px rgba(212,80,96,0.32), 0 6px 18px rgba(232,135,154,0.18)',
              border: `1px solid ${C.border}`,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 8 }}>🌸</div>
            <div style={{
              fontSize: 16, fontWeight: 700, color: C.dark,
              letterSpacing: '0.04em', marginBottom: 6,
            }}>
              {comingSoonSection}
            </div>
            <div style={{
              fontSize: 11, color: C.pinkMuted,
              marginBottom: 16, letterSpacing: '0.02em', lineHeight: 1.6,
            }}>
              このセクションは v0.2 で実装予定です。<br />
              本文・反応パターン・バリエーション・お気に入り等を順次公開していきます。
            </div>
            <button
              onClick={() => setComingSoonSection(null)}
              style={{
                background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                color: '#FFF', border: 'none',
                padding: '10px 28px', borderRadius: 14,
                fontSize: 12, fontWeight: 600, letterSpacing: '0.15em',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 12px rgba(232,135,154,0.32)',
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes eclat-manual-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .eclat-manual-section-card:hover {
          transform: translateY(-4px);
          box-shadow:
            0 14px 30px rgba(232,135,154,0.34),
            inset 0 3px 8px rgba(255,255,255,0.4),
            inset 0 -3px 8px rgba(212,80,96,0.22);
        }
        .eclat-manual-section-card:active {
          transform: translateY(-1px) scale(0.99);
        }
      `}</style>

      <BottomNav />
    </div>
  )
}
