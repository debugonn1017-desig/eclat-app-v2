import { C } from '@/lib/colors'
import type { StarCounts } from '@/lib/starredCustomers'
import styles from './StaffStarsPage.module.css'

/** 名簿の売上は、表示条件や個人ページの選択月に関係なく⭐️全員の当月実績。 */
export default function StarCastMonthlySales({ counts, castName }: { counts: StarCounts | null; castName: string }) {
  const sales = counts?.monthlySales
  const month = sales && /^\d{4}-(0[1-9]|1[0-2])$/.test(sales.month) ? sales.month : null
  const amount = sales ? Object.hasOwn(sales.byCast, castName) ? sales.byCast[castName] : 0 : undefined
  const available = month !== null && typeof amount === 'number' && Number.isFinite(amount)
  return <span className={styles.castMonthlySales} data-star-month-sales={castName} data-month={month ?? undefined} data-sales={available ? amount : 'unknown'} style={{ color: C.goalMuted }}>
    <span>{month ? `${Number(month.slice(5))}月売上` : '当月売上'}</span>
    <span className={styles.castMonthlySalesAmount} style={{ color: C.goalText }}>{available ? `¥${amount.toLocaleString('ja-JP')}` : '—'}</span>
  </span>
}
