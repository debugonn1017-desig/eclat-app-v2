import type { Customer, CustomerVisit } from '@/types'

export const MEETING_PRIORITIES = ['高', '中', '低'] as const
export const MEETING_FOLLOW_PERIODS = ['1週間', '2週間', '1ヶ月', '2ヶ月', '未設定'] as const
export const MEETING_TEXT_LIMITS = { table_number: 20, honshimei: 100, nomination_route: 500, after_place: 200, after_casts: 200, next_info: 4000, contact_content: 4000 } as const
export const MEETING_CUSTOMER_COLUMNS = 'id,customer_name,nickname,region,age_group,occupation,cast_name,nomination_status,is_starred,nomination_route'
export const MEETING_VISIT_COLUMNS = 'id,customer_id,visit_date,visit_time,table_number,party_size,has_after,is_planned,companion_honshimei'
export const MEETING_RECORD_COLUMNS = 'id,customer_id,visit_id,visit_date,revision,created_at,actor_id,actor_name,customer_snapshot,has_after,values,request_id'
export const MEETING_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export type CustomerMeetingCustomer = Pick<Customer, 'id' | 'customer_name' | 'nickname' | 'region' | 'age_group' | 'occupation' | 'cast_name' | 'nomination_status' | 'is_starred' | 'nomination_route'>
export type CustomerMeetingVisit = Pick<CustomerVisit, 'id' | 'customer_id' | 'visit_date' | 'visit_time' | 'table_number' | 'party_size' | 'has_after' | 'is_planned'> & { companion_honshimei?: string | null }
export interface CustomerMeetingValues {
  priority: typeof MEETING_PRIORITIES[number]
  in_time: string | null
  out_time: string | null
  table_number: string
  party_size: number | null
  honshimei: string
  nomination_route: string
  after_place: string
  after_casts: string
  next_info: string
  contact_content: string
  follow_period: typeof MEETING_FOLLOW_PERIODS[number]
  thank_you: boolean
  rally: boolean
  action: boolean
  /** 会議だけの手入力。顧客のリピート判定や売上には反映しない。 */
  repeat: boolean
  /** 会議専用。売上/成績/来店の金額から取得・更新しない。 */
  meeting_amount: number | null
  meeting_unit_price: number | null
}
export interface CustomerMeetingRecord {
  id: string
  customer_id: string
  visit_id: string
  visit_date: string
  revision: number
  created_at: string
  actor_id: string
  actor_name: string
  customer_snapshot: CustomerMeetingCustomer
  has_after: boolean
  values: CustomerMeetingValues
  request_id: string
}
export interface CustomerMeetingRow {
  customer: CustomerMeetingCustomer
  visit: CustomerMeetingVisit
  record: CustomerMeetingRecord | null
  values: CustomerMeetingValues
  canEdit: boolean
  unavailableReason?: string
}
export interface CustomerMeetingInput {
  customerId: string
  visitId: string
  expectedRevision: number
  expectedVisitDate: string
  requestId: string
  values: CustomerMeetingValues
}
export interface CustomerMeetingListData { date: string; castName: string; rows: CustomerMeetingRow[]; canEdit: boolean }
export interface CustomerMeetingHistoryData { customerId: string; records: CustomerMeetingRecord[]; rows: CustomerMeetingRow[]; canEdit: boolean }

