import { NextResponse } from 'next/server'
import { checkPermission, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { countStarredCustomers, type StarCountRow } from '@/lib/starredCustomers'

// スタッフの名簿用。顧客閲覧権限とセッションクライアントのRLSを両方維持。
// 名前・金額等は取得せず、⭐️顧客の担当/指名状況だけを全ページ集計する。
export async function GET() {
  try {
    const profile = await requireUser()
    if (profile.role !== 'admin' || (!profile.is_owner && !(await checkPermission('顧客.閲覧')))) {
      return NextResponse.json({ error: '顧客.閲覧 の権限がありません' }, { status: 403 })
    }
    const client = await createClient()
    const rows: StarCountRow[] = []
    // 件数が1000以上でも切り捨てない。必ず同じid順でページングする。
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from('customers')
        .select('cast_name,nomination_status').eq('is_starred', true)
        .order('id', { ascending: true }).range(from, from + 999)
      if (error) throw error
      const batch = data ?? []
      rows.push(...batch)
      if (batch.length < 1000) break
    }
    return NextResponse.json(countStarredCustomers(rows), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    console.error('GET /api/customers/star-counts error:', error)
    return NextResponse.json({ error: '⭐️のお客様の人数を取得できませんでした' }, { status: 500 })
  }
}
