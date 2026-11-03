'use client'
import { useEffect, useState } from 'react'
import type { CustomerGoalHistoryData } from '@/lib/customerGoalHistory'
import styles from './CustomerGoalHistory.module.css'

function monthPeriod(month: string) {
  const match = /^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])-01$/.exec(month)
  if (!match) return { title: month, period: '対象期間を確認してください' }
  const year = Number(match[1]), number = Number(match[2]), lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return { title: `${year}年${number}月`, period: `${year}/${match[2]}/01〜${year}/${match[2]}/${lastDay}` }
}
const yen = (value: number | null) => value === null ? '未設定' : '¥' + value.toLocaleString('ja-JP')

function History({ customerId, revision: parentRevision }: { customerId: string; revision?: string | number }) {
  const [open, setOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const scope = `${parentRevision ?? 0}:${revision}`
  const [result, setResult] = useState<{ scope: string; data?: CustomerGoalHistoryData; error?: string } | null>(null)
  const settled = result?.scope === scope
  useEffect(() => {
    if (!open || settled) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/customer-goals/history?customerId=${encodeURIComponent(customerId)}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '履歴を取得できませんでした')
        if (data.customerId !== customerId || !Array.isArray(data.items)) throw new Error('お客様の履歴を再取得してください')
        if (!controller.signal.aborted) setResult({ scope, data })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ scope, error: error instanceof Error ? error.message : '履歴を取得できませんでした' })
      }
    })()
    return () => controller.abort()
  }, [customerId, open, scope, settled])
  const data = settled ? result?.data : undefined, error = settled ? result?.error : undefined
  return <details className={styles.root} open={open} onToggle={event => {
    const next = event.currentTarget.open
    if (next && !open) setRevision(value => value + 1)
    setOpen(next)
  }}>
    <summary><span>旧担当の目標・備考履歴</span><small>スタッフ・管理者向け・閲覧のみ</small></summary>
    {open && <div className={styles.body}>
      <p className={styles.help}>現在の有効担当以外が保存した月別の目標・備考です。現在の一覧・合計には含まれません。</p>
      {data && <button type="button" onClick={() => setRevision(value => value + 1)}>履歴を更新</button>}
      {!settled && <p role="status">履歴を読み込み中…</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>再取得</button></div>}
      {data && (data.items.length ? <ul className={styles.list}>{data.items.map(item => {
        const month = monthPeriod(item.month), saved = new Date(item.updatedAt)
        return <li key={`${item.castId}:${item.month}`} className={styles.item}>
          <div className={styles.heading}><strong>{item.castName}</strong>{!item.castActive && <span className={styles.inactive}>退店</span>}<b>{month.title}</b></div>
          <p className={styles.period}>対象期間 {month.period}</p>
          <dl className={styles.metrics}><div><dt>目標売上</dt><dd>{yen(item.targetSales)}</dd></div><div><dt>目標来店回数</dt><dd>{item.targetVisits === null ? '未設定' : `${item.targetVisits}回`}</dd></div></dl>
          <p className={styles.note}><span>備考</span>{item.note || '未入力'}</p>
          {Number.isFinite(saved.getTime()) && <p className={styles.saved}>最終保存 {saved.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>}
        </li>
      })}</ul> : <p role="status">旧担当が保存した月別目標の履歴はありません。</p>)}
    </div>}
  </details>
}

export default function CustomerGoalHistory({ customerId, enabled, revision }: { customerId: string; enabled: boolean; revision?: string | number }) {
  return enabled ? <History key={customerId} customerId={customerId} revision={revision}/> : null
}
