import { NextResponse } from 'next/server'
import { getJstDateString } from '@/lib/followUpWorkflow'
import { validateStarLog, type StarCycle } from '@/lib/starLog'
import { STAR_CYCLE_COLUMNS, STAR_EVENT_COLUMNS, StarLogError, starCustomerId, starLogSession, starLogPage, starLogFailure } from '@/lib/starLogServer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  try {
    const { client, canEdit, profile } = await starLogSession()
    const id = starCustomerId((await context.params).id)
    const params = new URL(request.url).searchParams
    const page = starLogPage(params.get('page'))
    const cycleId = params.get('cycleId')
    if (cycleId !== null && !UUID.test(cycleId)) throw new StarLogError('期間IDが不正です', 400)
    let customerQuery = client.from('customers').select('id,customer_name,cast_name,is_starred').eq('id', id)
    if (profile.role === 'cast') customerQuery = customerQuery.eq('cast_name', profile.cast_name)
    const { data: customer, error: customerError } = await customerQuery.maybeSingle()
    if (customerError) throw customerError
    if (!customer) throw new StarLogError('お客様を表示できません', 404)
    const latest = await client.from('customer_star_cycles').select(STAR_CYCLE_COLUMNS).eq('customer_id', id).order('opened_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle()
    if (latest.error) throw latest.error
    const selected = cycleId && cycleId !== latest.data?.id ? await client.from('customer_star_cycles').select(STAR_CYCLE_COLUMNS).eq('customer_id', id).eq('id', cycleId).maybeSingle() : latest
    if (selected.error) throw selected.error
    const cycle = selected.data
    if (cycleId && !cycle) throw new StarLogError('記録を表示できません', 404)
    const cy = cycle as unknown as StarCycle | null
    const logs = cy ? await client.from('customer_star_logs').select(STAR_EVENT_COLUMNS)
      .eq('cycle_id', cy.id).order('event_on', { ascending: false }).order('recorded_at', { ascending: false }).order('id', { ascending: false })
      .range((page - 1) * 50, page * 50) : { data: [], error: null }
    if (logs.error) throw logs.error
    return NextResponse.json({ customer, cycle: cy, logs: (logs.data ?? []).slice(0, 50), has_more: (logs.data?.length ?? 0) > 50, can_edit: canEdit, restart_cycle_id: latest.data?.id ?? null }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })
  } catch (error) {
    const f = starLogFailure(error)
    return NextResponse.json({ error: f.error }, { status: f.status })
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { client } = await starLogSession(true)
    const id = starCustomerId((await context.params).id)
    let body: Record<string, unknown>
    try { body = await request.json() } catch { throw new StarLogError('入力の形式が不正です', 400) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new StarLogError('入力の形式が不正です', 400)
    let result
    if (body.action === 'restart') {
      if (Object.keys(body).some(k => !['action', 'cycleId', 'requestId'].includes(k)) || typeof body.cycleId !== 'string' || !UUID.test(body.cycleId) || typeof body.requestId !== 'string' || !UUID.test(body.requestId)) throw new StarLogError('再開の形式が不正です', 400)
      result = await client.rpc('restart_customer_star', { p_customer_id: id, p_cycle_id: body.cycleId, p_request_id: body.requestId })
    } else {
      const validation = validateStarLog(body, getJstDateString())
      if (validation) throw new StarLogError(validation, 400)
      result = await client.rpc('record_customer_star_log', {
        p_customer_id: id, p_cycle_id: body.cycleId, p_started_on: body.startedOn, p_expected_started_on: body.expectedStartedOn,
        p_checked_on: body.checkedOn, p_status: body.status, p_note: body.note, p_request_id: body.requestId,
      })
    }
    if (result.error) {
      const code = result.error.code
      if (code === '42501' || code === 'P0002') throw new StarLogError('対象を編集できません', 403)
      if (code === '40001' || code === '23505') throw new StarLogError('状態が変更されたか、同じ記録IDが使われています。開き直して確認してください', 409)
      if (code === '22023' || code === '23514' || code === '22007') throw new StarLogError('開始日は最初の確認日以前にし、確認日・状況・メモを確認してください', 400)
      throw result.error
    }
    return NextResponse.json(result.data, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })
  } catch (error) {
    const f = starLogFailure(error)
    return NextResponse.json({ error: f.error }, { status: f.status })
  }
}
