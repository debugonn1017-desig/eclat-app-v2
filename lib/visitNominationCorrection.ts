import type { Customer, CustomerVisit, NominationStatus } from '@/types'

export interface VisitNominationCorrectionInput {
  customerId: string
  visitId: string
  expectedVisitDate: string
  expectedStatus: NominationStatus | null
  expectedRevision: number
  newStatus: NominationStatus
  requestId: string
  expectedCustomerStatus?: NominationStatus | null
}
export interface VisitNominationCorrectionHistory {
  id: string
  visit_id: string
  visit_date: string
  old_status: NominationStatus | null
  new_status: NominationStatus
  actor_name: string
  created_at: string
  revision: number
}
export interface VisitNominationResource {
  customerId: string
  customerStatus: NominationStatus | null
  visits: CustomerVisit[]
  history: VisitNominationCorrectionHistory[]
  canEdit: boolean
}
export interface VisitNominationSaveResult {
  customer: Customer
  visit: CustomerVisit
  correction: VisitNominationCorrectionHistory
}
export const VISIT_NOMINATION_HISTORY_COLUMNS = 'id,visit_id,visit_date,old_status,new_status,actor_name,created_at,revision'
export function isVisitNominationStatus(value: unknown): value is NominationStatus {
  return value === 'フリー' || value === '場内' || value === '本指名'
}
export function isVisitNominationId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
}
export function validateVisitNominationCorrection(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '指名区分の訂正内容が不正です'
  const input = value as Record<string, unknown>
  const keys = ['customerId', 'visitId', 'expectedVisitDate', 'expectedStatus', 'expectedRevision', 'newStatus', 'requestId', 'expectedCustomerStatus']
  if (Object.keys(input).some(key => !keys.includes(key))) return '指名区分の訂正項目が不正です'
  if (!isVisitNominationId(input.customerId) || !isVisitNominationId(input.visitId)) return 'お客様または来店IDが不正です'
  if (typeof input.expectedVisitDate !== 'string' || !/^(20\d{2}|21\d{2})-\d{2}-\d{2}$/.test(input.expectedVisitDate)) return '訂正する来店日を確認してください'
  const date = new Date(input.expectedVisitDate + 'T00:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.expectedVisitDate) return '訂正する来店日を確認してください'
  if ((input.expectedStatus !== null && !isVisitNominationStatus(input.expectedStatus)) || !isVisitNominationStatus(input.newStatus)) return '指名区分を選択してください'
  if (input.expectedStatus === input.newStatus) return '変更後の指名区分を選択してください'
  if (Object.hasOwn(input, 'expectedCustomerStatus') && input.expectedCustomerStatus !== null && !isVisitNominationStatus(input.expectedCustomerStatus)) return '元の顧客の指名区分を確認してください'
  if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0 || Number(input.expectedRevision) > 2147483646) return '訂正履歴の版が不正です'
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) return '訂正の保存リクエストが不正です'
  return null
}
