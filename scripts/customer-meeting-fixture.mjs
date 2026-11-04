// 実コンポーネントのローカル操作確認用。本番DB・認証済みAPIには接続しない。
export function createCustomerMeetingFixture({ logic, getCustomers }) {
  let records = [], fail = false, conflict = false
  const snapshot = customer => Object.fromEntries(logic.MEETING_CUSTOMER_COLUMNS.split(',').map(key => [key, customer[key] ?? null]))
  const visitsFor = customer => (customer.visitRecords || []).map((visit, index) => ({
    id: String(visit.id || Number(customer.id) * 100 + index + 1), customer_id: String(customer.id),
    visit_date: visit.visit_date, visit_time: visit.visit_time || '20:30:00', table_number: visit.table_number || 'P2',
    party_size: visit.party_size || 2, has_after: visit.has_after === true, is_planned: visit.is_planned === true,
    companion_honshimei: '',
  }))
  const latest = visitId => records.filter(record => record.visit_id === visitId).sort((a, b) => b.revision - a.revision)[0] || null
  const rowFor = (customer, visit, readonly) => {
    const record = latest(visit.id)
    return { customer: snapshot(customer), visit, record, values: record?.values || logic.defaultMeetingValues(customer, visit), canEdit: !readonly }
  }
  const append = (customer, visit, values, requestId) => {
    const revision = (latest(visit.id)?.revision || 0) + 1
    const record = { id: `eeeeeeee-eeee-4eee-8eee-${String(records.length + 1).padStart(12, '0')}`, customer_id: String(customer.id), visit_id: visit.id, visit_date: visit.visit_date, revision, created_at: new Date(Date.UTC(2026, 10, 5, 0, 0, records.length)).toISOString(), actor_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', actor_name: '確認スタッフ', customer_snapshot: snapshot(customer), has_after: visit.has_after, values: structuredClone(values), request_id: requestId }
    records.push(record)
    return record
  }
  return {
    reset() { records = []; fail = false; conflict = false },
    records: () => records,
    async handle({ request, url, json, body, readonly }) {
      const customers = getCustomers()
      if (url.pathname === '/fixture/meeting-setup') {
        records = []; fail = false; conflict = false
        const three = customers.find(customer => customer.id === '3'), four = customers.find(customer => customer.id === '4')
        three.visitRecords = [{ id: '301', visit_date: '2026-11-02', has_after: true }, { id: '302', visit_date: '2026-11-02', table_number: '7', visit_time: '23:00:00' }]
        four.visitRecords = [{ id: '401', visit_date: '2026-11-02' }, { id: '402', visit_date: '2026-11-03' }]
        four.lastVisit = '2026-11-03'
        const planned = customers.find(customer => customer.id === '7')
        planned.visitRecords = [{ id: '701', visit_date: '2026-11-02', is_planned: true }]
        for (const customer of [three, four]) {
          const visit = visitsFor(customer)[0], values = logic.defaultMeetingValues(customer, visit)
          values.next_info = '次回の来店日程を確認する'; values.contact_content = 'お礼の連絡を送り、次回の予定を相談する'
          values.follow_period = '2週間'; values.meeting_amount = 128000; values.meeting_unit_price = 64000
          append(customer, visit, values, 'dddddddd-dddd-4ddd-8ddd-' + customer.id.padStart(12, '0'))
        }
        json({ ok: true }); return true
      }
      if (url.pathname === '/fixture/meeting-fail') { fail = !fail; json({ fail }); return true }
      if (url.pathname === '/fixture/meeting-conflict') { conflict = true; json({ ok: true }); return true }
      if (!url.pathname.startsWith('/api/customer-meetings')) return false
      if (fail) { json({ error: '会議記録の取得に失敗しました' }, 503); return true }
      if (url.pathname === '/api/customer-meetings/history') {
        const id = url.searchParams.get('customerId'), customer = customers.find(customer => customer.id === id)
        if (!customer) { json({ error: 'お客様が見つかりません' }, 404); return true }
        const history = records.filter(record => record.customer_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.revision - a.revision)
        const rows = visitsFor(customer).filter(visit => !visit.is_planned && latest(visit.id)).map(visit => rowFor(customer, visit, readonly))
        json({ customerId: id, records: history, rows, canEdit: !readonly }); return true
      }
      if (request.method === 'PUT') {
        if (readonly) { json({ error: '顧客の編集権限が必要です' }, 403); return true }
        const input = await body(), validation = logic.validateMeetingInput(input)
        if (validation) { json({ error: validation }, 400); return true }
        const customer = customers.find(customer => customer.id === input.customerId), visit = customer && visitsFor(customer).find(visit => visit.id === input.visitId && !visit.is_planned)
        if (!visit || visit.visit_date !== input.expectedVisitDate) { json({ error: '来店情報が変更されています。入力内容は残しています' }, 409); return true }
        const duplicate = records.find(record => record.request_id === input.requestId)
        if (duplicate) { json({ record: duplicate }); return true }
        if (conflict) {
          conflict = false
          append(customer, visit, { ...(latest(visit.id)?.values || logic.defaultMeetingValues(customer, visit)), contact_content: '別の端末から保存された会議記録' }, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
        }
        if ((latest(visit.id)?.revision || 0) !== input.expectedRevision) { json({ error: '別の端末から記録が更新されました。入力内容を残して履歴を確認してください' }, 409); return true }
        json({ record: append(customer, visit, input.values, input.requestId) }); return true
      }
      const date = url.searchParams.get('date'), castName = url.searchParams.get('castName') || ''
      const rows = customers.filter(customer => customer.is_starred && customer.nomination_status === '場内' && (!castName || customer.cast_name === castName)).flatMap(customer => visitsFor(customer).filter(visit => !visit.is_planned && visit.visit_date === date).map(visit => rowFor(customer, visit, readonly)))
      json({ date, castName, rows, canEdit: !readonly }); return true
    },
  }
}
