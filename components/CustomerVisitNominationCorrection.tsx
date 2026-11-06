'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CustomerVisit, NominationStatus } from '@/types'
import { C } from '@/lib/colors'
import type { VisitNominationCorrectionInput, VisitNominationCorrectionHistory } from '@/lib/visitNominationCorrection'

export const nominationCorrectionImpact = '売上金額・来店日は変えず、本指名／場内の本数・坊主判定・⭐️の表示対象へ反映します。'
const statuses: NominationStatus[] = ['フリー', '場内', '本指名']
const buttonStyle: CSSProperties = { minHeight: 40, padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, color: C.dark, background: C.white, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }
const dateLabel = (date: string) => date.replaceAll('-', '/')
const savedAt = (value: string) => new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function CustomerVisitNominationCorrection({ customerId, visit, history, canEdit, open, disabled = false, onOpenChange, onSave, onSaved }: {
  customerId: string
  visit: CustomerVisit
  history: VisitNominationCorrectionHistory[]
  canEdit: boolean
  open: boolean
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: VisitNominationCorrectionInput) => Promise<CustomerVisit | null>
  onSaved: (visit: CustomerVisit) => void
}) {
  const [nextStatus, setNextStatus] = useState<NominationStatus>(visit.nomination_status_at_visit || '本指名')
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef('')
  const lock = useRef(false)
  const original = useRef(visit)
  const busy = saving || disabled
  const begin = () => {
    if (busy) return
    original.current = visit
    setNextStatus(visit.nomination_status_at_visit === '本指名' ? '場内' : '本指名')
    setConfirmed(false); setError(''); requestId.current = crypto.randomUUID()
    onOpenChange(true)
  }
  useEffect(() => { if (!open) lock.current = false }, [open])
  const save = async () => {
    if (lock.current || busy || !confirmed || nextStatus === original.current.nomination_status_at_visit) return
    lock.current = true; setSaving(true); setError('')
    try {
      const updated = await onSave({
        customerId, visitId: String(original.current.id), expectedVisitDate: original.current.visit_date,
        expectedStatus: original.current.nomination_status_at_visit ?? null,
        expectedRevision: original.current.nomination_revision ?? 0,
        newStatus: nextStatus, requestId: requestId.current,
      })
      if (!updated) { setError('訂正を保存できませんでした。入力内容は残しています。別の端末で変更された場合は、キャンセルして最新の来店記録を開き直してください。'); return }
      onSaved(updated); onOpenChange(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '訂正を保存できませんでした。入力内容は残しています。')
    } finally { lock.current = false; setSaving(false) }
  }
  if (visit.is_planned) return null
  return <section data-visit-nomination={String(visit.id)} data-block-tab-swipe="true" style={{ marginTop: 10, fontSize: 12, color: C.dark }}>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <span>来店時の指名 <strong>{visit.nomination_status_at_visit || '未記録'}</strong></span>
      {canEdit && !open && <button type="button" disabled={disabled} onClick={begin} style={buttonStyle} aria-label={`${dateLabel(visit.visit_date)}の指名区分を訂正`}>指名区分を訂正</button>}
    </div>
    {open && <div aria-label={`${dateLabel(visit.visit_date)}の指名区分訂正`} style={{ marginTop: 10, padding: 12, border: `1px solid ${C.pink}`, borderRadius: 10, background: C.white, display: 'grid', gap: 10 }}>
      <strong>{dateLabel(original.current.visit_date)}{original.current.visit_time ? ` ${original.current.visit_time.slice(0, 5)}` : ''} の来店だけを訂正</strong>
      <label style={{ display: 'grid', gap: 6 }}>正しい指名区分
        <select aria-label="正しい指名区分" disabled={busy} value={nextStatus} onChange={event => { setNextStatus(event.target.value as NominationStatus); setConfirmed(false); requestId.current = crypto.randomUUID() }} style={{ width: '100%', minHeight: 42, boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', background: C.white, color: C.dark, fontSize: 16, fontFamily: 'inherit' }}>
          {statuses.map(status => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
      <p style={{ margin: 0, lineHeight: 1.6 }}>{nominationCorrectionImpact}</p>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.6 }}>
        <input type="checkbox" disabled={busy || nextStatus === original.current.nomination_status_at_visit} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}/>
        <span>{dateLabel(original.current.visit_date)}の来店を <strong>{original.current.nomination_status_at_visit || '未記録'} → {nextStatus}</strong> に訂正する</span>
      </label>
      {error && <p role="alert" style={{ color: C.danger, margin: 0, lineHeight: 1.6 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={busy || !confirmed || nextStatus === original.current.nomination_status_at_visit} style={{ ...buttonStyle, color: C.white, background: C.pink, borderColor: C.pink, opacity: busy || !confirmed ? .6 : 1 }}>{saving ? '訂正を保存中…' : 'この来店の訂正を保存'}</button>
        <button type="button" onClick={() => onOpenChange(false)} disabled={busy} style={buttonStyle}>キャンセル</button>
      </div>
    </div>}
    {history.length > 0 && <details style={{ marginTop: 8, lineHeight: 1.6 }}>
      <summary style={{ cursor: 'pointer', color: C.pinkMuted }}>指名区分の訂正履歴 {history.length}件</summary>
      <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>{history.map(entry => <li key={entry.id} style={{ marginTop: 6 }}>
        <strong>{entry.old_status || '未記録'} → {entry.new_status}</strong><br/>
        {savedAt(entry.created_at)} ／ {entry.actor_name || '記録者未設定'}
      </li>)}</ol>
    </details>}
  </section>
}
