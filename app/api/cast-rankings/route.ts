// 全キャストのランキングを集計して返す API。
//   GET /api/cast-rankings?month=YYYY-MM
//
// 通常の useCasts.getCastKPI はクライアント側 RLS に依存しているため
// キャストロールでは自分以外のプロフィール / 顧客 / 来店データが見えない。
// このエンドポイントは service-role でサーバー側集計し、
// 「ランキングに必要な集計値だけ」を返すことで、個人レベルの生データを
// 漏らさずにキャスト同士の比較を実現する。
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CastKPI, CastProfile, CustomerRank } from '@/types'

type RankingRow = {
  cast: CastProfile
  kpi: CastKPI
  prevSales: number
  targetSales: number
  achievementRate: number
}

function getMonthEndDate(month: string): string {
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
    // ログインユーザーなら誰でも閲覧可（キャスト・管理者共通）
    await requireUser()

    const url = new URL(request.url)
    const month = url.searchParams.get('month')
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'month=YYYY-MM が必要です' },
        { status: 400 }
      )
    }
    const prevMonth = computePrevMonth(month)
    const startDate = `${month}-01`
    const endDate = getMonthEndDate(month)
    const prevStart = `${prevMonth}-01`
    const prevEnd = getMonthEndDate(prevMonth)

    const admin = createAdminClient()

    // ─── 稼働キャスト一覧 ──────────────────────────────
    const { data: castsData, error: castsErr } = await admin
      .from('profiles')
      .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
      .eq('role', 'cast')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    if (castsErr) {
      console.error('cast-rankings profiles error:', castsErr)
      return NextResponse.json({ error: castsErr.message }, { status: 500 })
    }
    const casts = (castsData ?? []) as CastProfile[]
    if (casts.length === 0) return NextResponse.json([])

    const castIds = casts.map(c => c.id)
    const castNames = casts.map(c => c.cast_name).filter(Boolean) as string[]

    // ─── 顧客（cast_name でマッチ）────────────────────
    type CustomerRow = {
      id: string
      cast_name: string
      nomination_status: string | null
      region: string | null
      customer_rank: CustomerRank | null
      first_visit_date: string | null
    }
    let customers: CustomerRow[] = []
    if (castNames.length > 0) {
      const { data } = await admin
        .from('customers')
        .select('id, cast_name, nomination_status, region, customer_rank, first_visit_date')
        .in('cast_name', castNames)
      customers = (data ?? []) as CustomerRow[]
    }
    const customersByCast = new Map<string, CustomerRow[]>()
    for (const c of customers) {
      const list = customersByCast.get(c.cast_name) ?? []
      list.push(c)
      customersByCast.set(c.cast_name, list)
    }
    const allCustomerIds = customers.map(c => c.id)

    // ─── 当月来店 ─────────────────────────────────────
    type VisitRow = {
      customer_id: string
      amount_spent: number | null
      has_douhan: boolean | null
      has_after: boolean | null
    }
    let visits: VisitRow[] = []
    if (allCustomerIds.length > 0) {
      const { data } = await admin
        .from('customer_visits')
        .select('customer_id, amount_spent, has_douhan, has_after')
        .in('customer_id', allCustomerIds)
        .gte('visit_date', startDate)
        .lte('visit_date', endDate)
      visits = (data ?? []) as VisitRow[]
    }
    const visitsByCustomer = new Map<string, VisitRow[]>()
    for (const v of visits) {
      const list = visitsByCustomer.get(v.customer_id) ?? []
      list.push(v)
      visitsByCustomer.set(v.customer_id, list)
    }

    // ─── 前月来店（前月売上算出のみ）──────────────────
    let prevVisits: { customer_id: string; amount_spent: number | null }[] = []
    if (allCustomerIds.length > 0) {
      const { data } = await admin
        .from('customer_visits')
        .select('customer_id, amount_spent')
        .in('customer_id', allCustomerIds)
        .gte('visit_date', prevStart)
        .lte('visit_date', prevEnd)
      prevVisits = data ?? []
    }
    const prevSalesByCustomer = new Map<string, number>()
    for (const v of prevVisits) {
      prevSalesByCustomer.set(
        v.customer_id,
        (prevSalesByCustomer.get(v.customer_id) ?? 0) + (Number(v.amount_spent) || 0)
      )
    }

    // ─── 場内延長（当月）─────────────────────────────
    const { data: extData } = await admin
      .from('cast_extension_sales')
      .select('cast_id, amount_spent')
      .in('cast_id', castIds)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
    const extByCast = new Map<string, number>()
    for (const e of (extData ?? []) as { cast_id: string; amount_spent: number | null }[]) {
      extByCast.set(
        e.cast_id,
        (extByCast.get(e.cast_id) ?? 0) + (Number(e.amount_spent) || 0)
      )
    }

    // ─── 場内延長（前月）─────────────────────────────
    const { data: prevExtData } = await admin
      .from('cast_extension_sales')
      .select('cast_id, amount_spent')
      .in('cast_id', castIds)
      .gte('sale_date', prevStart)
      .lte('sale_date', prevEnd)
    const prevExtByCast = new Map<string, number>()
    for (const e of (prevExtData ?? []) as { cast_id: string; amount_spent: number | null }[]) {
      prevExtByCast.set(
        e.cast_id,
        (prevExtByCast.get(e.cast_id) ?? 0) + (Number(e.amount_spent) || 0)
      )
    }

    // ─── 場内→本指名 転換（当月）────────────────────
    const { data: convData } = await admin
      .from('nomination_history')
      .select('cast_id')
      .in('cast_id', castIds)
      .eq('old_status', '場内')
      .eq('new_status', '本指名')
      .gte('changed_at', startDate)
      .lte('changed_at', endDate + 'T23:59:59')
    const convCountByCast = new Map<string, number>()
    for (const r of (convData ?? []) as { cast_id: string }[]) {
      convCountByCast.set(r.cast_id, (convCountByCast.get(r.cast_id) ?? 0) + 1)
    }

    // ─── 個人目標 ─────────────────────────────────────
    const { data: targetsData } = await admin
      .from('cast_targets')
      .select('cast_id, target_sales')
      .in('cast_id', castIds)
      .eq('month', month)
    const targetByCast = new Map<string, number>()
    for (const t of (targetsData ?? []) as { cast_id: string; target_sales: number | null }[]) {
      targetByCast.set(t.cast_id, t.target_sales ?? 0)
    }

    // ─── キャスト単位で集計 ──────────────────────────
    const rows: RankingRow[] = casts.map(cast => {
      const myCustomers = customersByCast.get(cast.cast_name) ?? []
      const customerCount = myCustomers.length
      const banaCount = myCustomers.filter(c => c.nomination_status === '場内').length
      const honshimeiCount = myCustomers.filter(c => c.nomination_status === '本指名').length
      const freeCount = myCustomers.filter(
        c => !c.nomination_status || c.nomination_status === 'フリー'
      ).length
      const honshimeiCustomers = myCustomers.filter(c => c.nomination_status === '本指名')
      const localCustomerCount = honshimeiCustomers.filter(c => c.region === '福岡県').length
      const remoteCustomerCount = honshimeiCustomers.filter(
        c => c.region && c.region !== '福岡県'
      ).length
      const kokyakuCount = honshimeiCustomers.filter(
        c => c.region === '福岡県' && c.customer_rank && ['S', 'A', 'B'].includes(c.customer_rank)
      ).length
      const kengaiCount = remoteCustomerCount
      const rankCCount = myCustomers.filter(c => c.customer_rank === 'C').length

      // 当月来店をかき集める
      const myVisits: VisitRow[] = []
      myCustomers.forEach(c => {
        const list = visitsByCustomer.get(c.id) ?? []
        myVisits.push(...list)
      })

      let monthlySales = myVisits.reduce(
        (s, v) => s + (Number(v.amount_spent) || 0),
        0
      )
      const paidVisits = myVisits.filter(v => (Number(v.amount_spent) || 0) > 0)
      const visitGroups = new Set(paidVisits.map(v => v.customer_id)).size
      const totalVisitCount = myVisits.length
      const douhanCount = myVisits.filter(v => v.has_douhan).length
      const afterCount = myVisits.filter(v => v.has_after).length

      const rankBreakdown: Record<CustomerRank, { sales: number; visits: number }> = {
        S: { sales: 0, visits: 0 },
        A: { sales: 0, visits: 0 },
        B: { sales: 0, visits: 0 },
        C: { sales: 0, visits: 0 },
      }
      const rankMap = new Map<string, CustomerRank>()
      myCustomers.forEach(c => rankMap.set(c.id, (c.customer_rank || 'C') as CustomerRank))
      paidVisits.forEach(v => {
        const r = rankMap.get(v.customer_id) || 'C'
        rankBreakdown[r].sales += Number(v.amount_spent) || 0
        rankBreakdown[r].visits += 1
      })

      // 客単価（来店組ベース、場内延長は分母に入れない）
      const avgSpend = visitGroups > 0 ? Math.round(monthlySales / visitGroups) : 0

      // 場内延長を売上に加算
      monthlySales += extByCast.get(cast.id) ?? 0

      // 当月の場内来店件数（visit + first_visit_date 補完）
      let banaiMonthlyCount = 0
      const banaiCustomers = myCustomers.filter(c => c.nomination_status === '場内')
      const banaiVisitedSet = new Set<string>()
      banaiCustomers.forEach(c => {
        const list = visitsByCustomer.get(c.id) ?? []
        banaiMonthlyCount += list.length
        if (list.length > 0) banaiVisitedSet.add(c.id)
      })
      banaiCustomers.forEach(c => {
        if (!c.first_visit_date) return
        if (!String(c.first_visit_date).startsWith(month)) return
        if (banaiVisitedSet.has(c.id)) return
        banaiMonthlyCount += 1
      })

      const conversionCount = convCountByCast.get(cast.id) ?? 0

      const kpi: CastKPI = {
        monthlySales,
        targetSales: 0,
        achievementRate: 0,
        customerCount,
        banaCount,
        banaiMonthlyCount,
        honshimeiCount,
        freeCount,
        rankCCount,
        kokyakuCount,
        kengaiCount,
        workDays: 0,
        visitGroups,
        avgSpend,
        localCustomerCount,
        remoteCustomerCount,
        rankBreakdown,
        conversionCount,
        douhanCount,
        afterCount,
        totalVisitCount,
      }

      // 前月売上
      let prevSales = 0
      myCustomers.forEach(c => {
        prevSales += prevSalesByCustomer.get(c.id) ?? 0
      })
      prevSales += prevExtByCast.get(cast.id) ?? 0

      const targetSales = targetByCast.get(cast.id) ?? 0
      const achievementRate =
        targetSales > 0 ? Math.round((monthlySales / targetSales) * 100) : 0

      return { cast, kpi, prevSales, targetSales, achievementRate }
    })

    return NextResponse.json(rows)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }
    console.error('GET /api/cast-rankings error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
