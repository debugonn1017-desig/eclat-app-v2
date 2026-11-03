import type { CSSProperties, ReactNode } from 'react'
import { C } from '@/lib/colors'
import styles from './CustomerActivityFields.module.css'

type Props = {
  lastVisitDate?: string | null
  daysSinceLast: number | null
  dateReady?: boolean
  sales: ReactNode
  visits: ReactNode
  className?: string
}

const colors = {
  '--activity-text': C.dark, '--activity-muted': C.dark2,
  '--activity-date-bg': C.tagBg, '--activity-date-border': C.pinkLight, '--activity-date-label': C.tagTextStrong,
  '--activity-days-bg': C.goldBg, '--activity-days-border': C.beigeLight, '--activity-days-label': C.goldText,
  '--activity-sales-bg': C.chartBlueBg, '--activity-sales-border': C.chartBlue, '--activity-sales-label': C.chartBlueText,
  '--activity-visits-bg': C.successBg, '--activity-visits-border': C.success, '--activity-visits-label': C.successDeep,
} as CSSProperties

/** ⭐️の個人一覧と本日確認で、日付・経過・売上・回数の位置と色をそろえる。 */
export default function CustomerActivityFields({ lastVisitDate, daysSinceLast, dateReady = true, sales, visits, className = '' }: Props) {
  const validDays = daysSinceLast !== null && Number.isFinite(daysSinceLast)
  const elapsedLabel = !dateReady ? '確認中' : !validDays ? '来店未記録' : daysSinceLast! < 0 ? '来店予定' : daysSinceLast === 0 ? '本日来店' : `来店から${daysSinceLast}日`
  return <div className={`${styles.grid} ${className}`} style={colors} data-customer-activity>
    <section className={`${styles.field} ${styles.date}`} data-activity-field="last-visit" aria-label="最終入店">
      <span className={styles.label}>最終入店</span>
      <strong className={styles.dateValue} title={lastVisitDate || undefined} aria-label={dateReady ? lastVisitDate || '来店未記録' : '確認中'}>{!dateReady ? '確認中' : lastVisitDate ? lastVisitDate.slice(5).replace('-', '/') : '未記録'}</strong>
    </section>
    <section className={`${styles.field} ${styles.elapsed}`} data-activity-field="elapsed" aria-label="経過日数">
      <span className={styles.label}>経過日数</span>
      <strong className={`${styles.daysValue} ${validDays && daysSinceLast! >= 1000 ? styles.longNumber : ''}`} aria-label={elapsedLabel}>{dateReady && validDays && daysSinceLast! > 0 ? <>{daysSinceLast}<small>日</small></> : !dateReady ? '確認中' : !validDays ? '未記録' : daysSinceLast === 0 ? '本日' : '予定'}</strong>
    </section>
    <section className={`${styles.field} ${styles.sales}`} data-activity-field="sales" aria-label="売上">
      <span className={styles.label}>売上</span>{sales}
    </section>
    <section className={`${styles.field} ${styles.visits}`} data-activity-field="visits" aria-label="来店回数">
      <span className={styles.label}>来店回数</span>{visits}
    </section>
  </div>
}

export function CustomerOverviewFields({ lastVisitDate, daysSinceLast, averageSpend, totalSales, visitCount, className }: {
  lastVisitDate?: string | null; daysSinceLast: number | null; averageSpend: number; totalSales: number; visitCount: number; className?: string
}) {
  const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`
  return <CustomerActivityFields lastVisitDate={lastVisitDate} daysSinceLast={daysSinceLast} className={className}
    sales={<div className={styles.amounts}><div><small>客単価</small><strong>{yen(averageSpend)}</strong></div><div><small>累計売上</small><strong>{yen(totalSales)}</strong></div></div>}
    visits={<><strong className={`${styles.countValue} ${visitCount >= 1000 ? styles.longNumber : ''}`} aria-label={`来店回数 ${visitCount}回`}>{visitCount.toLocaleString('ja-JP')}<small>回</small></strong><small className={styles.caption}>累計</small></>}/>
}
