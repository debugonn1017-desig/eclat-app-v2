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
      // プロフィール（cast_tier 取得）
      admin.from('profiles').select('cast_tier').eq('id', castId).maybeSingle(),
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
    const castTier = (profileRes.data as { cast_tier: string | null } | null)?.cast_tier ?? null

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

    // 当月における順位は cast-rankings API で別途取得する設計（あちらは既に並列＆キャッシュ済み）
    // ここでは castId 自身の参考情報のみ返す
    void currentMonthSalesRes

    return NextResponse.json({
      castTier,
      todayShifts,
      prevTargets,
      prevMonthsKeys,
    }, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
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
