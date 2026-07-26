import { NextResponse } from 'next/server'
import { checkPermission, requireUser } from '@/lib/auth'
import { getMissingCoreCustomerFields } from '@/lib/coreCustomerFields'
import { getJstDateString } from '@/lib/followUpWorkflow'
import { createClient } from '@/lib/supabase/server'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

type CoreCustomerRow = {
  customer_name: string | null
  nickname: string | null
  age_group: string | null
  region: string | null
  spouse_status: string | null
  occupation: string | null
  nomination_status: string | null
}

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

    const [followUps, plannedVisits, customers] = await Promise.all([
      fetchAllPaginated<{ id: string; next_contact_date: string | null }>((from, to) =>
        supabase
          .from('customer_follow_ups')
          .select('id, next_contact_date')
          .eq('is_active', true)
          .range(from, to)
      ),
      fetchAllPaginated<{ id: number }>((from, to) =>
        supabase
          .from('planned_visits')
          .select('id')
          .eq('status', '予定')
          .eq('planned_date', today)
          .range(from, to)
      ),
      fetchAllPaginated<CoreCustomerRow>((from, to) =>
        supabase
          .from('customers')
          .select('customer_name, nickname, age_group, region, spouse_status, occupation, nomination_status')
          .range(from, to)
      ),
    ])

    const dueFollowUps = followUps.filter(item =>
      item.next_contact_date !== null && item.next_contact_date <= today
    ).length
    const incompleteCustomers = customers.filter(customer =>
      getMissingCoreCustomerFields(customer).length > 0
    ).length

    return NextResponse.json({
      available: true,
      todayPlannedVisits: plannedVisits.length,
      activeFollowUps: followUps.length,
      dueFollowUps,
      incompleteCustomers,
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
