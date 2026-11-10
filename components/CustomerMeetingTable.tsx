'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useCustomerMeetingList } from '@/hooks/useCustomerMeeting'
import type { CustomerMeetingRecord, CustomerMeetingRow, CustomerMeetingValues } from '@/lib/customerMeeting'
import CustomerMeetingDialog from './CustomerMeetingDialog'
import CustomerMeetingEditor from './CustomerMeetingEditor'
import CustomerMeetingHistory from './CustomerMeetingHistory'
import { customerMeetingColors, meetingDate, meetingMoney } from './CustomerMeetingTheme'
import styles from './CustomerMeetingTable.module.css'

const nameOf = (row: CustomerMeetingRow) => row.customer.customer_name || row.customer.nickname || 'お名前未登録'
const categoryOf = (row: CustomerMeetingRow) => {
  const region = row.customer.region?.trim()
  if (row.customer.nomination_status === '本指名') return !region ? '本指名・地域未設定' : region === '福岡県' ? '県内顧客' : '県外顧客'
  return region === '福岡県' ? '県内場内' : '県外場内'
}
const flags = [{ key: 'thank_you', label: 'お礼' }, { key: 'rally', label: 'ラリー' }, { key: 'action', label: 'アクション' }, { key: 'repeat', label: 'リピート' }] as const
const columnWidths = [82, 58, 52, 52, 46, 44, 136, 66, 64, 112, 92, 88, 72, 72, 112, 66, 88, 88, 44, 262, 262, 92, 72, 72, 72, 72]

