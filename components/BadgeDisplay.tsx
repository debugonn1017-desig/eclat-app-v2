'use client'

// 🏆 バッジ表示コンポーネント
//   detectBadgesForMonth で計算したバッジ配列を視覚化

import { Badge, RARITY_STYLES } from '@/lib/badges'
import { C } from '@/lib/colors'

export function BadgeDisplay({
  badges, size = 'md', showLabel = true,
}: {
  badges: Badge[]
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}) {
  if (badges.length === 0) return null

  const sizeStyle = {
    sm: { padding: '3px 8px', fontSize: 10, emojiSize: 12 },
    md: { padding: '4px 10px', fontSize: 11, emojiSize: 14 },
    lg: { padding: '6px 12px', fontSize: 12, emojiSize: 16 },
  }[size]

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {badges.map(b => {
        const style = RARITY_STYLES[b.rarity]
        return (
          <span
            key={b.id}
            title={`${b.label}: ${b.description}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: sizeStyle.padding,
              borderRadius: 12,
              background: style.bg,
              border: `1px solid ${style.border}`,
              color: style.fg,
              fontSize: sizeStyle.fontSize,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: sizeStyle.emojiSize }}>{b.emoji}</span>
            {showLabel && <span>{b.label}</span>}
          </span>
        )
      })}
    </div>
  )
}

export function BadgeCard({ badges, isPC }: { badges: Badge[]; isPC: boolean }) {
  if (badges.length === 0) {
    return (
      <div style={{
        background: '#FFF',
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: C.pinkMuted, marginBottom: 4 }}>
          🏆 今月の獲得バッジ
        </div>
        <div style={{ fontSize: 11, color: C.pinkMuted, fontStyle: 'italic' }}>
          まだバッジがありません。今月の頑張りでバッジ獲得を目指しましょう！
        </div>
      </div>
    )
  }
  return (
    <div style={{
      background: 'linear-gradient(135deg, #FFF8EC 0%, #FFE9C8 100%)',
      border: '1px solid #E5B14C',
      borderRadius: 12,
      padding: '12px 14px',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#9C6300',
        marginBottom: 8, letterSpacing: '0.05em',
      }}>
        🏆 今月の獲得バッジ — {badges.length} 個
      </div>
      <BadgeDisplay badges={badges} size={isPC ? 'md' : 'sm'} />
    </div>
  )
}
