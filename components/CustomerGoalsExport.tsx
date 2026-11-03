'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { createCustomerGoalsPdf, goalYen, goalGapLabel } from '@/lib/customerGoalsPdf'
import type { GoalReport } from '@/lib/starCustomerGoals'
import { captureCustomerListScroll } from '@/lib/customerListScroll'
import styles from './StarCustomerGoals.module.css'

export default function CustomerGoalsExport({ report, disabled, onBusyChange }: { report: GoalReport; disabled: boolean; onBusyChange: (value: boolean) => void }) {
  const [printing, setPrinting] = useState<GoalReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanup.current?.(), [])
  const run = async (pdf: boolean) => {
    if (busy || disabled) return
    setBusy(true); onBusyChange(true); setError('')
    const restore = captureCustomerListScroll()
    try {
      if (pdf) {
        const blob = await createCustomerGoalsPdf(report), url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `エクラ_${report.castName}_${report.month}_お客様目標.pdf`
        document.body.append(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      } else {
        flushSync(() => setPrinting(report))
        document.body.dataset.customerGoalsPrint = 'true'
        await document.fonts.ready
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        const finish = () => {
          delete document.body.dataset.customerGoalsPrint; setPrinting(null); restore()
          setBusy(false); onBusyChange(false); window.removeEventListener('afterprint', finish); cleanup.current = null
        }
        cleanup.current = finish; window.addEventListener('afterprint', finish)
        window.print()
        // Safari等でafterprintが発火しない場合も、印刷ダイアログ終了後に復帰する。
        if (document.visibilityState === 'visible' && !window.matchMedia('print').matches) finish()
      }
    } catch (e) { cleanup.current?.(); setError(e instanceof Error ? e.message : '出力できませんでした') }
    finally { if (pdf || !cleanup.current) { setBusy(false); onBusyChange(false); restore() } }
  }
  return <><div className={styles.exportButtons}><button type="button" disabled={disabled || busy} onClick={() => void run(false)}>印刷</button><button type="button" disabled={disabled || busy} onClick={() => void run(true)}>{busy ? '準備中…' : 'PDF保存'}</button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {printing && createPortal(<article className={styles.printReport}>
      <h1>{printing.castName} ⭐️お客様の目標・実績</h1><p>{printing.month.replace('-', '年')}月 / {printing.today}時点 / ⭐️全員 {printing.rows.length}名（画面の絞り込みにかかわらず全員を出力）</p>
      <p>売上実績 {goalYen(printing.rows.reduce((s, r) => s + r.sales, 0))} / 目標 {goalYen(printing.rows.reduce((s, r) => s + (r.targetSales ?? 0), 0))}　来店実績 {printing.rows.reduce((s, r) => s + r.visits, 0)}回 / 目標 {printing.rows.reduce((s, r) => s + (r.targetVisits ?? 0), 0)}回</p>
      <table><thead><tr>{['お客様 / 分類', '最終来店', '目標売上 / 実績 / 差', '目標回数 / 実績 / 差', '備考', '本日確認'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{printing.rows.map(r => <tr key={r.id}>
        <td><b>{r.name}</b><br/>{r.category}<br/>{r.region || '地域未設定'}・{r.occupation}</td><td>{r.lastVisit || '未記録'}</td>
        <td>{r.targetSales === null ? '未設定' : goalYen(r.targetSales)}<br/><b>{goalYen(r.sales)}</b><br/>{goalGapLabel(r.targetSales, r.sales, '円')}</td>
        <td>{r.targetVisits === null ? '未設定' : r.targetVisits + '回'}<br/><b>{r.visits}回</b><br/>{goalGapLabel(r.targetVisits, r.visits, '回')}</td>
        <td className={styles.printNote}>{r.note || '—'}</td><td>{r.checked === null ? '未取得' : r.checked ? '確認済み' : '未確認'}<br/>{r.checked ? r.checkedBy : ''}</td>
      </tr>)}</tbody></table><small>目標未設定は0円・0回とは別です。実績は対象月の実来店（予定と未来日は除外）。⭐️解除しても入力内容は保存され、一覧・合計からは外れます。</small>
    </article>, document.body)}
  </>
}
