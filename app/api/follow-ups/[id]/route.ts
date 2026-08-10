import { NextResponse } from 'next/server'
import { checkPermission, getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  getJstDateString,
  getEffectiveReturnVisitDeadline,
  isFollowUpActionItems,
  isFollowUpNextAction,
  isFollowUpPriority,
  isReturnVisitDeadlinePreset,
  isSalesContactIntervalDays,
  resolveReturnVisitDeadline,
  type FollowUpActionItem,
  type FollowUpNextAction,
  type FollowUpPriority,
  type ReturnVisitDeadlinePreset,
  type SalesContactIntervalDays,
} from '@/lib/followUpWorkflow'

type FollowUpAction = 'contact' | 'update' | 'remove' | 'reactivate'

function parseOptionalDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('次回連絡日は YYYY-MM-DD 形式で指定してください')
  }
  return value
}

function parseOptionalNextAction(value: unknown): FollowUpNextAction | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (!isFollowUpNextAction(value)) {
    throw new Error('次の行動を選び直してください')
  }
  return value
}

function parseOptionalActionItems(value: unknown): FollowUpActionItem[] | undefined {
  if (value === undefined) return undefined
  if (value === null) return []
  if (!isFollowUpActionItems(value)) {
    throw new Error('次の行動を選び直してください')
  }
  return value
}

function parseOptionalFollowUpPriority(value: unknown): FollowUpPriority | undefined {
  if (value === undefined) return undefined
  if (!isFollowUpPriority(value)) {
    throw new Error('優先度を選び直してください')
  }
  return value
}

function parseOptionalReturnVisitPreset(
  value: unknown,
): ReturnVisitDeadlinePreset | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (!isReturnVisitDeadlinePreset(value)) {
    throw new Error('再来店期限を選び直してください')
  }
  return value
}

