'use client'

import { groupCustomerCastOptions, type CustomerCastOption } from '@/lib/customerCastOptions'
import type { StarCounts, StarNominationCount } from '@/lib/starredCustomers'
import styles from './StaffStarsPage.module.css'

export default function StaffStarsMenu({ casts, counts, disabled, onToday, onCast }: {
  casts: CustomerCastOption[]; counts: StarCounts | null; disabled: boolean
  onToday: () => void; onCast: (name: string) => void
}) {
  const countFor = (name: string): StarNominationCount | undefined => !counts ? undefined : Object.hasOwn(counts.byCast, name) ? counts.byCast[name] : { total: 0, honshimei: 0, banai: 0 }
  return <main className={styles.menu}>
    <h1>表示するリスト</h1>
    <button className={`${styles.menuRow} ${styles.todayRow}`} type="button" disabled={disabled} onClick={onToday}>
      <span>1. 本日確認<small>全キャストの⭐️場内・対象日をキャスト別に</small></span><span>{counts?.matched ? `${counts.matched.total.total}名` : '—名'}　›</span>
    </button>
    <h2>2. キャスト別</h2>
    <p className={styles.countHint}>管理で保存した順番。人数は⭐️全員分です。</p>
    {groupCustomerCastOptions(casts.filter(cast => cast.is_active)).map(group => <section key={group.key} aria-label={`${group.tier}のキャスト`}>
      <h3 className={styles.menuTier}>{group.tier}<span>{group.rows.length}人</span></h3>
      <ul className={styles.menuList}>{group.rows.map(cast => {
        const count = countFor(cast.cast_name)
        return <li key={cast.id}><button className={styles.menuRow} type="button" disabled={disabled} onClick={() => onCast(cast.cast_name)}>
          <span>{cast.display_name || cast.cast_name}</span><span>{count ? `${count.total}名` : '—名'}　›<small>{count ? `本${count.honshimei}名・場${count.banai}名` : '取得中'}</small></span>
        </button></li>
      })}</ul>
    </section>)}
  </main>
}
