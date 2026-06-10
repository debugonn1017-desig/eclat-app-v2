// ─────────────────────────────────────────────────────────────────
//  /api/admin/all-casts-honshimei
//   B-1: 全キャスト × 本指名顧客 + 来店履歴 を 1 リクエストで集約
//
//  GET → { casts, customersByCast, visitsByCustomer }
//
//  認証: is_owner または「レポート.全店ビュー」権限が必要
//  処理: 1000 件制限を考慮してページング
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CastProfile, Customer, CustomerVisit } from '@/types'

export async function GET() {
  try {
    await requirePermission('レポート.全店ビュー')

    const admin = createAdminClient()

    // ─── ① 稼働キャスト一覧（cast_name 持ちのみ）─────────────
    const { data: castsData, error: castsErr } = await admin
      .from('profiles')
      .select('id, role, cast_name, display_name, cast_tier, is_active, is_owner, created_at')
      .eq('role', 'cast')
      .eq('is_active', true)
      .order('cast_tier', { ascending: true })
      .order('created_at', { ascending: true })
    if (castsErr) throw castsErr
    const casts = ((castsData ?? []) as CastProfile[])
      .filter(c => !!c.cast_name)

    if (casts.length === 0) {
      return NextResponse.json({ casts: [], customersByCast: {}, visitsByCustomer: {} })
    }
    const castNames = casts.map(c => c.cast_name!).filter(Boolean) as string[]

    // ─── ② 本指名顧客を全件取得（cast_name で紐付け）────────
    //   N+1 を避けるため、in() でまとめて取得（1000 件制限はページング）
    let customersAll: Customer[] = []
    const PAGE = 1000
    {
      let from = 0
      while (true) {
        const { data, error } = await admin
          .from('customers')
          .select('*')
          .in('cast_name', castNames)
          .eq('nomination_status', '本指名')
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data ?? []) as Customer[]
        customersAll.push(...batch)
        if (batch.length < PAGE) break
        from += PAGE
      }
    }

    const customersByCast: Record<string, Customer[]> = {}
    for (const cast of casts) customersByCast[cast.id] = []
    // cast_name から cast.id を引くマップ
    const castIdByName = new Map<string, string>()
    for (const c of casts) {
      if (c.cast_name) castIdByName.set(c.cast_name, c.id)
    }
    for (const cust of customersAll) {
      const cid = cust.cast_name ? castIdByName.get(cust.cast_name) : undefined
      if (cid) customersByCast[cid].push(cust)
    }

    // ─── ③ 来店履歴を全件取得（customer_id で in()）───────
    const customerIds = customersAll.map(c => c.id)
    const visitsByCustomer: Record<string, CustomerVisit[]> = {}
    if (customerIds.length > 0) {
      // in() のパラメータが多すぎると URL がパンクするので 500 件ずつバッチ
      const BATCH = 500
      for (let i = 0; i < customerIds.length; i += BATCH) {
        const chunk = customerIds.slice(i, i + BATCH)
        let from = 0
        while (true) {
          const { data, error } = await admin
            .from('customer_visits')
            .select('*')
            .in('customer_id', chunk)
            .order('visit_date', { ascending: true })
            .range(from, from + PAGE - 1)
          if (error) throw error
          const batch = (data ?? []) as CustomerVisit[]
          for (const v of batch) {
            const list = visitsByCustomer[v.customer_id] ?? []
            list.push(v)
            visitsByCustomer[v.customer_id] = list
          }
          if (batch.length < PAGE) break
          from += PAGE
        }
      }
    }

    return NextResponse.json({ casts, customersByCast, visitsByCustomer }, {
      // v0.3.44-A2: Vary: Cookie 追加（同一ブラウザ内のユーザー切替対策）
      headers: { 'Cache-Control': 'private, max-age=30', 'Vary': 'Cookie' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'レポート.全店ビュー 権限が必要です' }, { status: 403 })
    }
    console.error('GET /api/admin/all-casts-honshimei error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
