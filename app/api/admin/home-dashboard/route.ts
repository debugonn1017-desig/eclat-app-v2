// ─────────────────────────────────────────────────────────────────
//  GET /api/admin/home-dashboard?month=YYYY-MM&today=YYYY-MM-DD&yesterday=YYYY-MM-DD&todayMD=MM-DD
// ─────────────────────────────────────────────────────────────────
//  AdminHomeDashboard が必要とする13+のクエリを1リクエストに集約。
//
//  パフォーマンス効果:
//  - 旧: ブラウザ→Supabase 直接 ×13クエリ (各 100-300ms 並列、計 1-3秒)
//  - 新: ブラウザ→/api 1往復 + Vercel→Supabase 並列 (各 30-50ms / 計 100-200ms)
//        東京リージョンで Vercel と Supabase が同居してるので超高速
//
//  キャッシュ: 30秒の private キャッシュ + 60秒 stale-while-revalidate
//  → 同じユーザーが30秒以内に再アクセスしても即時返答
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

type ShiftCast = { id: string; name: string; tier: string | null; status: string }
type BirthdayCustomer = { id: string; name: string; cast: string; rank: string }
type RiskCustomer = {
  id: string; name: string; cast: string; rank: string
  daysSince: number; avgCycleDays: number | null
  exceedsPersonalCycle: boolean; hasDouhanHistory: boolean
}

