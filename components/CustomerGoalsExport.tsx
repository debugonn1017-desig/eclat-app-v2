'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { createCustomerGoalsPdf, goalYen, goalGapLabel, goalReportElapsed, goalReportTotals, goalReportNoteParts, goalReportMetricParts, goalReportPrintColors, goalReportExplanation } from '@/lib/customerGoalsPdf'
import type { GoalReport } from '@/lib/starCustomerGoals'
import { captureCustomerListScroll } from '@/lib/customerListScroll'
import { C } from '@/lib/colors'
import styles from './CustomerGoalsExport.module.css'
import type { CSSProperties } from 'react'

const colors = { '--export-ink': C.dark, '--export-muted': C.dark2, '--export-line': C.border, '--export-paper': C.white, '--export-tint': C.miniBg, '--export-error': C.dangerDeep } as CSSProperties
const printColors = { ...colors, '--export-ink': goalReportPrintColors.ink, '--export-muted': goalReportPrintColors.muted, '--export-line': goalReportPrintColors.rule } as CSSProperties

function PrintMetricValue({ value }: { value: string }) {
  return goalReportMetricParts(value).map((part, index) => <span key={index}>{index > 0 && <wbr />}<span className={styles.printValuePart}>{part}</span></span>)
}

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
    {printing && createPortal(<article className={styles.printReport} style={printColors}>
      <header className={styles.printHeader}>
        <h1>{printing.castName} お客様の目標・実績</h1><p>{printing.month.replace('-', '年')}月 / {printing.today}時点 / {printing.scopeLabel || '⭐️全員'} {printing.rows.length}名</p>
        <p>{goalReportTotals(printing)}</p><p className={styles.printHelp}>{goalReportExplanation}</p>
      </header>
      <div className={styles.printColumns}>{printing.rows.flatMap(r => goalReportNoteParts(r.note).map((note, index) => <section className={styles.printCard} key={`${r.id}:${index}`} data-report-customer={index === 0 ? r.id : undefined} data-report-part={`${r.id}:${index}`}>
        <div className={styles.printIdentity}>
          <div className={styles.printIdentityLine}><strong>{r.name}{index > 0 ? '（続き）' : ''}</strong><span className={styles.printMetadata}>{r.castName ? `担当 ${r.castName} / ` : ''}{r.category}{index === 0 ? ` / ${r.region || '地域未設定'} / ${r.occupation || '職業未設定'}` : ''}</span></div>
          {index === 0 && <p className={styles.printVisitLine}><span>最終入店 {r.lastVisit || '未記録'} / {goalReportElapsed(printing.today, r.lastVisit)}</span><span className={styles.printChecked}>{r.checked === null ? '確認状況未取得' : r.checked ? `本日確認済み${r.checkedBy ? ' / ' + r.checkedBy : ''}` : '本日未確認'}</span></p>}
        </div>
        {index === 0 && <table><thead><tr>{['項目', '目標', '実績', '差'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
        <tr className={styles.printMetric}><td>売上</td><td><PrintMetricValue value={r.targetSales === null ? '未設定' : goalYen(r.targetSales)} /></td><td><b><PrintMetricValue value={goalYen(r.sales)} /></b></td><td><PrintMetricValue value={goalGapLabel(r.targetSales, r.sales, '円')} /></td></tr>
        <tr className={styles.printMetric}><td>来店</td><td>{r.targetVisits === null ? '未設定' : r.targetVisits + '回'}</td><td><b>{r.visits}回</b></td><td>{goalGapLabel(r.targetVisits, r.visits, '回')}</td></tr>
        </tbody></table>}<p className={styles.printNote}><span>備考{index > 0 ? '（続き）' : ''}</span> {note}</p>
      </section>))}</div>
    </article>, document.body)}
  </>
}
