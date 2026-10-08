import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentProfile } from '@/lib/auth'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'

export async function GET(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 })
  if (profile.role !== 'cast' && !profile.is_owner && !await checkPermission('顧客.閲覧')) {
    return NextResponse.json({ error: '顧客閲覧の権限がありません' }, { status: 403 })
  }
  if (profile.role === 'cast' && !profile.cast_name) {
    return NextResponse.json({ error: '担当が未設定です' }, { status: 403 })
  }
  const supabase = await createClient()
  const castName = profile.role === 'cast' ? profile.cast_name : new URL(request.url).searchParams.get('castName')
  try {
    const items = await fetchAllPaginated((from, to) => {
      let q = supabase.from('customers').select('id,is_starred,no_reply').order('id')
      if (castName) q = q.eq('cast_name', castName)
      return q.range(from, to)
    })
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'マークを取得できませんでした' }, { status: 500 })
  }
}
