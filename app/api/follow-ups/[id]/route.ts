import { NextResponse } from 'next/server'
import { checkPermission, getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  getJstDateString,
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
      .select('id, is_active, return_visit_deadline, return_visit_deadline_preset')
      .eq('id', id)
      .maybeSingle()
    if (existingError) throw existingError
    if (!existing) {
      return NextResponse.json({ error: '追いかけ項目が見つかりません' }, { status: 404 })
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
      payload.is_active = true
      payload.activated_at = now
      payload.activated_by = profile.id
      payload.removed_at = null
      payload.removed_by = null
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
        existing.return_visit_deadline,
        getJstDateString(),
      )
    }
    const salesContactIntervalDays = parseOptionalSalesInterval(
      (body as { salesContactIntervalDays?: unknown }).salesContactIntervalDays,
    )
    if (salesContactIntervalDays !== undefined) {
      payload.sales_contact_interval_days = salesContactIntervalDays
    }
    const noteValue = (body as { note?: unknown }).note
    if (typeof noteValue === 'string') payload.note = noteValue.trim().slice(0, 1000) || null

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: '更新する内容がありません' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('customer_follow_ups')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
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
