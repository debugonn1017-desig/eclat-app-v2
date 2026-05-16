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
import type { CastKPI, CastProfile, CustomerRank, AutoCustomerRank } from '@/types'

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
    // ただしキャストは「自分以外の達成率・目標額」をレスポンスから除外する
    const profile = await requireUser()
    const isAdminViewer = profile.role === 'admin' // owner も admin に含まれる前提
    const viewerId = profile.id

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
    // ⚠ Supabase の暗黙の 1000 件制限を避けるため、ページングして全件取得する。
    //   そうしないと顧客総数が多い時に一部のキャスト分が抜け落ちる（成績不一致の原因）。
    let customers: CustomerRow[] = []
    if (castNames.length > 0) {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error } = await admin
          .from('customers')
          .select('id, cast_name, nomination_status, region, customer_rank, first_visit_date')
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
    type VisitRow = {
      customer_id: string
      amount_spent: number | null
      has_douhan: boolean | null
      has_after: boolean | null
    }
    // 当月来店も同じくページングで全件取得（1000件超えると切られる）
    let visits: VisitRow[] = []
    if (allCustomerIds.length > 0) {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error } = await admin
          .from('customer_visits')
          .select('customer_id, amount_spent, has_douhan, has_after')
          .in('customer_id', allCustomerIds)
          .gte('visit_date', startDate)
          .lte('visit_date', endDate)
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
      list.push(v)
      visitsByCustomer.set(v.customer_id, list)
    }

    // ─── 前月来店（前月売上算出のみ、これも1000件超対応）──
    let prevVisits: { customer_id: string; amount_spent: number | null }[] = []
    if (allCustomerIds.length > 0) {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error } = await admin
          .from('customer_visits')
          .select('customer_id, amount_spent')
          .in('customer_id', allCustomerIds)
          .gte('visit_date', prevStart)
          .lte('visit_date', prevEnd)
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

    // ─── 場内→本指名 転換（当月）+ 場内獲得（当月） ────
    //   v3 (2026-05-12): 1回のクエリで両方の集計を兼ねる
    const { data: convData } = await admin
      .from('nomination_history')
      .select('cast_id, old_status, new_status')
      .in('cast_id', castIds)
      .gte('changed_at', startDate)
      .lte('changed_at', endDate + 'T23:59:59')
    const convCountByCast = new Map<string, number>()
    const banaiAcquiredByCast = new Map<string, number>()
    for (const r of (convData ?? []) as { cast_id: string; old_status: string | null; new_status: string }[]) {
      // 場内/フリー → 本指名 を 1 転換
      if ((r.old_status === '場内' || r.old_status === 'フリー') && r.new_status === '本指名') {
        convCountByCast.set(r.cast_id, (convCountByCast.get(r.cast_id) ?? 0) + 1)
      }
      // new_status='場内' を 1 獲得（フリー→場内 / 新規(NULL)→場内 など全部）
      if (r.new_status === '場内') {
        banaiAcquiredByCast.set(r.cast_id, (banaiAcquiredByCast.get(r.cast_id) ?? 0) + 1)
      }
    }

    // ─── 個人目標（階層検索: 月別 > 個別恒久 > 層別月別 > 層別恒久）────
    //   v2 (2026-05-09 階層化): /admin/targets で設定した「層別デフォルト」や
    //   「個別恒久デフォルト」も拾えるように、4階層を順に探す。
    const [castMonthRes, castDefaultRes, tierMonthRes, tierDefaultRes] = await Promise.all([
      // 1) cast 月別特例
      admin.from('cast_targets').select('cast_id, target_sales')
        .in('cast_id', castIds).eq('month', month),
      // 2) cast 恒久デフォルト (month=null)
      admin.from('cast_targets').select('cast_id, target_sales')
        .in('cast_id', castIds).is('month', null),
      // 3) 層別月別 (legacy)
      admin.from('cast_tier_targets').select('tier, target_sales')
        .eq('month', month),
      // 4) 層別恒久デフォルト
      admin.from('cast_tier_targets').select('tier, target_sales')
        .is('month', null),
    ])
    const castMonthMap = new Map<string, number>()
    for (const t of (castMonthRes.data ?? []) as { cast_id: string; target_sales: number | null }[]) {
      if (t.target_sales != null) castMonthMap.set(t.cast_id, t.target_sales)
    }
    const castDefaultMap = new Map<string, number>()
    for (const t of (castDefaultRes.data ?? []) as { cast_id: string; target_sales: number | null }[]) {
      if (t.target_sales != null) castDefaultMap.set(t.cast_id, t.target_sales)
    }
    const tierMonthMap = new Map<string, number>()
    for (const t of (tierMonthRes.data ?? []) as { tier: string; target_sales: number | null }[]) {
      if (t.target_sales != null) tierMonthMap.set(t.tier, t.target_sales)
    }
    const tierDefaultMap = new Map<string, number>()
    for (const t of (tierDefaultRes.data ?? []) as { tier: string; target_sales: number | null }[]) {
      if (t.target_sales != null) tierDefaultMap.set(t.tier, t.target_sales)
    }
    // 各キャストの目標を階層検索で1つに確定するヘルパー
    const resolveTarget = (cast: CastProfile): number => {
      if (castMonthMap.has(cast.id)) return castMonthMap.get(cast.id)!
      if (castDefaultMap.has(cast.id)) return castDefaultMap.get(cast.id)!
      if (cast.cast_tier) {
        if (tierMonthMap.has(cast.cast_tier)) return tierMonthMap.get(cast.cast_tier)!
        if (tierDefaultMap.has(cast.cast_tier)) return tierDefaultMap.get(cast.cast_tier)!
      }
      return 0
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

      const rankBreakdown: Record<AutoCustomerRank, { sales: number; visits: number }> = {
        S: { sales: 0, visits: 0 },
        A: { sales: 0, visits: 0 },
        B: { sales: 0, visits: 0 },
        C: { sales: 0, visits: 0 },
      }
      // 「切れた」は集計から除外（自動変動・売上集計の対象外）
      const rankMap = new Map<string, AutoCustomerRank>()
      myCustomers.forEach(c => {
        const raw = c.customer_rank
        if (raw === '切れた') return
        rankMap.set(c.id, (raw && ['S', 'A', 'B', 'C'].includes(raw) ? raw : 'C') as AutoCustomerRank)
      })
      paidVisits.forEach(v => {
        const r = rankMap.get(v.customer_id)
        if (!r) return  // 「切れた」顧客の来店は rankBreakdown に含めない
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

      // v3 (2026-05-12): ノルマ達成状況用のカテゴリ別「今月の来店回数」を集計
      //   paidVisits を myCustomers の region/rank/nomination でフィルタして数える
      // v0.3.17 (2026-05-16): honshimeiMonthlyVisits も同時集計（地域/ランク問わず全本指名）
      let kokyakuMonthlyVisits = 0
      let kengaiMonthlyVisits = 0
      let honshimeiMonthlyVisits = 0
      const custMetaMap = new Map<string, { nom: string | null; region: string | null; rank: CustomerRank | null }>()
      for (const c of myCustomers) {
        custMetaMap.set(c.id, { nom: c.nomination_status ?? null, region: c.region ?? null, rank: c.customer_rank ?? null })
      }
      for (const v of paidVisits) {
        const meta = custMetaMap.get(v.customer_id)
        if (!meta) continue
        if (meta.nom !== '本指名') continue
        // 全本指名（地域/ランク問わず）
        honshimeiMonthlyVisits++
        if (meta.region === '福岡県') {
          if (meta.rank && ['S', 'A', 'B'].includes(meta.rank)) kokyakuMonthlyVisits++
        } else if (meta.region) {
          kengaiMonthlyVisits++
        }
      }

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
        kokyakuMonthlyVisits,
        kengaiMonthlyVisits,
        // 場内獲得は nomination_history (cast_id, new_status='場内', 当月) を一括取得して集計
        banaiAcquiredCount: banaiAcquiredByCast.get(cast.id) ?? 0,
        honshimeiMonthlyVisits,
      }

      // 前月売上
      let prevSales = 0
      myCustomers.forEach(c => {
        prevSales += prevSalesByCustomer.get(c.id) ?? 0
      })
      prevSales += prevExtByCast.get(cast.id) ?? 0

      const realTarget = resolveTarget(cast)
      const realAchievement =
        realTarget > 0 ? Math.round((monthlySales / realTarget) * 100) : 0

      // ─── プライバシー: キャスト視点では他キャストの目標/達成率を 0 に
      //   isAdminViewer なら全部本物を返す
      //   キャスト視点なら自分の行だけ本物、他は 0
      const visible = isAdminViewer || cast.id === viewerId
      const targetSales = visible ? realTarget : 0
      const achievementRate = visible ? realAchievement : 0

      return { cast, kpi, prevSales, targetSales, achievementRate }
    })

    return NextResponse.json(rows, {
      headers: {
        // ⚡ ランキングは30秒キャッシュ + stale-while-revalidate 60秒
        //   30秒以内は即時、30〜90秒は古いまま返しつつ裏で更新
        //   キャストはマスク済みデータなのでユーザーごとキャッシュ（private）
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    })
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