export default function CustomerMeetingTable({ date, castName, revision, onBusyChange, onOpenCustomer }: {
  date: string
  castName?: string
  revision?: number
  onBusyChange?: (busy: boolean) => void
  onOpenCustomer?: (customerId: string) => void
}) {
  const meetings = useCustomerMeetingList({ date, castName })
  const reload = meetings.reload
  const scope = JSON.stringify([date, castName || ''])
  const [editing, setEditing] = useState<CustomerMeetingRow | null>(null)
  const [historyCustomer, setHistoryCustomer] = useState<{ id: string; name: string } | null>(null)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [error, setError] = useState<{ scope: string; message: string } | null>(null)
  const [notice, setNotice] = useState<{ scope: string; customerId: string; name: string } | null>(null)
  const currentError = error?.scope === scope ? error.message : ''
  const currentNotice = notice?.scope === scope ? notice : null
  const [localRecords, setLocalRecords] = useState<Record<string, CustomerMeetingRecord>>({})
  const [pending, setPending] = useState<{ visitId: string; values: CustomerMeetingValues } | null>(null)
  const quickLock = useRef(false)
  const quickRequest = useRef<{ key: string; id: string } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const busy = !!editing || !!historyCustomer || meetings.saving || !!pending
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false) }, [busy, onBusyChange])
  useEffect(() => { if (revision !== undefined) reload() }, [revision, reload])
  const rows = useMemo(() => meetings.rows.map(row => {
    const saved = localRecords[String(row.visit.id)]
    return saved && saved.customer_id === String(row.customer.id) && saved.visit_date === row.visit.visit_date && saved.revision > (row.record?.revision ?? 0)
      ? { ...row, record: saved, values: saved.values }
      : row
  }), [meetings.rows, localRecords])
  const saveNotice = (row: CustomerMeetingRow, record: CustomerMeetingRecord) => {
    setLocalRecords(previous => ({ ...previous, [String(record.visit_id)]: record }))
    setNotice({ scope, customerId: String(row.customer.id), name: nameOf(row) })
    setError(null)
  }
  const quickSave = async (row: CustomerMeetingRow, key: typeof flags[number]['key'], checked: boolean) => {
    if (quickLock.current || !meetings.ready || !meetings.canEdit || !row.canEdit || busy) return
    const values = { ...row.values, [key]: checked }
    const inputKey = JSON.stringify([row.customer.id, row.visit.id, row.visit.visit_date, row.record?.revision ?? 0, values])
    if (quickRequest.current?.key !== inputKey) quickRequest.current = { key: inputKey, id: crypto.randomUUID() }
    quickLock.current = true
    setPending({ visitId: String(row.visit.id), values })
    setError(null)
    try {
      const record = await meetings.save({ customerId: String(row.customer.id), visitId: String(row.visit.id), expectedVisitDate: row.visit.visit_date, expectedRevision: row.record?.revision ?? 0, requestId: quickRequest.current.id, values })
      saveNotice(row, record)
    } catch (failure) {
      setError({ scope, message: failure instanceof Error ? failure.message : '対応状況を保存できませんでした。チェックは保存前の状態に戻しています' })
    } finally {
      quickLock.current = false
      setPending(null)
    }
  }
  const openHistory = (row: CustomerMeetingRow) => setHistoryCustomer({ id: String(row.customer.id), name: nameOf(row) })
  const openEditor = (row: CustomerMeetingRow) => { if (meetings.ready && meetings.canEdit && row.canEdit && !busy) setEditing({ ...row, values: { ...row.values } }) }
  const textCell = (row: CustomerMeetingRow, key: 'next_info' | 'contact_content') => {
    const text = row.values[key]
    const canEdit = meetings.ready && meetings.canEdit && row.canEdit
    return <td className={styles.proseCell}><div><p>{text.length > 240 ? `${text.slice(0, 240)}…` : text || '未入力'}</p><button type="button" disabled={busy || (!canEdit && !row.record)} onClick={() => canEdit ? openEditor(row) : openHistory(row)} aria-label={`${nameOf(row)}の${key === 'next_info' ? '次回につながる情報' : '営業連絡内容'}を${canEdit ? '編集' : '確認'}`}>{canEdit ? text.length > 240 ? '全文・編集' : '編集' : '全文を確認'}</button></div></td>
  }
  const summary = [
    ['案件数', rows.length], ['最優先・高', rows.filter(row => row.values.priority === '高').length],
    ['次回情報 入力済み', rows.filter(row => row.values.next_info.trim()).length], ['営業連絡 入力済み', rows.filter(row => row.values.contact_content.trim()).length], ['アフターあり', rows.filter(row => row.visit.has_after).length],
  ]
  const jump = (side: 'left' | 'right') => {
    const element = scroller.current
    if (element) element.scrollTo({ left: side === 'left' ? 0 : element.scrollWidth - element.clientWidth, behavior: 'smooth' })
  }

  return <section className={styles.root} style={customerMeetingColors} data-customer-meeting-table data-block-tab-swipe="true">
    <header className={styles.title}><div><small>⭐️ 本日確認 ／ 会議モード</small><h2>日別営業計画ミーティング</h2></div><span>{flags.map(flag => `${flag.label} ${meetings.ready ? rows.filter(row => row.values[flag.key]).length : '—'}`).join(' · ')}</span></header>
    <div className={styles.summary}><div className={styles.date}><small>来店日 · ⭐️のお客様</small><b>{meetingDate(date)}</b></div>{summary.map(([label, count], index) => <div key={label} data-meeting-stat={index}><small>{label}</small><strong>{meetings.ready ? count : '—'}<span>件</span></strong></div>)}</div>
    <div className={styles.toolbar}><span>{castName ? `${castName}担当 · ` : ''}場内・本指名（県内・県外）</span><div><button type="button" onClick={() => jump('left')}>お客様情報</button><span aria-hidden>↔</span><button type="button" onClick={() => jump('right')}>共有・次の行動へ →</button></div></div>
    <div className={styles.sync}><div><b>保存先：お客様ページ → 基本情報 → メモ履歴（自動）</b><small>表は左右にスクロールできます ／ No.欄から一括編集 ／ チェックは自動保存</small></div><button type="button" disabled={meetings.loading || busy} onClick={meetings.reload}>再取得</button></div>
    {(meetings.error || currentError) && <div role="alert" className={styles.error}><p>{meetings.error || currentError}</p>{meetings.error && <button type="button" disabled={busy} onClick={meetings.reload}>再取得</button>}</div>}
    {currentNotice && <p className={styles.notice} role="status">{currentNotice.name}の会議記録を保存し、基本情報のメモ履歴へ反映しました。 <button type="button" disabled={busy} onClick={() => onOpenCustomer ? onOpenCustomer(currentNotice.customerId) : setHistoryCustomer({ id: currentNotice.customerId, name: currentNotice.name })}>{onOpenCustomer ? 'メモ履歴を確認 ›' : '会議ログを確認 ›'}</button></p>}
    {!meetings.ready && !meetings.error && <p role="status" className={styles.message}>会議の来店情報を読み込み中…</p>}
    <div className={styles.scroller} ref={scroller} data-customer-scroll aria-label="会議表・横スクロール">
      <table className={styles.table} aria-label="日別営業計画ミーティング">
        <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width }}/>)}</colgroup>
        <thead><tr className={styles.groupHeading}><th colSpan={18} scope="colgroup">お客様担当班 <small>来店情報・お客様情報</small></th><th className={styles.bridge} aria-label="共有先へ">→</th><th colSpan={7} scope="colgroup" className={styles.education}>キャスト教育班 <small>共有・次の行動</small></th></tr>
          <tr className={styles.columns}><th scope="col" className={styles.no}>No.</th><th scope="col">優先度</th><th scope="col">IN</th><th scope="col">OUT</th><th scope="col">卓番</th><th scope="col">人数</th><th scope="col" className={styles.name}>お客様名</th><th scope="col">お住まい</th><th scope="col">年齢</th><th scope="col">職業</th><th scope="col">金額<br/><small>会議用</small></th><th scope="col">客単価<br/><small>会議用</small></th><th scope="col">本指名</th><th scope="col">場内</th><th scope="col">来店経緯</th><th scope="col">アフター<br/>の有無</th><th scope="col">アフター<br/>場所</th><th scope="col">アフター<br/>同席キャスト</th><th scope="col" className={styles.bridge}><span className={styles.srOnly}>共有</span></th><th scope="col" className={styles.education}>次回につながる情報</th><th scope="col" className={styles.education}>営業連絡内容</th><th scope="col" className={styles.education}>追いかけ期間</th>{flags.map(flag => <th key={flag.key} scope="col" className={styles.education}>{flag.label}</th>)}</tr>
        </thead>
        <tbody>{rows.map((row, index) => {
          const value = row.values, name = nameOf(row), editDisabled = busy || !meetings.ready || !meetings.canEdit || !row.canEdit
          const currentFlags = pending?.visitId === String(row.visit.id) ? pending.values : value
          return <tr key={String(row.visit.id)} data-meeting-visit={String(row.visit.id)}>
            <td className={styles.no}><span className={styles.number}>{index + 1}</span><span className={styles.mobileIdentity}>{name}</span><button type="button" className={styles.edit} disabled={editDisabled} data-meeting-edit={String(row.visit.id)} onClick={() => openEditor(row)} aria-label={`${name} ${meetingDate(row.visit.visit_date)} ${row.visit.visit_time || ''}の会議項目を一括編集`}>一括編集</button></td>
            <td className={value.priority === '高' ? styles.high : undefined}>{value.priority}</td><td className={styles.time}>{value.in_time || '—'}</td><td className={styles.time}>{value.out_time || '—'}</td><td>{value.table_number || '—'}</td><td>{value.party_size ?? '—'}</td>
            <td className={styles.name}><button type="button" className={styles.customer} disabled={busy} onClick={() => onOpenCustomer ? onOpenCustomer(String(row.customer.id)) : openHistory(row)}>{name}</button><small>{categoryOf(row)}</small>{row.source === 'first_visit' && <small>初回来店日から表示・来店履歴未登録</small>}<button type="button" className={styles.log} disabled={busy} onClick={() => openHistory(row)}>記録・ログ</button>{row.unavailableReason && <small className={styles.unavailable}>{row.unavailableReason}</small>}</td>
            <td>{row.customer.region || '未設定'}</td><td>{row.customer.age_group || '未設定'}</td><td>{row.customer.occupation || '未設定'}</td><td className={styles.money}>{meetingMoney(value.meeting_amount)}</td><td className={styles.money}>{meetingMoney(value.meeting_unit_price)}</td><td className={styles.hon}>{value.honshimei || '—'}</td><td className={styles.ban}>{row.customer.cast_name || '未設定'}</td><td>{value.nomination_route || '—'}</td><td className={styles.after}>{row.source === 'first_visit' ? '未記録' : row.visit.has_after ? 'あり' : 'なし'}</td><td className={styles.after}>{value.after_place || '—'}</td><td className={styles.after}>{value.after_casts || '—'}</td><td className={styles.bridge} aria-hidden>→</td>{textCell(row, 'next_info')}{textCell(row, 'contact_content')}<td className={styles.education}>{value.follow_period}</td>{flags.map(flag => <td key={flag.key} className={styles.check}><input type="checkbox" disabled={editDisabled} checked={currentFlags[flag.key]} onChange={event => { void quickSave(row, flag.key, event.target.checked) }} aria-label={`${name} ${row.visit.visit_time || ''}の${flag.label}`}/></td>)}
          </tr>
        })}</tbody>
      </table>
    </div>
    {meetings.ready && !rows.length && <p className={styles.message}>この来店日に該当する⭐️場内のお客様はいません。</p>}
    <p className={styles.footnote}>金額・客単価は会議専用の独立した記録です。実際の売上集計への反映はありません。</p>
    {editing && <CustomerMeetingEditor key={`${editing.visit.id}:${editing.record?.revision ?? 0}`} row={editing} save={meetings.save} saving={meetings.saving} onClose={() => setEditing(null)} onSaved={record => { saveNotice(editing, record); setEditing(null) }}/>}
    {historyCustomer && <CustomerMeetingDialog title={`${historyCustomer.name} · 会議ログ`} subtitle="記録・ログ" busy={historyBusy} onClose={() => { setHistoryCustomer(null); setHistoryBusy(false) }}><div className={styles.historyBody}><CustomerMeetingHistory customerId={historyCustomer.id} defaultOpen onBusyChange={setHistoryBusy} onOpenCustomer={onOpenCustomer ? id => { setHistoryCustomer(null); onOpenCustomer(id) } : undefined}/></div></CustomerMeetingDialog>}
  </section>
}
