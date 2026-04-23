// 来店予定 CRUD
//   GET  /api/planned-visits?customer_id=X  -> list planned visits for a customer
//   GET  /api/planned-visits?cast_id=X&month=YYYY-MM  -> list by cast & month
//   POST /api/planned-visits  -> create a new planned visit
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/** 翌日AM4:00を過ぎた「予定」を自動キャンセルする */
async function autoCancelExpired() {
  const supabase = await createClient()

  // 現在の日本時間を取得
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000) // UTC+9
  const jstHour = jst.getUTCHours()

  // 「翌日AM4:00」= planned_date + 1日 の 04:00 JST
  // つまり現在が AM4:00 以降なら、昨日以前の予定をキャンセル
  // AM4:00 未満なら、一昨日以前の予定をキャンセル
  let cutoffDate: string
  if (jstHour >= 4) {
    // 今日の日付（JST）以前の予定をキャンセル
    cutoffDate = jst.toISOString().slice(0, 10)
  } else {
    // 昨日の日付（JST）以前の予定をキャンセル
    const yesterday = new Date(jst.getTime() - 24 * 60 * 60 * 1000)
    cutoffDate = yesterday.toISOString().slice(0, 10)
  }

  await supabase
    .from('planned_visits')
    .update({ status: 'キャンセル', updated_at: new Date().toISOString() })
    .eq('status', '予定')
    .lt('planned_date', cutoffDate)
}

export async function GET(request: NextRequest) {
  try {
    await requireUser()
    const supabase = await createClient()

    // 自動キャンセル処理
    await autoCancelExpired()

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customer_id')
    const castId = searchParams.get('cast_id')
    const month = searchParams.get('month')

    let query = supabase
      .from('planned_visits')
      .select('*, customers!inner(customer_name, cast_name)')
      .order('planned_date', { ascending: true })

    if (customerId) {
      query = query.eq('customer_id', Number(customerId))
    }

    if (castId && month) {
      // キャストの月別来店予定
      const [y, m] = month.split('-').map(Number)
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`
      const endDate = new Date(y, m, 0).toISOString().slice(0, 10) // 月末
      query = query
        .eq('cast_id', castId)
        .gte('planned_date', startDate)
        .lte('planned_date', endDate)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // flatten customer info
    const result = (data ?? []).map((row: Record<string, unknown>) => {
      const customers = row.customers as { customer_name: string; cast_name: string } | null
      return {
        ...row,
        customer_name: customers?.customer_name ?? '',
        cast_name: customers?.cast_name ?? '',
        customers: undefined,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireUser()
    const supabase = await createClient()

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '不正なリクエスト' }, { status: 400 })
    }

    const customerId = Number(body.customer_id)
    if (!customerId || isNaN(customerId)) {
      return NextResponse.json({ error: '顧客IDが必要です' }, { status: 400 })
    }

    if (!body.planned_date) {
      return NextResponse.json({ error: '来店予定日は必須です' }, { status: 400 })
    }

    const payload = {
      customer_id: customerId,
      cast_id: profile.id,
      planned_date: body.planned_date,
      planned_time: body.planned_time || null,
      party_size: body.party_size ? Number(body.party_size) : null,
      has_douhan: typeof body.has_douhan === 'boolean' ? body.has_douhan : null,
      memo: body.memo || null,
      status: '予定',
    }

    const { data, error } = await supabase
      .from('planned_visits')
      .insert([payload])
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
