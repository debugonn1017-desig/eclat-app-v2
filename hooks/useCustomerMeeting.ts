'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MEETING_UUID, validateMeetingInput, validateMeetingValues, validMeetingDate, validMeetingId, type CustomerMeetingInput, type CustomerMeetingRecord, type CustomerMeetingListData, type CustomerMeetingHistoryData } from '@/lib/customerMeeting'

const SAVED = 'eclat:customer-meeting-saved'
const EMPTY_ROWS: CustomerMeetingListData['rows'] = []
const EMPTY_RECORDS: CustomerMeetingRecord[] = []
export class CustomerMeetingSaveError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'CustomerMeetingSaveError' }
}
export async function saveCustomerMeeting(input: CustomerMeetingInput): Promise<CustomerMeetingRecord> {
  const error = validateMeetingInput(input)
  if (error) throw new CustomerMeetingSaveError(error, 400)
  const response = await fetch('/api/customer-meetings', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Customer-Meeting-Schema': '2' }, body: JSON.stringify(input), cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new CustomerMeetingSaveError(result.error || '会議記録を保存できませんでした。入力内容を残して再試行してください', response.status)
  const record = result.record as CustomerMeetingRecord
  if (!record || !MEETING_UUID.test(record.id) || record.customer_id !== input.customerId || record.visit_id !== input.visitId || record.visit_date !== input.expectedVisitDate || !Number.isSafeInteger(record.revision) || record.revision < Math.max(1, input.expectedRevision) || record.revision > input.expectedRevision + 1 || validateMeetingValues(record.values)) throw new Error('保存結果を確認できませんでした。入力内容を残して履歴を再取得してください')
  window.dispatchEvent(new CustomEvent(SAVED, { detail: record }))
  return record
}

type Resource = CustomerMeetingListData | CustomerMeetingHistoryData
function useMeetingResource<T extends Resource>(url: string, enabled: boolean, assert: (data: T) => void) {
  const [loaded, setLoaded] = useState<{ url: string; request: number; data: T } | null>(null)
  const [failure, setFailure] = useState<{ url: string; request: number; error: string } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [saving, setSaving] = useState(false)
  const lock = useRef(false), scope = useRef(url), validate = useRef(assert)
  useEffect(() => { scope.current = url; validate.current = assert }, [url, assert])
  const reload = useCallback(() => setRefresh(value => value + 1), [])
  useEffect(() => {
    if (!enabled || saving) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(url, { headers: { 'X-Customer-Meeting-Schema': '2' }, cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '会議記録を取得できませんでした')
        validate.current(data)
        if (!controller.signal.aborted) { setLoaded({ url, request: refresh, data }); setFailure(null) }
      } catch (error) { if (!controller.signal.aborted) setFailure({ url, request: refresh, error: error instanceof Error ? error.message : '会議記録を取得できませんでした' }) }
    })()
    return () => controller.abort()
  }, [url, enabled, saving, refresh])
  useEffect(() => {
    if (!enabled) return
    const changed = (event: Event) => {
      const record = (event as CustomEvent<CustomerMeetingRecord>).detail
      setLoaded(previous => {
        if (previous?.url !== url) return previous
        const data = previous.data
        const rows = data.rows.map(row => String(row.visit.id) === record.visit_id && String(row.customer.id) === record.customer_id && (row.record?.revision ?? 0) < record.revision ? { ...row, record, values: record.values } : row)
        if ('records' in data && data.customerId === record.customer_id) {
          if (data.records.some(item => item.visit_id === record.visit_id && item.revision === record.revision && item.id !== record.id)) return previous
          const records = [...data.records.filter(item => item.id !== record.id), record].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.revision - a.revision)
          return { ...previous, data: { ...data, rows, records } }
        }
        return { ...previous, data: { ...data, rows } }
      })
    }
    const update = () => { if (document.visibilityState === 'visible' && !lock.current) reload() }
    window.addEventListener(SAVED, changed); window.addEventListener('focus', update); document.addEventListener('visibilitychange', update)
    const timer = window.setInterval(update, 30000)
    return () => { window.removeEventListener(SAVED, changed); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); window.clearInterval(timer) }
  }, [url, enabled, reload])
  const data = enabled && loaded?.url === url ? loaded.data : null
  const error = failure?.url === url && failure.request === refresh ? failure.error : ''
  const ready = enabled && !!data && loaded?.request === refresh && !error
  const save = async (input: CustomerMeetingInput) => {
    if (lock.current) throw new Error('会議記録を保存中です')
    if (!enabled || scope.current !== url || !data?.canEdit || !data.rows.some(row => row.canEdit && String(row.customer.id) === input.customerId && String(row.visit.id) === input.visitId)) throw new Error('対象または権限が変わっています。入力を残して記録を再取得してください')
    lock.current = true; setSaving(true)
    try { return await saveCustomerMeeting(input) } finally { lock.current = false; setSaving(false) }
  }
  return { data, ready, loading: enabled && !ready && !error, error, reload, saving, save, canEdit: ready && !!data?.canEdit }
}
export function useCustomerMeetingList({ date, castName = '', enabled = true }: { date: string; castName?: string; enabled?: boolean }) {
  const valid = validMeetingDate(date) && castName.length <= 100
  const query = new URLSearchParams({ date })
  if (castName) query.set('castName', castName)
  const result = useMeetingResource<CustomerMeetingListData>('/api/customer-meetings?' + query.toString(), enabled && valid, data => {
    if (!data || data.date !== date || data.castName !== castName || !Array.isArray(data.rows) || typeof data.canEdit !== 'boolean') throw new Error('会議の対象日・担当を確認できませんでした')
    const ids = new Set<string>()
    for (const row of data.rows) {
      if (!validMeetingId(String(row.customer?.id)) || !validMeetingId(String(row.visit?.id)) || String(row.visit.customer_id) !== String(row.customer.id) || row.visit.visit_date !== date || ids.has(String(row.visit.id)) || validateMeetingValues(row.values)) throw new Error('会議の来店情報を確認できませんでした')
      ids.add(String(row.visit.id))
    }
  })
  return { ...result, rows: result.data?.rows || EMPTY_ROWS, error: enabled && !valid ? '会議の対象日または担当が不正です' : result.error }
}
export function useCustomerMeetingHistory(customerId: string | null, { enabled = true }: { enabled?: boolean } = {}) {
  const valid = validMeetingId(customerId)
  const result = useMeetingResource<CustomerMeetingHistoryData>('/api/customer-meetings/history?customerId=' + encodeURIComponent(customerId || ''), enabled && valid, data => {
    if (!data || data.customerId !== customerId || !Array.isArray(data.records) || !Array.isArray(data.rows) || typeof data.canEdit !== 'boolean') throw new Error('お客様の会議履歴を確認できませんでした')
    if (data.records.some(record => record.customer_id !== customerId || !validMeetingId(record.visit_id) || !validMeetingDate(record.visit_date) || validateMeetingValues(record.values))) throw new Error('会議履歴の対象を確認できませんでした')
    if (data.rows.some(row => String(row.customer.id) !== customerId || String(row.visit.customer_id) !== customerId)) throw new Error('会議履歴の来店情報を確認できませんでした')
  })
  return { ...result, records: result.data?.records || EMPTY_RECORDS, rows: result.data?.rows || EMPTY_ROWS, error: enabled && customerId !== null && !valid ? 'お客様IDが不正です' : result.error }
}
