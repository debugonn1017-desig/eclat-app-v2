import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { buildLockerRanking, lockerRankingPeriod, type LockerRankingCast, type LockerRankingCustomer, type LockerRankingExtension, type LockerRankingShift, type LockerRankingVisit } from '@/lib/lockerRanking'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
const MAX_ROWS = 100000, BATCH_SIZE = 200, CONCURRENCY = 3
const chunks = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / BATCH_SIZE) }, (_, index) => ids.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE))
async function readAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>) {
  const rows = await fetchAllPaginated(query)
  if (rows.length >= MAX_ROWS) throw new Error('取得上限を超えました')
  return rows
}
/** 顧客IDのバッチを無制限に並列実行しない。失敗後は新しい照会を始めない。 */
async function bounded<T>(jobs: readonly (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(jobs.length)
  let next = 0, failed = false
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (!failed && next < jobs.length) {
      const index = next++
      try { results[index] = await jobs[index]() } catch (error) { failed = true; throw error }
    }
  }))
  return results
}

/** 管理専用。生の顧客情報・層・目標を含まない更衣室向け集計。 */
export async function GET(request: Request) {
  try {
    await requireAdmin()
    let period
    try { period = lockerRankingPeriod(new URL(request.url).searchParams.get('month')) } catch {
      return NextResponse.json({ error: '対象月を正しく指定してください' }, { status: 400, headers })
    }
    // 認証・月の検証を通過するまではservice clientを作らない。
    const admin = createAdminClient()
    const casts = await readAll<LockerRankingCast>((from, to) => admin.from('profiles')
      .select('id,cast_name,display_name,cast_tier').eq('role', 'cast').eq('is_active', true).order('id').range(from, to))
    const names = [...new Set(casts.map(cast => cast.cast_name).filter((name): name is string => !!name?.trim()))]
    const customers = (await bounded(chunks(names).map(batch => () => readAll<LockerRankingCustomer>((from, to) => admin.from('customers')
      .select('id,cast_name,nomination_status,first_visit_date').in('cast_name', batch).order('id').range(from, to))))).flat()
    if (customers.length >= MAX_ROWS) throw new Error('取得上限を超えました')
    const castIds = casts.map(cast => cast.id), customerIds = customers.map(customer => String(customer.id))
    // 月間売上に加え、月跨ぎの連続坊主を確定する実来店日・出勤日を取得する。
    // 場内履歴・目標・配席・顧客名はこのページに不要なので照会しない。
    const jobs: (() => Promise<{ visits?: LockerRankingVisit[]; extensions?: LockerRankingExtension[]; shifts?: LockerRankingShift[] }>)[] = [
      ...chunks(customerIds).map(batch => async () => ({ visits: await readAll<LockerRankingVisit>((from, to) => admin.from('customer_visits')
        .select('customer_id,visit_date,amount_spent,is_planned,nomination_status_at_visit,has_douhan').in('customer_id', batch)
        .lte('visit_date', period.businessDate).or('is_planned.is.null,is_planned.eq.false').order('id').range(from, to)) })),
      ...chunks(castIds).map(batch => async () => ({ extensions: await readAll<LockerRankingExtension>((from, to) => admin.from('cast_extension_sales')
        .select('cast_id,sale_date,amount_spent').in('cast_id', batch).gte('sale_date', period.periodStart).lte('sale_date', period.periodEnd).order('id').range(from, to)) })),
      ...chunks(castIds).map(batch => async () => ({ shifts: await readAll<LockerRankingShift>((from, to) => admin.from('cast_shifts')
        .select('cast_id,shift_date,status').in('cast_id', batch).lte('shift_date', period.businessDate).order('cast_id').order('shift_date').range(from, to)) })),
    ]
    const results = await bounded(jobs), visits = results.flatMap(result => result.visits || []), extensionSales = results.flatMap(result => result.extensions || []), shifts = results.flatMap(result => result.shifts || [])
    if ([visits, extensionSales, shifts].some(rows => rows.length >= MAX_ROWS)) throw new Error('取得上限を超えました')
    return NextResponse.json(buildLockerRanking({ period, casts, customers, visits, extensionSales, shifts }), { headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const status = message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 503
    return NextResponse.json({ error: status === 401 ? 'ログインしてください' : status === 403 ? '黒服・オーナーのみ閲覧できます' : '更衣室ランキングを取得できませんでした。再取得してください' }, { status, headers })
  }
}
