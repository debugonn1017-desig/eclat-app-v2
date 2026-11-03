'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal, flushSync } from 'react-dom'
import PageHeader from '@/components/PageHeader'
import BottomNav from '@/components/BottomNav'
import Spinner from '@/components/ui/Spinner'
import { C } from '@/lib/colors'
import { businessDateJST } from '@/lib/dateUtils'
import { captureCustomerListScroll } from '@/lib/customerListScroll'
import type { LockerRankingData, LockerRankingRow } from '@/lib/lockerRanking'
import styles from './LockerRankingPage.module.css'

const colors = {
  '--locker-bg': C.goalBg, '--locker-paper': C.white, '--locker-text': C.goalText,
  '--locker-muted': C.goalMuted, '--locker-line': C.goalBorder, '--locker-accent': C.goalAccent,
  '--locker-soft': C.tagBg, '--locker-pink': C.pink, '--locker-pink-deep': C.pinkDeep,
  '--locker-gold': C.gold, '--locker-gold-bg': C.goldBg, '--locker-gold-text': C.goldText,
  '--locker-silver-bg': C.chartBlueBg, '--locker-bronze-bg': C.beigeBg,
  '--locker-purple': C.chartPurple, '--locker-purple-bg': C.pinkBg,
  '--locker-error': C.dangerDeep,
} as CSSProperties

const medalColors = [
  { main: C.gold, soft: C.warningBg, ink: C.goldText },
  { main: C.chartBlue, soft: C.chartBlueBg, ink: C.chartBlueText },
  { main: C.beige, soft: C.beigeBg, ink: C.goldText },
  { main: C.chartPurple, soft: C.pinkBg, ink: C.goalAccent },
  { main: C.pinkDeep, soft: C.pinkBg, ink: C.goalAccent },
]
const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`
const monthLabel = (value: string) => `${value.slice(0, 4)}年${Number(value.slice(5))}月`
const shortDate = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`

