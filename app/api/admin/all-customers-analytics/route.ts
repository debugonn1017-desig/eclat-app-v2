// ─────────────────────────────────────────────────────────────────
//  /api/admin/all-customers-analytics
//   C-1: お客様分析ページ用の全店データを 1 リクエストで集約
//
//  GET → { customers, visitsByCustomer, extSalesByCustomer, casts }
//
//  認証: is_owner または「顧客.全店分析」権限が必要
//  対象: 全顧客 + 全来店履歴 + 場内延長 (LTV 用) + キャストプロフィール
//  ページング: customer_visits は customer_id を 500 件ずつチャンク + 1000 行ずつページング
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CastProfile, Customer, CustomerVisit } from '@/types'

function getMonthEndDate(month: string): string {
  // 'YYYY-MM' → 'YYYY-MM-LAST_DAY'
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

export async function GET(request: Request) {
  try {
    await requirePermission('顧客.全店分析')

    const url = new URL(request.url)
    const basisMonth = url.searchParams.get('month')  // 'YYYY-MM' or null
    // basisMonth があれば visit_date を月末以下にフィルタ。なければ全期間。
    const basisMonthEnd = basisMonth && /^\d{4}-\d{2}$/.test(basisMonth)
      ? getMonthEndDate(basisMonth)
      : null

    const admin = createAdminClient()
    const PAGE = 1000

    // ─── ① キャストプロフィール ───────────────────────────
    const { data: castsData, error: castsErr } = await admin
      .from('profiles')
      .select('id, role, cast_name, display_name, cast_tier, is_active, is_owner, created_at')
      .eq('role', 'cast')
      .order('cast_tier', { ascending: true })
      .order('created_at', { ascending: true })
    if (castsErr) throw castsErr
    const casts = (castsData ?? []) as CastProfile[]

    // ─── ② 全顧客取得（ページング）─────────────────────────
    const customers: Customer[] = []
    {
      let from = 0
      while (true) {
        const { data, error } = await admin
          .from('customers')
          .select('*')
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data ?? []) as Customer[]
        customers.push(...batch)
        if (batch.length < PAGE) break
        from += PAGE
      }
    }

    if (customers.length === 0) {
      return NextResponse.json({
        customers: [], visitsByCustomer: {}, extSalesByCustomer: {}, casts,
      })
    }

    // ─── ③ 来店履歴を全顧客分集約（500件ずつチャンク + ページング）──
    const customerIds = customers.map(c => c.id)
    const visitsByCustomer: Record<string, CustomerVisit[]> = {}
    const CHUNK = 500
    for (let i = 0; i < customerIds.length; i += CHUNK) {
      const chunk = customerIds.slice(i, i + CHUNK)
      let from = 0
      while (true) {
        let q = admin
          .from('customer_visits')
          .select('*')
          .in('customer_id', chunk)
          .order('visit_date', { ascending: true })
          .range(from, from + PAGE - 1)
        // v6 (2026-05-12): 基準月までのデータに絞る (月切替対応)
        if (basisMonthEnd) q = q.lte('visit_date', basisMonthEnd)
        const { data, error } = await q
        if (error) throw error
        const batch = (data ?? []) as CustomerVisit[]
        for (const v of batch) {
          if (!visitsByCustomer[v.customer_id]) visitsByCustomer[v.customer_id] = []
          visitsByCustomer[v.customer_id].push(v)
        }
        if (batch.length < PAGE) break
        from += PAGE
      }
    }

    // ─── ④ 場内延長売上を cast_id ごとに集計（LTV 補助）──────
    //   ※ cast_extension_sales は customer_id を持たないので、
    //     キャスト単位の集計しかできない。LTV は visits ベースのみで OK。
    //     ここでは「キャストの月別延長売上合計」を担当顧客全体に均等配分しない
    //     （配分すると不正確）。LTV 計算は visits だけを使う。
    //   ただし将来 cast_extension_sales に customer_id が付くなら拡張可能。
    const extSalesByCustomer: Record<string, number> = {}

    return NextResponse.json(
      { customers, visitsByCustomer, extSalesByCustomer, casts },
      // v0.3.44-A2: Vary: Cookie 追加（同一ブラウザ内のユーザー切替対策）
      { headers: { 'Cache-Control': 'private, max-age=60', 'Vary': 'Cookie' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: '顧客.全店分析 権限が必要です' }, { status: 403 })
    }
    console.error('GET /api/admin/all-customers-analytics error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