export async function GET(request: Request) {
  try {
    // ⚠ アクセス制御: 管理者/オーナーのみ。キャストは自分の home-dashboard 集約 API があるのでこちらは禁止
    //    （旧: requireUser() のみだったので、キャストロールでも店舗全体の売上が取れてしまっていた）
    const profile = await requireUser()
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: '管理者・スタッフのみアクセスできます' }, { status: 403 })
    }

    const url = new URL(request.url)
    const month = url.searchParams.get('month') || ''
    const today = url.searchParams.get('today') || ''
    const yesterday = url.searchParams.get('yesterday') || ''
    const todayMD = url.searchParams.get('todayMD') || ''
    if (!month || !today || !yesterday || !todayMD) {
      return NextResponse.json({ error: 'month/today/yesterday/todayMD が必要' }, { status: 400 })
    }
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const startDate = `${month}-01`
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

    const admin = createAdminClient()

    // ─── 全クエリを並列実行（東京リージョンで超高速）─────
    const [
      shiftRowsRes,
      yVisitsRes,
      yExtRes,
      mVisitsArr,
      mExtRes,
      monthShiftsRes,
      targetsRes,
      convsRes,
      birthdayRowsArr,
      contactRowsArr,
    ] = await Promise.all([
      // 今日の出勤キャスト
      admin
        .from('cast_shifts')
        .select('cast_id, status, profiles!inner(id, cast_name, cast_tier, role, is_active)')
        .eq('shift_date', today)
        .in('status', ['出勤', '希望出勤', '来客出勤']),
      // 昨日売上
      admin.from('customer_visits').select('amount_spent').eq('visit_date', yesterday),
      // 昨日場内延長
      admin.from('cast_extension_sales').select('amount_spent').eq('sale_date', yesterday),
      // 今月来店（ページング）
      fetchAllPaginated<{ visit_date: string; amount_spent: number }>((from, to) =>
        admin.from('customer_visits')
          .select('visit_date, amount_spent')
          .gte('visit_date', startDate).lte('visit_date', endDate)
          .range(from, to)
      ).catch(() => []),
      // 今月場内延長
      admin.from('cast_extension_sales').select('amount_spent')
        .gte('sale_date', startDate).lte('sale_date', endDate),
      // 月の出勤シフト
      admin.from('cast_shifts').select('shift_date, status')
        .gte('shift_date', startDate).lte('shift_date', endDate)
        .in('status', ['出勤', '希望出勤', '来客出勤']),
      // 月予算
      admin.from('cast_targets').select('target_sales').eq('month', month),
      // 場内→本指名 転換
      admin.from('nomination_history').select('id')
        .eq('old_status', '場内').eq('new_status', '本指名')
        .gte('changed_at', startDate).lte('changed_at', endDate + 'T23:59:59'),
      // 全顧客（誕生日・リスク用、ページング）
      fetchAllPaginated<{
        id: string; customer_name: string; cast_name: string;
        customer_rank: string; birthday: string | null; nomination_status: string | null
      }>((from, to) =>
        admin.from('customers')
          .select('id, customer_name, cast_name, customer_rank, birthday, nomination_status')
          .range(from, to)
      ).catch(() => []),
      // 連絡履歴（直近14日、ページング）
      // ⚠ JST 固定: クライアントから渡された today（YYYY-MM-DD JST）を起点に14日前を計算。
      //    旧: new Date(Date.now() - ...) は UTC 基準なので JST 早朝（00時〜09時）には13日分しか取れなかった
      fetchAllPaginated<{ customer_id: string; contact_date: string; direction: string }>((from, to) => {
        const todayDate = new Date(today + 'T00:00:00+09:00')
        const since = new Date(todayDate.getTime() - 14 * 24 * 60 * 60 * 1000)
        const sinceJST = `${since.getUTCFullYear()}-${String(since.getUTCMonth() + 1).padStart(2, '0')}-${String(since.getUTCDate()).padStart(2, '0')}`
        return admin.from('customer_contacts')
          .select('customer_id, contact_date, direction')
          .gte('contact_date', sinceJST)
          .range(from, to)
      }).catch(() => []),
    ])

    // ─── 集計 ─────────────────────────────────────────
    // 今日のシフト
    //   profiles join は配列で返るかもしれない（!inner でも型では配列扱い）
    const shifts: ShiftCast[] = []
    for (const s of (shiftRowsRes.data ?? []) as Array<{
      cast_id: string; status: string;
      profiles: Array<{ id: string; cast_name: string | null; cast_tier: string | null; role: string; is_active: boolean }>
        | { id: string; cast_name: string | null; cast_tier: string | null; role: string; is_active: boolean }
    }>) {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
      if (!p || !p.is_active || p.role !== 'cast') continue
      shifts.push({ id: p.id, name: p.cast_name ?? '', tier: p.cast_tier, status: s.status })
    }

    const yesterdaySales =
      ((yVisitsRes.data ?? []) as Array<{ amount_spent: number }>).reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
      + ((yExtRes.data ?? []) as Array<{ amount_spent: number }>).reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)

    const mSum = mVisitsArr.reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
    const mExtSum = ((mExtRes.data ?? []) as Array<{ amount_spent: number }>).reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
    const monthSales = mSum + mExtSum

    const workedDateSet = new Set<string>()
    for (const v of mVisitsArr) {
      if (Number(v.amount_spent) > 0) workedDateSet.add(v.visit_date)
    }
    const workedDays = workedDateSet.size

    const planDates = new Set<string>()
    for (const s of (monthShiftsRes.data ?? []) as Array<{ shift_date: string }>) {
      planDates.add(s.shift_date)
    }
    const totalWorkDays = planDates.size

    const monthTarget = ((targetsRes.data ?? []) as Array<{ target_sales: number | null }>)
      .reduce((s, t) => s + (Number(t.target_sales) || 0), 0)

    const conversionCount = (convsRes.data ?? []).length

    // 今日の誕生日
    const birthdayCustomers: BirthdayCustomer[] = []
    for (const c of birthdayRowsArr) {
      if (!c.birthday) continue
      const md = String(c.birthday).slice(5, 10)
      if (md === todayMD) {
        birthdayCustomers.push({
          id: c.id, name: c.customer_name, cast: c.cast_name, rank: c.customer_rank,
        })
      }
    }

    // 未返信トラッキング
    const byCustomer = new Map<string, { contact_date: string; direction: 'sent' | 'received' }[]>()
    for (const c of contactRowsArr) {
      if (c.direction !== 'sent' && c.direction !== 'received') continue
      const list = byCustomer.get(c.customer_id) ?? []
      list.push({ contact_date: c.contact_date, direction: c.direction as 'sent' | 'received' })
      byCustomer.set(c.customer_id, list)
    }
    // 未返信判定 (3日以上 sent して received なし)
    let unrepliedCount = 0
    for (const list of byCustomer.values()) {
      const sorted = [...list].sort((a, b) => a.contact_date.localeCompare(b.contact_date))
      const lastReceived = [...sorted].reverse().find(c => c.direction === 'received')
      const lastSent = [...sorted].reverse().find(c => c.direction === 'sent')
      if (!lastSent) continue
      if (lastReceived && lastReceived.contact_date >= lastSent.contact_date) continue
      const sentTime = new Date(lastSent.contact_date + 'T00:00:00').getTime()
      const daysSince = Math.floor((Date.now() - sentTime) / (24 * 60 * 60 * 1000))
      if (daysSince >= 3) unrepliedCount += 1
    }

    // リスク客（S/A 本指名 + 1.5倍周期超過 or 90日未来店）
    const targetCustomers = birthdayRowsArr.filter(c =>
      ['S', 'A'].includes(c.customer_rank) &&
      (!c.nomination_status || c.nomination_status === '本指名')
    )
    const targetIds = targetCustomers.map(c => c.id)
    const riskCustomers: RiskCustomer[] = []
    if (targetIds.length > 0) {
      const allVisits = await fetchAllPaginated<{ customer_id: string; visit_date: string; has_douhan: boolean }>((from, to) =>
        admin.from('customer_visits')
          .select('customer_id, visit_date, has_douhan')
          .in('customer_id', targetIds)
          .order('visit_date', { ascending: true })
          .range(from, to)
      ).catch(() => [])

      const visitsByCustomer = new Map<string, { date: string; douhan: boolean }[]>()
      for (const v of allVisits) {
        const list = visitsByCustomer.get(v.customer_id) ?? []
        list.push({ date: v.visit_date, douhan: !!v.has_douhan })
        visitsByCustomer.set(v.customer_id, list)
      }
      const now = new Date(today + 'T00:00:00').getTime()
      const dayMs = 1000 * 60 * 60 * 24

      for (const c of targetCustomers) {
        const visits = visitsByCustomer.get(c.id) ?? []
        if (visits.length === 0) continue
        const last = visits[visits.length - 1].date
        const daysSince = Math.floor((now - new Date(last + 'T00:00:00').getTime()) / dayMs)
        let avgCycleDays: number | null = null
        if (visits.length >= 2) {
          const gaps: number[] = []
          for (let i = 1; i < visits.length; i++) {
            const a = new Date(visits[i - 1].date + 'T00:00:00').getTime()
            const b = new Date(visits[i].date + 'T00:00:00').getTime()
            gaps.push(Math.max(1, Math.round((b - a) / dayMs)))
          }
          avgCycleDays = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
        }
        const exceedsPersonalCycle = avgCycleDays != null && daysSince >= Math.round(avgCycleDays * 1.5)
        const isInactive90 = daysSince >= 90
        if (!exceedsPersonalCycle && !isInactive90) continue
        const hasDouhanHistory = visits.some(v => v.douhan)
        riskCustomers.push({
          id: c.id, name: c.customer_name, cast: c.cast_name, rank: c.customer_rank,
          daysSince, avgCycleDays, exceedsPersonalCycle, hasDouhanHistory,
        })
      }
      riskCustomers.sort((a, b) => {
        if (a.hasDouhanHistory !== b.hasDouhanHistory) return a.hasDouhanHistory ? -1 : 1
        return b.daysSince - a.daysSince
      })
    }

    return NextResponse.json({
      shifts,
      yesterdaySales,
      monthSales,
      monthTarget,
      conversionCount,
      birthdayCustomers,
      riskCustomers: riskCustomers.slice(0, 8),
      workedDays,
      totalWorkDays,
      unrepliedCount,
    }, {
      headers: {
        // 30秒キャッシュ + 60秒 stale-while-revalidate
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('GET /api/admin/home-dashboard error:', err)
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
