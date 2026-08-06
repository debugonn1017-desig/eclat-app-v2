// ─────────────────────────────────────────────────────────────────
//  GET /api/casts/[castId]/customer-meta
// ─────────────────────────────────────────────────────────────────
//  指定キャストの担当顧客について、CUSTOMERS タブで表示する補助データを返す。
//
//  返却内容:
//   - firstVisits: { customer_id: 'YYYY-MM-DD' }
//       is_first_visit=true の最古の visit_date（90日 NEW バッジ用）
//   - lastVisits:  { customer_id: 'YYYY-MM-DD' }
//       全期間の最新 visit_date（最終来店経過日数用）
//   - bottleSearchText: { customer_id: 'ボトル名 ...' }
//       CUSTOMERSタブの名前・ニックネーム・ボトル名検索用
//
//  v0.3.20: クライアント側 supabase + .in() で取得していたが、データが取れない
//    （0件返る）症状があったため、サーバー側 service_role で確実に取得する方式に変更。
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { checkPermission, requireUser, requireAnyPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import {
  buildCustomerVisitPatterns,
  type CustomerVisitPattern,
} from '@/lib/customerVisitPattern'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ castId: string }> }
) {
  try {
    const profile = await requireUser() // ログイン必須
    const { castId } = await params
    if (!castId) {
      return NextResponse.json({ error: 'castId required' }, { status: 400 })
    }

    // v0.3.32/v0.3.33: 認可ガード
    //   cast: 自分自身の castId のみ
    //   admin (owner以外): 累計売上・顧客メタを返すため KPI.閲覧 または 顧客.閲覧 必須
    //   owner: そのまま通す
    if (profile.role === 'cast') {
      if (String(profile.id) !== String(castId)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    } else if (profile.role === 'admin' && !profile.is_owner) {
      try {
        await requireAnyPermission(['KPI.閲覧', '顧客.閲覧'])
      } catch {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    }
    // このAPIはKPI閲覧だけの管理スタッフも利用するため、顧客固有のボトル名は
    // 顧客閲覧権限がある場合だけ返す。キャストは上のcastId本人固定と組み合わせる。
    const canReadBottleNames = profile.role === 'cast'
      || profile.is_owner
      || await checkPermission('顧客.閲覧')

    const admin = createAdminClient()

    // 1) cast プロファイル取得（cast_name を使うため）
    const { data: castRow, error: castErr } = await admin
      .from('profiles')
      .select('cast_name')
      .eq('id', castId)
      .maybeSingle()
    if (castErr || !castRow || !castRow.cast_name) {
      return NextResponse.json({
        firstVisits: {},
        lastVisits: {},
        customerPatterns: {},
        bottleSearchText: {},
      })
    }
    const castName: string = castRow.cast_name

    // 2) この cast の担当顧客 ID と phase_shoshimei_at を全件取得
    //    v0.3.22: phase_shoshimei_at も含めて返す（NEW バッジ判定③で使用）
    const custRows = await fetchAllPaginated<{ id: string | number; phase_shoshimei_at: string | null }>((from, to) =>
      admin
        .from('customers')
        .select('id, phase_shoshimei_at')
        .eq('cast_name', castName)
        .range(from, to)
    ).catch(() => [])
    const custIds = custRows.map((c) => String(c.id))
    // phase_shoshimei_at マップ（customer_id → ISO 日時）
    const phaseShoshimeiAt: Record<string, string> = {}
    for (const c of custRows) {
      if (c.phase_shoshimei_at) phaseShoshimeiAt[String(c.id)] = c.phase_shoshimei_at
    }
    if (custIds.length === 0) {
      return NextResponse.json({
        firstVisits: {},
        lastVisits: {},
        phaseShoshimeiAt: {},
        customerPatterns: {},
        bottleSearchText: {},
      })
    }

    // 3) is_first_visit=true の visit を取得（NEW バッジ用）
    //   ⚠ 大量 ID を一度に渡すと URL 長制限に当たるので 200 件チャンク
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

    // 4) 全期間の visit を取得して、各顧客の最新 visit_date を確定（最終来店経過日数用）
    //    v0.3.31: 同じクエリで amount_spent も取って 累計来店回数 / 累計売上 / 平均単価 も算出
    const lastVisits: Record<string, string> = {}
    const visitCounts: Record<string, number> = {}
    const totalSales: Record<string, number> = {}
    const customerPatterns: Record<string, CustomerVisitPattern> = {}
    for (let i = 0; i < custIds.length; i += CHUNK) {
      const chunk = custIds.slice(i, i + CHUNK)
      const rows = await fetchAllPaginated<{
        id: string | number
        customer_id: string | number
        visit_date: string
        visit_time: string | null
        amount_spent: number | null
        is_planned: boolean | null
      }>(
        (from, to) =>
          admin
            .from('customer_visits')
            .select('id, customer_id, visit_date, visit_time, amount_spent, is_planned')
            .in('customer_id', chunk)
            .order('visit_date', { ascending: false })
            .order('visit_time', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false })
            .range(from, to)
      ).catch(() => [])
      for (const v of rows) {
        const key = String(v.customer_id)
        if (!lastVisits[key]) lastVisits[key] = v.visit_date
        visitCounts[key] = (visitCounts[key] || 0) + 1
        totalSales[key] = (totalSales[key] || 0) + (v.amount_spent || 0)
      }
      Object.assign(customerPatterns, buildCustomerVisitPatterns(rows))
    }
    // 平均単価 = 累計売上 / 累計来店回数（0除算は0）
    const avgPerVisit: Record<string, number> = {}
    for (const key of Object.keys(visitCounts)) {
      const count = visitCounts[key]
      avgPerVisit[key] = count > 0 ? Math.round(totalSales[key] / count) : 0
    }

    // 5) 顧客検索用のボトル名を一括取得する（顧客ごとのN+1は行わない）。
    const bottleSearchText: Record<string, string> = {}
    if (canReadBottleNames) {
      const bottleNamesByCustomer = new Map<string, string[]>()
      for (let i = 0; i < custIds.length; i += CHUNK) {
        const chunk = custIds.slice(i, i + CHUNK)
        const rows = await fetchAllPaginated<{
          id: string | number
          customer_id: string | number
          bottle_name: string | null
        }>(
          (from, to) =>
            admin
              .from('customer_bottles')
              .select('id, customer_id, bottle_name')
              .in('customer_id', chunk)
              .order('id', { ascending: true })
              .range(from, to)
        ).catch(() => [])
        for (const bottle of rows) {
          const bottleName = bottle.bottle_name?.trim()
          if (!bottleName) continue
          const customerId = String(bottle.customer_id)
          const names = bottleNamesByCustomer.get(customerId) ?? []
          names.push(bottleName)
          bottleNamesByCustomer.set(customerId, names)
        }
      }
      for (const [customerId, names] of bottleNamesByCustomer) {
        bottleSearchText[customerId] = names.join(' ')
      }
    }

    return NextResponse.json({
      firstVisits,
      lastVisits,
      phaseShoshimeiAt,
      visitCounts,
      totalSales,
      avgPerVisit,
      customerPatterns,
      bottleSearchText,
    }, {
      headers: {
        // 軽くキャッシュ（30秒 + SWR 60秒）。来店記録は頻繁に変わるが秒単位精度は不要
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        // v0.3.44-A2: Cookie が変わったらキャッシュ再利用しない（同一ブラウザ内のユーザー切替対策）
        'Vary': 'Cookie',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('GET /api/casts/[castId]/customer-meta error:', err)
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
