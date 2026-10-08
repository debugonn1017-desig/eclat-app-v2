'use client'

import { useState, type ComponentProps, type CSSProperties } from 'react'
import CustomerActionCardShell from './CustomerActionCardShell'
import { CustomerRecencyBadge } from './CustomerCardIndicators'
import { C } from '@/lib/colors'
import CustomerCardPreview from './CustomerCardPreview'
import CustomerVisitPatternSummary from './CustomerVisitPatternSummary'
import type { CustomerVisitPattern, SortableVisitWeekdayCode } from '@/lib/customerVisitPattern'
import styles from './CompactCustomerCard.module.css'

type Props = Omit<ComponentProps<typeof CustomerActionCardShell>, 'children' | 'compactMobile' | 'onPreview'> & {
  nomination: string | null
  averageSpend: number
  totalSales: number
  daysSinceLast: number | null
  preview?: {
    nickname?: string | null
    ageGroup?: string | null
    region?: string | null
    assignedCast?: string | null
    staffNames?: string
    companion?: string
    lastVisitDate?: string | null
    lastContactDate?: string | null
    visitCount?: number
    visitPattern?: CustomerVisitPattern | null
    highlightWeekday?: SortableVisitWeekdayCode | null
  }
}

export function formatCompactCustomerYen(value: number) {
  const amount = Number.isFinite(value) ? value : 0
  if (Math.abs(amount) < 10000) return `¥${amount.toLocaleString('ja-JP')}`
  const man = amount / 10000
  return `${Number(man.toFixed(Math.abs(man) < 100 ? 1 : 0))}万円`
}

export default function CompactCustomerCard({ nomination, averageSpend, totalSales, daysSinceLast, preview, ...shell }: Props) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const visitCount = preview?.visitCount ?? 0
  const cardColors = {
      '--card-text': C.dark, '--card-muted': C.dark2, '--card-pink': C.pink,
      '--card-border': C.border, '--card-tint': C.bgLight,
      '--card-value': C.pinkDeep,
    } as CSSProperties
  const badges = <>
    <span className={styles.rank} data-rank={shell.customerRank ?? '未設定'}>
      {shell.customerRank === '切れた' ? '💔 切れた' : `${shell.customerRank ?? '未設定'}ランク`}
    </span><span>{nomination || '指名未設定'}</span>
    {shell.noReply && <span className={styles.noReply}>返信なし</span>}
  </>
  return <>
  <CustomerActionCardShell {...shell} borderRadius={12} compactMobile onPreview={() => setPreviewOpen(true)}>
    <div className={styles.card} style={cardColors}>
      <div className={styles.header}>
        <span className={styles.name}>{shell.customerName || 'お名前未登録'}</span>
        {!shell.selectionMode && <button type="button" className={styles.detail}
          disabled={shell.busy} aria-label={`${shell.customerName || 'お客様'}のカード情報を表示`}
          onClick={event => { event.stopPropagation(); setPreviewOpen(true) }}>情報</button>}
      </div>
      <div className={styles.badges}>
        {badges}
        <span className={styles.visitCount} aria-label={`来店回数 ${visitCount}回`}>来店 <strong>{visitCount.toLocaleString('ja-JP')}</strong>回</span>
      </div>
      <div className={styles.metrics}>
        <div><span>客単価</span><strong>{formatCompactCustomerYen(averageSpend)}</strong></div>
        <div><span>累計売上</span><strong>{formatCompactCustomerYen(totalSales)}</strong></div>
        <div className={styles.recency}><CustomerRecencyBadge days={daysSinceLast}/></div>
      </div>
    </div>
  </CustomerActionCardShell>
  {previewOpen && !shell.selectionMode && !shell.busy && <CustomerCardPreview
    name={shell.customerName || 'お客様'} onClose={() => setPreviewOpen(false)} onOpenCustomer={shell.onOpen}>
    <div className={styles.previewCard} style={cardColors}>
      <div className={styles.previewName}>{shell.isFollowUp && '⭐️ '}{shell.customerName || 'お名前未登録'}</div>
      {preview?.nickname && <p className={styles.previewNickname}>（{preview.nickname}）</p>}
      <div className={`${styles.badges} ${styles.previewBadges}`}>{badges}<span>{preview?.ageGroup || '年代未設定'}</span><span>{preview?.region || '地域未設定'}</span></div>
      <div className={styles.previewPanels}>
        <section><h3>売上</h3><dl><div><dt>客単価</dt><dd>{formatCompactCustomerYen(averageSpend)}</dd></div><div><dt>累計売上</dt><dd>{formatCompactCustomerYen(totalSales)}</dd></div><div><dt>累計回数</dt><dd>{visitCount}回</dd></div></dl></section>
        <section><h3>最終来店</h3><strong>{preview?.lastVisitDate?.replaceAll('-', '/') || '未記録'}</strong><div className={styles.previewRecency}><CustomerRecencyBadge days={daysSinceLast}/></div></section>
      </div>
      <CustomerVisitPatternSummary pattern={preview?.visitPattern} highlightWeekday={preview?.highlightWeekday}/>
      <dl className={styles.previewRelations}>
        <div><dt>担当キャスト</dt><dd>{preview?.assignedCast || '未設定'}</dd></div>
        {preview?.staffNames && <div><dt>黒服</dt><dd>{preview.staffNames}</dd></div>}
        {preview?.companion !== undefined && <div><dt>お連れ様</dt><dd>{preview.companion || '未登録'}</dd></div>}
        <div><dt>最終連絡</dt><dd>{preview?.lastContactDate?.replaceAll('-', '/') || '未記録'}</dd></div>
      </dl>
    </div>
  </CustomerCardPreview>}
  </>
}