function parseOptionalSalesInterval(
  value: unknown,
): SalesContactIntervalDays | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (!isSalesContactIntervalDays(value)) {
    throw new Error('営業連絡間隔を選び直してください')
  }
  return value
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await getCurrentProfile()
    if (!profile) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    if (profile.role === 'admin' && !profile.is_owner) {
      const allowed = await checkPermission('顧客.編集')
      if (!allowed) {
        return NextResponse.json({ error: '顧客.編集の権限がありません' }, { status: 403 })
      }
    }

    const { id } = await params
    if (!id) return NextResponse.json({ error: '追いかけ項目が見つかりません' }, { status: 400 })
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '入力内容が不正です' }, { status: 400 })
    }
    const action = (body as { action?: unknown }).action as FollowUpAction | undefined
    if (!action || !['contact', 'update', 'remove', 'reactivate'].includes(action)) {
      return NextResponse.json({ error: '操作内容が不正です' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: existing, error: existingError } = await supabase
      .from('customer_follow_ups')
      .select('id, customer_id, cast_id, is_active, current_cycle_id, return_visit_deadline, return_visit_deadline_preset, return_visit_configured_at, last_repeated_at, sales_contact_interval_days, sales_contact_configured_at')
      .eq('id', id)
      .maybeSingle()
    if (existingError) throw existingError
    if (!existing) {
      return NextResponse.json({ error: '追いかけ項目が見つかりません' }, { status: 404 })
    }

    // 同じ操作が別タブや連打で重なっても、状態が変わらない場合は周期IDを更新しない。
    // active のまま新しい周期IDだけを発行すると、開始ログのない孤立周期になるため先に終了する。
    if (action === 'reactivate' && existing.is_active) {
      return NextResponse.json(existing)
    }
    if (action === 'remove' && !existing.is_active) {
      return NextResponse.json(existing)
    }

    const now = new Date().toISOString()
    const payload: Record<string, unknown> = {}
    if (action === 'contact') {
      payload.last_contacted_at = now
      payload.last_contacted_by = profile.id
      // 連絡済みにしても is_active は変更しない。明示的に外すまで残す。
    } else if (action === 'remove') {
      payload.is_active = false
      payload.removed_at = now
      payload.removed_by = profile.id
    } else if (action === 'reactivate') {
      payload.current_cycle_id = crypto.randomUUID()
      payload.is_active = true
      payload.activated_at = now
      payload.activated_by = profile.id
      payload.removed_at = null
      payload.removed_by = null
      payload.last_checked_at = null
      payload.last_check_result = null
      payload.last_repeated_at = null
    }

    const nextContactDate = parseOptionalDate((body as { nextContactDate?: unknown }).nextContactDate)
    if (nextContactDate !== undefined) payload.next_contact_date = nextContactDate
    const nextAction = parseOptionalNextAction((body as { nextAction?: unknown }).nextAction)
    if (nextAction !== undefined) payload.next_action = nextAction
    const nextActions = parseOptionalActionItems((body as { nextActions?: unknown }).nextActions)
    if (nextActions !== undefined) payload.next_actions = nextActions
    const followUpPriority = parseOptionalFollowUpPriority(
      (body as { followUpPriority?: unknown }).followUpPriority,
    )
    if (followUpPriority !== undefined) payload.follow_up_priority = followUpPriority
    const returnVisitDeadlinePreset = parseOptionalReturnVisitPreset(
      (body as { returnVisitDeadlinePreset?: unknown }).returnVisitDeadlinePreset,
    )
    if (returnVisitDeadlinePreset !== undefined) {
      payload.return_visit_deadline_preset = returnVisitDeadlinePreset
      payload.return_visit_deadline = resolveReturnVisitDeadline(
        returnVisitDeadlinePreset,
        existing.return_visit_deadline_preset as ReturnVisitDeadlinePreset | null,
        getEffectiveReturnVisitDeadline({
          return_visit_deadline: existing.return_visit_deadline,
          return_visit_deadline_preset: existing.return_visit_deadline_preset as ReturnVisitDeadlinePreset | null,
          return_visit_configured_at: existing.return_visit_configured_at,
          last_repeated_at: existing.last_repeated_at,
        }),
        getJstDateString(),
      )
      payload.return_visit_configured_at = now
    }
    const salesContactIntervalDays = parseOptionalSalesInterval(
      (body as { salesContactIntervalDays?: unknown }).salesContactIntervalDays,
    )
    if (salesContactIntervalDays !== undefined) {
      payload.sales_contact_interval_days = salesContactIntervalDays
      if (
        salesContactIntervalDays !== existing.sales_contact_interval_days
        || !existing.sales_contact_configured_at
      ) {
        payload.sales_contact_configured_at = now
      }
    }
    const noteValue = (body as { note?: unknown }).note
    if (typeof noteValue === 'string') payload.note = noteValue.trim().slice(0, 1000) || null

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: '更新する内容がありません' }, { status: 400 })
    }

    let updateQuery = supabase
      .from('customer_follow_ups')
      .update(payload)
      .eq('id', id)
    // 読取後に別画面が同じ操作を終えた場合は、古い状態を前提に更新しない。
    // 特に再開では current_cycle_id だけが後勝ちして開始ログを失う競合を防ぐ。
    if (action === 'remove') updateQuery = updateQuery.eq('is_active', true)
    if (action === 'reactivate') updateQuery = updateQuery.eq('is_active', false)
    const { data, error } = await updateQuery
      .select('*')
      .maybeSingle()
    if (error) throw error
    if (!data) {
      const { data: current, error: currentError } = await supabase
        .from('customer_follow_ups')
        .select('*')
        .eq('id', id)
        .single()
      if (currentError) throw currentError
      return NextResponse.json(current)
    }
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新に失敗しました'
    if (
      message.includes('YYYY-MM-DD')
      || message.includes('次の行動')
      || message.includes('優先度')
      || message.includes('再来店期限')
      || message.includes('営業連絡間隔')
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    console.error('PATCH /api/follow-ups/[id] error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
