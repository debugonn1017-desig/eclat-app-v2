import { NextResponse } from 'next/server'
import { checkPermission, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  if (message === 'UNAUTHENTICATED') {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }
  if (message === 'FORBIDDEN') {
    return NextResponse.json({ error: 'この操作の権限がありません' }, { status: 403 })
  }
  return NextResponse.json({ error: message }, { status: 500 })
}

// 顧客検索の担当キャスト候補専用。
// 管理用プロフィールAPIを流用せず、顧客閲覧権限で必要な名前と在籍状態だけを返す。
// キャスト本人には退店キャストを含む名簿を公開しない。
export async function GET() {
  try {
    const profile = await requireUser()
    if (profile.role !== 'admin') {
      throw new Error('FORBIDDEN')
    }
    if (!profile.is_owner && !(await checkPermission('顧客.閲覧'))) {
      throw new Error('FORBIDDEN')
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, cast_name, display_name, is_active')
      .eq('role', 'cast')
      .not('cast_name', 'is', null)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('GET /api/customers/cast-options error:', error)
      return NextResponse.json({ error: '担当キャスト一覧の取得に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ casts: data ?? [] }, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
        'Vary': 'Cookie',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
