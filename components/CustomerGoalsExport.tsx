'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { createCustomerGoalsPdf, goalYen, goalGapLabel, goalReportElapsed, goalReportTotals, goalReportNoteParts } from '@/lib/customerGoalsPdf'
import type { GoalReport } from '@/lib/starCustomerGoals'
import { captureCustomerListScroll } from '@/lib/customerListScroll'
import { C } from '@/lib/colors'
import styles from './CustomerGoalsExport.module.css'
import type { CSSProperties } from 'react'

const colors = { '--export-ink': C.dark, '--export-muted': C.dark2, '--export-line': C.border, '--export-paper': C.white, '--export-tint': C.miniBg, '--export-error': C.dangerDeep } as CSSProperties

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
  return <><div className={styles.exportButtons} style={colors}><button type="button" disabled={disabled || busy} onClick={() => void run(false)}>印刷</button><button type="button" disabled={disabled || busy} onClick={() => void run(true)}>{busy ? '準備中…' : 'PDF保存'}</button></div>
    {error && <p role="alert" className={styles.error} style={colors}>{error}</p>}
    {printing && createPortal(<article className={styles.printReport} style={colors}>
      <h1>{printing.castName} お客様の目標・実績</h1><p>{printing.month.replace('-', '年')}月 / {printing.today}時点 / {printing.scopeLabel || '⭐️全員'} {printing.rows.length}名</p>
      <p>{goalReportTotals(printing)}</p>
      <table><thead><tr>{['項目', '目標', '実績', '差'].map(h => <th key={h}>{h}</th>)}</tr></thead>{printing.rows.flatMap(r => goalReportNoteParts(r.note).map((note, index) => <tbody key={`${r.id}:${index}`} data-report-customer={index === 0 ? r.id : undefined}>
        <tr className={styles.printIdentity}><td colSpan={4}><strong>{r.name}{index > 0 ? '（続き）' : ''}</strong><span className={styles.printChecked}>{r.checked === null ? '確認状況未取得' : r.checked ? `本日確認済み${r.checkedBy ? ' / ' + r.checkedBy : ''}` : '本日未確認'}</span><p>{r.castName ? `担当 ${r.castName} / ` : ''}{r.category} / {r.region || '地域未設定'} / {r.occupation || '職業未設定'}</p><p>最終入店 {r.lastVisit || '未記録'} / {goalReportElapsed(printing.today, r.lastVisit)}</p></td></tr>
        <tr className={styles.printMetric}><td>売上</td><td>{r.targetSales === null ? '未設定' : goalYen(r.targetSales)}</td><td><b>{goalYen(r.sales)}</b></td><td>{goalGapLabel(r.targetSales, r.sales, '円')}</td></tr>
        <tr className={styles.printMetric}><td>来店回数</td><td>{r.targetVisits === null ? '未設定' : r.targetVisits + '回'}</td><td><b>{r.visits}回</b></td><td>{goalGapLabel(r.targetVisits, r.visits, '回')}</td></tr>
        <tr className={styles.printNote}><td colSpan={4}><span>備考{index > 0 ? '（続き）' : ''}</span> {note}</td></tr>
      </tbody>))}</table><small>目標未設定は0円・0回とは別です。実績は対象月の実来店（予定と未来日は除外）。⭐️解除しても入力内容は保存され、一覧・合計からは外れます。</small>
    </article>, document.body)}
  </>
}
