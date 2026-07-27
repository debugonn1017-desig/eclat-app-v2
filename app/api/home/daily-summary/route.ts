import { NextResponse } from 'next/server'
import { checkPermission, requireUser } from '@/lib/auth'
import { getJstDateString } from '@/lib/followUpWorkflow'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const profile = await requireUser()
    if (profile.role === 'admin' && !profile.is_owner) {
      const allowed = await checkPermission('顧客.閲覧')
      if (!allowed) {
        return NextResponse.json({
          available: false,
          todayPlannedVisits: 0,
          activeFollowUps: 0,
          dueFollowUps: 0,
          incompleteCustomers: 0,
        })
      }
    }

    const supabase = await createClient()
    const today = getJstDateString()
    const { data, error } = await supabase
      .rpc('get_daily_workflow_summary', { p_today: today })
      .single()
    if (error) throw new Error(error.message)
    const summary = data as {
      today_planned_visits?: number | string | null
      active_follow_ups?: number | string | null
      due_follow_ups?: number | string | null
      incomplete_customers?: number | string | null
    } | null

    return NextResponse.json({
      available: true,
      todayPlannedVisits: Number(summary?.today_planned_visits ?? 0),
      activeFollowUps: Number(summary?.active_follow_ups ?? 0),
      dueFollowUps: Number(summary?.due_follow_ups ?? 0),
      incompleteCustomers: Number(summary?.incomplete_customers ?? 0),
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '取得に失敗しました'
    if (message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    console.error('GET /api/home/daily-summary error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
