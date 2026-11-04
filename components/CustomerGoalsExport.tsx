'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { createCustomerGoalsPdf, goalReportElapsed, goalReportTotals, goalReportNoteParts, goalReportMetricParts } from '@/lib/customerGoalsPdf'
import { goalReportGroups, goalReportMetadata, goalReportShortDate, goalReportCheckLabel, goalReportMetric, goalReportTheme } from '@/lib/customerGoalReportLayout'
import type { GoalReport } from '@/lib/starCustomerGoals'
import { captureCustomerListScroll } from '@/lib/customerListScroll'
import { C } from '@/lib/colors'
import styles from './CustomerGoalsExport.module.css'
import type { CSSProperties } from 'react'

const colors = { '--export-ink': C.dark, '--export-muted': C.dark2, '--export-line': C.border, '--export-paper': C.white, '--export-tint': C.miniBg, '--export-error': C.dangerDeep } as CSSProperties
const printColors = {
  ...colors, '--export-ink': goalReportTheme.ink, '--export-muted': goalReportTheme.muted, '--export-line': goalReportTheme.rule,
  '--export-soft': goalReportTheme.soft, '--export-header-line': goalReportTheme.headerRule, '--export-memo-line': goalReportTheme.memoRule,
  '--export-sales': goalReportTheme.sales, '--export-visits': goalReportTheme.visits, '--export-remaining': goalReportTheme.remaining, '--export-achieved': goalReportTheme.achieved,
  '--export-date-ink': goalReportTheme.dateInk, '--export-date-fill': goalReportTheme.dateFill, '--export-date-line': goalReportTheme.dateBorder,
  '--export-elapsed-ink': goalReportTheme.elapsedInk, '--export-elapsed-fill': goalReportTheme.elapsedFill, '--export-elapsed-line': goalReportTheme.elapsedBorder,
} as CSSProperties

function PrintMetricValue({ value }: { value: string }) {
  return goalReportMetricParts(value).map((part, index) => <span key={index}>{index > 0 && <wbr />}<span className={styles.printValuePart}>{part}</span></span>)
}

function PrintMetric({ target, actual, unit }: { target: number | null; actual: number; unit: '円' | '回' }) {
  const value = goalReportMetric(target, actual, unit)
  return <div className={`${styles.printMetric} ${unit === '回' ? styles.printVisits : ''}`}>
    <p className={styles.printActual}><b><PrintMetricValue value={value.actual} /></b></p>
    <p><span>目標</span><strong><PrintMetricValue value={value.target} /></strong></p>
    <p className={value.state === 'remaining' ? styles.printRemaining : value.state === 'achieved' || value.state === 'exceeded' ? styles.printAchieved : ''}><span>{value.label}</span><strong><PrintMetricValue value={value.value} /></strong></p>
  </div>
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
  const printGroups = printing ? goalReportGroups(printing) : []
  const footer = printing && <footer className={styles.printFooter}><span>— は目標未設定。実績は対象月の実来店。</span><span>Éclat / {printing.today}</span></footer>
  return <><div className={styles.exportButtons} style={colors}><button type="button" disabled={disabled || busy} onClick={() => void run(false)}>印刷</button><button type="button" disabled={disabled || busy} onClick={() => void run(true)}>{busy ? '準備中…' : 'PDF保存'}</button></div>
    {error && <p role="alert" className={styles.error} style={colors}>{error}</p>}
    {printing && createPortal(<article className={styles.printReport} style={printColors}>
      <header className={styles.printHeader}>
        <div className={styles.printHeading}><h1>Éclat　お客様別 目標・実績</h1><span>{printing.month.replace('-', '年')}月</span></div>
        <div className={styles.printSummary}><p>担当 {printing.castName} / {printing.scopeLabel || '⭐️全員'} {printing.rows.length}名 / {printing.today}時点</p><p>{goalReportTotals(printing)}</p></div>
      </header>
      <div className={styles.printLabels}>{['お客様・最終入店', '売上実績', '来店実績', '備考・確認状況', 'ひとことメモ'].map((label, index) => <span key={label} className={index === 1 || index === 2 ? styles.printNumeric : ''}>{label}</span>)}</div>
      <div className={styles.printColumns}>{printGroups.map((group, groupIndex) => <table className={styles.printCategoryGroup} key={group.category}>
        <thead><tr><th><div className={styles.printCategory} style={{ '--export-category-ink': group.ink, '--export-category-fill': group.fill } as CSSProperties}><div><h2>{group.category}</h2><span>{group.subtitle}</span></div><b>{group.rows.length}名</b></div></th></tr></thead>
        <tbody>{group.rows.flatMap((r, rowIndex) => goalReportNoteParts(r.note).map((note, index, parts) => <tr key={`${r.id}:${index}`}><td><section className={styles.printRow} data-report-customer={index === 0 ? r.id : undefined} data-report-part={`${r.id}:${index}`}>
          <div className={styles.printIdentity}>
            <strong>{r.name}{index > 0 ? '（続き）' : ''}</strong>
            <p className={styles.printMetadata}>{index === 0 ? goalReportMetadata(r) : r.castName ? `担当 ${r.castName}` : group.category}</p>
            {index === 0 && <p className={styles.printVisitLine}><span>最終 {goalReportShortDate(r.lastVisit, printing.today)}</span><span>{goalReportElapsed(printing.today, r.lastVisit)}</span></p>}
          </div>
          {index === 0 ? <><PrintMetric target={r.targetSales} actual={r.sales} unit="円" /><PrintMetric target={r.targetVisits} actual={r.visits} unit="回" /></> : <><div /><div /></>}
          <div className={styles.printRemarks}><p className={styles.printNote}>{note}</p>{index === 0 && <p className={styles.printChecked}>{goalReportCheckLabel(r)}</p>}</div>
          <div className={styles.printMemo} aria-label={index === 0 ? '手書きメモ2行' : undefined} aria-hidden={index > 0 || undefined}>{index === 0 && <><span /><span /></>}</div>
        </section>{groupIndex === printGroups.length - 1 && rowIndex === group.rows.length - 1 && index === parts.length - 1 && footer}</td></tr>))}</tbody>
      </table>)}</div>
      {!printGroups.length && footer}
    </article>, document.body)}
  </>
}
