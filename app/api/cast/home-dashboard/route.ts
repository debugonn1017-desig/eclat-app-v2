// ─────────────────────────────────────────────────────────────────
//  GET /api/cast/home-dashboard?castId=X&month=YYYY-MM&today=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────
//  CastHomeDashboard が必要とする補助データ（KPI 以外）を1リクエストに集約。
//
//  返すもの:
//  - profile.cast_tier (キャストの層)
//  - todayShifts: 今日の出勤キャスト一覧
//  - rankInMonth: 今月の自分の売上順位（cast-rankings から算出）
//  - prevTargets: 過去5ヶ月の目標売上（バッジ判定用）
//
//  KPI 自体は getCastKPI で別ルート経由（複雑なため）だが、
//  クライアント側で Promise.all により並列実行する。
//
//  キャッシュ: 30秒の private キャッシュ + 60秒 stale-while-revalidate
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

type ShiftCastItem = { id: string; name: string; tier: string | null }

export async function GET(request: Request) {
  try {
    const profile = await requireUser()

    const url = new URL(request.url)
    const castId = url.searchParams.get('castId') || ''
    const month = url.searchParams.get('month') || ''
    const today = url.searchParams.get('today') || ''
    if (!castId || !month || !today) {
      return NextResponse.json({ error: 'castId/month/today が必要' }, { status: 400 })
    }

    // ⚠ アクセス制御:
    //   キャストロールは自分の castId のみアクセス可（他キャストの過去ノルマが見えてしまう穴を塞ぐ）
    //   admin/owner は誰の castId でも OK
    if (profile.role === 'cast' && profile.id !== castId) {
      return NextResponse.json({ error: '自分のデータのみアクセス可能です' }, { status: 403 })
    }

    // 過去5ヶ月の月キー（YYYY-MM）を計算
    const baseDate = new Date(month + '-01')
    const prevMonthsKeys: string[] = []
    for (let i = 1; i <= 5; i++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1)
      prevMonthsKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const admin = createAdminClient()

    // ─── 全クエリを並列実行 ─────
    const [
      profileRes,
      shiftRowsRes,
      currentMonthSalesRes,
      prevTargetsRes,
    ] = await Promise.all([
      // プロフィール（cast_tier + cast_name 取得。cast_name は contactTop5 用）
      admin.from('profiles').select('cast_tier, cast_name').eq('id', castId).maybeSingle(),
      // 今日の出勤キャスト
      admin
        .from('cast_shifts')
        .select('cast_id, status, profiles!inner(id, cast_name, cast_tier, role, is_active)')
        .eq('shift_date', today)
        .in('status', ['出勤', '希望出勤', '来客出勤']),
      // 今月の自分の月間売上（順位算出のためにキャスト全員分必要 → cast_targets と JOIN なしで全 visit を集約は重いので、cast_name 一致の visits のみを取得して比較は省略）
      // ↓ 順位は cast-rankings API で取得するためここでは取らない（参考用に空）
      Promise.resolve({ data: null }),
      // 過去5ヶ月の自分の目標（cast_targets, 月別優先で取得）
      admin
        .from('cast_targets')
        .select('month, target_sales')
        .eq('cast_id', castId)
        .in('month', prevMonthsKeys),
    ])

    // ─── 集計 ─────
    const profileData = profileRes.data as { cast_tier: string | null; cast_name: string | null } | null
    const castTier = profileData?.cast_tier ?? null
    const castName = profileData?.cast_name ?? null

    // 今日のシフト整形
    const todayShifts: ShiftCastItem[] = []
    for (const s of (shiftRowsRes.data ?? []) as Array<{
      cast_id: string; status: string;
      profiles: Array<{ id: string; cast_name: string | null; cast_tier: string | null; role: string; is_active: boolean }>
        | { id: string; cast_name: string | null; cast_tier: string | null; role: string; is_active: boolean }
    }>) {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
      if (!p || !p.is_active || p.role !== 'cast') continue
      todayShifts.push({ id: p.id, name: p.cast_name ?? '', tier: p.cast_tier })
    }

    // 過去5ヶ月の目標（month → target_sales のマップ）
    const prevTargetsMap: Record<string, number> = {}
    for (const t of (prevTargetsRes.data ?? []) as Array<{ month: string; target_sales: number | null }>) {
      prevTargetsMap[t.month] = Number(t.target_sales) || 0
    }
    // prevMonthsKeys 順に並んだ配列で返す（クライアント側で扱いやすく）
    const prevTargets = prevMonthsKeys.map(m => ({
      month: m,
      target_sales: prevTargetsMap[m] ?? 0,
    }))

    // ─── 営業要連絡 TOP5 (v0.3.47-A) ─────
    //   旧: クライアントが useCustomers() の全顧客 summary (~25-40kB) から計算していた。
    //   新: サーバー側で担当顧客の軽量4カラムだけ取得し、TOP5 まで計算して返す。
    //   採点ロジックは旧クライアント版と同一:
    //     days(連絡なし=999) + rankBonus(S=30/A=20/B=10)、3日未満除外、score 降順上位5件
    type ContactTop5Item = { id: string; customer_name: string | null; customer_rank: string | null; days: number }
    let contactTop5: ContactTop5Item[] = []
    if (castName) {
      const { data: custRows } = await admin
        .from('customers')
        .select('id, customer_name, customer_rank, last_contact_date')
        .eq('cast_name', castName)
      const now = Date.now()
      const dayMs = 1000 * 60 * 60 * 24
      contactTop5 = ((custRows ?? []) as Array<{
        id: string | number
        customer_name: string | null
        customer_rank: string | null
        last_contact_date: string | null
      }>)
        .map(c => {
          const last = c.last_contact_date ? new Date(c.last_contact_date).getTime() : 0
          const days = last > 0 ? Math.floor((now - last) / dayMs) : 999
          const rankBonus = c.customer_rank === 'S' ? 30 : c.customer_rank === 'A' ? 20 : c.customer_rank === 'B' ? 10 : 0
          return { id: String(c.id), customer_name: c.customer_name, customer_rank: c.customer_rank, days, score: days + rankBonus }
        })
        .filter(x => x.days >= 3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ id, customer_name, customer_rank, days }) => ({ id, customer_name, customer_rank, days }))
    }

    // 当月における順位は cast-rankings API で別途取得する設計（あちらは既に並列＆キャッシュ済み）
    // ここでは castId 自身の参考情報のみ返す
    void currentMonthSalesRes

    return NextResponse.json({
      castTier,
      // v0.3.47-A: 営業要連絡 TOP5 (軽量データのみ)
      contactTop5,
      todayShifts,
      prevTargets,
      prevMonthsKeys,
    }, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
        // v0.3.44-A2: Cookie が変わったらキャッシュ再利用しない（同一ブラウザ内のユーザー切替対策）
        'Vary': 'Cookie',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('GET /api/cast/home-dashboard error:', err)
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
