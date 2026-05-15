'use client'

// ─────────────────────────────────────────────────────────────────────
//  CastTypesView – キャストタイプ別アレンジ表示（4タイプ）
//
//  仕様：
//   - 4タイプを大カード化（grid auto-fill minmax(280px,1fr)）
//   - icon ごとに背景グラデを変える（🌸 清楚 / 💗 甘え / ✨ お姉さん / 🌙 クール）
//   - feature / weapon / strong / weak / basic / advice を縦並びでラベル付き表示
//   - recommended[] があればタップで onJumpManual(id)
//   - React #300 再発防止：useMemo 不使用、useState 不使用（純粋関数）
// ─────────────────────────────────────────────────────────────────────

import type { ManualData, CastType } from '@/types/manual'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const TEXT = '#2D1B26'
const HEAD = '#3D2840'
const MUTED = '#6B5560'
const PINK = '#E8879A'
const BORDER = '#F0DDE2'

type Props = {
  data: ManualData
  onBack: () => void
  onJumpManual?: (id: string) => void
}

// icon から背景グラデを決定
function pickGradient(icon: string): string {
  if (icon === '🌸') return 'linear-gradient(135deg, #FFE8EE, #FFFAFC)'
  if (icon === '💗') return 'linear-gradient(135deg, #FFD6E5, #FFFAFC)'
  if (icon === '✨') return 'linear-gradient(135deg, #FFF4E0, #FFFAFC)'
  if (icon === '🌙') return 'linear-gradient(135deg, #E8E0F0, #FFFAFC)'
  return 'linear-gradient(135deg, #FFFAFC, #FFFFFF)'
}

// 1項目のラベル付き行
function FieldRow({ label, value }: { label: string; value: string }) {
  if (!value || !value.trim()) return null
  return (
    <div
      style={{
        fontSize: 12.5,
        color: TEXT,
        lineHeight: 1.75,
        letterSpacing: '0.02em',
        fontFamily: READ_FONT,
      }}
    >
      <span
        style={{
          fontWeight: 700,
          color: HEAD,
          marginRight: 4,
        }}
      >
        {label}:
      </span>
      <span>{value}</span>
    </div>
  )
}

// 1タイプのカード
function TypeCard({
  type,
  onJumpManual,
}: {
  type: CastType
  onJumpManual?: (id: string) => void
}) {
  const grad = pickGradient(type.icon)
  return (
    <div
      style={{
        background: grad,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: '18px 20px',
        boxShadow: '0 4px 12px rgba(232,135,154,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: READ_FONT,
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 32, lineHeight: 1 }}>{type.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: HEAD,
              letterSpacing: '0.02em',
              lineHeight: 1.4,
            }}
          >
            {type.name}
          </div>
          {type.tagline ? (
            <div
              style={{
                fontSize: 11,
                fontStyle: 'italic',
                color: '#E8879A',
                marginTop: 2,
                letterSpacing: '0.02em',
              }}
            >
              {type.tagline}
            </div>
          ) : null}
        </div>
      </div>

      {/* 各項目 */}
      <div
        style={{
          background: 'rgba(255,255,255,0.7)',
          borderRadius: 12,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          border: `1px solid ${BORDER}`,
        }}
      >
        <FieldRow label="特徴" value={type.feature || ''} />
        <FieldRow label="武器" value={type.weapon || ''} />
        <FieldRow label="強い場面" value={type.strong || ''} />
        <FieldRow label="弱い場面" value={type.weak || ''} />
        <FieldRow label="基本トーン" value={type.basic || ''} />
        <FieldRow label="アドバイス" value={type.advice || ''} />
      </div>

      {/* recommended */}
      {type.recommended && type.recommended.length > 0 ? (
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: PINK,
              letterSpacing: '0.22em',
              marginBottom: 8,
            }}
          >
            🌟 おすすめ項目
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            {type.recommended.map((id, i) => (
              <button
                key={`rec-${id}-${i}`}
                type="button"
                onClick={() => onJumpManual?.(id)}
                style={{
                  background: '#FFFFFF',
                  border: `1px solid ${BORDER}`,
                  color: PINK,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 11px',
                  borderRadius: 100,
                  cursor: onJumpManual ? 'pointer' : 'default',
                  letterSpacing: '0.04em',
                  fontFamily: 'inherit',
                }}
              >
                #{id}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── 本体 ──────────────────────────────────────────────────────
export default function CastTypesView({ data, onBack, onJumpManual }: Props) {
  const types = data.castTypes ?? []

  return (
    <div
      style={{
        padding: 16,
        fontFamily: READ_FONT,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* 戻る */}
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            color: PINK,
            fontSize: 12,
            fontWeight: 700,
            padding: '7px 14px',
            borderRadius: 10,
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
          }}
        >
          ← 戻る
        </button>
      </div>

      {/* ヘッダー */}
      <div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.3em',
            color: PINK,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          キャストタイプ別アレンジ
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: HEAD,
            letterSpacing: '0.02em',
            lineHeight: 1.5,
          }}
        >
          4タイプから自分らしい使い方を選ぶ
        </div>
        <div
          style={{
            fontSize: 12,
            color: MUTED,
            marginTop: 6,
            lineHeight: 1.7,
          }}
        >
          自分の強みに合うタイプを基準に、得意な引き出しを増やしていきましょう。
        </div>
      </div>

      {/* 4タイプ */}
      {types.length === 0 ? (
        <div
          style={{
            background: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 18,
            color: MUTED,
            fontSize: 13,
          }}
        >
          キャストタイプのデータが見つかりません。
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {types.map((t, i) => (
            <TypeCard
              key={`type-${t.id}-${i}`}
              type={t}
              onJumpManual={onJumpManual}
            />
          ))}
        </div>
      )}
    </div>
  )
}
