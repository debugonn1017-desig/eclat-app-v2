import { StarLogError } from '@/lib/starLogServer'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { todayJST } from '@/lib/dateUtils'
import { MEETING_CUSTOMER_COLUMNS, MEETING_VISIT_COLUMNS, MEETING_RECORD_COLUMNS, validMeetingId, normaliseMeetingRecord, type CustomerMeetingCustomer, type CustomerMeetingVisit, type CustomerMeetingRecord } from '@/lib/customerMeeting'
import { meetingResponse, meetingSession, meetingFailure, meetingRows } from '../shared'

export async function GET(request: Request) {
  try {
    const customerId = new URL(request.url).searchParams.get('customerId')
    if (!validMeetingId(customerId)) throw new StarLogError('お客様IDが不正です', 400)
    const { client, profile, canEdit } = await meetingSession()
    let query = client.from('customers').select(MEETING_CUSTOMER_COLUMNS).eq('id', Number(customerId))
    if (profile.role === 'cast') query = query.eq('cast_name', profile.cast_name || '')
    const customer = await query.maybeSingle()
    if (customer.error) throw customer.error
    if (!customer.data) throw new StarLogError('お客様を閲覧できません', 403)
    // ⭐️解除・担当変更・元来店削除後も、現在の顧客閲覧範囲の履歴を保持する。
    const records = (await fetchAllPaginated<CustomerMeetingRecord>((from, to) => client.from('customer_meeting_records').select(MEETING_RECORD_COLUMNS).eq('customer_id', Number(customerId)).order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to))).map(normaliseMeetingRecord)
    if (records.length >= 100000) throw new Error('会議履歴の取得上限')
    const visits: CustomerMeetingVisit[] = []
    const currentCustomer = customer.data as CustomerMeetingCustomer
    // 初回保存と同じ資格のときだけ、未記録の実来店を通常ログから編集候補にする。
    // 指名変更後も対象日の来店を追える。本指名/場内以外・閲覧だけ・⭐️解除後は既存履歴のみ。
    if (canEdit && currentCustomer.is_starred === true && ['場内', '本指名'].includes(currentCustomer.nomination_status ?? '')) {
      const actualVisits = await fetchAllPaginated<CustomerMeetingVisit>((from, to) => client.from('customer_visits').select(MEETING_VISIT_COLUMNS)
        .eq('customer_id', Number(customerId)).gte('visit_date', '2000-01-01').lte('visit_date', todayJST())
        .or('is_planned.is.null,is_planned.eq.false').order('id').range(from, to))
      if (actualVisits.length >= 100000) throw new Error('会議来店履歴の取得上限')
      visits.push(...actualVisits)
    } else {
      const visitIds = [...new Set(records.map(record => record.visit_id))]
      for (let index = 0; index < visitIds.length; index += 200) {
        const batch = await fetchAllPaginated<CustomerMeetingVisit>((from, to) => client.from('customer_visits').select(MEETING_VISIT_COLUMNS).eq('customer_id', Number(customerId)).in('id', visitIds.slice(index, index + 200)).lte('visit_date', todayJST()).or('is_planned.is.null,is_planned.eq.false').order('id').range(from, to))
        if (batch.length >= 100000) throw new Error('会議来店履歴の取得上限')
        visits.push(...batch)
      }
    }
    return meetingResponse(request, { customerId, records, rows: meetingRows([currentCustomer], visits, records, canEdit), canEdit })
  } catch (error) { return meetingFailure(error) }
}
