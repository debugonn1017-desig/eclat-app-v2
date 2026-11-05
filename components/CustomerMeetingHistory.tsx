'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCustomerMeetingHistory } from '@/hooks/useCustomerMeeting'
import { latestMeetingRecords, type CustomerMeetingRecord, type CustomerMeetingRow } from '@/lib/customerMeeting'
import CustomerMeetingEditor from './CustomerMeetingEditor'
import { customerMeetingColors, meetingDate, meetingMoney, meetingSavedAt } from './CustomerMeetingTheme'
import styles from './CustomerMeetingHistory.module.css'

export function CustomerMeetingRecordCard({ record, onEdit, editingDisabled = false }: {
  record: CustomerMeetingRecord
  onEdit?: () => void
  editingDisabled?: boolean
}) {
  const value = record.values
  const pairs = [
    ['優先度', value.priority], ['IN', value.in_time], ['OUT', value.out_time], ['卓番', value.table_number],
    ['人数', value.party_size == null ? '' : `${value.party_size}名`], ['本指名', value.honshimei], ['場内・担当', record.customer_snapshot.cast_name], ['来店経緯', value.nomination_route],
    ['アフターの有無', record.has_after ? 'あり' : 'なし'], ['アフター場所', value.after_place], ['アフター同席キャスト', value.after_casts], ['追いかけ期間', value.follow_period],
  ]
  return <article className={styles.card} data-meeting-record-id={record.id} data-meeting-visit-id={record.visit_id}>
    <div className={styles.cardHeading}><div><h4>{meetingDate(record.visit_date)} 来店分 · 会議記録</h4><p>{meetingSavedAt(record.created_at)} 保存 ／ {record.actor_name || '記録者未設定'}</p></div>
      <div className={styles.cardActions}><span>会議ログ</span>{onEdit && <button type="button" disabled={editingDisabled} onClick={onEdit} aria-label={`${meetingDate(record.visit_date)}来店分を一括編集`}>一括編集</button>}</div>
    </div>
    <dl className={styles.fields}>{pairs.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text || '未入力'}</dd></div>)}</dl>
    <section className={styles.prose}><h5>次回につながる情報</h5><p>{value.next_info || '未入力'}</p></section>
    <section className={styles.prose}><h5>営業連絡内容</h5><p>{value.contact_content || '未入力'}</p></section>
    <div className={styles.flags}>{(['thank_you', 'rally', 'action'] as const).map((key, index) => <span key={key} data-done={value[key]}>{['お礼', 'ラリー', 'アクション'][index]} {value[key] ? '☑ 済' : '☐ 未'}</span>)}<span data-done={value.repeat}>リピート {value.repeat ? '☑ あり' : '☐ なし'}</span></div>
    <p className={styles.finance}>会議用の記録：金額 {meetingMoney(value.meeting_amount)} ／ 客単価 {meetingMoney(value.meeting_unit_price)} · 売上集計への反映なし</p>
  </article>
}

