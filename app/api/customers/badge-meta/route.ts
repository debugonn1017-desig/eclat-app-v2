// ─────────────────────────────────────────────────────────────────
//  GET /api/customers/badge-meta
// ─────────────────────────────────────────────────────────────────
//  顧客一覧ページの NEW バッジと最終来店経過日数 を表示するための補助データ。
//  返却:
//   - firstVisits:      Record<customer_id, 'YYYY-MM-DD'>  is_first_visit=true の最古 visit_date
//   - lastVisits:       Record<customer_id, 'YYYY-MM-DD'>  全期間最新 visit_date
//   - phaseShoshimeiAt: Record<customer_id, ISO>           phase='初指名' で保存した最新日時
//
//  v0.3.23 (2026-05-20):
//   - キャストロールは自分の担当顧客分だけ返す（プライバシー）
//   - admin / owner は全顧客分
//   - 1700+ 顧客でも 200 件チャンク + fetchAllPaginated で確実に取得
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

export async function GET() {
  try {
    const profile = await requireUser()
    const admin = createAdminClient()

    // 1) 担当範囲の customer 一覧を取得
    //    - cast: 自分の cast_name に紐づく顧客のみ
    //    - admin/owner: 全顧客
    type CustRow = { id: string | number; phase_shoshimei_at: string | null }
    let custRows: CustRow[] = []
    if (profile.role === 'cast' && profile.cast_name) {
      custRows = await fetchAllPaginated<CustRow>((from, to) =>
        admin
          .from('customers')
          .select('id, phase_shoshimei_at')
          .eq('cast_name', profile.cast_name)
          .range(from, to)
      ).catch(() => [])
    } else {
      custRows = await fetchAllPaginated<CustRow>((from, to) =>
        admin
          .from('customers')
          .select('id, phase_shoshimei_at')
          .range(from, to)
      ).catch(() => [])
    }

    const custIds = custRows.map((c) => String(c.id))
    const phaseShoshimeiAt: Record<string, string> = {}
    for (const c of custRows) {
      if (c.phase_shoshimei_at) phaseShoshimeiAt[String(c.id)] = c.phase_shoshimei_at
    }

    if (custIds.length === 0) {
      return NextResponse.json({ firstVisits: {}, lastVisits: {}, phaseShoshimeiAt: {} })
    }

    // 2) is_first_visit=true の visit を取得 → firstVisits（NEW バッジ用）
    //    URL 長制限回避のため customer_id を 200 件チャンク分割
    const firstVisits: Record<string, string> = {}
    const CHUNK = 200
    for (let i = 0; i < custIds.length; i += CHUNK) {
      const chunk = custIds.slice(i, i + CHUNK)
      const rows = await fetchAllPaginated<{ customer_id: string | number; visit_date: string }>(
        (from, to) =>
          admin
            .from('customer_visits')
            .select('customer_id, visit_date')
            .in('customer_id', chunk)
            .eq('is_first_visit', true)
            .order('visit_date', { ascending: true })
            .range(from, to)
      ).catch(() => [])
      for (const v of rows) {
        const key = String(v.customer_id)
        if (!firstVisits[key]) firstVisits[key] = v.visit_date
      }
    }

    // 3) 全期間 visit から各顧客の最新 visit_date を確定 → lastVisits（経過日数用）
    //    v0.3.31: 同じクエリで amount_spent も取って 累計来店回数 / 累計売上 / 平均単価 も算出
    const lastVisits: Record<string, string> = {}
    const visitCounts: Record<string, number> = {}
    const totalSales: Record<string, number> = {}
    for (let i = 0; i < custIds.length; i += CHUNK) {
      const chunk = custIds.slice(i, i + CHUNK)
      const rows = await fetchAllPaginated<{
        customer_id: string | number
        visit_date: string
        amount_spent: number | null
      }>(
        (from, to) =>
          admin
            .from('customer_visits')
            .select('customer_id, visit_date, amount_spent')
            .in('customer_id', chunk)
            .order('visit_date', { ascending: false })
            .range(from, to)
      ).catch(() => [])
      for (const v of rows) {
        const key = String(v.customer_id)
        if (!lastVisits[key]) lastVisits[key] = v.visit_date
        visitCounts[key] = (visitCounts[key] || 0) + 1
        totalSales[key] = (totalSales[key] || 0) + (v.amount_spent || 0)
      }
    }
    // 平均単価 = 累計売上 / 累計来店回数
    const avgPerVisit: Record<string, number> = {}
    for (const key of Object.keys(visitCounts)) {
      const count = visitCounts[key]
      avgPerVisit[key] = count > 0 ? Math.round(totalSales[key] / count) : 0
    }

    return NextResponse.json({ firstVisits, lastVisits, phaseShoshimeiAt, visitCounts, totalSales, avgPerVisit }, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        // v0.3.44-A2: Cookie が変わったらキャッシュ再利用しない（同一ブラウザ内のユーザー切替対策）
        'Vary': 'Cookie',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('GET /api/customers/badge-meta error:', err)
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
