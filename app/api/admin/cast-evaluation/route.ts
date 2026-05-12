// ─────────────────────────────────────────────────────────────────
//  /api/admin/cast-evaluation
//   キャスト評価ページ用の集約データ
//   各キャスト × 月 で必要な KPI + ランキング材料を一括取得
//
//  GET ?month=YYYY-MM
//   → CastRow[] (評価点・強化点の計算に必要なフィールド全部)
//
//  認証: is_owner または「KPI.詳細分析」
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCastTargetFull } from '@/lib/targetResolver'
import type { CastProfile, CustomerRank } from '@/types'

function getMonthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

function computePrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function GET(request: Request) {
  try {
    await requirePermission('KPI.詳細分析')

    const url = new URL(request.url)
    const month = url.searchParams.get('month') ?? (() => {
      const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month は YYYY-MM 形式' }, { status: 400 })
    }

    const prevMonth = computePrevMonth(month)
    const startDate = `${month}-01`
    const endDate = getMonthEnd(month)
    const prevStart = `${prevMonth}-01`
    const prevEnd = getMonthEnd(prevMonth)

    const admin = createAdminClient()

    // 60 日前 (新人判定用)
    const newCutoff = new Date()
    newCutoff.setDate(newCutoff.getDate() - 60)
    const newCutoffStr = newCutoff.toISOString().slice(0, 10)

    // ─── 全キャスト ──────────────────────────────────
    const { data: castsData, error: castsErr } = await admin
      .from('profiles')
      .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
      .eq('role', 'cast')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    if (castsErr) throw castsErr
    const casts = (castsData ?? []) as (CastProfile & { created_at: string })[]
    const castIds = casts.map(c => c.id)
    const castNames = casts.map(c => c.cast_name).filter(Boolean) as string[]
    if (casts.length === 0) return NextResponse.json([])

    // ─── 顧客 + ランク (cast_name → 顧客リスト) ─────────
    type CustomerRow = { id: string; cast_name: string; nomination_status: string | null; customer_rank: CustomerRank | null }
    let customers: CustomerRow[] = []
    if (castNames.length > 0) {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error } = await admin
          .from('customers')
          .select('id, cast_name, nomination_status, customer_rank')
          .in('cast_name', castNames)
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data ?? []) as CustomerRow[]
        customers.push(...batch)
        if (batch.length < PAGE) break
        from += PAGE
      }
    }
    const customersByCast = new Map<string, CustomerRow[]>()
    for (const c of customers) {
      const list = customersByCast.get(c.cast_name) ?? []
      list.push(c)
      customersByCast.set(c.cast_name, list)
    }
    const allCustomerIds = customers.map(c => c.id)

    // ─── 当月来店 ─────────────────────────────────────
    type VisitRow = { customer_id: string; amount_spent: number | null; has_douhan: boolean | null; has_after: boolean | null }
    let visits: VisitRow[] = []
    if (allCustomerIds.length > 0) {
      const PAGE = 1000; let from = 0
      while (true) {
        const { data, error } = await admin
          .from('customer_visits')
          .select('customer_id, amount_spent, has_douhan, has_after')
          .in('customer_id', allCustomerIds)
          .gte('visit_date', startDate).lte('visit_date', endDate)
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = (data ?? []) as VisitRow[]
        visits.push(...batch)
        if (batch.length < PAGE) break
        from += PAGE
      }
    }
    const visitsByCustomer = new Map<string, VisitRow[]>()
    for (const v of visits) {
      const list = visitsByCustomer.get(v.customer_id) ?? []
      list.push(v); visitsByCustomer.set(v.customer_id, list)
    }

    // ─── 前月来店 ─────────────────────────────────────
    let prevVisits: { customer_id: string; amount_spent: number | null }[] = []
    if (allCustomerIds.length > 0) {
      const PAGE = 1000; let from = 0
      while (true) {
        const { data, error } = await admin
          .from('customer_visits')
          .select('customer_id, amount_spent')
          .in('customer_id', allCustomerIds)
          .gte('visit_date', prevStart).lte('visit_date', prevEnd)
          .range(from, from + PAGE - 1)
        if (error) throw error
        const batch = data ?? []
        prevVisits.push(...batch)
        if (batch.length < PAGE) break
        from += PAGE
      }
    }
    const prevSalesByCustomer = new Map<string, number>()
    for (const v of prevVisits) {
      prevSalesByCustomer.set(v.customer_id,
        (prevSalesByCustomer.get(v.customer_id) ?? 0) + (Number(v.amount_spent) || 0))
    }

    // ─── 場内延長 (当月) ───────────────────────────────
    const { data: extData } = await admin
      .from('cast_extension_sales')
      .select('cast_id, amount_spent')
      .in('cast_id', castIds)
      .gte('sale_date', startDate).lte('sale_date', endDate)
    const extByCast = new Map<string, number>()
    for (const e of (extData ?? []) as { cast_id: string; amount_spent: number | null }[]) {
      extByCast.set(e.cast_id, (extByCast.get(e.cast_id) ?? 0) + (Number(e.amount_spent) || 0))
    }

    // ─── 場内延長 (前月) ───────────────────────────────
    const { data: prevExtData } = await admin
      .from('cast_extension_sales')
      .select('cast_id, amount_spent')
      .in('cast_id', castIds)
      .gte('sale_date', prevStart).lte('sale_date', prevEnd)
    const prevExtByCast = new Map<string, number>()
    for (const e of (prevExtData ?? []) as { cast_id: string; amount_spent: number | null }[]) {
      prevExtByCast.set(e.cast_id, (prevExtByCast.get(e.cast_id) ?? 0) + (Number(e.amount_spent) || 0))
    }

    // ─── nomination_history (転換 + 新規場内獲得) ──────
    const { data: histData } = await admin
      .from('nomination_history')
      .select('cast_id, old_status, new_status')
      .in('cast_id', castIds)
      .gte('changed_at', startDate).lte('changed_at', endDate + 'T23:59:59')
    const conversionByCast = new Map<string, number>()
    const banaiAcquiredByCast = new Map<string, number>()
    for (const h of (histData ?? []) as { cast_id: string; old_status: string | null; new_status: string }[]) {
      if ((h.old_status === '場内' || h.old_status === 'フリー') && h.new_status === '本指名') {
        conversionByCast.set(h.cast_id, (conversionByCast.get(h.cast_id) ?? 0) + 1)
      }
      if (h.new_status === '場内') {
        banaiAcquiredByCast.set(h.cast_id, (banaiAcquiredByCast.get(h.cast_id) ?? 0) + 1)
      }
    }

    // ─── シフト (出勤日数) ─────────────────────────────
    const { data: shiftsData } = await admin
      .from('cast_shifts')
      .select('cast_id, status')
      .in('cast_id', castIds)
      .gte('shift_date', startDate).lte('shift_date', endDate)
    const workDaysByCast = new Map<string, number>()
    for (const s of (shiftsData ?? []) as { cast_id: string; status: string }[]) {
      if (s.status === '出勤' || s.status === '来客出勤') {
        workDaysByCast.set(s.cast_id, (workDaysByCast.get(s.cast_id) ?? 0) + 1)
      }
    }

    // ─── ノルマ (階層検索) ────────────────────────────
    const [castTargetsRes, tierTargetsRes] = await Promise.all([
      admin.from('cast_targets').select('*'),
      admin.from('cast_tier_targets').select('*'),
    ])
    const castTargets = castTargetsRes.data ?? []
    const tierTargets = tierTargetsRes.data ?? []

    // ─── キャスト単位で集計 ──────────────────────────
    const rows = casts.map(cast => {
      const myCust = customersByCast.get(cast.cast_name ?? '') ?? []
      const myCustIds = myCust.map(c => c.id)
      const honshimei = myCust.filter(c => c.nomination_status === '本指名')
      const honshimeiCount = honshimei.length
      const highRankCount = honshimei.filter(
        c => c.customer_rank === 'S' || c.customer_rank === 'A'
      ).length

      let monthlySales = 0, visitGroups = 0, douhanCount = 0, afterCount = 0
      const visitedSet = new Set<string>()
      for (const cid of myCustIds) {
        const list = visitsByCustomer.get(cid) ?? []
        const paid = list.filter(v => (Number(v.amount_spent) || 0) > 0)
        if (paid.length > 0) visitedSet.add(cid)
        for (const v of list) {
          monthlySales += Number(v.amount_spent) || 0
          if (v.has_douhan) douhanCount++
          if (v.has_after) afterCount++
        }
      }
      visitGroups = visitedSet.size
      const avgSpend = visitGroups > 0 ? Math.round(monthlySales / visitGroups) : 0
      monthlySales += extByCast.get(cast.id) ?? 0

      let prevSales = 0
      for (const cid of myCustIds) prevSales += prevSalesByCustomer.get(cid) ?? 0
      prevSales += prevExtByCast.get(cast.id) ?? 0

      // ノルマ (階層検索)
      const resolved = resolveCastTargetFull(
        castTargets, tierTargets, cast.id, cast.cast_tier ?? null, month,
      )
      const targetSales = resolved.target_sales
      const achievementRate = targetSales > 0
        ? Math.round((monthlySales / targetSales) * 100)
        : 0

      // 新人判定 (60日以内)
      const isNew = cast.created_at >= newCutoffStr

      return {
        castId: cast.id,
        castName: cast.display_name || cast.cast_name || null,
        tier: cast.cast_tier ?? null,
        isNew,
        monthlySales,
        targetSales,
        achievementRate,
        prevSales,
        visitGroups,
        avgSpend,
        douhanCount,
        afterCount,
        honshimeiCount,
        highRankCount,
        banaiAcquiredCount: banaiAcquiredByCast.get(cast.id) ?? 0,
        conversionCount: conversionByCast.get(cast.id) ?? 0,
        workDays: workDaysByCast.get(cast.id) ?? 0,
        targetWorkDays: resolved.target_work_days,
      }
    })

    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'KPI.詳細分析 権限が必要です' }, { status: 403 })
    }
    console.error('GET /api/admin/cast-evaluation error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