export default function LockerRankingPage() {
  const currentMonth = businessDateJST().slice(0, 7)
  const [month, setMonth] = useState(() => businessDateJST().slice(0, 7))
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<LockerRankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [printError, setPrintError] = useState('')
  const [printing, setPrinting] = useState<LockerRankingData | null>(null)
  const cleanupPrint = useRef<(() => void) | null>(null)
  const visibleData = data?.month === month ? data : null

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/admin/locker-ranking?month=${encodeURIComponent(month)}`, {
          cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        })
        const json = await response.json() as LockerRankingData & { error?: string }
        if (!response.ok) throw new Error(json.error || 'ランキングを取得できませんでした')
        if (json.month !== month || !Array.isArray(json.rows) || !Array.isArray(json.previousDayBowzu)) {
          throw new Error('ランキングの対象月を確認できませんでした')
        }
        if (!controller.signal.aborted) setData(json)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'ランキングを取得できませんでした')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [month, revision])

  useEffect(() => () => cleanupPrint.current?.(), [])

  const printReport = async () => {
    if (!visibleData || loading || error || printing) return
    const restoreScroll = captureCustomerListScroll()
    const finish = () => {
      if (cleanupPrint.current !== finish) return
      cleanupPrint.current = null
      window.removeEventListener('afterprint', finish)
      delete document.body.dataset.lockerRankingPrint
      setPrinting(null)
      restoreScroll()
    }
    cleanupPrint.current = finish
    setPrintError('')
    try {
      flushSync(() => setPrinting(visibleData))
      document.body.dataset.lockerRankingPrint = 'true'
      window.addEventListener('afterprint', finish)
      await document.fonts.ready
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      if (cleanupPrint.current !== finish) return
      window.print()
      if (document.visibilityState === 'visible' && !window.matchMedia('print').matches) finish()
    } catch (cause) {
      finish()
      setPrintError(cause instanceof Error ? cause.message : '印刷を準備できませんでした')
    }
  }

  return <div className={styles.page} style={colors} data-locker-ranking-page>
    <PageHeader title="更衣室ランキング表" subtitle="月間実績" backFallback="/admin/casts" actions={<div className={styles.controls}>
      <label className={styles.monthControl}><span>対象月</span><input type="month" aria-label="ランキングの対象月" value={month} max={currentMonth} disabled={!!printing} onChange={event => {
        const next = event.target.value
        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(next) && next <= currentMonth) setMonth(next)
      }}/></label>
      <button type="button" disabled={loading || !!printing} onClick={() => setRevision(value => value + 1)}>再取得</button>
      <button type="button" className={styles.printButton} disabled={!visibleData || loading || !!error || !!printing} onClick={() => void printReport()}>{printing ? '準備中…' : '印刷'}</button>
    </div>}/>
    <main className={styles.main}>
      {error && <div role="alert" className={styles.error}>{error}{visibleData && <span>前回取得したデータを表示しています。</span>}<button type="button" disabled={loading || !!printing} onClick={() => setRevision(value => value + 1)}>もう一度取得</button></div>}
      {printError && <p role="alert" className={styles.error}>{printError}</p>}
      {loading && !visibleData ? <div className={styles.loading}><Spinner size="md" label="ランキングを読み込み中…"/></div> : visibleData ? <>
        <section className={styles.board} aria-labelledby="locker-ranking-title" aria-busy={loading}>
          <header className={styles.boardHeader}>
            <div><p>MONTHLY RANKING</p><h2 id="locker-ranking-title">{monthLabel(visibleData.month)}のランキング</h2><span>{shortDate(visibleData.periodStart)}〜{shortDate(visibleData.periodEnd)} · 実質売上順</span></div>
            <svg className={styles.boardStar} aria-hidden="true" viewBox="0 0 64 64" fill="none"><path d="m32 4 7.5 20.5L60 32l-20.5 7.5L32 60l-7.5-20.5L4 32l20.5-7.5Z" stroke="currentColor" strokeWidth="1.5"/><path d="m52 4 2.2 5.8L60 12l-5.8 2.2L52 20l-2.2-5.8L44 12l5.8-2.2Z" fill="currentColor"/></svg>
          </header>
          <div className={styles.tableCaption}><span>{visibleData.rows.length}名</span><span>{loading ? '更新中…' : '同額は固定順'}</span></div>
          {visibleData.rows.length ? <RankingTable rows={visibleData.rows}/> : <p className={styles.empty}>対象のキャストがいません。</p>}
          <p className={styles.tableHint}>横にスクロールして全項目を確認できます。</p>
        </section>
        <BowzuSection data={visibleData}/>
      </> : !loading && !error ? <p className={styles.empty}>ランキングを取得してください。</p> : null}
    </main>
    <BottomNav/>
    {printing && createPortal(<article className={styles.printReport} style={colors} data-locker-print-report>
      <header className={styles.printHeading}><h1>更衣室ランキング表</h1><p>{monthLabel(printing.month)} · {shortDate(printing.periodStart)}〜{shortDate(printing.periodEnd)} · 実質売上順</p></header>
      {printing.rows.length ? <RankingTable rows={printing.rows} printOnly/> : <p className={styles.empty}>対象のキャストがいません。</p>}
      <BowzuSection data={printing}/>
    </article>, document.body)}
  </div>
}

function RankingTable({ rows, printOnly = false }: { rows: LockerRankingRow[]; printOnly?: boolean }) {
  return <div className={styles.tableScroll} data-locker-ranking-scroll={printOnly ? undefined : 'true'} data-customer-scroll={printOnly ? undefined : 'locker-ranking'} tabIndex={printOnly ? undefined : 0} role={printOnly ? undefined : 'region'} aria-label="更衣室ランキングの全項目">
    <table className={styles.rankingTable} data-locker-ranking-table={printOnly ? undefined : 'true'} data-locker-print-table={printOnly ? 'true' : undefined}>
      <colgroup><col className={styles.rankColumn}/><col className={styles.nameColumn}/><col className={styles.salesColumn}/><col span={5}/></colgroup>
      <thead><tr><th scope="col">順位</th><th scope="col">名前</th><th scope="col">実質売上</th><th scope="col">本指名</th><th scope="col">場内</th><th scope="col">同伴数</th><th scope="col">坊主数</th><th scope="col">連続坊主</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.castId} data-locker-cast={row.castId} data-locker-rank={row.rank}>
        <td className={styles.rankCell}>{row.rank >= 1 && row.rank <= 5 ? <RankMedal rank={row.rank}/> : <span className={styles.plainRank} aria-label={`第${row.rank}位`}>{row.rank}</span>}</td>
        <th scope="row"><span className={styles.castName}>{row.castName}</span></th>
        <td className={styles.sales} data-locker-value="sales">{yen(row.sales)}</td>
        <td data-locker-value="honshimei">{row.honshimei.toLocaleString('ja-JP')}<small>本</small></td>
        <td data-locker-value="banai">{row.banai.toLocaleString('ja-JP')}<small>本</small></td>
        <td data-locker-value="douhan">{row.douhan.toLocaleString('ja-JP')}<small>回</small></td>
        <td data-locker-value="bowzu">{row.bowzuDays.toLocaleString('ja-JP')}<small>日</small></td>
        <td data-locker-value="streak">{row.bowzuStreak.toLocaleString('ja-JP')}<small>出勤</small></td>
      </tr>)}</tbody>
    </table>
  </div>
}

function RankMedal({ rank }: { rank: number }) {
  const gradient = `locker-medal-${useId().replace(/\W/g, '')}`
  const palette = medalColors[rank - 1]
  return <span className={styles.medal} role="img" aria-label={`第${rank}位`} data-locker-medal={rank}>
    <svg viewBox="0 0 48 54" aria-hidden="true">
      <defs><linearGradient id={gradient} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor={C.white}/><stop offset=".5" stopColor={palette.soft}/><stop offset="1" stopColor={palette.main}/></linearGradient></defs>
      <path d="m13 31-3 20 10-5 5 6 2-19m-2 0 2 19 6-6 9 5-7-20" fill={palette.main} opacity=".85"/>
      <circle cx="24" cy="22" r="18" fill={`url(#${gradient})`} stroke={palette.main} strokeWidth="1.5"/>
      <circle cx="24" cy="22" r="14.5" fill="none" stroke={C.white} strokeWidth="1.2"/>
      <path d="m5 3 1.2 3.3L10 7.5 6.2 8.7 5 12 3.8 8.7 0 7.5l3.8-1.2ZM43 13l1 2.6 3 1-3 1L43 20l-1-2.4-3-1 3-1Z" fill={palette.main}/>
      <text x="24" y="28" textAnchor="middle" fill={palette.ink} fontSize="18" fontWeight="700">{rank}</text>
    </svg>
  </span>
}

function BowzuSection({ data }: { data: LockerRankingData }) {
  return <section className={styles.bowzuSection} aria-label="前日坊主" data-locker-bowzu>
    <header className={styles.bowzuHeader}><h2>前日坊主</h2><time dateTime={data.previousBusinessDate}>{shortDate(data.previousBusinessDate)} 営業日</time></header>
    <p className={styles.bowzuHelp}>ランキングの対象月に関係なく、現在の前日を表示。連続回数は出勤日を基準にしています。</p>
    {data.previousDayBowzu.length ? <div className={styles.bowzuGrid}>{data.previousDayBowzu.map(cast => <article className={styles.bowzuCard} key={cast.castId} data-locker-bowzu-cast={cast.castId}>
      <strong>{cast.castName}</strong><span>連続<b>{cast.streak.toLocaleString('ja-JP')}</b>出勤</span>
    </article>)}</div> : <p className={styles.empty}>前日坊主の対象者はいません。</p>}
  </section>
}
