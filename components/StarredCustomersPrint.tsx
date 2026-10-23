'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { captureCustomerListScroll } from '@/lib/customerListScroll'
import type { StarredPrintReport } from '@/lib/starredCustomersPrint'
import styles from './StarredCustomersPrint.module.css'

const date = (value: string | null) => value ? value.replaceAll('-', '/') : '未設定'
const yen = (value: number) => `¥${value.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`

/** プレビュー・紙面を同じ表で描画。Reactのテキスト描画で名前等をエスケープする。 */
export function StarredCustomersPrintReport({ report }: { report: StarredPrintReport }) {
  let rowNumber = 0
  return <article className={styles.report} aria-label={`${report.castName}の⭐️全員印刷一覧`}>
    <header className={styles.reportHeader}>
      <div><p className={styles.brand}>Éclat · ⭐️のお客様</p><h1>{report.castName} — ⭐️全員一覧</h1></div>
      <p>{report.count}名 · {date(report.asOf)}現在<br/>カテゴリ内：{report.sortLabel}</p>
    </header>
    <p className={styles.scope}>検索・確認状況・折りたたみに関係なく、このキャストの⭐️全員を掲載しています。</p>
    <table>
      <caption className={styles.srOnly}>{report.castName}の⭐️付きのお客様 {report.count}名</caption>
      <colgroup>{[4, 22, 8, 8, 12, 6, 10, 12, 18].map((width, index) => <col key={index} style={{ width: `${width}%` }}/>)}</colgroup>
      <thead><tr>{['No.', 'お客様 / ニックネーム', '指名 / ランク', '地域', '最終来店 / 経過', '来店回数', '客単価', '累計売上', '⭐️記録'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      {report.groups.map(group => <tbody key={group.label}>
        <tr className={styles.category}><th colSpan={9} scope="rowgroup">{group.label} <span>— {group.rows.length}名</span></th></tr>
        {group.rows.map(row => <tr key={row.id}>
          <td className={styles.number}>{++rowNumber}</td>
          <td><strong>{row.name}</strong>{row.nickname && row.nickname !== row.name && <small>{row.nickname}</small>}</td>
          <td>{row.nomination || '未設定'}<small>{row.rank ? `${row.rank}${row.rank === '切れた' ? '' : 'ランク'}` : 'ランク未設定'}</small></td>
          <td>{row.region || '未設定'}</td>
          <td>{row.lastVisit ? date(row.lastVisit) : '来店未記録'}{row.days !== null && <small>{row.days === 0 ? '本日' : row.days < 0 ? `${Math.abs(row.days)}日後` : `${row.days}日前`}</small>}</td>
          <td className={styles.number}>{row.visitCount}回</td>
          <td className={styles.money}>{yen(row.averageSpend)}</td>
          <td className={styles.money}>{yen(row.totalSales)}</td>
          <td>{row.logAvailable ? <><span>{row.status || '未記録'}</span><small>開始 {date(row.startedOn)}<br/>確認 {date(row.checkedOn)}</small></> : '記録未取得'}</td>
        </tr>)}
      </tbody>)}
    </table>
    <footer className={styles.reportFooter}>店内管理用 · お客様情報の取り扱いにご注意ください。自由メモの本文・終了履歴は印刷しません。</footer>
  </article>
}

function PrintPreview({ report, onClose }: { report: StarredPrintReport; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const restore = captureCustomerListScroll()
    dialog.showModal()
    restore()
    document.body.style.overflow = 'hidden'
    return () => {
      const restoreOnClose = captureCustomerListScroll()
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
      restoreOnClose()
    }
  }, [])
  async function print() {
    if (printing) return
    setPrinting(true); setError('')
    try {
      await document.fonts.ready
      // フォント待機中にプレビューを閉じた場合、通常画面を誤って印刷しない。
      if (!dialogRef.current?.open) return
      window.print()
    } catch {
      setError('印刷画面を開けませんでした。端末のブラウザーから印刷してください。')
    } finally { setPrinting(false) }
  }
  return createPortal(<dialog ref={dialogRef} className={styles.dialog} aria-label={`${report.castName}の⭐️全員を印刷`} onCancel={event => { event.preventDefault(); onClose() }}>
    <header className={styles.controls}>
      <div><h2>印刷プレビュー · {report.count}名</h2><p>A4・横向き推奨。印刷画面からPDF保存もできます。</p></div>
      <div className={styles.actions}><button type="button" onClick={onClose}>閉じる</button><button type="button" className={styles.primary} disabled={printing} onClick={() => { void print() }}>{printing ? '印刷画面を開いています…' : '🖨️ 印刷する'}</button></div>
      {error && <p role="alert">{error}</p>}
    </header>
    <div className={styles.paper}><StarredCustomersPrintReport report={report}/></div>
  </dialog>, document.body)
}

export default function StarredCustomersPrintButton({ count, disabled, disabledReason, createReport }: {
  count: number; disabled: boolean; disabledReason?: string; createReport: () => StarredPrintReport
}) {
  const [report, setReport] = useState<StarredPrintReport | null>(null)
  return <>
    <div className={styles.launcher}>
      <span>{disabledReason || `⭐️全${count}名を印刷（絞り込みは適用しません）`}</span>
      <button type="button" disabled={disabled} title={disabledReason} onClick={() => setReport(createReport())}>🖨️ 印刷</button>
    </div>
    {report && <PrintPreview report={report} onClose={() => setReport(null)}/>}
  </>
}
