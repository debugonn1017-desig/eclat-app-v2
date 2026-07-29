import { C } from '@/lib/colors'
import {
  SORTABLE_VISIT_WEEKDAY_CODES,
  VISIT_TIME_PRIORITY,
  type CustomerVisitPattern,
  type SortableVisitWeekdayCode,
} from '@/lib/customerVisitPattern'
import styles from './CustomerVisitPatternSummary.module.css'

export default function CustomerVisitPatternSummary({
  pattern,
  compact = false,
  highlightWeekday = null,
}: {
  pattern: CustomerVisitPattern | null | undefined
  compact?: boolean
  highlightWeekday?: SortableVisitWeekdayCode | null
}) {
  const hasVisits = Boolean(pattern && pattern.sampleVisitCount > 0)
  const isTendency = Boolean(pattern && pattern.sampleVisitCount >= 3)
  const selectedWeekdayStat = highlightWeekday
    ? pattern?.weekdayStats?.[highlightWeekday] ?? { count: 0, lastVisitDate: null }
    : null
  const showUsual = Boolean(
    isTendency
    && pattern?.usualHour !== null
    && pattern?.usualHour !== pattern?.earlyHour
  )
  const shortDate = (value: string | null | undefined) => {
    if (!value) return null
    const [, month, day] = /^(\d{4})-(\d{2})-(\d{2})/.exec(value) ?? []
    return month && day ? `${Number(month)}/${Number(day)}` : value
  }

  const weekdayLabels: Record<SortableVisitWeekdayCode, string> = {
    1: '月',
    2: '火',
    3: '水',
    4: '木',
    5: '金',
    6: '土',
  }

  return (
    <div
      className={`${styles.summary} ${compact ? styles.compact : ''}`}
      style={{ color: C.dark2 }}
    >
      <div className={styles.heading}>
        <span className={styles.headingLabel}>
          {hasVisits ? (isTendency ? '来店傾向' : '来店実績') : '来店傾向'}
        </span>
        <span className={styles.sample}>
          {hasVisits ? `直近${pattern?.sampleVisitCount}回来店` : '実績なし'}
        </span>
      </div>

      <div className={styles.weekdays} aria-label="曜日別の来店実績">
        {SORTABLE_VISIT_WEEKDAY_CODES.map((weekday) => {
          const stat = pattern?.weekdayStats?.[weekday]
          const selected = highlightWeekday === weekday
          return (
            <span
              key={weekday}
              className={`${styles.weekday} ${stat?.count ? styles.hasValue : ''} ${selected ? styles.selectedWeekday : ''}`}
              title={`${weekdayLabels[weekday]}曜日 ${stat?.count ?? 0}回`}
              aria-label={`${weekdayLabels[weekday]}曜日 ${stat?.count ?? 0}回`}
            >
              <span>{weekdayLabels[weekday]}</span>
              <span className={styles.dot} aria-hidden />
            </span>
          )
        })}
      </div>

      <div className={styles.hours} aria-label="来店時間帯">
        {VISIT_TIME_PRIORITY.map((hour) => {
          const isEarly = pattern?.earlyHour === hour
          const isUsual = pattern?.usualHour === hour
          return (
            <span
              key={hour}
              className={`${styles.hour} ${isEarly ? styles.earlyHour : ''} ${isUsual ? styles.usualHour : ''}`}
              aria-label={`${hour}時台${isEarly ? ` 来店実績${pattern?.earlyHourCount ?? 0}回` : ''}${isUsual ? ' 最頻時間帯' : ''}`}
            >
              {hour}時
            </span>
          )
        })}
      </div>

      <div className={styles.caption}>
        {!hasVisits && <span>来店が登録されると曜日・時間帯を表示します</span>}
        {selectedWeekdayStat && highlightWeekday && (
          <strong>
            {weekdayLabels[highlightWeekday]}曜 {selectedWeekdayStat.count}回
            {selectedWeekdayStat.lastVisitDate
              ? `・最終 ${shortDate(selectedWeekdayStat.lastVisitDate)}`
              : ''}
          </strong>
        )}
        {pattern?.earlyHour !== null && pattern?.earlyHour !== undefined && (
          <span className={pattern.earlyHour <= 21 ? styles.earlyCaption : undefined}>
            {pattern.earlyHour}時台 {pattern.earlyHourCount}回
          </span>
        )}
        {showUsual && pattern?.usualHour !== null && pattern?.usualHour !== undefined && (
          <span>通常は{pattern.usualHour}時台が多い</span>
        )}
      </div>
    </div>
  )
}
