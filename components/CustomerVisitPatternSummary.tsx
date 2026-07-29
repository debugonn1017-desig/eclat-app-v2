import { C } from '@/lib/colors'
import {
  formatPatternWeekdays,
  type CustomerVisitPattern,
} from '@/lib/customerVisitPattern'

export default function CustomerVisitPatternSummary({
  pattern,
  compact = false,
}: {
  pattern: CustomerVisitPattern | null | undefined
  compact?: boolean
}) {
  if (!pattern || pattern.sampleVisitCount === 0) return null

  const weekdays = formatPatternWeekdays(pattern.weekdayCodes)
  const isTendency = pattern.sampleVisitCount >= 3
  const showUsual = isTendency
    && pattern.usualHour !== null
    && pattern.usualHour !== pattern.earlyHour

  return (
    <div style={{
      marginTop: compact ? 5 : 8,
      padding: compact ? '6px 8px' : '8px 10px',
      borderRadius: 10,
      background: '#FFF8F1',
      border: '1px solid #F3E2C9',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: compact ? 5 : 7,
      color: C.dark2,
      fontSize: compact ? 9 : 10,
      lineHeight: 1.45,
    }}>
      <span style={{ color: '#9A6A2F', fontWeight: 700 }}>
        {isTendency ? '来店傾向' : '来店実績'}
      </span>
      {weekdays && <span>{weekdays}</span>}
      {pattern.earlyHour !== null && (
        <span style={{
          color: pattern.earlyHour <= 21 ? '#B36B24' : C.dark2,
          fontWeight: pattern.earlyHour <= 21 ? 700 : 600,
        }}>
          {pattern.earlyHour <= 21 ? '🌅' : '🕘'} {pattern.earlyHour}時台に来店実績あり
          （{pattern.earlyHourCount}回）
        </span>
      )}
      {showUsual && (
        <span style={{ color: C.pinkMuted }}>
          通常は{pattern.usualHour}時台が多い
        </span>
      )}
      <span style={{ marginLeft: 'auto', color: C.pinkMuted, fontSize: compact ? 8 : 9 }}>
        直近{pattern.sampleVisitCount}回来店
      </span>
    </div>
  )
}
