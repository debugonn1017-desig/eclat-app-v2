import { createAdminClient } from '@/lib/supabase/admin'
import { StarLogError, starLogSession } from '@/lib/starLogServer'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { todayJST } from '@/lib/dateUtils'
import { VISIT_NOMINATION_HISTORY_COLUMNS, isVisitNominationStatus, type VisitNominationCorrectionHistory, type VisitNominationCorrectionInput, type VisitNominationResource, type VisitNominationSaveResult } from '@/lib/visitNominationCorrection'
import type { CustomerVisit } from '@/types'

export const visitNominationHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
export async function loadVisitNominations(customerId: string): Promise<VisitNominationResource> {
  const { profile, client, canEdit } = await starLogSession()
  let query = client.from('customers').select('id,cast_name,nomination_status').eq('id', Number(customerId))
  if (profile.role === 'cast') query = query.eq('cast_name', profile.cast_name || '')
  const { data: customer, error } = await query.maybeSingle()
  if (error) throw error
  if (!customer) throw new StarLogError('お客様が見つからないか、閲覧できません', 404)
  const [visits, rawHistory] = await Promise.all([
    fetchAllPaginated<CustomerVisit>((from, to) => client.from('customer_visits').select('*').eq('customer_id', Number(customerId))
      .or('is_planned.is.null,is_planned.eq.false').lte('visit_date', todayJST())
      .order('visit_date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)),
    fetchAllPaginated<VisitNominationCorrectionHistory>((from, to) => client.from('customer_visit_nomination_corrections').select(VISIT_NOMINATION_HISTORY_COLUMNS)
      .eq('customer_id', Number(customerId)).order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)),
  ])
  if (visits.length >= 100000 || rawHistory.length >= 100000) throw new Error('指名区分の履歴取得上限を超えました')
  const history = rawHistory.map(row => ({ ...row, id: String(row.id), visit_id: String(row.visit_id) }))
  const revisions = new Map<string, number>()
  for (const record of history) revisions.set(record.visit_id, Math.max(revisions.get(record.visit_id) ?? 0, record.revision))
  return {
    customerId, customerStatus: isVisitNominationStatus(customer.nomination_status) ? customer.nomination_status : null,
    visits: visits.map(visit => ({ ...visit, id: String(visit.id), customer_id: String(visit.customer_id), nomination_revision: revisions.get(String(visit.id)) ?? 0 })),
    history, canEdit,
  }
}
export async function saveVisitNominationCorrection(input: VisitNominationCorrectionInput, actorId: string, customerPatch: Record<string, unknown> = {}, requireLatest = false): Promise<VisitNominationSaveResult> {
  if (input.expectedVisitDate > todayJST()) throw new StarLogError('実来店の来店日を確認してください', 400)
  const { data, error } = await createAdminClient().rpc('correct_customer_visit_nomination', {
    p_actor_id: actorId, p_customer_id: Number(input.customerId), p_customer_patch: customerPatch,
    p_expected_customer_status: input.expectedCustomerStatus ?? null,
    p_visit_id: Number(input.visitId), p_expected_visit_date: input.expectedVisitDate,
    p_expected_visit_status: input.expectedStatus, p_new_visit_status: input.newStatus,
    p_expected_revision: input.expectedRevision, p_request_id: input.requestId, p_require_latest: requireLatest,
  })
  if (error) throw error
  const result = (Array.isArray(data) ? data[0] : data) as VisitNominationSaveResult | null
  if (!result?.customer || !result.visit || !result.correction || String(result.customer.id) !== input.customerId || String(result.visit.id) !== input.visitId || result.visit.nomination_status_at_visit !== input.newStatus) throw new Error('指名区分の訂正結果を確認できませんでした')
  return { ...result, visit: { ...result.visit, id: String(result.visit.id), customer_id: String(result.visit.customer_id), nomination_revision: result.correction.revision } }
}
export function visitNominationFailure(error: unknown): { status: number; error: string } {
  if (error instanceof StarLogError) return { status: error.status, error: error.message }
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  const status = ['40001', '23505'].includes(code) ? 409 : code === '42501' ? 403 : ['22023', '22P02', '23514'].includes(code) ? 400 : 503
  return { status, error: status === 409 ? 'お客様または来店記録が変更されています。入力を残して最新の履歴を確認してください' : status === 403 ? '指名区分を訂正できません。現在の担当・編集権限を確認してください' : status === 400 ? '訂正する来店日と指名区分を確認してください' : '指名区分の履歴を取得・保存できませんでした。入力を残して再試行してください' }
}
