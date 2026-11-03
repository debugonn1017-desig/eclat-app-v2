'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GOAL_UUID, validGoalMonth, type CustomerGoalInput, type CustomerMonthlyGoal, type StaffCustomerGoalData } from '@/lib/starCustomerGoals'

const MAX_IDS = 10000, BATCH_SIZE = 200, CONCURRENCY = 3
function validIds(ids: readonly string[]) {
  return ids.length <= MAX_IDS && ids.every(id => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)))
}
function assertResponse(data: StaffCustomerGoalData, month: string, ids: readonly string[]) {
  if (data?.month !== month || typeof data.canEdit !== 'boolean' || !Array.isArray(data.customerIds) || data.customerIds.length !== ids.length || !ids.every(id => data.customerIds.includes(id)) || !data.items || typeof data.items !== 'object') throw new Error('対象月とお客様を再取得してください')
  for (const id of ids) {
    const item = data.items[id]
    if (!item || item.customerId !== id || !['ready', 'unassigned', 'unavailable'].includes(item.status)) throw new Error('お客様の目標を再取得してください')
    if (item.status === 'ready') {
      if (!item.castId || !GOAL_UUID.test(item.castId) || !item.actual || !Number.isFinite(item.actual.sales) || !Number.isSafeInteger(item.actual.visits) || item.actual.visits < 0 || (item.goal && (String(item.goal.customer_id) !== id || item.goal.cast_id !== item.castId || item.goal.month !== month + '-01'))) throw new Error('担当と実績を再取得してください')
    } else if (item.goal !== null || item.actual !== null || item.castId !== null) throw new Error('担当を確認できないお客様の目標は表示できません')
  }
}

/** ⭐️解除・担当変更が月別APIへ先に届いた場合だけ、元一覧を一度同期する。 */
export function useStaffGoalMembership({ month, customerCasts, data, enabled, onRefresh }: {
  month: string; customerCasts: ReadonlyMap<string, string | null>; data: StaffCustomerGoalData | null; enabled: boolean; onRefresh: () => void
}) {
  const mismatches = data?.month === month ? [...customerCasts].filter(([id, castName]) => {
    const item = data.items[id]
    return item && (item.status === 'unavailable' || item.castName !== (castName || null))
  }).sort(([a], [b]) => a.localeCompare(b)) : []
  const key = `${month}:${mismatches.map(([id, castName]) => JSON.stringify([id, castName, data!.items[id].status, data!.items[id].castName, data!.items[id].castId])).join(',')}`
  const mismatch = mismatches.length > 0, attempted = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || !data) return
    if (!mismatch) { attempted.current = null; return }
    if (attempted.current === key) return
    attempted.current = key
    onRefresh()
  }, [enabled, data, mismatch, key, onRefresh])
  return mismatch
}

/** 全キャスト分のAPIを個別に呼ばず、200顧客ずつ・同時3件まで取得する。 */
export async function loadStaffCustomerGoals(customerIds: readonly string[], month: string, signal: AbortSignal): Promise<StaffCustomerGoalData> {
  if (!validGoalMonth(month) || !validIds(customerIds)) throw new Error('対象月とお客様を確認してください')
  const ids = [...new Set(customerIds)], batches: string[][] = []
  for (let index = 0; index < ids.length; index += BATCH_SIZE) batches.push(ids.slice(index, index + BATCH_SIZE))
  const data: StaffCustomerGoalData = { month, customerIds: ids, canEdit: false, items: {} }
  let next = 0, stopped = false, canEdit: boolean | undefined
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, async () => {
    try {
      while (!stopped && !signal.aborted && next < batches.length) {
        const batch = batches[next++]
        const params = new URLSearchParams({ month, customerIds: batch.join(',') })
        const response = await fetch('/api/customer-goals/staff?' + params, { cache: 'no-store', signal })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '月別目標・実績を取得できませんでした')
        assertResponse(result, month, batch)
        if (canEdit !== undefined && canEdit !== result.canEdit) throw new Error('権限を再取得してください')
        canEdit = result.canEdit
        for (const id of batch) data.items[id] = result.items[id]
      }
    } catch (error) { stopped = true; throw error }
  }))
  if (signal.aborted) throw new DOMException('取得を中止しました', 'AbortError')
  data.canEdit = canEdit ?? false
  return data
}

export function useStaffCustomerGoals(customerIds: readonly string[], month: string, revision: number, paused: boolean) {
  const idsKey = [...new Set(customerIds)].sort((a, b) => Number(a) - Number(b)).join(',')
  const valid = validGoalMonth(month) && validIds(customerIds)
  const scope = `${month}:${idsKey}`, currentScope = useRef(scope)
  const [state, setState] = useState<{ scope: string; request: string; data: StaffCustomerGoalData } | null>(null)
  const [failure, setFailure] = useState<{ scope: string; request: string; message: string } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const request = `${scope}:${revision}:${refresh}`
  useEffect(() => { currentScope.current = scope }, [scope])
  const reload = useCallback(() => setRefresh(value => value + 1), [])
  useEffect(() => {
    if (!valid || paused || saving || !idsKey) return
    const controller = new AbortController()
    void loadStaffCustomerGoals(idsKey.split(','), month, controller.signal).then(data => {
      if (!controller.signal.aborted) { setState({ scope, request, data }); setFailure(null) }
    }).catch(error => {
      if (!controller.signal.aborted) setFailure({ scope, request, message: error instanceof Error ? error.message : '取得失敗' })
    })
    return () => controller.abort()
  }, [month, idsKey, valid, scope, request, paused, saving])
  useEffect(() => {
    if (!valid || paused || saving || !idsKey) return
    const update = () => { if (document.visibilityState === 'visible') reload() }
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    const timer = window.setInterval(update, 30000)
    return () => { window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); window.clearInterval(timer) }
  }, [valid, paused, saving, idsKey, reload])
  const data = state?.scope === scope ? state.data : null
  const error = !valid ? '対象月とお客様を確認してください' : failure?.scope === scope && failure.request === request ? failure.message : ''
  const ready = valid && (!idsKey || (!!data && state?.request === request && !error))
  const save = async (input: CustomerGoalInput) => {
    if (saveLock.current) throw new Error('保存中です')
    const item = data?.items[input.customerId]
    // 編集中は再取得を止める。別の確認ログ等でrevisionが増えても、同じ対象の
    // 編集スナップショットは保存できるようにし、担当/権限/版はPUTでも再検証する。
    if (!valid || currentScope.current !== scope || !data?.canEdit || input.month !== month || item?.status !== 'ready' || item.castId !== input.castId) throw new Error('担当と目標を読み直してください')
    saveLock.current = true; setSaving(true)
    try {
      const response = await fetch('/api/customer-goals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '目標を保存できませんでした。入力内容は残しています')
      const goal = result.goal as CustomerMonthlyGoal
      if (!goal || goal.cast_id !== input.castId || String(goal.customer_id) !== input.customerId || goal.month !== input.month + '-01' || !Number.isSafeInteger(goal.revision) || goal.revision <= input.expectedRevision) throw new Error('保存結果を確認できませんでした。入力内容は残しています')
      if (currentScope.current === scope) setState(previous => previous?.scope === scope && previous.data.items[input.customerId]?.castId === input.castId ? { ...previous, data: { ...previous.data, items: { ...previous.data.items, [input.customerId]: { ...previous.data.items[input.customerId], goal } } } } : previous)
      return goal
    } finally { saveLock.current = false; setSaving(false) }
  }
  return { data, ready, loading: valid && !!idsKey && !paused && !ready && !error, error, reload, save, saving }
}
