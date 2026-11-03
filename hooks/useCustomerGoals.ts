'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GOAL_UUID, validGoalMonth, type CustomerGoalData, type CustomerGoalInput, type CustomerMonthlyGoal } from '@/lib/starCustomerGoals'

function assertGoalData(data: CustomerGoalData, castId: string, month: string) {
  if (data?.castId !== castId || data.month !== month || typeof data.canEdit !== 'boolean' || !Array.isArray(data.customerIds) || !Array.isArray(data.goals) || !data.actuals || new Set(data.customerIds).size !== data.customerIds.length) throw new Error('対象月とお客様を再取得してください')
  const ids = new Set(data.customerIds)
  for (const id of ids) {
    const actual = data.actuals[id]
    if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !actual || !Number.isFinite(actual.sales) || !Number.isSafeInteger(actual.visits) || actual.visits < 0) throw new Error('実績を再取得してください。未取得を0として表示していません')
  }
  const goalIds = new Set<string>()
  for (const goal of data.goals) {
    const id = String(goal.customer_id)
    if (!ids.has(id) || goalIds.has(id) || goal.cast_id !== castId || goal.month !== month + '-01') throw new Error('担当と目標を再取得してください')
    goalIds.add(id)
  }
}

/** 一覧と目標の取得順が逆になっても、同じ不一致に対する再取得は一度に抑える。 */
export function useCustomerGoalMembership({ castId, month, customerIds, data, enabled, onRefresh }: {
  castId: string; month: string; customerIds: readonly string[]; data: CustomerGoalData | null; enabled: boolean; onRefresh: () => void
}) {
  const idsKey = [...new Set(customerIds)].sort().join(',')
  const goalIdsKey = data ? [...data.customerIds].sort().join(',') : null
  const mismatch = !!data && data.castId === castId && data.month === month && idsKey !== goalIdsKey
  const attempted = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || !data) return
    if (!mismatch) { attempted.current = null; return }
    const key = `${castId}:${month}:${idsKey}:${goalIdsKey}`
    if (attempted.current === key) return
    attempted.current = key
    onRefresh()
  }, [enabled, data, mismatch, castId, month, idsKey, goalIdsKey, onRefresh])
  return mismatch
}

export function useCustomerGoals(castId: string, month: string, revision: number, paused: boolean) {
  const scope = `${castId}:${month}`
  const valid = GOAL_UUID.test(castId) && validGoalMonth(month)
  const currentScope = useRef(scope)
  const [state, setState] = useState<{ scope: string; request: string; data: CustomerGoalData } | null>(null)
  const [failure, setFailure] = useState<{ scope: string; request: string; message: string } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const request = `${scope}:${revision}:${refresh}`
  useEffect(() => { currentScope.current = scope }, [scope])
  const reload = useCallback(() => setRefresh(v => v + 1), [])
  useEffect(() => {
    if (!valid || paused || saving) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/customer-goals?castId=${encodeURIComponent(castId)}&month=${month}`, { cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '月別目標・実績を取得できませんでした')
        assertGoalData(data, castId, month)
        if (!controller.signal.aborted) { setState({ scope, request, data }); setFailure(null) }
      } catch (error) { if (!controller.signal.aborted) setFailure({ scope, request, message: error instanceof Error ? error.message : '取得失敗' }) }
    })()
    return () => controller.abort()
  }, [castId, month, scope, request, valid, paused, saving])
  useEffect(() => {
    if (!valid || paused || saving) return
    const update = () => { if (document.visibilityState === 'visible') reload() }
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    const timer = window.setInterval(update, 30000)
    return () => { window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); window.clearInterval(timer) }
  }, [valid, paused, saving, reload])
  const data = state?.scope === scope ? state.data : null
  const error = !valid ? '対象月とキャストを確認してください' : failure?.scope === scope && failure.request === request ? failure.message : ''
  const ready = valid && !!data && state?.request === request && !error
  const save = async (input: CustomerGoalInput) => {
    if (saveLock.current) throw new Error('保存中です')
    // 編集開始時の同じ担当・月は保持する。版や⭐️・担当の最終認可はPUTで行う。
    if (!valid || currentScope.current !== scope || input.castId !== castId || input.month !== month || !data?.canEdit || !data.customerIds.includes(input.customerId)) throw new Error('担当または⭐️の状態が変わっています。入力内容を控えて一覧を再取得してください')
    saveLock.current = true; setSaving(true)
    try {
      const response = await fetch('/api/customer-goals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '目標を保存できませんでした。入力内容は残しています')
      const goal = result.goal as CustomerMonthlyGoal
      if (!goal || goal.cast_id !== input.castId || String(goal.customer_id) !== input.customerId || goal.month !== input.month + '-01' || !Number.isSafeInteger(goal.revision) || goal.revision <= input.expectedRevision) throw new Error('保存結果を確認できませんでした。入力内容は残しています')
      if (currentScope.current === scope) setState(previous => previous?.scope === scope ? { ...previous, data: { ...previous.data, goals: [...previous.data.goals.filter(g => String(g.customer_id) !== input.customerId), goal] } } : previous)
      return goal
    } finally { saveLock.current = false; setSaving(false) }
  }
  return { data, ready, loading: valid && !paused && !ready && !error, error, reload, save, saving }
}
