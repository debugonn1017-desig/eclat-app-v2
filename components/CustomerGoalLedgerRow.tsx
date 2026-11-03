'use client'

import type { CSSProperties } from 'react'
import type { Customer } from '@/types'
import { C } from '@/lib/colors'
import { useCustomerCardGesture } from '@/hooks/useCustomerCardGesture'
import { customerGoalCategory, goalDifference, type CustomerGoalActual, type CustomerMonthlyGoal } from '@/lib/starCustomerGoals'
import { goalGapLabel, goalYen } from '@/lib/customerGoalsPdf'
import type { StarCycle } from '@/lib/starLog'
import { starredElapsedDays } from '@/lib/starredCustomers'
import styles from './CustomerGoalLedgerRow.module.css'

export type CustomerGoalLedgerRowProps = {
  customer: Customer
  goal?: CustomerMonthlyGoal
  actual?: CustomerGoalActual
  ready: boolean
  cycle?: StarCycle
  logsReady: boolean
  today: string | null
  lastVisitReady: boolean
  lastVisit?: string
  busy: boolean
  canManage: boolean
  canEdit: boolean
  actionsOpen: boolean
  noReply: boolean
  confirming: boolean
  selectionMode?: boolean
  selected?: boolean
  onToggleSelected?: () => void
  assignedCastLabel?: string
  onInfo: () => void
  onEdit: () => void
  onActions: () => void
  onLog: () => void
  onConfirm: () => void
  onRemove: () => void
  onNoReply: () => void
  onSever: () => void
  onRank: () => void
}

const colors = {
  '--ledger-text': C.dark, '--ledger-muted': C.dark2, '--ledger-border': C.border,
  '--ledger-paper': C.white, '--ledger-soft': C.bgLight, '--ledger-selected': C.tagBg,
  '--ledger-accent': C.pinkDeep, '--ledger-success': C.successDeep, '--ledger-star': C.goldText,
} as CSSProperties