function History({ customerId, defaultOpen = true, revision, onBusyChange, onOpenCustomer, disabled = false }: {
  customerId: string
  defaultOpen?: boolean
  revision?: string | number
  onBusyChange?: (busy: boolean) => void
  onOpenCustomer?: (customerId: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [editing, setEditing] = useState<CustomerMeetingRow | null>(null)
  const [notice, setNotice] = useState('')
  const [newVisitId, setNewVisitId] = useState('')
  const history = useCustomerMeetingHistory(customerId, { enabled: open || !!editing })
  const reload = history.reload
  const busy = !!editing || history.saving
  const latest = useMemo(() => latestMeetingRecords(history.records), [history.records])
  const visits = useMemo(() => [...latest.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.revision - a.revision), [latest])
  const rowByVisit = new Map(history.rows.map(row => [String(row.visit.id), row]))
  const newVisits = history.rows.filter(row => row.canEdit && !row.record).sort((a, b) => b.visit.visit_date.localeCompare(a.visit.visit_date) || (b.visit.visit_time || '').localeCompare(a.visit.visit_time || '') || String(b.visit.id).localeCompare(String(a.visit.id), undefined, { numeric: true }))
  const newVisit = newVisits.find(row => String(row.visit.id) === newVisitId) || newVisits[0]
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false) }, [busy, onBusyChange])
  useEffect(() => { if (revision !== undefined) reload() }, [revision, reload])
  const showRecord = (record: CustomerMeetingRecord) => {
    const row = rowByVisit.get(record.visit_id)
    const canEdit = history.ready && history.canEdit && row?.canEdit && row.record?.id === record.id && row.record.revision === record.revision
    const previous = history.records.filter(item => item.visit_id === record.visit_id && item.id !== record.id).sort((a, b) => b.revision - a.revision)
    return <div key={record.visit_id} className={styles.visit}>
      <CustomerMeetingRecordCard record={record} editingDisabled={busy || disabled} onEdit={canEdit ? () => setEditing(row) : undefined}/>
      {previous.length > 0 && <details className={styles.previous}><summary>この来店分の保存履歴 {previous.length}件</summary>{previous.map(item => <CustomerMeetingRecordCard key={item.id} record={item}/>)}</details>}
    </div>
  }
  return <section style={customerMeetingColors} className={styles.root} data-customer-meeting-history={customerId} data-block-tab-swipe="true">
    <details open={open} onToggle={event => {
      const next = event.currentTarget.open
      if (busy && !next) { event.currentTarget.open = true; return }
      setOpen(next)
    }}>
      <summary className={styles.summary}><span>会議ログ・編集 {history.ready && <small>{visits.length}来店分</small>}</span><span aria-hidden>⌄</span></summary>
      {open && <div className={styles.body}>
        <div className={styles.tools}><span>来店ごとの記録 · お客様ページのメモ履歴と共通</span><div><button type="button" disabled={busy || disabled || history.loading} onClick={history.reload}>再取得</button>{onOpenCustomer && <button type="button" disabled={busy || disabled} onClick={() => onOpenCustomer(customerId)}>お客様ページへ ›</button>}</div></div>
        {history.ready && history.canEdit && newVisit && <div className={styles.create}>
          <label>記録をつける来店<select aria-label="会議記録を新しくつける来店" value={String(newVisit.visit.id)} disabled={busy || disabled} onChange={event => setNewVisitId(event.target.value)}>{newVisits.map(row => <option key={String(row.visit.id)} value={String(row.visit.id)}>{meetingDate(row.visit.visit_date)} · IN {row.visit.visit_time?.slice(0, 5) || '未設定'} · 卓 {row.visit.table_number || '未設定'}</option>)}</select></label>
          <button type="button" disabled={busy || disabled} onClick={() => setEditing({ ...newVisit, values: { ...newVisit.values } })}>この来店分を一括編集</button>
        </div>}
        {!history.ready && !history.error && <p role="status" className={styles.message}>会議ログを読み込み中…</p>}
        {history.error && <div className={styles.error} role="alert"><p>{history.error}</p><button type="button" disabled={busy} onClick={history.reload}>再取得</button></div>}
        {notice && <p role="status" className={styles.notice}>{notice}</p>}
        {history.ready && !visits.length && <p role="status" className={styles.message}>会議ログはまだありません</p>}
        {visits.slice(0, 3).map(showRecord)}
        {visits.length > 3 && <details className={styles.older}><summary>以前の来店分 {visits.length - 3}件</summary>{visits.slice(3).map(showRecord)}</details>}
      </div>}
    </details>
    {editing && <CustomerMeetingEditor key={`${editing.visit.id}:${editing.record?.revision ?? 0}`} row={editing} save={history.save} saving={history.saving} onClose={() => setEditing(null)} onSaved={() => {
      setEditing(null)
      setNotice('会議記録を保存し、このお客様の基本情報のメモ履歴へ反映しました')
    }}/>}
  </section>
}

export default function CustomerMeetingHistory(props: {
  customerId: string
  defaultOpen?: boolean
  revision?: string | number
  onBusyChange?: (busy: boolean) => void
  onOpenCustomer?: (customerId: string) => void
  disabled?: boolean
}) {
  return <History key={props.customerId} {...props}/>
}