export function validMeetingId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
}
export function validMeetingDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(20\d{2}|21\d{2})-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function defaultMeetingValues(customer: CustomerMeetingCustomer, visit: CustomerMeetingVisit): CustomerMeetingValues {
  const time = visit.visit_time?.slice(0, 5) || null
  return {
    priority: '中', in_time: time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null, out_time: null,
    table_number: String(visit.table_number || '').slice(0, MEETING_TEXT_LIMITS.table_number),
    party_size: Number.isSafeInteger(visit.party_size) && visit.party_size >= 1 && visit.party_size <= 99 ? visit.party_size : null,
    honshimei: String(visit.companion_honshimei || '').slice(0, MEETING_TEXT_LIMITS.honshimei),
    nomination_route: String(customer.nomination_route || '').slice(0, MEETING_TEXT_LIMITS.nomination_route),
    after_place: '', after_casts: '', next_info: '', contact_content: '', follow_period: '未設定',
    thank_you: false, rally: false, action: false, repeat: false, meeting_amount: null, meeting_unit_price: null,
  }
}
const valueKeys = new Set(['priority', 'in_time', 'out_time', 'table_number', 'party_size', 'honshimei', 'nomination_route', 'after_place', 'after_casts', 'next_info', 'contact_content', 'follow_period', 'thank_you', 'rally', 'action', 'repeat', 'meeting_amount', 'meeting_unit_price'])
function isObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
export function validateMeetingValues(value: unknown): string | null {
  // 導入前の17項目も受理する。未知の項目・repeat以外の欠落は従来どおり拒否する。
  if (!isObject(value) || Object.keys(value).length !== valueKeys.size - (Object.hasOwn(value, 'repeat') ? 0 : 1) || Object.keys(value).some(key => !valueKeys.has(key))) return '会議入力の項目が不正です'
  if (!MEETING_PRIORITIES.includes(value.priority as CustomerMeetingValues['priority']) || !MEETING_FOLLOW_PERIODS.includes(value.follow_period as CustomerMeetingValues['follow_period'])) return '優先度または追いかけ期間を確認してください'
  for (const key of ['in_time', 'out_time']) if (value[key] !== null && (typeof value[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value[key]))) return '時刻は時:分で入力してください'
  for (const [key, max] of Object.entries(MEETING_TEXT_LIMITS)) if (typeof value[key] !== 'string' || value[key].length > max) return `入力が長すぎるか形式が不正です（${key}: ${max}文字まで）`
  if (value.party_size !== null && (!Number.isSafeInteger(value.party_size) || Number(value.party_size) < 1 || Number(value.party_size) > 99)) return '人数は1〜99名で入力してください'
  for (const key of ['meeting_amount', 'meeting_unit_price']) if (value[key] !== null && (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0 || Number(value[key]) > 999999999)) return '会議用の金額は0〜999999999の整数で入力してください'
  for (const key of ['thank_you', 'rally', 'action']) if (typeof value[key] !== 'boolean') return '対応状況を確認してください'
  if (Object.hasOwn(value, 'repeat') && typeof value.repeat !== 'boolean') return 'リピートのチェックを確認してください'
  return null
}
export function validateMeetingInput(value: unknown): string | null {
  if (!isObject(value) || Object.keys(value).some(key => !['customerId', 'visitId', 'expectedRevision', 'expectedVisitDate', 'requestId', 'values'].includes(key))) return '会議入力の形式が不正です'
  if (!validMeetingId(value.customerId) || !validMeetingId(value.visitId)) return 'お客様または来店IDが不正です'
  if (!validMeetingDate(value.expectedVisitDate)) return '元の来店日を確認できませんでした'
  if (!Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 0 || Number(value.expectedRevision) > 2147483646) return '記録の版が不正です'
  if (typeof value.requestId !== 'string' || !MEETING_UUID.test(value.requestId)) return '保存リクエストが不正です'
  return validateMeetingValues(value.values)
}
export function latestMeetingRecords(records: readonly CustomerMeetingRecord[]): Map<string, CustomerMeetingRecord> {
  const result = new Map<string, CustomerMeetingRecord>()
  for (const record of records) if ((result.get(record.visit_id)?.revision ?? 0) < record.revision) result.set(record.visit_id, record)
  return result
}
export function normaliseMeetingRecord(record: CustomerMeetingRecord): CustomerMeetingRecord {
  const error = validateMeetingValues(record.values)
  if (error) throw new Error(error)
  // 過去ログはDBで更新せず、表示・編集用のコピーだけに既定値を補完する。
  return { ...record, customer_id: String(record.customer_id), visit_id: String(record.visit_id), customer_snapshot: { ...record.customer_snapshot, id: String(record.customer_snapshot.id) }, values: { ...record.values, repeat: record.values.repeat ?? false } }
}
