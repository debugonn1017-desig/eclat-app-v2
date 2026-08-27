import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
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

// キャスト一覧の「退店キャスト」表示専用。
// 黒服・オーナーだけが利用でき、キャスト本人には退店者名簿を返さない。
export async function GET() {
  try {
    await requireAdmin()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, cast_name, display_name, cast_tier, training_start_date, is_active, created_at')
      .eq('role', 'cast')
      .eq('is_active', false)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('GET /api/casts/retired error:', error)
      return NextResponse.json({ error: '退店キャスト一覧の取得に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ casts: data ?? [] }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
