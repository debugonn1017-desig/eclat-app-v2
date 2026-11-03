'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { validGoalMonth, type CustomerGoalData, type CustomerGoalInput, type CustomerMonthlyGoal } from '@/lib/starCustomerGoals'

export function useCustomerGoals(castId: string, month: string, revision: number, paused: boolean) {
  const scope = `${castId}:${month}`
  const currentScope = useRef(scope)
  const [state, setState] = useState<{ scope: string; data: CustomerGoalData } | null>(null)
  const [failure, setFailure] = useState<{ scope: string; message: string } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  useEffect(() => { currentScope.current = scope }, [scope])
  const reload = useCallback(() => setRefresh(v => v + 1), [])
  useEffect(() => {
    if (!validGoalMonth(month) || paused || saving) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/customer-goals?castId=${encodeURIComponent(castId)}&month=${month}`, { cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '月別目標・実績を取得できませんでした')
        if (data.castId !== castId || data.month !== month) throw new Error('対象月を再取得してください')
        if (!controller.signal.aborted) { setState({ scope, data }); setFailure(null) }
      } catch (error) { if (!controller.signal.aborted) setFailure({ scope, message: error instanceof Error ? error.message : '取得失敗' }) }
    })()
    return () => controller.abort()
  }, [castId, month, scope, revision, refresh, paused, saving])
  useEffect(() => {
    if (paused || saving) return
    const update = () => { if (document.visibilityState === 'visible') reload() }
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    const timer = window.setInterval(update, 30000)
    return () => { window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); window.clearInterval(timer) }
  }, [paused, saving, reload])
  const save = async (input: CustomerGoalInput) => {
    if (saveLock.current) throw new Error('保存中です')
    saveLock.current = true; setSaving(true)
    try {
      const response = await fetch('/api/customer-goals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '目標を保存できませんでした。入力内容は残しています')
      const goal = data.goal as CustomerMonthlyGoal
      if (currentScope.current === scope) setState(previous => previous?.scope === scope ? { scope, data: { ...previous.data, goals: [...previous.data.goals.filter(g => String(g.customer_id) !== input.customerId), goal] } } : previous)
      return goal
    } finally { saveLock.current = false; setSaving(false) }
  }
  return { data: state?.scope === scope ? state.data : null, error: failure?.scope === scope ? failure.message : '', reload, save, saving }
}
