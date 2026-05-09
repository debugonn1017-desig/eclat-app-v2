// ─────────────────────────────────────────────────────────────────
//  GET /api/keep-warm
// ─────────────────────────────────────────────────────────────────
//  GitHub Actions から 5分おきに叩かれる、Vercel サーバーレス関数を
//  「寝かさない」ためのウォームアップエンドポイント。
//
//  認証不要（誰でもアクセス可）、極軽量（DB アクセスなし）。
//  Vercel Hobby プランは 10〜15分アクセスがないと cold start するので、
//  これを有効にするとアプリの初回アクセスが常に「温かい」状態になる。
// ─────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    message: 'warm',
  }, {
    headers: {
      // ウォームアップ自体はキャッシュさせない（毎回サーバー実行されないと意味がない）
      'Cache-Control': 'no-store',
    },
  })
}
