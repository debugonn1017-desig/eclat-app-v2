import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CastProfile, CastShift, CastTierTarget, CastTarget, CastKPI } from '@/types'

const supabase = createClient()

export function useCasts() {
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
  }, [])

  // ─── 個別キャスト取得 ─────────────────────────────────────
  const getCast = useCallback(async (castId: string): Promise<CastProfile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
      .eq('id', castId)
      .single()

    if (error || !data) return null
    return data as CastProfile
  }, [])

  // ─── キャストの売上集計（月間） ────────────────────────────
  const getCastKPI = useCallback(async (castName: string, month: string): Promise<CastKPI> => {
    // month は 'YYYY-MM' 形式
    const startDate = `${month}-01`
    const endDate = getMonthEndDate(month)

    // 担当顧客を取得
    const { data: customers } = await supabase
      .from('customers')
      .select('id, phase')
      .eq('cast_name', castName)

    const customerIds = customers?.map(c => c.id) ?? []
    const customerCount = customerIds.length
    const banaCount = customers?.filter(c => c.phase === '場内').length ?? 0

    // 来店データを取得
    let monthlySales = 0
    let visitGroups = 0

    if (customerIds.length > 0) {
      const { data: visits } = await supabase
        .from('customer_visits')
        .select('customer_id, amount_spent')
        .in('customer_id', customerIds)
        .gte('visit_date', startDate)
        .lte('visit_date', endDate)

      if (visits) {
        monthlySales = visits.reduce((sum, v) => sum + (Number(v.amount_spent) || 0), 0)
        // ユニークな来店組数
        visitGroups = new Set(visits.map(v => v.customer_id)).size
      }
    }

    const avgSpend = visitGroups > 0 ? Math.round(monthlySales / visitGroups) : 0

    return {
      monthlySales,
      targetSales: 0, // 後で目標とマージ
      achievementRate: 0,
      customerCount,
      banaCount,
      workDays: 0,
      visitGroups,
      avgSpend,
    }
  }, [])

  // ─── 層別ベースノルマ取得 ──────────────────────────────────
  const getTierTargets = useCallback(async (month: string): Promise<CastTierTarget[]> => {
    const { data, error } = await supabase
      .from('cast_tier_targets')
      .select('*')
      .eq('month', month)

    if (error || !data) return []
    return data as CastTierTarget[]
  }, [])

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
  }, [])

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
  }, [])

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
  }, [])

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
  }, [])

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
  }, [])

  // ─── キャスト層更新 ────────────────────────────────────────
  const updateCastTier = useCallback(async (castId: string, tier: string | null): Promise<boolean> => {
    const { error } = await supabase
      .from('profiles')
      .update({ cast_tier: tier })
      .eq('id', castId)

    return !error
  }, [])

  return {
    casts,
    isLoaded,
    getCast,
    getCastKPI,
    getTierTargets,
    getCastTarget,
    getShifts,
    upsertShift,
    upsertTierTarget,
    upsertCastTarget,
    updateCastTier,
  }
}

// ─── ユーティリティ ──────────────────────────────────────────
function getMonthEndDate(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const lastDay = new Date(year, mon, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}
