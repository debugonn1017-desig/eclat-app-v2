'use client'
import { useEffect, useRef, useState } from 'react'
import { STAR_LOG_STATUSES, validateStarLog, validateStarLogMutation, type StarLogCustomer, type StarLogDetail, type StarLogEvent } from '@/lib/starLog'
import { useJstToday } from '@/hooks/useJstToday'
import CustomerCardPreview from '@/components/CustomerCardPreview'
import { StarCheckedBadge, starLogColors } from '@/components/StarLogSummary'
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
  const [showDeleted, setShowDeleted] = useState(false)
  const [editing, setEditing] = useState<{ log: StarLogEvent; day: string; status: string; note: string } | null>(null)
  const locked = useRef(false)
  const pending = useRef<{ payload: string; id: string } | null>(null)
  const dirty = useRef(false)
  const loadedCycle = useRef<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const params = new URLSearchParams({ page: String(page) })
        // 再取得中に他の人が⭐️を再開しても、編集中の期間・入力を別期間へ切り替えない。
        const cycleId = target.cycleId || loadedCycle.current
        if (cycleId) params.set('cycleId', cycleId)
        if (showDeleted) params.set('includeDeleted', 'true')
        const response = await fetch(`/api/star-logs/${target.id}?${params}`, { cache: 'no-store', signal: controller.signal })
        const json = await response.json() as StarLogDetail & { error?: string }
        if (!response.ok) throw new Error(json.error || '記録を取得できませんでした')
        if (controller.signal.aborted) return
        setData(previous => page > 1 && previous ? { ...json, logs: [...new Map([...previous.logs, ...json.logs].map(log => [log.id, log])).values()] } : json)
        if (page === 1) {
          loadedCycle.current = json.cycle?.id || null
          if (!dirty.current) { setStartedOn(json.cycle?.started_on || ''); setStatus(json.cycle?.last_status || '未連絡') }
        }
        setError('')
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '取得失敗') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [target.id, target.cycleId, revision, page, showDeleted])
  const close = () => { if (!locked.current && (!dirty.current || window.confirm('未保存の入力を破棄して閉じますか？'))) onClose() }
  const editable = data?.can_edit && data.customer.is_starred && data.cycle && !data.cycle.ended_at
  function beginEdit(log: StarLogEvent) {
    if (locked.current || (dirty.current && !window.confirm('未保存の入力を破棄して、この記録を編集しますか？'))) return
    dirty.current = false; pending.current = null; setNote(''); setCheckedOn(''); setStartedOn(data?.cycle?.started_on || ''); setStatus(data?.cycle?.last_status || '未連絡'); setError(''); setMessage('')
    setEditing({ log, day: log.event_on, status: log.status || '未連絡', note: log.note || '' })
  }
  function cancelEdit() {
    if (locked.current || (dirty.current && !window.confirm('編集内容を破棄しますか？'))) return
    dirty.current = false; pending.current = null; setEditing(null); setError('')
  }
  async function mutate(log: StarLogEvent, action: 'edit' | 'delete' | 'restore') {
    if (locked.current || loading || !today || !data?.can_edit) return
    if (action === 'delete' && !window.confirm('この確認ログを削除しますか？「削除済みも表示」から復元できます。' + (dirty.current ? '\n未保存の入力は、削除が成功すると破棄されます。' : ''))) return
    if (action === 'restore' && dirty.current && !window.confirm('復元が成功すると未保存の入力を破棄します。よろしいですか？')) return
    if (action === 'edit' && (!editing || editing.log.id !== log.id)) return
    const fields = { action, logId: log.id, expectedRevision: log.revision ?? 0,
      ...(action === 'edit' && editing ? { checkedOn: editing.day, status: editing.status, note: editing.note } : {}) }
    const fingerprint = JSON.stringify(fields)
    if (pending.current?.payload !== fingerprint) pending.current = { payload: fingerprint, id: crypto.randomUUID() }
    const body = { ...fields, requestId: pending.current!.id }
    const validation = validateStarLogMutation(body, today)
    if (validation) { setError(validation); return }
    if (action === 'edit' && editing && data.cycle?.started_on && editing.day < data.cycle.started_on) { setError('確認日は追いかけ開始日以降にしてください'); return }
    locked.current = true; setBusy(true); onBusyChange(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/star-logs/${target.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || '記録を変更できませんでした')
      pending.current = null; dirty.current = false; setEditing(null); setNote(''); setCheckedOn('')
      setMessage(action === 'edit' ? '記録を修正しました' : action === 'delete' ? '記録を削除しました。「削除済みも表示」から復元できます。' : '記録を復元しました')
      onSaved(); setLoading(true); setPage(1); setRevision(v => v + 1)
    } catch (e) { setError(e instanceof Error ? e.message : '変更失敗') }
    finally { locked.current = false; setBusy(false); onBusyChange(false) }
  }
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
      if (restart) { loadedCycle.current = null; setLoading(true); setPage(1); setRevision(v => v + 1); onRestart() }
      else if (next) { if (onNext) onNext(); else onClose() }
      else { setPage(1); setRevision(v => v + 1) }
    } catch (e) { setError(e instanceof Error ? e.message : '保存失敗') }
    finally { locked.current = false; setBusy(false); onBusyChange(false) }
  }
  return <CustomerCardPreview name={target.name} title="⭐️記録" onClose={close} busy={busy} footer={<button type="button" disabled={busy} onClick={close}>一覧に戻る</button>}>
    <div className={styles.panel} style={starLogColors}>
      <h2>{target.name}</h2><p className={styles.muted}>{data?.customer.cast_name || target.castName || '担当未設定'} · ⭐️解除後も記録は終了履歴に残ります。</p>
      <StarCheckedBadge cycle={data?.cycle} today={today}/>
      {error && <p role="alert" className={styles.error}>{error} <button disabled={busy} onClick={() => { if (!data || !dirty.current || window.confirm('入力を保ったまま最新の開始日・状況を読み直しますか？')) { setLoading(true); setRevision(v => v + 1) } }}>再取得</button></p>}
      {message && <p role="status">{message}</p>}
      {loading && !data ? <p role="status">記録を読み込み中…</p> : data && <>
        {editable && !editing ? <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit() }}>
          <div className={styles.dates}>
            <label>追いかけ開始日<input type="date" value={startedOn} max={checkedOn || today || undefined} disabled={busy} onInput={e => { dirty.current = true; setStartedOn(e.currentTarget.value) }} onChange={e => { dirty.current = true; setStartedOn(e.target.value) }}/></label>
            <label>状況確認日<input type="date" required value={checkedOn || today || ''} max={today || undefined} min={startedOn || undefined} disabled={busy} onInput={e => { dirty.current = true; setCheckedOn(e.currentTarget.value) }} onChange={e => { dirty.current = true; setCheckedOn(e.target.value) }}/></label>
          </div>
          {!data.cycle?.started_on && <span className={styles.muted}>以前からの⭐️は開始日不明のため未設定です。分かる日付を入力できます。</span>}
          <div role="group" aria-label="確認した状況" className={styles.options}>{STAR_LOG_STATUSES.map(option => <button type="button" key={option} aria-pressed={status === option} disabled={busy} onClick={() => { dirty.current = true; setStatus(option) }}>{option}</button>)}</div>
          <label>自由メモ<textarea value={note} maxLength={2000} disabled={busy} placeholder="返信内容、確認したこと、次回の対応など" onChange={e => { dirty.current = true; setNote(e.target.value) }}/></label>
          <span className={styles.muted}>{note.length}/2000文字 · 確認を保存しても最終連絡日は変更しません。</span>
          <div className={styles.buttons}><button className={styles.save} disabled={busy || !today || !status}>{busy ? '保存中…' : '記録を保存'}</button><button className={styles.secondary} type="button" disabled={busy || !today || !status} onClick={() => void submit(true)}>{onNext ? '保存して次へ' : '保存して閉じる'}</button></div>
        </form> : <p>{editing ? '履歴の確認ログを編集中です。日付・状況・自由メモを修正できます。' : data.cycle?.ended_at ? `終了：${new Date(data.cycle.ended_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })} · この期間への追記はできません。${data.can_edit ? '確認ログの訂正・削除はできます。' : '閲覧のみ可能です。'}` : data.can_edit ? '⭐️の状態を確認して開き直してください。' : '記録の閲覧のみ可能です。'}</p>}
        {!editable && note && <label>未保存の自由メモ<textarea readOnly value={note}/><span className={styles.muted}>この入力はまだ保存されていません。コピーして残せます。</span></label>}
        {data.cycle?.ended_at && data.customer.is_starred && <button type="button" className={styles.secondary} onClick={() => { if (!dirty.current || window.confirm('未保存の入力を破棄して現在の記録へ切り替えますか？')) onRestart() }}>現在の⭐️の記録を見る</button>}
        {data.can_edit && data.cycle?.ended_at && !data.customer.is_starred && <button className={styles.save} type="button" disabled={busy || !!editing || !today} onClick={() => void submit(false, true)}>⭐️を付けて新しい期間で再開</button>}
        <h3 style={{ fontSize: 12, marginTop: 18 }}>この期間の履歴</h3>
        {data.cycle && <p className={styles.muted}>開始日：{data.cycle.started_on || '未設定'} ／ 最終確認：{data.cycle.last_checked_on || '未確認'}</p>}
        {data.can_edit && <label className={styles.deletedToggle}><input type="checkbox" checked={showDeleted} disabled={busy || !!editing || loading} onChange={event => { if (!dirty.current || window.confirm('未保存の入力を破棄して、表示を切り替えますか？')) { dirty.current = false; setNote(''); setCheckedOn(''); setLoading(true); setPage(1); setShowDeleted(event.target.checked) } }}/>削除済みも表示（復元できます）</label>}
        {!data.logs.length && <p className={styles.muted}>確認記録はまだありません。記録は導入後の操作から残ります。</p>}
        <ol className={styles.events}>{data.logs.map(log => <li key={log.id} className={`${styles.event} ${log.deleted_at ? styles.deletedEvent : ''}`}>
          {log.deleted_at && <span className={styles.deletedLabel}>削除済み · {log.deleted_by_name || '確認者未設定'} · {new Date(log.deleted_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>}
          <header><strong>{log.kind === 'check' ? log.status : log.kind === 'started' ? '追いかけ開始' : log.kind === 'ended' ? '⭐️解除・追いかけ終了' : `開始日を設定：${log.started_on}`}</strong><time>{log.event_on}</time></header>
          {log.note && <p className={styles.note}>{log.note}</p>}
          <span className={styles.muted}>{log.actor_name || '記録者未設定'} · 記録日時 {new Date(log.recorded_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>
          {log.edited_at && <div className={styles.muted}>修正：{log.edited_by_name || '確認者未設定'} · {new Date(log.edited_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</div>}
          {data.can_edit && log.kind === 'check' && (editing?.log.id === log.id ? <form className={styles.form} onSubmit={event => { event.preventDefault(); void mutate(editing.log, 'edit') }}>
            <label>編集する確認日<input type="date" required value={editing.day} min={data.cycle?.started_on || undefined} max={today || undefined} disabled={busy} onInput={event => { dirty.current = true; setEditing({ ...editing, day: event.currentTarget.value }) }} onChange={event => { dirty.current = true; setEditing({ ...editing, day: event.target.value }) }}/></label>
            <label>編集する状況<select value={editing.status} disabled={busy} onChange={event => { dirty.current = true; setEditing({ ...editing, status: event.target.value }) }}>{STAR_LOG_STATUSES.map(value => <option key={value}>{value}</option>)}</select></label>
            <label>編集する自由メモ<textarea value={editing.note} maxLength={2000} disabled={busy} onChange={event => { dirty.current = true; setEditing({ ...editing, note: event.target.value }) }}/></label>
            <span className={styles.muted}>{editing.note.length}/2000文字 · 元の記録者・記録日時は残ります。</span>
            <div className={styles.buttons}><button className={styles.save} disabled={busy || loading || !today}>修正を保存</button><button type="button" className={styles.secondary} disabled={busy} onClick={cancelEdit}>編集をやめる</button></div>
          </form> : <div className={styles.eventActions}>
            {log.deleted_at ? <button type="button" className={styles.secondary} disabled={busy || loading || !!editing || !today} aria-label={`${log.event_on}の記録を復元`} onClick={() => void mutate(log, 'restore')}>復元</button> : <>
              <button type="button" className={styles.secondary} disabled={busy || loading || !!editing} aria-label={`${log.event_on}の記録を編集`} onClick={() => beginEdit(log)}>編集</button>
              <button type="button" className={`${styles.secondary} ${styles.danger}`} disabled={busy || loading || !!editing || !today} aria-label={`${log.event_on}の記録を削除`} onClick={() => void mutate(log, 'delete')}>削除</button>
            </>}
          </div>)}
        </li>)}</ol>
        {data.has_more && <button type="button" disabled={busy || loading} className={styles.secondary} onClick={() => { setLoading(true); setPage(v => v + 1) }}>以前の記録を読む</button>}
      </>}
    </div>
  </CustomerCardPreview>
}
