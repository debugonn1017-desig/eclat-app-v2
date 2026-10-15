import { NextResponse } from 'next/server'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { STAR_CYCLE_COLUMNS, StarLogError, starLogSession, starLogPage, starLogFailure } from '@/lib/starLogServer'

export async function GET(request: Request) {
  try {
    const { client, profile } = await starLogSession()
    const params = new URL(request.url).searchParams
    const view = params.get('view') || 'active'
    if (!['active', 'ended'].includes(view)) throw new StarLogError('表示条件が不正です', 400)
    const requestedCast = params.get('castName')
    if (requestedCast !== null && (!requestedCast.trim() || requestedCast.length > 100)) throw new StarLogError('担当が不正です', 400)
    if (profile.role === 'cast' && requestedCast && requestedCast !== profile.cast_name) throw new StarLogError('担当の範囲外です', 403)
    const castName = profile.role === 'cast' ? profile.cast_name : requestedCast
    const q = params.get('q')?.trim() || ''
    if (q.length > 100) throw new StarLogError('検索は100文字以内です', 400)
    const page = starLogPage(params.get('page'))
    const query = () => {
      let result = client.from('customer_star_cycles').select(`${STAR_CYCLE_COLUMNS},customer:customers!inner(id,customer_name,cast_name,is_starred)`, { count: 'exact' })
      result = view === 'active' ? result.is('ended_at', null).eq('customer.is_starred', true) : result.not('ended_at', 'is', null)
      if (castName) result = result.eq('customer.cast_name', castName)
      if (q) result = result.ilike('customer.customer_name', `%${q.replace(/[\\%_]/g, '\\$&')}%`)
      return result.order(view === 'active' ? 'id' : 'ended_at', { ascending: view === 'active' }).order('id', { ascending: true })
    }
    if (view === 'active') {
      const items = await fetchAllPaginated((from, to) => query().range(from, to))
      if (items.length >= 100000) throw new Error('limit')
      return NextResponse.json({ items }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })
    }
    const { data, error, count } = await query().range((page - 1) * 50, page * 50 - 1)
    if (error) throw error
    return NextResponse.json({ items: data ?? [], page, has_more: page * 50 < (count ?? 0), total: count ?? 0 }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })
  } catch (error) {
    const failure = starLogFailure(error)
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }
}
