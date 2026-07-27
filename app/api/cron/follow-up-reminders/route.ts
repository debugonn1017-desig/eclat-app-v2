import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getSalesContactDeadline,
  type SalesContactIntervalDays,
} from '@/lib/followUpWorkflow'
import { sendPushToUsers } from '@/lib/push'

type ActiveFollowUp = {
  customer_id: string | number
  cast_id: string
  return_visit_deadline: string | null
  sales_contact_interval_days: SalesContactIntervalDays | null
  last_contacted_at: string | null
  activated_at: string
}

type ActiveCastProfile = {
  id: string
  cast_name: string | null
}

type CustomerAssignment = {
  id: string | number
  cast_name: string | null
}

function getJstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const reminderDate = getJstDate()
    const { data: followUpData, error: followUpError } = await admin
      .from('customer_follow_ups')
      .select(
        'customer_id, cast_id, return_visit_deadline, sales_contact_interval_days, last_contacted_at, activated_at',
      )
      .eq('is_active', true)
    if (followUpError) throw followUpError

    const activeFollowUps = (followUpData ?? []) as ActiveFollowUp[]
    if (activeFollowUps.length === 0) {
      return NextResponse.json({ delivered: 0, failed: 0, skipped: 'no_active_follow_ups' })
    }

    const castIds = [...new Set(activeFollowUps.map(row => row.cast_id))]
    const customerIds = [...new Set(activeFollowUps.map(row => String(row.customer_id)))]
    const [
      { data: activeProfiles, error: profileError },
      { data: disabledPreferences, error: preferenceError },
      { data: customerAssignments, error: customerError },
    ] = await Promise.all([
      admin
        .from('profiles')
        .select('id, cast_name')
        .in('id', castIds)
        .eq('role', 'cast')
        .eq('is_active', true),
      admin
        .from('follow_up_notification_preferences')
        .select('user_id')
        .in('user_id', castIds)
        .eq('daily_enabled', false),
      admin
        .from('customers')
        .select('id, cast_name')
        .in('id', customerIds),
    ])
    if (profileError) throw profileError
    if (preferenceError) throw preferenceError
    if (customerError) throw customerError

    const activeCastNames = new Map(
      ((activeProfiles ?? []) as ActiveCastProfile[])
        .map(profile => [String(profile.id), profile.cast_name] as const),
    )
    const currentCustomerAssignments = new Map(
      ((customerAssignments ?? []) as CustomerAssignment[])
        .map(customer => [String(customer.id), customer.cast_name] as const),
    )
    const disabledCastIds = new Set((disabledPreferences ?? []).map(row => String(row.user_id)))

    // 担当変更・担当解除後の古い追いかけ行は履歴として残す一方、旧キャストへは通知しない。
    // これにより「通知は来るのに、RLS 上はリストが空」というズレを防ぐ。
    const byCast = new Map<string, ActiveFollowUp[]>()
    let staleAssignmentCount = 0
    for (const row of activeFollowUps) {
      const profileCastName = activeCastNames.get(row.cast_id)
      const currentCastName = currentCustomerAssignments.get(String(row.customer_id))
      if (!profileCastName || !currentCastName || currentCastName !== profileCastName) {
        staleAssignmentCount += 1
        continue
      }
      const list = byCast.get(row.cast_id)
      if (list) list.push(row)
      else byCast.set(row.cast_id, [row])
    }
    if (byCast.size === 0) {
      return NextResponse.json({
        delivered: 0,
        failed: 0,
        skipped: 'no_current_assignments',
        stale_assignments: staleAssignmentCount,
      })
    }

    const eligibleCastIds = [...byCast.keys()]
    const results = await Promise.all(eligibleCastIds.map(async castId => {
      if (disabledCastIds.has(castId)) {
        return { delivered: 0, failed: 0, skipped: 1 }
      }
      const followUps = byCast.get(castId) ?? []
      const { error: claimError } = await admin
        .from('follow_up_reminder_log')
        .insert({
          cast_id: castId,
          reminder_date: reminderDate,
          active_count: followUps.length,
        })
      if (claimError) {
        // unique violation = 同日分は既に処理済み
        if (claimError.code === '23505') return { delivered: 0, failed: 0, skipped: 1 }
        throw claimError
      }

      const dueCount = followUps.filter(row => {
        const salesContactDeadline = getSalesContactDeadline(
          row.last_contacted_at,
          row.activated_at,
          row.sales_contact_interval_days,
        )
        return (
          (row.return_visit_deadline !== null && row.return_visit_deadline <= reminderDate)
          || (salesContactDeadline !== null && salesContactDeadline <= reminderDate)
        )
      }).length
      const body = dueCount > 0
        ? `追いかけ中は${followUps.length}人、営業連絡・再来店の確認が必要な方は${dueCount}人です。`
        : `追いかけ中のお客様が${followUps.length}人います。今日の連絡を確認しましょう。`
      const result = await sendPushToUsers(admin, [castId], {
        title: '追いかけリストの確認',
        body,
        url: '/follow-ups',
        tag: `follow-up-daily-${reminderDate}`,
      })
      await admin
        .from('follow_up_reminder_log')
        .update({
          delivered_count: result.delivered,
          failed_count: result.failed,
        })
        .eq('cast_id', castId)
        .eq('reminder_date', reminderDate)
      return { ...result, skipped: 0 }
    }))

    return NextResponse.json({
      delivered: results.reduce((sum, result) => sum + result.delivered, 0),
      failed: results.reduce((sum, result) => sum + result.failed, 0),
      skipped: results.reduce((sum, result) => sum + result.skipped, 0),
      reminder_date: reminderDate,
      stale_assignments: staleAssignmentCount,
    })
  } catch (error) {
    console.error('GET /api/cron/follow-up-reminders error:', error)
    return NextResponse.json({ error: '追いかけ通知の送信に失敗しました' }, { status: 500 })
  }
}
