import { NextResponse } from 'next/server'
import { checkPermission, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCustomerCastOptions } from '@/lib/customerCastOptionsServer'

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
// 管理用プロフィールAPIを流用せず、顧客閲覧権限で名前・層・在籍状態だけを返す。
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
    const casts = await loadCustomerCastOptions(supabase, createAdminClient())
    return NextResponse.json({ casts }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Vary': 'Cookie',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
