'use client'

// ─────────────────────────────────────────────────────────────────────
//  ManualItemView – 44項目の1項目を詳細表示（離席60秒で見るやつ）
//
//  仕様：
//   - SerifHero で item.serif を強調表示（prelude なし）
//   - ReactionBubbles で item.reactions を LINE風表示
//   - InfoCard で目的（defaultOpen=true）/ なぜ効くか / 取れる情報 / 基準（gold）
//   - 末尾に keyword chips
//   - React #300 再発防止：useMemo 不使用、useState 不使用（純粋関数）
// ─────────────────────────────────────────────────────────────────────

import type { ManualItem } from '@/types/manual'
import SerifHero from '@/components/manual/SerifHero'
import ReactionBubbles from '@/components/manual/ReactionBubbles'
import InfoCard from '@/components/manual/InfoCard'

const READ_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Meiryo", -apple-system, sans-serif'
const HEAD = '#3D2840'
const MUTED = '#6B5560'
const PINK = '#E8879A'
const PINK_LIGHT = '#F4B0BF'
const PINK_DEEP = '#C0405C'
const BORDER = '#F0DDE2'

type Props = {
  item: ManualItem
  onBack: () => void
}

export default function ManualItemView({ item, onBack }: Props) {
  return (
    <div
      style={{
        padding: 16,
        fontFamily: READ_FONT,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
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

      {/* タイトル + ラベル */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#FFFFFF',
              background: `linear-gradient(135deg, ${PINK}, ${PINK_LIGHT})`,
              padding: '3px 10px',
              borderRadius: 100,
              letterSpacing: '0.08em',
            }}
          >
            {item.id.toUpperCase()}
          </span>
          {item.step ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: PINK_DEEP,
                background: '#FFF0F3',
                border: `1px solid ${PINK_LIGHT}`,
                padding: '3px 10px',
                borderRadius: 100,
                letterSpacing: '0.06em',
              }}
            >
              {item.step}
            </span>
          ) : null}
          {item.group ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: MUTED,
                background: '#FFFFFF',
                border: `1px solid ${BORDER}`,
                padding: '3px 10px',
                borderRadius: 100,
                letterSpacing: '0.04em',
              }}
            >
              {item.group}
            </span>
          ) : null}
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: HEAD,
            margin: 0,
            lineHeight: 1.45,
            letterSpacing: '0.02em',
          }}
        >
          {item.title}
        </h2>
        {item.scene ? (
          <div
            style={{
              fontSize: 12,
              color: MUTED,
              lineHeight: 1.7,
              letterSpacing: '0.02em',
            }}
          >
            📍 {item.scene}
          </div>
        ) : null}
      </div>

      {/* セリフヒーロー */}
      <SerifHero serif={item.serif} />

      {/* 反応パターン */}
      {item.reactions && item.reactions.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: PINK,
              letterSpacing: '0.25em',
              padding: '0 4px',
            }}
          >
            🌸 反応パターン（{item.reactions.length}件）
          </div>
          <ReactionBubbles reactions={item.reactions} />
        </div>
      ) : null}

      {/* 構造化情報 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <InfoCard
          icon="🎯"
          label="目的"
          content={item.purpose}
          defaultOpen={true}
        />
        <InfoCard icon="💡" label="なぜ効くか" content={item.why} />
        <InfoCard icon="📊" label="取れる情報" content={item.info} />
        <InfoCard
          icon="🧭"
          label="基準"
          content={item.standard}
          accent="gold"
        />
      </div>

      {/* keywords */}
      {item.keywords && item.keywords.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {item.keywords.map((k, i) => (
            <span
              key={`kw-${i}`}
              style={{
                fontSize: 10,
                color: PINK_DEEP,
                fontWeight: 600,
                background: '#FFF0F3',
                border: `1px solid ${PINK_LIGHT}`,
                padding: '3px 10px',
                borderRadius: 100,
                letterSpacing: '0.04em',
              }}
            >
              #{k}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
