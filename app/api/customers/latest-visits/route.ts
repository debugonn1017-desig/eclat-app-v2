// ─────────────────────────────────────────────────────────────────
//  GET /api/customers/latest-visits
// ─────────────────────────────────────────────────────────────────
//  各顧客の最終来店日 (customer_id → 'YYYY-MM-DD') をサーバー側で集計。
//
//  パフォーマンス効果:
//  - 旧: ブラウザが customer_visits 全件 (1000+ 行) を取得して JS で集計
//        → ペイロード重い + 1000行制限の危険 + 体感 1.5-2秒
//  - 新: サーバー側で集計、{customer_id: latest_date} のマップだけ返す
//        → 数百顧客分 = 数十KB、Vercel↔Supabase 同居で高速 (<300ms)
//
//  キャッシュ: 60秒の private + 120秒 stale-while-revalidate
//  最終来店日は1日に1回程度しか更新されないので長めのキャッシュで OK
// ─────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

export async function GET() {
  try {
    await requireUser()
    const admin = createAdminClient()

    // 1000+ 行の可能性があるのでページング取得
    const rows = await fetchAllPaginated<{ customer_id: number | string; visit_date: string }>(
      (from, to) =>
        admin
          .from('customer_visits')
          .select('customer_id, visit_date')
          .order('visit_date', { ascending: false })
          .range(from, to)
    ).catch((e) => {
      console.error('[latest-visits] paginated fetch failed:', e)
      return []
    })

    // 顧客IDごとの最初（=最新）の visit_date を集計
    const map: Record<string, string> = {}
    for (const v of rows) {
      const key = String(v.customer_id)
      if (!map[key]) map[key] = v.visit_date
    }

    return NextResponse.json(map, {
      headers: {
        // 最終来店日は1日に1回程度しか変わらない → 長めにキャッシュ
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('GET /api/customers/latest-visits error:', err)
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
