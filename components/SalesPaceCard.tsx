'use client'

import { C } from '@/lib/colors'
import { SalesPace } from '@/lib/salesPace'

interface Props {
  pace: SalesPace
  /** 横長カード or コンパクト */
  variant?: 'full' | 'compact'
}

const formatYen = (n: number) => `¥${n.toLocaleString()}`
const shortYen = (n: number) => {
  if (Math.abs(n) >= 10000) return `¥${Math.round(n / 10000).toLocaleString()}万`
  return `¥${n.toLocaleString()}`
}

export default function SalesPaceCard({ pace, variant = 'full' }: Props) {
  const isCompact = variant === 'compact'
  const rateColor = (rate: number | null) =>
    rate == null ? C.pinkMuted : rate >= 100 ? '#0F6E56' : rate >= 80 ? '#BA7517' : '#A32D2D'

  return (
    <div
      style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: isCompact ? '12px 14px' : '16px 18px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: '0.15em',
            color: C.pinkMuted,
            fontWeight: 500,
          }}
        >
          PACE FORECAST
        </span>
        <span style={{ fontSize: 11, color: C.pinkMuted }}>
          {pace.elapsedDays} / {pace.totalDaysInMonth}日経過 ({Math.round(pace.elapsedRate * 100)}%)
        </span>
      </div>

      {/* 進捗バー */}
      <div
        style={{
          height: 8,
          background: '#F0EBE8',
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pace.elapsedRate * 100}%`,
            background: 'linear-gradient(90deg, #FFD7E4, #E8789A)',
          }}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr 1fr' : 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 2 }}>
            月末予測（出勤ペース）
          </div>
          <div style={{ fontSize: isCompact ? 16 : 20, fontWeight: 500, color: C.pink }}>
            {formatYen(pace.forecastByWorkDays)}
          </div>
          {pace.forecastAchievementRate != null && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: rateColor(pace.forecastAchievementRate),
                marginTop: 2,
              }}
            >
              達成見込み {pace.forecastAchievementRate}%
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 2 }}>
            月末予測（カレンダー）
          </div>
          <div style={{ fontSize: isCompact ? 14 : 16, fontWeight: 500, color: C.dark }}>
            {formatYen(pace.forecastByCalendar)}
          </div>
        </div>

        {!isCompact && pace.gapToTarget != null && (
          <div>
            <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 2 }}>
              目標まで残り
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: pace.gapToTarget > 0 ? C.pink : '#0F6E56',
              }}
            >
              {pace.gapToTarget > 0
                ? formatYen(pace.gapToTarget)
                : `達成済 +${shortYen(Math.abs(pace.gapToTarget))}`}
            </div>
            {pace.totalWorkDays > 0 && pace.workedDays < pace.totalWorkDays && (
              <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 2 }}>
                残り{pace.totalWorkDays - pace.workedDays}営業日
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
