'use client'

import { useRef, useState } from 'react'
import { CustomerMeetingSaveError, useCustomerMeetingHistory } from '@/hooks/useCustomerMeeting'
import { MEETING_FOLLOW_PERIODS, MEETING_PRIORITIES, MEETING_TEXT_LIMITS, validateMeetingValues, type CustomerMeetingInput, type CustomerMeetingRecord, type CustomerMeetingRow, type CustomerMeetingValues } from '@/lib/customerMeeting'
import CustomerMeetingDialog from './CustomerMeetingDialog'
import { meetingDate, meetingMoney, meetingSavedAt } from './CustomerMeetingTheme'
import styles from './CustomerMeetingEditor.module.css'

export type CustomerMeetingSave = (input: CustomerMeetingInput) => Promise<CustomerMeetingRecord>

export default function CustomerMeetingEditor({ row, saving = false, save, onSaved, onClose }: {
  row: CustomerMeetingRow
  saving?: boolean
  save: CustomerMeetingSave
  onSaved: (record: CustomerMeetingRecord) => void
  onClose: () => void
}) {
  const [baseRow, setBaseRow] = useState(row)
  const [values, setValues] = useState<CustomerMeetingValues>(() => ({ ...row.values }))
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [inspectLatest, setInspectLatest] = useState(false)
  const [versionNotice, setVersionNotice] = useState('')
  const [discard, setDiscard] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const lock = useRef(false)
  const request = useRef<{ key: string; id: string } | null>(null)
  const latest = useCustomerMeetingHistory(String(row.customer.id), { enabled: inspectLatest })
  const latestRow = latest.rows.find(item => String(item.visit.id) === String(row.visit.id) && item.visit.visit_date === row.visit.visit_date)
  const dirty = JSON.stringify(values) !== JSON.stringify(baseRow.values)
  const busy = saving || submitting
  const name = baseRow.customer.customer_name || baseRow.customer.nickname || 'お客様'
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else onClose() }
  const setField = <K extends keyof CustomerMeetingValues>(key: K, value: CustomerMeetingValues[K]) => setValues(previous => ({ ...previous, [key]: value }))
  const number = (value: string) => value === '' ? null : Number(value)
  const source = [
    ['お客様名', name], ['お住まい', baseRow.customer.region || '未設定'], ['年齢区分', baseRow.customer.age_group || '未設定'],
    ['職業', baseRow.customer.occupation || '未設定'], ['場内・担当', baseRow.customer.cast_name || '未設定'], ['アフターの有無', baseRow.visit.has_after ? 'あり' : 'なし'],
  ]

  return <CustomerMeetingDialog title={`${name} ／ ${meetingDate(row.visit.visit_date)}`} subtitle="お客様ごとの一括編集" busy={busy} onClose={close}>
    <form className={styles.form} onSubmit={async event => {
      event.preventDefault()
      if (lock.current || !baseRow.canEdit) return
      const validation = validateMeetingValues(values)
      if (validation) { setError(validation); return }
      const key = JSON.stringify(values)
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
      lock.current = true
      setSubmitting(true)
      setError('')
      let saved: CustomerMeetingRecord | undefined
      try {
        saved = await save({ customerId: String(row.customer.id), visitId: String(row.visit.id), expectedVisitDate: row.visit.visit_date, expectedRevision: baseRow.record?.revision ?? 0, requestId: request.current.id, values: { ...values } })
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : '会議記録を保存できませんでした')
        setConflict(failure instanceof CustomerMeetingSaveError && failure.status === 409)
      } finally {
        lock.current = false
        setSubmitting(false)
      }
      if (saved) onSaved(saved)
    }}>
      <div className={styles.body}>
        <section className={styles.source}><h3>基本情報 · 自動表示</h3><dl>{source.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
        <fieldset className={styles.fields} disabled={busy || !row.canEdit}>
          <legend className={styles.srOnly}>会議の入力項目</legend>
          <label>優先度<select aria-label="優先度" value={values.priority} onChange={event => setField('priority', event.target.value as CustomerMeetingValues['priority'])}>{MEETING_PRIORITIES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>IN<input aria-label="IN" type="time" value={values.in_time ?? ''} onChange={event => setField('in_time', event.target.value || null)}/></label>
          <label>OUT<input aria-label="OUT" type="time" value={values.out_time ?? ''} onChange={event => setField('out_time', event.target.value || null)}/></label>
          <label>卓番<input aria-label="卓番" value={values.table_number} maxLength={MEETING_TEXT_LIMITS.table_number} onChange={event => setField('table_number', event.target.value)}/></label>
          <label>人数<input aria-label="人数" type="number" min={1} max={99} step={1} inputMode="numeric" value={values.party_size ?? ''} onChange={event => setField('party_size', number(event.target.value))}/></label>
          <label>本指名<input aria-label="本指名" value={values.honshimei} maxLength={MEETING_TEXT_LIMITS.honshimei} onChange={event => setField('honshimei', event.target.value)}/></label>
          <label>来店経緯<input aria-label="来店経緯" value={values.nomination_route} maxLength={MEETING_TEXT_LIMITS.nomination_route} onChange={event => setField('nomination_route', event.target.value)}/></label>
          <label>アフター場所<input aria-label="アフター場所" value={values.after_place} maxLength={MEETING_TEXT_LIMITS.after_place} onChange={event => setField('after_place', event.target.value)}/></label>
          <label>アフター同席キャスト<input aria-label="アフター同席キャスト" value={values.after_casts} maxLength={MEETING_TEXT_LIMITS.after_casts} onChange={event => setField('after_casts', event.target.value)}/></label>
          <label>追いかけ期間<select aria-label="追いかけ期間" value={values.follow_period} onChange={event => setField('follow_period', event.target.value as CustomerMeetingValues['follow_period'])}>{MEETING_FOLLOW_PERIODS.map(value => <option key={value}>{value}</option>)}</select></label>
        </fieldset>
        <fieldset className={styles.finance} disabled={busy || !row.canEdit}><legend>会議用の金額・客単価</legend><div>
          <label>金額（会議用）<input aria-label="金額（会議用）" type="number" min={0} max={999999999} step={1} inputMode="numeric" value={values.meeting_amount ?? ''} onChange={event => setField('meeting_amount', number(event.target.value))}/></label>
          <label>客単価（会議用）<input aria-label="客単価（会議用）" type="number" min={0} max={999999999} step={1} inputMode="numeric" value={values.meeting_unit_price ?? ''} onChange={event => setField('meeting_unit_price', number(event.target.value))}/></label>
        </div><p>会議専用の記録です。キャスト売上・成績・日次売上の集計には使用しません。</p></fieldset>
        <label className={styles.longField}>次回につながる情報<textarea aria-label="次回につながる情報" rows={4} maxLength={MEETING_TEXT_LIMITS.next_info} disabled={busy || !row.canEdit} value={values.next_info} onChange={event => setField('next_info', event.target.value)}/></label>
        <label className={styles.longField}>営業連絡内容<textarea aria-label="営業連絡内容" rows={4} maxLength={MEETING_TEXT_LIMITS.contact_content} disabled={busy || !row.canEdit} value={values.contact_content} onChange={event => setField('contact_content', event.target.value)}/></label>
        <fieldset className={styles.flags} disabled={busy || !row.canEdit}><legend>対応状況</legend>{(['thank_you', 'rally', 'action', 'repeat'] as const).map((key, index) => <label key={key}><input type="checkbox" checked={values[key]} onChange={event => setField(key, event.target.checked)}/>{['お礼', 'ラリー', 'アクション', 'リピート'][index]}</label>)}</fieldset>
        {error && <div className={styles.error} role="alert"><p>{error}</p><p>入力内容はこの画面に残しています。</p></div>}
        {conflict && !inspectLatest && <button type="button" className={styles.inspect} disabled={busy} onClick={() => { setInspectLatest(true); latest.reload() }}>最新の記録を確認</button>}
        {inspectLatest && <section className={styles.latest} aria-label="競合した会議記録の最新版">
          <h3>最新の記録を確認</h3>
          {latest.loading && <p role="status">最新の会議記録を読み込み中…</p>}
          {latest.error && <div role="alert"><p>{latest.error}</p><button type="button" onClick={latest.reload}>再取得</button></div>}
          {latest.ready && (!latestRow || !latestRow.canEdit || !latest.canEdit) && <p role="alert">同じ来店日の編集可能な記録を確認できませんでした。来店日・担当・権限を確認してください。入力内容は残しています。</p>}
          {latest.ready && latestRow?.record && <><p>第{latestRow.record.revision}版 ／ {meetingSavedAt(latestRow.record.created_at)} ／ {latestRow.record.actor_name || '記録者未設定'}</p><details className={styles.latestValues}><summary>最新の保存内容を表示</summary><dl>{Object.entries(latestRow.values).map(([key, value]) => {
            const labels: Record<string, string> = { priority: '優先度', in_time: 'IN', out_time: 'OUT', table_number: '卓番', party_size: '人数', honshimei: '本指名', nomination_route: '来店経緯', after_place: 'アフター場所', after_casts: 'アフター同席キャスト', next_info: '次回につながる情報', contact_content: '営業連絡内容', follow_period: '追いかけ期間', thank_you: 'お礼', rally: 'ラリー', action: 'アクション', repeat: 'リピート', meeting_amount: '金額（会議用）', meeting_unit_price: '客単価（会議用）' }
            const text = typeof value === 'boolean' ? value ? '済' : '未' : key.startsWith('meeting_') ? meetingMoney(value as number | null) : value == null || value === '' ? '未入力' : String(value)
            return <div key={key}><dt>{labels[key]}</dt><dd>{text}</dd></div>
          })}</dl></details></>}
          {latest.ready && latest.canEdit && latestRow?.canEdit && <button type="button" className={styles.inspect} disabled={busy} onClick={() => {
            setBaseRow({ ...latestRow, values: { ...latestRow.values } })
            request.current = null
            setConflict(false)
            setInspectLatest(false)
            setError('')
            setVersionNotice(`第${latestRow.record?.revision ?? 0}版を確認しました。編集中の入力は残しています。この内容で保存する場合は、保存ボタンを押してください。`)
          }}>入力を残してこの版を使う</button>}
        </section>}
        {versionNotice && <p className={styles.versionNotice} role="status">{versionNotice}</p>}
        {!row.canEdit && <p className={styles.error} role="alert">この会議記録は閲覧専用です。</p>}
      </div>
      <footer className={styles.footer}>
        {discard ? <div className={styles.discard} role="alert"><p>入力内容を破棄して閉じますか？</p><div><button type="button" onClick={() => setDiscard(false)}>編集を続ける</button><button type="button" onClick={onClose}>破棄して閉じる</button></div></div> : <><small>このお客様のメモ履歴へ自動反映</small><button type="button" disabled={busy} onClick={close}>キャンセル</button><button type="submit" className={styles.save} disabled={busy || !baseRow.canEdit || (!!baseRow.record && !dirty)}>{busy ? '保存中…' : '保存・メモ履歴へ反映'}</button></>}
      </footer>
    </form>
  </CustomerMeetingDialog>
}
