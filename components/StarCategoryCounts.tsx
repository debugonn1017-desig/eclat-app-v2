import type { CSSProperties } from 'react'
import { C } from '@/lib/colors'
import type { GoalCategory } from '@/lib/starCustomerGoals'
import type { StarNominationCount } from '@/lib/starredCustomers'
import styles from './StarCategoryCounts.module.css'

const PRIMARY_CATEGORIES = ['県内顧客', '県外顧客', '県内場内', '県外場内'] as const satisfies readonly GoalCategory[]
const EXTRA_CATEGORIES = ['その他・地域未設定', '切れたお客様'] as const satisfies readonly GoalCategory[]

export default function StarCategoryCounts({ count, castName }: { count?: StarNominationCount; castName: string }) {
  const valueFor = (category: GoalCategory) => {
    const value = count?.categories?.[category]
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
  }
  const renderCategory = (category: GoalCategory, primary: boolean) => {
    const value = valueFor(category)
    return <span key={category} className={styles.category} data-star-category={category} data-star-primary={primary || undefined} data-count={value ?? 'unknown'}>
      <span>{category}</span><span className={styles.value}>{value ?? '—'}名</span>
    </span>
  }
  const extras = EXTRA_CATEGORIES.filter(category => (valueFor(category) ?? 0) > 0)
  return <span className={styles.breakdown} data-star-breakdown={castName} style={{ '--star-count-text': C.goalMuted, '--star-count-value': C.goalText, '--star-count-border': C.goalBorder } as CSSProperties}>
    <span className={styles.primary}>{PRIMARY_CATEGORIES.map(category => renderCategory(category, true))}</span>
    {extras.length > 0 && <span className={styles.extras}>{extras.map(category => renderCategory(category, false))}</span>}
  </span>
}
