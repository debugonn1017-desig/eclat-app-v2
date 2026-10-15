'use client'
import { useEffect, useRef, useState } from 'react'
import { STAR_LOG_STATUSES, validateStarLog, type StarLogCustomer, type StarLogDetail } from '@/lib/starLog'
import { useJstToday } from '@/hooks/useJstToday'
import CustomerCardPreview from '@/components/CustomerCardPreview'
import { starLogColors } from '@/components/StarLogSummary'
import styles from './StarLog.module.css'

export default function StarLogPanel({ target, onClose, onSaved, onNext, onRestart, onBusyChange }: {
  target: StarLogCustomer; onClose: () => void; onSaved: () => void
  onNext?: () => void; onRestart: () => void; onBusyChange: (busy: boolean) => void
}) {
  const today = useJstToday()
  const [data, setData] = useState<StarLogDetail | null>(null)
  const [startedOn, setStartedOn] = useState('')
  const [checkedOn, setCheckedOn] = useState('')
  const [status, setStatus] = useState<string>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const locked = useRef(false)
  const pending = useRef<{ payload: string; id: string } | null>(null)
  const dirty = useRef(false)
  const loadedCycle = useRef<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const params = new URLSearchParams({ page: String(page) })
        const cycleId = target.cycleId || (page > 1 ? loadedCycle.current : null)
        if (cycleId) params.set('cycleId', cycleId)
        const response = await fetch(`/api/star-logs/${target.id}?${params}`, { cache: 'no-store', signal: controller.signal })
        const json = await response.json() as StarLogDetail & { error?: string }
        if (!response.ok) throw new Error(json.error || '記録を取得できませんでした')
        if (controller.signal.aborted) return
        setData(previous => page > 1 && previous ? { ...json, logs: [...new Map([...previous.logs, ...json.logs].map(log => [log.id, log])).values()] } : json)
        if (page === 1) { loadedCycle.current = json.cycle?.id || null; setStartedOn(json.cycle?.started_on || ''); setStatus(json.cycle?.last_status || '未連絡') }
        setError('')
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '取得失敗') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [target.id, target.cycleId, revision, page])
  const close = () => { if (!locked.current && (!dirty.current || window.confirm('未保存の入力を破棄して閉じますか？'))) onClose() }
  const editable = data?.can_edit && data.customer.is_starred && data.cycle && !data.cycle.ended_at
  async function submit(next = false, restart = false) {
    if (locked.current || !today || !data?.cycle) return
    if (restart && dirty.current && !window.confirm('未保存の入力を破棄して、新しい期間で再開しますか？')) return
    const fields = restart ? { action: 'restart', cycleId: data.restart_cycle_id || data.cycle.id } : {
      cycleId: data.cycle.id, startedOn: startedOn || null, expectedStartedOn: data.cycle.started_on,
      checkedOn: checkedOn || today, status, note,
    }
    const fingerprint = JSON.stringify(fields)
    if (pending.current?.payload !== fingerprint) pending.current = { payload: fingerprint, id: crypto.randomUUID() }
    const body = { ...fields, requestId: pending.current!.id }
    const validation = restart ? null : validateStarLog(body, today)
    if (validation) { setError(validation); return }
    locked.current = true; setBusy(true); onBusyChange(true); setMessage(''); setError('')
    try {
      const response = await fetch(`/api/star-logs/${target.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || '保存できませんでした')
      pending.current = null; dirty.current = false; setNote(''); setMessage('記録を保存しました')
      onSaved()
      if (restart) onRestart()
      else if (next) { if (onNext) onNext(); else onClose() }
      else { setPage(1); setRevision(v => v + 1) }
    } catch (e) { setError(e instanceof Error ? e.message : '保存失敗') }
    finally { locked.current = false; setBusy(false); onBusyChange(false) }
  }
  return <CustomerCardPreview name={target.name} title="⭐️記録" onClose={close} busy={busy} footer={<button type="button" disabled={busy} onClick={close}>一覧に戻る</button>}>
    <div className={styles.panel} style={starLogColors}>
      <h2>{target.name}</h2><p className={styles.muted}>{data?.customer.cast_name || target.castName || '担当未設定'} · ⭐️解除後も記録は終了履歴に残ります。</p>
      {error && <p role="alert" className={styles.error}>{error} <button disabled={busy} onClick={() => { if (!data || !dirty.current || window.confirm('入力を保ったまま最新の開始日・状況を読み直しますか？')) { setLoading(true); setRevision(v => v + 1) } }}>再取得</button></p>}
      {message && <p role="status">{message}</p>}
      {loading && !data ? <p role="status">記録を読み込み中…</p> : data && <>
        {editable ? <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit() }}>
          <div className={styles.dates}>
            <label>追いかけ開始日<input type="date" value={startedOn} max={checkedOn || today || undefined} disabled={busy} onInput={e => { dirty.current = true; setStartedOn(e.currentTarget.value) }} onChange={e => { dirty.current = true; setStartedOn(e.target.value) }}/></label>
            <label>状況確認日<input type="date" required value={checkedOn || today || ''} max={today || undefined} min={startedOn || undefined} disabled={busy} onInput={e => { dirty.current = true; setCheckedOn(e.currentTarget.value) }} onChange={e => { dirty.current = true; setCheckedOn(e.target.value) }}/></label>
          </div>
          {!data.cycle?.started_on && <span className={styles.muted}>以前からの⭐️は開始日不明のため未設定です。分かる日付を入力できます。</span>}
          <div role="group" aria-label="確認した状況" className={styles.options}>{STAR_LOG_STATUSES.map(option => <button type="button" key={option} aria-pressed={status === option} disabled={busy} onClick={() => { dirty.current = true; setStatus(option) }}>{option}</button>)}</div>
          <label>自由メモ<textarea value={note} maxLength={2000} disabled={busy} placeholder="返信内容、確認したこと、次回の対応など" onChange={e => { dirty.current = true; setNote(e.target.value) }}/></label>
          <span className={styles.muted}>{note.length}/2000文字 · 確認を保存しても最終連絡日は変更しません。</span>
          <div className={styles.buttons}><button className={styles.save} disabled={busy || !today || !status}>{busy ? '保存中…' : '記録を保存'}</button><button className={styles.secondary} type="button" disabled={busy || !today || !status} onClick={() => void submit(true)}>{onNext ? '保存して次へ' : '保存して閉じる'}</button></div>
        </form> : <p>{data.cycle?.ended_at ? `終了：${new Date(data.cycle.ended_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })} · この期間の記録は閲覧のみです。` : data.can_edit ? '⭐️の状態を確認して開き直してください。' : '記録の閲覧のみ可能です。'}</p>}
        {!editable && note && <label>未保存の自由メモ<textarea readOnly value={note}/><span className={styles.muted}>この入力はまだ保存されていません。コピーして残せます。</span></label>}
        {data.cycle?.ended_at && data.customer.is_starred && <button type="button" className={styles.secondary} onClick={() => { if (!dirty.current || window.confirm('未保存の入力を破棄して現在の記録へ切り替えますか？')) onRestart() }}>現在の⭐️の記録を見る</button>}
        {data.can_edit && data.cycle?.ended_at && !data.customer.is_starred && <button className={styles.save} type="button" disabled={busy || !today} onClick={() => void submit(false, true)}>⭐️を付けて新しい期間で再開</button>}
        <h3 style={{ fontSize: 12, marginTop: 18 }}>この期間の履歴</h3>
        {data.cycle && <p className={styles.muted}>開始日：{data.cycle.started_on || '未設定'} ／ 最終確認：{data.cycle.last_checked_on || '未確認'}</p>}
        {!data.logs.length && <p className={styles.muted}>確認記録はまだありません。記録は導入後の操作から残ります。</p>}
        <ol className={styles.events}>{data.logs.map(log => <li key={log.id} className={styles.event}>
          <header><strong>{log.kind === 'check' ? log.status : log.kind === 'started' ? '追いかけ開始' : log.kind === 'ended' ? '⭐️解除・追いかけ終了' : `開始日を設定：${log.started_on}`}</strong><time>{log.event_on}</time></header>
          {log.note && <p className={styles.note}>{log.note}</p>}
          <span className={styles.muted}>{log.actor_name || '記録者未設定'} · 記録日時 {new Date(log.recorded_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>
        </li>)}</ol>
        {data.has_more && <button type="button" disabled={busy || loading} className={styles.secondary} onClick={() => { setLoading(true); setPage(v => v + 1) }}>以前の記録を読む</button>}
      </>}
    </div>
  </CustomerCardPreview>
}
