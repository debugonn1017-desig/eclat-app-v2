import { NextResponse } from 'next/server'
import { starLogSession, StarLogError } from '@/lib/starLogServer'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { MEETING_RECORD_COLUMNS, defaultMeetingValues, latestMeetingRecords, normaliseMeetingRecord, type CustomerMeetingCustomer, type CustomerMeetingVisit, type CustomerMeetingRecord, type CustomerMeetingRow } from '@/lib/customerMeeting'

export const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
export async function meetingSession(write = false) {
  const auth = await starLogSession(write)
  if (!auth.profile.is_active) throw new StarLogError('ログインしてください', 401)
  return auth
}
export function meetingFailure(error: unknown) {
  if (error instanceof StarLogError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  const status = ['40001', '23505'].includes(code) ? 409 : code === '42501' ? 403 : ['22023', '22P02', '23514'].includes(code) ? 400 : 503
  const message = status === 409 ? '記録または元の来店情報が変更されています。入力を残して最新の履歴を再取得してください' : status === 403 ? '会議記録を編集できません。現在の担当・権限・⭐️の状態を確認してください' : status === 400 ? '会議入力の形式を確認してください' : '会議記録を取得・保存できませんでした。入力を残して再取得してください'
  return NextResponse.json({ error: message }, { status, headers })
}
export type MeetingClient = Awaited<ReturnType<typeof meetingSession>>['client']
export async function meetingRecordsForVisits(client: MeetingClient, visitIds: string[]) {
  const records: CustomerMeetingRecord[] = []
  for (let index = 0; index < visitIds.length; index += 200) {
    const batch = await fetchAllPaginated<CustomerMeetingRecord>((from, to) => client.from('customer_meeting_records').select(MEETING_RECORD_COLUMNS).in('visit_id', visitIds.slice(index, index + 200)).order('visit_id').order('revision').range(from, to))
    if (batch.length >= 100000) throw new Error('会議記録の取得上限')
    records.push(...batch.map(normaliseMeetingRecord))
  }
  return records
}
export function meetingRows(customers: CustomerMeetingCustomer[], visits: CustomerMeetingVisit[], records: CustomerMeetingRecord[], canEdit: boolean, keepChangedSources = false): CustomerMeetingRow[] {
  const customerMap = new Map(customers.map(customer => [String(customer.id), { ...customer, id: String(customer.id) }]))
  const latest = latestMeetingRecords(records)
  return visits.flatMap(source => {
    const visit = { ...source, id: String(source.id), customer_id: String(source.customer_id) }, customer = customerMap.get(visit.customer_id)
    if (!customer) return []
    const record = latest.get(visit.id) || null
    if (record && (record.customer_id !== customer.id || record.visit_date !== visit.visit_date)) return keepChangedSources ? [{ customer, visit, record: null, values: defaultMeetingValues(customer, visit), canEdit: false, unavailableReason: '元の来店情報が保存済みの会議記録から変更されています。過去の記録はメモ履歴から確認してください' }] : []
    return [{ customer, visit, record, values: record?.values || defaultMeetingValues(customer, visit), canEdit }]
  })
}
