'use client'

import { groupCustomerCastOptions, type CustomerCastOption } from '@/lib/customerCastOptions'
import { emptyStarNominationCount, type StarCounts, type StarNominationCount } from '@/lib/starredCustomers'
import StarCategoryCounts from '@/components/StarCategoryCounts'
import StarCastMonthlySales from '@/components/StarCastMonthlySales'
import styles from './StaffStarsPage.module.css'

export default function StaffStarsMenu({ casts, counts, disabled, onToday, onCast }: {
  casts: CustomerCastOption[]; counts: StarCounts | null; disabled: boolean
  onToday: () => void; onCast: (name: string) => void
}) {
  const countFor = (name: string): StarNominationCount | undefined => !counts ? undefined : Object.hasOwn(counts.byCast, name) ? counts.byCast[name] : emptyStarNominationCount()
  return <main className={styles.menu} data-star-list="menu">
    <h1>表示するリスト</h1>
    <button className={`${styles.menuRow} ${styles.todayRow}`} type="button" disabled={disabled} onClick={onToday}>
      <span>1. 本日確認<small>全キャストの⭐️場内・対象日をキャスト別に</small></span><span className={styles.menuTrailing}>{counts?.matched ? `${counts.matched.total.total}名` : '—名'}　›</span>
    </button>
    <h2>2. キャスト別</h2>
    <p className={styles.countHint}>管理で保存した順番。人数は⭐️全員分、売上は⭐️のお客様の当月実績です。</p>
    {groupCustomerCastOptions(casts.filter(cast => cast.is_active)).map(group => <section key={group.key} aria-label={`${group.tier}のキャスト`}>
      <h3 className={styles.menuTier}>{group.tier}<span>{group.rows.length}人</span></h3>
      <ul className={styles.menuList}>{group.rows.map(cast => {
        const count = countFor(cast.cast_name)
        return <li key={cast.id}><button className={`${styles.menuRow} ${styles.castMenuRow}`} data-star-cast={cast.cast_name} type="button" disabled={disabled} onClick={() => onCast(cast.cast_name)}>
          <span className={styles.castIdentity}><span className={styles.menuCastName} data-star-name>{cast.display_name || cast.cast_name}</span></span>
          <StarCastMonthlySales counts={counts} castName={cast.cast_name}/>
          <span className={styles.castCountBlock} data-star-count-block>
            <span className={styles.castCountTotal}>⭐️{count ? `${count.total}名` : '—名'}　›</span>
            <StarCategoryCounts count={count} castName={cast.cast_name}/>
          </span>
        </button></li>
      })}</ul>
    </section>)}
  </main>
}
