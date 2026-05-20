// ─────────────────────────────────────────────────────────────────
//  GET /api/admin/customer-staff-list
// ─────────────────────────────────────────────────────────────────
//  「お客様担当」チェック（has_customer_staff=true）が付いた顧客を一覧化。
//  各顧客の来店集計（最終来店日・経過日数・来店回数・平均単価・合計金額）を返す。
//
//  認証: オーナー または 管理者(admin) のみ
//  v0.3.28 (2026-05-20)
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

type Row = {
  id: string
  customer_name: string | null
  region: string | null
  cast_name: string | null
  customer_rank: string | null
  lastVisit: string | null
  daysSince: number | null
  visitCount: number
  avgSpend: number
  total: number
}

export async function GET() {
  try {
    const profile = await requireUser()
    // オーナー or 管理者(admin) のみ
    if (!profile.is_owner && profile.role !== 'admin') {
      return NextResponse.json({ error: 'オーナー・管理者のみアクセスできます' }, { status: 403 })
    }

    const admin = createAdminClient()

    // 1) has_customer_staff=true の顧客を全件取得
    const custRows = await fetchAllPaginated<{
      id: string | number
      customer_name: string | null
      region: string | null
      cast_name: string | null
      customer_rank: string | null
    }>((from, to) =>
      admin
        .from('customers')
        .select('id, customer_name, region, cast_name, customer_rank')
        .eq('has_customer_staff', true)
        .range(from, to)
    ).catch(() => [])

    const custIds = custRows.map((c) => String(c.id))
    if (custIds.length === 0) {
      return NextResponse.json({ rows: [] })
    }

    // 2) 来店履歴を 200件チャンクで取得して顧客別に集計
    type VisitRow = { customer_id: string | number; visit_date: string; amount_spent: number | null }
    const visitsByCustomer = new Map<string, VisitRow[]>()
    const CHUNK = 200
    for (let i = 0; i < custIds.length; i += CHUNK) {
      const chunk = custIds.slice(i, i + CHUNK)
      const rows = await fetchAllPaginated<VisitRow>((from, to) =>
        admin
          .from('customer_visits')
          .select('customer_id, visit_date, amount_spent')
          .in('customer_id', chunk)
          .range(from, to)
      ).catch(() => [])
      for (const v of rows) {
        const key = String(v.customer_id)
        const list = visitsByCustomer.get(key) ?? []
        list.push(v)
        visitsByCustomer.set(key, list)
      }
    }

    // 3) 顧客ごとに集計
    const todayMs = Date.now()
    const rows: Row[] = custRows.map((c) => {
      const visits = visitsByCustomer.get(String(c.id)) ?? []
      const total = visits.reduce((acc, v) => acc + (Number(v.amount_spent) || 0), 0)
      const paid = visits.filter((v) => (Number(v.amount_spent) || 0) > 0)
      const avgSpend = paid.length > 0
        ? Math.round(paid.reduce((a, v) => a + (Number(v.amount_spent) || 0), 0) / paid.length)
        : 0
      let lastVisit: string | null = null
      for (const v of visits) {
        if (!lastVisit || v.visit_date > lastVisit) lastVisit = v.visit_date
      }
      const daysSince = lastVisit
        ? Math.floor((todayMs - new Date(lastVisit + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
        : null
      return {
        id: String(c.id),
        customer_name: c.customer_name,
        region: c.region,
        cast_name: c.cast_name,
        customer_rank: c.customer_rank,
        lastVisit,
        daysSince,
        visitCount: visits.length,
        avgSpend,
        total,
      }
    })

    // デフォルト: 合計金額の高い順
    rows.sort((a, b) => b.total - a.total)

    return NextResponse.json({ rows }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('GET /api/admin/customer-staff-list error:', err)
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
