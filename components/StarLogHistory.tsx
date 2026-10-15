'use client'
import { useEffect, useState } from 'react'
import type { StarHistoryRow, StarLogCustomer } from '@/lib/starLog'
import CustomerCardPreview from '@/components/CustomerCardPreview'
import { starLogColors } from '@/components/StarLogSummary'
import styles from './StarLog.module.css'
import CompactListField from '@/components/CompactListField'

export default function StarLogHistory({ castName, casts, revision, onClose, onOpen }: {
  castName?: string; casts: { cast_name: string; display_name?: string | null; cast_tier?: string | null }[]
  revision: number; onClose: () => void; onOpen: (target: StarLogCustomer) => void
}) {
  const [selectedCast, setSelectedCast] = useState(castName || '')
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [state, setState] = useState<{ items: StarHistoryRow[]; total: number; has_more: boolean }>({ items: [], total: 0, has_more: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      setLoading(true); setError('')
      try {
        const params = new URLSearchParams({ view: 'ended', page: String(page), q: query })
        if (selectedCast) params.set('castName', selectedCast)
        const response = await fetch('/api/star-logs?' + params, { cache: 'no-store', signal: controller.signal })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || '終了履歴を取得できませんでした')
        if (!controller.signal.aborted) setState(json)
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '取得失敗') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [selectedCast, query, page, retry, revision])
  return <CustomerCardPreview name={castName || '全キャスト'} title="終了履歴" onClose={onClose} footer={<button type="button" onClick={onClose}>⭐️一覧に戻る</button>}>
    <div className={styles.panel} style={starLogColors}>
      <h2>⭐️を解除したお客様の記録</h2>
      <p className={styles.muted}>個人ページには移動しません。同じお客様でも追いかけの期間ごとに表示します。導入前に解除した⭐️の履歴はありません。</p>
      <form className={styles.archiveFilters} onSubmit={e => { e.preventDefault(); setPage(1); setQuery(input.trim()) }}>
        {!castName && <label>キャスト<CompactListField compact><select aria-label="終了履歴のキャスト" value={selectedCast} onChange={e => { setPage(1); setSelectedCast(e.target.value) }}><option value="">全キャスト</option>{casts.map(c => <option key={c.cast_name} value={c.cast_name}>{c.cast_tier || '未設定'} · {c.display_name || c.cast_name}</option>)}</select></CompactListField></label>}
        <label>お客様名<CompactListField compact><input type="search" value={input} maxLength={100} onChange={e => setInput(e.target.value)} placeholder="お客様名で終了履歴を検索"/></CompactListField></label>
        <button className={styles.secondary}>検索</button>
      </form>
      {loading ? <p role="status">終了履歴を読み込み中…</p> : error ? <p role="alert" className={styles.error}>{error}<button onClick={() => setRetry(v => v + 1)}>再取得</button></p> : <>
        <p>{state.total}期間</p>
        {!state.items.length && <p className={styles.muted}>この条件の終了履歴はありません。</p>}
        <ul className={styles.events}>{state.items.map(cycle => <li key={cycle.id} className={styles.event}>
          <header><strong>{cycle.customer.customer_name || 'お名前未登録'}</strong><span>{cycle.customer.cast_name || '担当未設定'}</span></header>
          <p className={styles.muted}>開始 {cycle.started_on || '未設定'} ／ 終了 {cycle.ended_at ? new Date(cycle.ended_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—'}<br/>最終確認 {cycle.last_checked_on || '未確認'} · {cycle.last_status || '状況未記録'}</p>
          <button type="button" className={styles.secondary} onClick={() => onOpen({ id: String(cycle.customer_id), name: cycle.customer.customer_name || 'お名前未登録', castName: cycle.customer.cast_name, cycleId: cycle.id })}>📝記録を見る</button>
          {cycle.customer.is_starred && <span className={styles.muted}> 現在は別の期間で⭐️付きです</span>}
        </li>)}</ul>
        <nav className={styles.buttons} aria-label="終了履歴のページ"><button className={styles.secondary} disabled={page === 1} onClick={() => setPage(v => v - 1)}>前へ</button><span>{page}ページ</span><button className={styles.secondary} disabled={!state.has_more} onClick={() => setPage(v => v + 1)}>次へ</button></nav>
      </>}
    </div>
  </CustomerCardPreview>
}
