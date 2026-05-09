// ─────────────────────────────────────────────────────────────────
//  GET /api/keep-warm
// ─────────────────────────────────────────────────────────────────
//  cron-job.org から 5分おきに叩かれる、Vercel サーバーレス関数を
//  「寝かさない」ためのウォームアップエンドポイント。
//
//  認証不要（誰でもアクセス可）、極軽量（DB アクセスなし）。
//  Vercel Hobby プランは 10〜15分アクセスがないと cold start するので、
//  これを有効にするとアプリの初回アクセスが常に「温かい」状態になる。
//
//  ⚡ 2026-05-10 強化: keep-warm 自身だけでなく、ホーム画面で叩かれる
//     主要ルートも fire-and-forget で温める。auth が通らず 401 で
//     終わるが、Vercel 関数はちゃんと起動するのでコールドスタート解消。
// ─────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'

// 温める主要ルート（auth 必要だが、関数ロード自体は走る）
//   ・/api/admin/home-dashboard ← 管理者ホーム
//   ・/api/cast/home-dashboard ← キャストホーム補助
//   ・/api/customers ← 顧客リスト
//   ・/api/customers/latest-visits ← 最終来店日マップ
//   ・/api/cast-rankings ← キャストランキング
//   ・/api/auth/me ← 自分のロール
const ROUTES_TO_WARM = [
  '/api/admin/home-dashboard?month=2026-01&today=2026-01-01&yesterday=2026-01-01&todayMD=01-01',
  '/api/cast/home-dashboard?castId=warm&month=2026-01&today=2026-01-01',
  '/api/customers?summary=1',
  '/api/customers/latest-visits',
  '/api/cast-rankings?month=2026-01',
  '/api/auth/me',
]

export async function GET(request: Request) {
  // ベース URL を request から取得（自分自身を叩く）
  const url = new URL(request.url)
  const baseUrl = `${url.protocol}//${url.host}`

  // 各ルートを並列に fire-and-forget で叩く
  // タイムアウト 4秒（Vercel Hobby の関数実行制限を考慮）
  const warmPromises = ROUTES_TO_WARM.map(async (route) => {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      const res = await fetch(`${baseUrl}${route}`, {
        signal: controller.signal,
        headers: { 'X-Keep-Warm': '1' },
      }).catch(() => null)
      clearTimeout(timer)
      return { route, status: res?.status ?? 0 }
    } catch {
      return { route, status: 0 }
    }
  })

  const results = await Promise.all(warmPromises)

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    message: 'warm',
    routes: results,
  }, {
    headers: {
      // ウォームアップ自体はキャッシュさせない（毎回サーバー実行されないと意味がない）
      'Cache-Control': 'no-store',
    },
  })
}
