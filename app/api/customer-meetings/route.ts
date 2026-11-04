import { NextResponse } from 'next/server'
import { StarLogError } from '@/lib/starLogServer'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { todayJST } from '@/lib/dateUtils'
import { MEETING_CUSTOMER_COLUMNS, MEETING_VISIT_COLUMNS, normaliseMeetingRecord, validateMeetingInput, validMeetingDate, type CustomerMeetingCustomer, type CustomerMeetingVisit, type CustomerMeetingInput, type CustomerMeetingRecord } from '@/lib/customerMeeting'
import { headers, meetingSession, meetingFailure, meetingRecordsForVisits, meetingRows } from './shared'

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, date = params.get('date'), castName = params.get('castName') || ''
    if (!validMeetingDate(date) || date > todayJST()) throw new StarLogError('実来店の対象日を確認してください', 400)
    if (castName.length > 100) throw new StarLogError('担当が不正です', 400)
    const { client, profile, canEdit } = await meetingSession()
    if (profile.role === 'cast' && castName && castName !== profile.cast_name) throw new StarLogError('担当の範囲外です', 403)
    const scopedCast = profile.role === 'cast' ? profile.cast_name || '' : castName
    const customers = await fetchAllPaginated<CustomerMeetingCustomer>((from, to) => {
      let query = client.from('customers').select(MEETING_CUSTOMER_COLUMNS).eq('is_starred', true).eq('nomination_status', '場内')
      if (scopedCast) query = query.eq('cast_name', scopedCast)
      return query.order('id').range(from, to)
    })
    if (customers.length >= 100000) throw new Error('顧客の取得上限')
    const visits: CustomerMeetingVisit[] = [], customerIds = customers.map(customer => String(customer.id))
    for (let index = 0; index < customerIds.length; index += 200) {
      const batch = await fetchAllPaginated<CustomerMeetingVisit>((from, to) => client.from('customer_visits').select(MEETING_VISIT_COLUMNS).in('customer_id', customerIds.slice(index, index + 200)).eq('visit_date', date).or('is_planned.is.null,is_planned.eq.false').order('id').range(from, to))
      if (batch.length >= 100000) throw new Error('来店の取得上限')
      visits.push(...batch)
    }
    const records = await meetingRecordsForVisits(client, visits.map(visit => String(visit.id)))
    return NextResponse.json({ date, castName, rows: meetingRows(customers, visits, records, canEdit, true), canEdit }, { headers })
  } catch (error) { return meetingFailure(error) }
}
export async function PUT(request: Request) {
  try {
    let body: unknown
    try { body = await request.json() } catch { throw new StarLogError('入力の形式が不正です', 400) }
    const invalid = validateMeetingInput(body)
    if (invalid) throw new StarLogError(invalid, 400)
    const input = body as CustomerMeetingInput
    const { client, profile } = await meetingSession(true)
    let customerQuery = client.from('customers').select('id,cast_name').eq('id', Number(input.customerId))
    if (profile.role === 'cast') customerQuery = customerQuery.eq('cast_name', profile.cast_name || '')
    const customer = await customerQuery.maybeSingle()
    if (customer.error) throw customer.error
    if (!customer.data) throw new StarLogError('担当が変更されたか、お客様を編集できません', 403)
    const { data, error } = await client.rpc('save_customer_meeting', {
      p_customer_id: Number(input.customerId), p_visit_id: Number(input.visitId), p_expected_visit_date: input.expectedVisitDate,
      p_expected_revision: input.expectedRevision, p_request_id: input.requestId, p_values: input.values,
    })
    if (error) throw error
    const record = (Array.isArray(data) ? data[0] : data) as CustomerMeetingRecord | null
    if (!record || String(record.customer_id) !== input.customerId || String(record.visit_id) !== input.visitId) throw new Error('会議記録の保存結果が不正')
    return NextResponse.json({ record: normaliseMeetingRecord(record) }, { headers })
  } catch (error) { return meetingFailure(error) }
}
