import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CastProfile, CastShift, CastTierTarget, CastTarget, CastKPI, NominationHistory, CustomerRank } from '@/types'

export function useCasts() {
  const supabase = useMemo(() => createClient(), [])
  const [casts, setCasts] = useState<CastProfile[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const fetchCasts = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
        .eq('role', 'cast')
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      if (!error && data) {
        setCasts(data as CastProfile[])
      }
      setIsLoaded(true)
    }
    fetchCasts()
  }, [supabase])

  // ─── 個別キャスト取得 ─────────────────────────────────────
  const getCast = useCallback(async (castId: string): Promise<CastProfile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
      .eq('id', castId)
      .single()

    if (error || !data) return null
    return data as CastProfile
  }, [supabase])

  // ─── キャストの売上集計（月間） ────────────────────────────
  const getCastKPI = useCallback(async (castName: string, month: string, castId?: string): Promise<CastKPI> => {
    // month は 'YYYY-MM' 形式
    const startDate = `${month}-01`
    const endDate = getMonthEndDate(month)

    // 担当顧客を取得（地域・ランク・指名状況を含む）
    const { data: customers } = await supabase
      .from('customers')
      .select('id, phase, nomination_status, region, customer_rank')
      .eq('cast_name', castName)

    const customerIds = customers?.map(c => c.id) ?? []
    const customerCount = customerIds.length
    const banaCount = customers?.filter(c => c.nomination_status === '場内').length ?? 0
    const honshimeiCount = customers?.filter(c => c.nomination_status === '本指名').length ?? 0

    // 県内/県外（本指名の顧客のみカウント）
    const honshimeiCustomers = customers?.filter(c => c.nomination_status === '本指名') ?? []
    const localCustomerCount = honshimeiCustomers.filter(c => c.region === '福岡県').length
    const remoteCustomerCount = honshimeiCustomers.filter(c => c.region && c.region !== '福岡県').length

    // 来店データを取得
    let monthlySales = 0
    let visitGroups = 0
    const rankBreakdown: Record<CustomerRank, { sales: number; visits: number }> = {
      S: { sales: 0, visits: 0 },
      A: { sales: 0, visits: 0 },
      B: { sales: 0, visits: 0 },
      C: { sales: 0, visits: 0 },
    }

    if (customerIds.length > 0) {
      const { data: visits } = await supabase
        .from('customer_visits')
        .select('customer_id, amount_spent')
        .in('customer_id', customerIds)
        .gte('visit_date', startDate)
        .lte('visit_date', endDate)

      if (visits) {
        monthlySales = visits.reduce((sum, v) => sum + (Number(v.amount_spent) || 0), 0)
        visitGroups = new Set(visits.map(v => v.customer_id)).size

        // ランク別集計
        const customerRankMap = new Map<string, CustomerRank>()
        customers?.forEach(c => customerRankMap.set(c.id, (c.customer_rank || 'C') as CustomerRank))

        visits.forEach(v => {
          const rank = customerRankMap.get(v.customer_id) || 'C'
          rankBreakdown[rank].sales += Number(v.amount_spent) || 0
          rankBreakdown[rank].visits += 1
        })
      }
    }

    const avgSpend = visitGroups > 0 ? Math.round(monthlySales / visitGroups) : 0

    // 場内→本指名 転換数（当月）
    let conversionCount = 0
    if (castId) {
      const { data: history } = await supabase
        .from('nomination_history')
        .select('id')
        .eq('cast_id', castId)
        .eq('old_status', '場内')
        .eq('new_status', '本指名')
        .gte('changed_at', startDate)
        .lte('changed_at', endDate + 'T23:59:59')

      conversionCount = history?.length ?? 0
    }

    return {
      monthlySales,
      targetSales: 0,
      achievementRate: 0,
      customerCount,
      banaCount,
      honshimeiCount,
      workDays: 0,
      visitGroups,
      avgSpend,
      localCustomerCount,
      remoteCustomerCount,
      rankBreakdown,
      conversionCount,
    }
  }, [supabase])

  // ─── 複数月のKPI取得（グラフ用） ──────────────────────────
  const getMultiMonthKPI = useCallback(async (
    castName: string, castId: string, months: string[]
  ): Promise<Record<string, CastKPI>> => {
    const results: Record<string, CastKPI> = {}
    for (const m of months) {
      results[m] = await getCastKPI(castName, m, castId)
    }
    return results
  }, [getCastKPI])

  // ─── 指名履歴記録 ─────────────────────────────────────────
  const recordNominationChange = useCallback(async (
    customerId: string, castId: string, oldStatus: string | null, newStatus: string
  ): Promise<boolean> => {
    const { error } = await supabase
      .from('nomination_history')
      .insert({
        customer_id: customerId,
        cast_id: castId,
        old_status: oldStatus,
        new_status: newStatus,
      })
    return !error
  }, [supabase])

  // ─── 層別ベースノルマ取得 ──────────────────────────────────
  const getTierTargets = useCallback(async (month: string): Promise<CastTierTarget[]> => {
    const { data, error } = await supabase
      .from('cast_tier_targets')
      .select('*')
      .eq('month', month)

    if (error || !data) return []
    return data as CastTierTarget[]
  }, [supabase])

  // ─── 個人目標取得 ──────────────────────────────────────────
  const getCastTarget = useCallback(async (castId: string, month: string): Promise<CastTarget | null> => {
    const { data, error } = await supabase
      .from('cast_targets')
      .select('*')
      .eq('cast_id', castId)
      .eq('month', month)
      .single()

    if (error || !data) return null
    return data as CastTarget
  }, [supabase])

  // ─── シフト取得（月間） ────────────────────────────────────
  const getShifts = useCallback(async (castId: string, month: string): Promise<CastShift[]> => {
    const startDate = `${month}-01`
    const endDate = getMonthEndDate(month)

    const { data, error } = await supabase
      .from('cast_shifts')
      .select('*')
      .eq('cast_id', castId)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate)
      .order('shift_date', { ascending: true })

    if (error || !data) return []
    return data as CastShift[]
  }, [supabase])

  // ─── シフト登録・更新（upsert） ───────────────────────────
  const upsertShift = useCallback(async (
    castId: string,
    shiftDate: string,
    status: CastShift['status'],
    memo?: string,
  ): Promise<CastShift | null> => {
    const { data, error } = await supabase
      .from('cast_shifts')
      .upsert(
        { cast_id: castId, shift_date: shiftDate, status, memo: memo ?? '' },
        { onConflict: 'cast_id,shift_date' }
      )
      .select()
      .single()

    if (error || !data) return null
    return data as CastShift
  }, [supabase])

  // ─── 層ベースノルマ保存 ────────────────────────────────────
  const upsertTierTarget = useCallback(async (
    tier: string,
    month: string,
    targets: Partial<Omit<CastTierTarget, 'id' | 'tier' | 'month'>>,
  ): Promise<CastTierTarget | null> => {
    const { data, error } = await supabase
      .from('cast_tier_targets')
      .upsert(
        { tier, month, ...targets },
        { onConflict: 'tier,month' }
      )
      .select()
      .single()

    if (error || !data) return null
    return data as CastTierTarget
  }, [supabase])

  // ─── 個人目標保存 ──────────────────────────────────────────
  const upsertCastTarget = useCallback(async (
    castId: string,
    month: string,
    targets: Partial<Omit<CastTarget, 'id' | 'cast_id' | 'month'>>,
  ): Promise<CastTarget | null> => {
    const { data, error } = await supabase
      .from('cast_targets')
      .upsert(
        { cast_id: castId, month, ...targets },
        { onConflict: 'cast_id,month' }
      )
      .select()
      .single()

    if (error || !data) return null
    return data as CastTarget
  }, [supabase])

  // ─── キャスト層更新 ────────────────────────────────────────
  const updateCastTier = useCallback(async (castId: string, tier: string | null): Promise<boolean> => {
    const { error } = await supabase
      .from('profiles')
      .update({ cast_tier: tier })
      .eq('id', castId)

    return !error
  }, [supabase])

  return {
    casts,
    isLoaded,
    getCast,
    getCastKPI,
    getMultiMonthKPI,
    getTierTargets,
    getCastTarget,
    getShifts,
    upsertShift,
    upsertTierTarget,
    upsertCastTarget,
    updateCastTier,
    recordNominationChange,
  }
}

// ─── ユーティリティ ──────────────────────────────────────────
function getMonthEndDate(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const lastDay = new Date(year, mon, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}
