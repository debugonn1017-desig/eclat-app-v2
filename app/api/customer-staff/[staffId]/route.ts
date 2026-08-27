import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEligibleCustomerStaffOptions } from '@/lib/customerStaffServer'

const CUSTOMER_COLUMNS = [
  'id',
  'customer_name',
  'nickname',
  'cast_name',
  'nomination_status',
  'customer_rank',
  'region',
  'metric_total_spent',
  'metric_visit_count',
  'metric_avg_per_visit',
  'metric_last_visit_date',
].join(',')

type CustomerMetricRow = {
  id: string | number
  customer_name: string | null
  nickname: string | null
  cast_name: string | null
  nomination_status: string | null
  customer_rank: string | null
  region: string | null
  metric_total_spent: number | string | null
  metric_visit_count: number | string | null
  metric_avg_per_visit: number | string | null
  metric_last_visit_date: string | null
}

type MonthlyVisitRow = {
  customer_id: string | number
  visit_date: string
  visit_time: string | null
  amount_spent: number | string | null
}

function monthRange(raw: string | null): { month: string; start: string; end: string } | null {
  const month = raw ?? new Date().toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit',
  }).slice(0, 7)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null
  const [year, monthNumber] = month.split('-').map(Number)
  const next = monthNumber === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`
  return { month, start: `${month}-01`, end: next }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }
  if (message === 'FORBIDDEN') {
    return NextResponse.json({ error: '黒服・オーナーのみ閲覧できます' }, { status: 403 })
  }
  return NextResponse.json({ error: 'お客様担当ページの取得に失敗しました' }, { status: 500 })
}

// 黒服・オーナー専用の「お客様担当」個人ページデータ。
// 店舗KPIやキャスト分類は書き換えず、割当テーブルの対象だけを集計する。
export async function GET(
  request: Request,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    await requireAdmin()
    const { staffId } = await params
    const range = monthRange(new URL(request.url).searchParams.get('month'))
    if (!range) {
      return NextResponse.json({ error: '対象月の形式が不正です' }, { status: 400 })
    }

    const eligible = await getEligibleCustomerStaffOptions()
    const staff = eligible.find(option => option.id === staffId)
    if (!staff) {
      return NextResponse.json({ error: 'お客様担当が見つかりません' }, { status: 404 })
    }

    const admin = createAdminClient()
    const { data: assignments, error: assignmentError } = await admin
      .from('customer_staff_assignments')
      .select('customer_id, created_at')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
    if (assignmentError) throw assignmentError

    const customerIds = (assignments ?? []).map(row => String(row.customer_id))
    if (customerIds.length === 0) {
      return NextResponse.json({
        staff,
        month: range.month,
        summary: { customerCount: 0, monthlySales: 0, monthlyVisits: 0 },
        customers: [],
      }, { headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } })
    }

    const customerRows: CustomerMetricRow[] = []
    const monthlyVisits: MonthlyVisitRow[] = []
    for (let index = 0; index < customerIds.length; index += 200) {
      const ids = customerIds.slice(index, index + 200)
      const [customerResult, visitResult] = await Promise.all([
        admin
          .from('customer_search_metrics_with_bottles')
          .select(CUSTOMER_COLUMNS)
          .in('id', ids),
        admin
          .from('customer_visits')
          .select('customer_id, visit_date, visit_time, amount_spent')
          .in('customer_id', ids)
          .eq('is_planned', false)
          .gte('visit_date', range.start)
          .lt('visit_date', range.end)
          .order('visit_date', { ascending: false })
          .order('visit_time', { ascending: false, nullsFirst: false }),
      ])
      if (customerResult.error) throw customerResult.error
      if (visitResult.error) throw visitResult.error
      customerRows.push(...((customerResult.data ?? []) as unknown as CustomerMetricRow[]))
      monthlyVisits.push(...((visitResult.data ?? []) as MonthlyVisitRow[]))
    }

    const monthlyByCustomer = new Map<string, { sales: number; visits: number }>()
    let monthlySales = 0
    for (const visit of monthlyVisits) {
      const customerId = String(visit.customer_id)
      const amount = Number(visit.amount_spent ?? 0)
      monthlySales += Number.isFinite(amount) ? amount : 0
      const current = monthlyByCustomer.get(customerId) ?? { sales: 0, visits: 0 }
      current.sales += Number.isFinite(amount) ? amount : 0
      current.visits += 1
      monthlyByCustomer.set(customerId, current)
    }

    const assignmentOrder = new Map(customerIds.map((id, index) => [id, index]))
    const customers = customerRows.map(row => {
      const monthly = monthlyByCustomer.get(String(row.id)) ?? { sales: 0, visits: 0 }
      return {
        id: String(row.id),
        customer_name: row.customer_name,
        nickname: row.nickname,
        cast_name: row.cast_name,
        nomination_status: row.nomination_status,
        customer_rank: row.customer_rank,
        region: row.region,
        total_spent: Number(row.metric_total_spent ?? 0),
        visit_count: Number(row.metric_visit_count ?? 0),
        avg_per_visit: Number(row.metric_avg_per_visit ?? 0),
        last_visit_date: row.metric_last_visit_date,
        monthly_sales: monthly.sales,
        monthly_visits: monthly.visits,
      }
    }).sort((a, b) => (assignmentOrder.get(a.id) ?? 0) - (assignmentOrder.get(b.id) ?? 0))

    return NextResponse.json({
      staff,
      month: range.month,
      summary: {
        customerCount: customers.length,
        monthlySales,
        monthlyVisits: monthlyVisits.length,
      },
      customers,
    }, { headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } })
  } catch (error) {
    console.error('GET /api/customer-staff/[staffId] error:', error)
    return errorResponse(error)
  }
}
