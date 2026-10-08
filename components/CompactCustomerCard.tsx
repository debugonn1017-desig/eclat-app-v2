'use client'

import type { ComponentProps, CSSProperties } from 'react'
import CustomerActionCardShell from './CustomerActionCardShell'
import { CustomerRecencyBadge } from './CustomerCardIndicators'
import { C } from '@/lib/colors'
import styles from './CompactCustomerCard.module.css'

type Props = Omit<ComponentProps<typeof CustomerActionCardShell>, 'children' | 'compactMobile'> & {
  nomination: string | null
  averageSpend: number
  totalSales: number
  daysSinceLast: number | null
}

export function formatCompactCustomerYen(value: number) {
  const amount = Number.isFinite(value) ? value : 0
  if (Math.abs(amount) < 10000) return `¥${amount.toLocaleString('ja-JP')}`
  const man = amount / 10000
  return `${Number(man.toFixed(Math.abs(man) < 100 ? 1 : 0))}万円`
}

export default function CompactCustomerCard({ nomination, averageSpend, totalSales, daysSinceLast, ...shell }: Props) {
  return <CustomerActionCardShell {...shell} borderRadius={12} compactMobile>
    <div className={styles.card} style={{
      '--card-text': C.dark, '--card-muted': C.dark2, '--card-pink': C.pink,
      '--card-border': C.border, '--card-tint': C.bgLight,
      '--card-value': C.pinkDeep,
    } as CSSProperties}>
      <div className={styles.header}>
        <span className={styles.name}>{shell.customerName || 'お名前未登録'}</span>
        {!shell.selectionMode && <button type="button" className={styles.detail}
          disabled={shell.busy} aria-label={`${shell.customerName || 'お客様'}の詳細を開く`}
          onClick={event => { event.stopPropagation(); shell.onOpen() }}>詳細</button>}
      </div>
      <div className={styles.badges}>
        <span className={styles.rank} data-rank={shell.customerRank ?? '未設定'}>
          {shell.customerRank === '切れた' ? '💔 切れた' : `${shell.customerRank ?? '未設定'}ランク`}
        </span>
        <span>{nomination || '指名未設定'}</span>
        {shell.noReply && <span className={styles.noReply}>返信なし</span>}
      </div>
      <div className={styles.metrics}>
        <div><span>客単価</span><strong>{formatCompactCustomerYen(averageSpend)}</strong></div>
        <div><span>累計売上</span><strong>{formatCompactCustomerYen(totalSales)}</strong></div>
        <div className={styles.recency}><CustomerRecencyBadge days={daysSinceLast}/></div>
      </div>
    </div>
  </CustomerActionCardShell>
}
