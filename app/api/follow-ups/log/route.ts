import { NextResponse } from 'next/server'
import { checkPermission, getCurrentProfile } from '@/lib/auth'
import {
  buildFollowUpTimeline,
  type FollowUpActivityLogRow,
  type FollowUpContactLogRow,
  type FollowUpVisitLogRow,
} from '@/lib/followUpLog'
import { getJstDateString, isFollowUpCheckResult } from '@/lib/followUpWorkflow'
import { createClient } from '@/lib/supabase/server'

async function requireFollowUpAccess(edit: boolean) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return { response: NextResponse.json({ error: 'ログインが必要です' }, { status: 401 }) }
  }
  if (profile.role === 'admin' && !profile.is_owner) {
    const allowed = await checkPermission(edit ? '顧客.編集' : '顧客.閲覧')
    if (!allowed) {
      return {
        response: NextResponse.json({
          error: edit ? '顧客.編集の権限がありません' : '顧客.閲覧の権限がありません',
        }, { status: 403 }),
      }
    }
  }
  return { profile }
}

export async function GET(request: Request) {
  try {
    const access = await requireFollowUpAccess(false)
    if ('response' in access) return access.response
    const canEdit = access.profile.role === 'cast'
      || access.profile.is_owner
      || await checkPermission('顧客.編集')
    const url = new URL(request.url)
    const followUpId = url.searchParams.get('followUpId')
    const customerId = Number(url.searchParams.get('customerId'))
    if (!followUpId && (!Number.isSafeInteger(customerId) || customerId <= 0)) {
      return NextResponse.json({ error: 'お客様を指定してください' }, { status: 400 })
    }

    const supabase = await createClient()
    let followUpQuery = supabase
      .from('customer_follow_ups')
      .select('*')
      .order('is_active', { ascending: false })
      .order('activated_at', { ascending: false })
      .limit(1)
    followUpQuery = followUpId
      ? followUpQuery.eq('id', followUpId)
      : followUpQuery.eq('customer_id', customerId)

    const { data: followUps, error: followUpError } = await followUpQuery
    if (followUpError) throw followUpError
    const followUp = followUps?.[0] ?? null
    if (!followUp) {
      return NextResponse.json({
        status: 'never',
        follow_up: null,
        timeline: [],
        can_check: false,
        can_edit: Boolean(canEdit),
      }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })
    }

    const { data: activityData, error: activityError } = await supabase
      .from('follow_up_activity_logs')
      .select('id, follow_up_id, cycle_id, event_type, check_result, note, actor_user_id, actor_display_name, actor_role, event_at, voided_at')
      .eq('follow_up_id', followUp.id)
      .order('event_at', { ascending: true })
    if (activityError) throw activityError

    const activities = (activityData ?? []) as FollowUpActivityLogRow[]
    if (!activities.some(row => row.event_type === 'started')) {
      activities.push({
        id: `synthetic-start-${followUp.id}`,
        follow_up_id: String(followUp.id),
        cycle_id: String(followUp.current_cycle_id),
        event_type: 'started',
        check_result: null,
        note: null,
        actor_user_id: null,
        actor_display_name: null,
        actor_role: null,
        event_at: String(followUp.activated_at),
        voided_at: null,
      })
    }
    const earliestStart = activities
      .filter(row => row.event_type === 'started')
      .map(row => row.event_at)
      .sort()[0]
    const earliestVisitDate = earliestStart
      ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(earliestStart))
      : null

    let visitRows: FollowUpVisitLogRow[] = []
    let contactRows: FollowUpContactLogRow[] = []
    if (earliestVisitDate) {
      const { data: visitData, error: visitError } = await supabase
        .from('customer_visits')
        .select('id, visit_date, visit_time, amount_spent, has_douhan, has_after')
        .eq('customer_id', followUp.customer_id)
        .eq('is_planned', false)
        .gte('visit_date', earliestVisitDate)
        .lte('visit_date', getJstDateString())
        .order('visit_date', { ascending: true })
      if (visitError) throw visitError
      visitRows = (visitData ?? []) as FollowUpVisitLogRow[]

      const { data: contactData, error: contactError } = await supabase
        .from('customer_contacts')
        .select('id, contact_date, direction, channel, memo')
        .eq('customer_id', followUp.customer_id)
        .gte('contact_date', earliestVisitDate)
        .order('contact_date', { ascending: true })
      if (contactError) throw contactError
      contactRows = (contactData ?? []) as FollowUpContactLogRow[]
    }

    return NextResponse.json({
      status: followUp.is_active ? 'active' : 'inactive',
      follow_up: followUp,
      timeline: buildFollowUpTimeline(activities, visitRows, contactRows),
      can_check: Boolean(canEdit && followUp.is_active),
      can_edit: Boolean(canEdit),
    }, {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    })
  } catch (error) {
    console.error('GET /api/follow-ups/log error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : '追いかけログの取得に失敗しました',
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireFollowUpAccess(true)
    if ('response' in access) return access.response
    const body = await request.json().catch(() => null)
    const followUpId = body && typeof body === 'object'
      ? (body as { followUpId?: unknown }).followUpId
      : null
    const result = body && typeof body === 'object'
      ? (body as { result?: unknown }).result
      : null
    const noteValue = body && typeof body === 'object'
      ? (body as { note?: unknown }).note
      : null
    if (typeof followUpId !== 'string' || !followUpId) {
      return NextResponse.json({ error: '追いかけ項目を指定してください' }, { status: 400 })
    }
    if (!isFollowUpCheckResult(result)) {
      return NextResponse.json({ error: '担当者チェックの結果を選び直してください' }, { status: 400 })
    }
    const note = typeof noteValue === 'string' ? noteValue.trim().slice(0, 1000) || null : null

    const supabase = await createClient()
    const { data: followUp, error: followUpError } = await supabase
      .from('customer_follow_ups')
      .select('id, customer_id, cast_id, current_cycle_id, is_active')
      .eq('id', followUpId)
      .maybeSingle()
    if (followUpError) throw followUpError
    if (!followUp) return NextResponse.json({ error: '追いかけ項目が見つかりません' }, { status: 404 })
    if (!followUp.is_active) {
      return NextResponse.json({ error: '追いかけ中のお客様だけ確認できます' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('follow_up_activity_logs')
      .insert({
        follow_up_id: followUp.id,
        cycle_id: followUp.current_cycle_id,
        customer_id: followUp.customer_id,
        cast_id: followUp.cast_id,
        event_type: 'check',
        check_result: result,
        note,
        actor_user_id: access.profile.id,
      })
      .select('id, event_at, check_result, note')
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('POST /api/follow-ups/log error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : '担当者チェックの保存に失敗しました',
    }, { status: 500 })
  }
}