/** 個人の⭐️とスタッフ本日確認で、同じ月別明細と操作位置を共有する。 */
export default function CustomerGoalLedgerRow(p: CustomerGoalLedgerRowProps) {
  const name = p.customer.customer_name || p.customer.nickname || 'お名前未登録'
  const selecting = p.selectionMode === true
  const actionsOpen = p.actionsOpen && p.canManage && !selecting
  const checked = p.logsReady && !!p.today && p.cycle?.last_checked_on === p.today
  const gesture = useCustomerCardGesture({
    disabled: p.busy || selecting,
    longPress: !actionsOpen,
    canSwipe: p.canManage && !selecting,
    onLongPress: p.onInfo,
    onSwipe: direction => { if ((direction === 'left') !== actionsOpen) p.onActions() },
  })
  const category = customerGoalCategory(p.customer)
  const elapsed = starredElapsedDays(p.today, p.lastVisit)
  const date = !p.lastVisitReady ? '確認中' : p.lastVisit ? p.lastVisit.slice(5).replace('-', '/') : '未記録'
  const elapsedText = !p.lastVisitReady ? '確認中' : elapsed === null ? '—' : elapsed < 0 ? '来店予定' : elapsed === 0 ? '本日来店' : `${elapsed}日経過`
  const openName = () => { if (!gesture.consumeClick() && !p.busy) { if (selecting) p.onToggleSelected?.(); else p.onInfo() } }
  const confirmTitle = checked ? `本日確認済み${p.cycle?.last_checked_by ? ` · ${p.cycle.last_checked_by}` : ''}` : '連絡状況を確認した記録を保存'
  return <div className={styles.rowFrame} style={colors} data-customer-swipe="true" data-customer-id={p.customer.id} data-customer-ledger="true" data-selected={selecting && p.selected ? 'true' : undefined}>
    {p.canManage && <div className={styles.actions} inert={!actionsOpen || p.busy} aria-hidden={!actionsOpen}>
      <button type="button" disabled={!p.canEdit || p.busy} onClick={p.onEdit}>目標・備考<br/>編集</button>
      <button type="button" disabled={p.busy} onClick={p.onRank}>ランク変更</button>
      <button type="button" disabled={p.busy} onClick={p.onRemove}>⭐️解除</button>
      <button type="button" disabled={p.busy} onClick={p.onNoReply}>{p.noReply ? '返信なし解除' : '返信なし'}</button>
      <button type="button" disabled={p.busy || p.customer.customer_rank === '切れた'} onClick={p.onSever}>切れたへ</button>
      <button type="button" disabled={p.busy} onClick={p.onActions}>戻る</button>
    </div>}
    <div className={`${styles.row} ${actionsOpen ? styles.shifted : ''}`} onTouchStart={gesture.onTouchStart} onTouchMove={gesture.onTouchMove} onTouchEnd={gesture.onTouchEnd} onTouchCancel={gesture.onTouchCancel} onContextMenu={e => e.preventDefault()} onClick={() => {
      if (gesture.consumeClick() || p.busy) return
      if (selecting) p.onToggleSelected?.()
      else if (actionsOpen) p.onActions()
    }}>
      <div className={styles.identity}>
        <div className={styles.heading}>
          {selecting && <input className={styles.selection} type="checkbox" checked={!!p.selected} disabled={p.busy} aria-label={`${name}を選択`} onChange={() => p.onToggleSelected?.()} onClick={e => e.stopPropagation()}/>}
          <span className={styles.star} aria-hidden="true">★</span>
          <span className={styles.name} role="button" tabIndex={0} title={name} onClick={e => { e.stopPropagation(); openName() }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openName() } }}>{name}</span>
        </div>
        <div className={styles.subheader}>
          <div className={styles.meta} title={`${category} · ${p.customer.customer_rank || 'ランク未設定'} · ${p.customer.nomination_status} · ${p.customer.region || '地域未設定'}${p.assignedCastLabel ? ` · 担当 ${p.assignedCastLabel}` : ''}${p.noReply ? ' · 返信なし' : ''}`}>
            <span className={styles.category}>{category}</span><span> · {p.customer.customer_rank || '—'} · {p.customer.region || '地域未設定'}{p.assignedCastLabel ? ` · ${p.assignedCastLabel}` : ''}{p.noReply ? ' · 返信なし' : ''}</span>
          </div>
          <div className={styles.dates}>
            <span title={p.lastVisitReady ? p.lastVisit || '来店未記録' : '確認中'}>最終入店 <b>{date}</b></span>
            <span className={styles.elapsed} aria-label={elapsed !== null && elapsed > 0 ? `来店から${elapsed}日` : elapsedText}>{elapsedText}</span>
          </div>
        </div>
      </div>
      <div className={styles.metrics} aria-label="対象月の目標と実績">
        <Metric label="売上" target={p.goal?.target_sales} actual={p.actual?.sales ?? 0} unit="円" ready={p.ready}/>
        <Metric label="来店" target={p.goal?.target_visits} actual={p.actual?.visits ?? 0} unit="回" ready={p.ready}/>
      </div>
      <p className={styles.note} title={p.ready ? p.goal?.note || '未入力' : '取得を確認中'}><span>備考</span> {p.ready ? p.goal?.note || '未入力' : '取得を確認中'}</p>
      <div className={styles.activity}>
        <button type="button" className={checked ? styles.checked : undefined} disabled={p.busy || selecting || !p.canManage || !p.logsReady || !p.today || checked} onClick={e => { e.stopPropagation(); p.onConfirm() }} title={confirmTitle} aria-label={checked ? confirmTitle : undefined}>{p.confirming ? '保存中…' : checked ? `✓ 本日確認済み${p.cycle?.last_checked_by ? ' · ' + p.cycle.last_checked_by : ''}` : '本日確認'}</button>
        <button type="button" disabled={p.busy || selecting} onClick={e => { e.stopPropagation(); p.onLog() }} title={`開始 ${p.cycle?.started_on || '未設定'}・確認 ${p.cycle?.last_checked_on || '未記録'}・${p.cycle?.last_status || '未記録'}`}>記録・ログ</button>
      </div>
      {p.canManage && !selecting && <button type="button" className={styles.more} aria-label={`${name}の操作を表示`} aria-expanded={actionsOpen} disabled={p.busy} onClick={e => { e.stopPropagation(); p.onActions() }}>⋯</button>}
    </div>
  </div>
}

function Metric({ label, target, actual, unit, ready }: { label: '売上' | '来店'; target?: number | null; actual: number; unit: '円' | '回'; ready: boolean }) {
  const amount = (value: number) => unit === '円' ? goalYen(value) : `${value.toLocaleString('ja-JP')}回`
  const difference = goalDifference(target, actual)
  return <section className={styles.metric} data-goal-measure={unit === '円' ? 'sales' : 'visits'} aria-label={unit === '円' ? '目標売上と実績' : '目標来店と実績'}>
    <span className={styles.metricLabel}>{label}実績</span>
    <strong className={styles.actual} data-goal-value="actual">{ready ? amount(actual) : '—'}</strong>
    <div className={styles.target}>目標 <span data-goal-value="target">{!ready ? '—' : target == null ? '未設定' : amount(target)}</span></div>
    <small className={!ready || difference.remaining === null ? styles.unset : difference.achieved ? styles.achieved : styles.remaining} data-goal-value="remaining">{ready ? goalGapLabel(target, actual, unit) : '取得を確認中'}</small>
  </section>
}
