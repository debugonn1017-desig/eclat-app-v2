'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CustomerRank } from '@/types'
import { useToast } from '@/hooks/useToast'
import { useUndoToast } from '@/hooks/useUndoToast'
import { invalidateCustomerDetail, invalidateAllCastsKPI } from '@/lib/cache'

export type CustomerActionTarget = { id: string; name: string; previousRank: CustomerRank | null }
type Mark = { id: string | number; is_starred: boolean; no_reply: boolean }
type Options = { castName?: string; onRanksChanged?: () => void | Promise<void> }

export function useCustomerListActions(options: Options = {}) {
  const [activeFollowUpIds, setStarredIds] = useState<Set<string>>(new Set())
  const [noReplyIds, setNoReplyIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const generation = useRef({ value: 0 })
  const { toast, ToastView } = useToast()
  const undo = useUndoToast()
  const onChanged = options.onRanksChanged
  const refreshParent = useCallback(async () => {
    try { await onChanged?.() } catch { toast('変更は保存済みです。一覧を再読み込みしてください', 'error') }
  }, [onChanged, toast])
  useEffect(() => {
    const tracker = generation.current
    tracker.value++
    return () => { tracker.value++ }
  }, [options.castName])

  // 呼び出し名は既存画面との互換用。取得・保存する状態は星だけ。
  const loadActiveFollowUpIds = useCallback(async () => {
    const token = ++generation.current.value
    try {
      const response = await fetch('/api/customer-marks' + (options.castName ? '?castName=' + encodeURIComponent(options.castName) : ''), { cache: 'no-store' })
      if (!response.ok) throw new Error('取得失敗')
      const data = await response.json() as { items: Mark[] }
      if (token !== generation.current.value) return null
      const ids = new Set(data.items.filter(item => item.is_starred).map(item => String(item.id)))
      setStarredIds(ids)
      setNoReplyIds(new Set(data.items.filter(item => item.no_reply).map(item => String(item.id))))
      return ids
    } catch {
      if (token === generation.current.value) { setStarredIds(new Set()); setNoReplyIds(new Set()) }
      return null
    }
  }, [options.castName])

  const write = useCallback(async (id: string, payload: Record<string, unknown>) => {
    const response = await fetch('/api/customers/' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(data.error || '変更できませんでした')
    }
    invalidateCustomerDetail(id)
    invalidateAllCastsKPI()
  }, [])

  const setMark = useCallback(async (ids: string[], key: 'is_starred' | 'no_reply', value: boolean) => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    try {
      const results = await Promise.all([...new Set(ids)].map(async id => {
        try {
          const response = await fetch('/api/customers/' + id, { cache: 'no-store' })
          if (!response.ok) throw new Error('取得失敗')
          const row = await response.json() as Record<string, unknown>
          const previous = row[key] === true
          if (previous === value) return null
          await write(id, { [key]: value })
          return { id, previous }
        } catch { return { failed: true as const } }
      }))
      const changed = results.filter((r): r is { id: string; previous: boolean } => !!r && 'id' in r)
      await loadActiveFollowUpIds()
      await refreshParent()
      if (changed.length) {
        const label = key === 'is_starred' ? (value ? '⭐️に追加しました' : '⭐️を解除しました') : (value ? '返信なしを付けました' : '返信なしを解除しました')
        undo.show(changed.length + '人：' + label, async () => {
          const restored = await Promise.allSettled(changed.map(r => write(r.id, { [key]: r.previous })))
          await loadActiveFollowUpIds()
          await refreshParent()
          if (restored.some(r => r.status === 'rejected')) throw new Error('一部を元に戻せませんでした')
        })
      }
      const failed = results.filter(r => r && 'failed' in r).length
      if (failed) toast(failed + '人は変更できませんでした', 'error')
      return changed.length > 0
    } finally { busyRef.current = false; setBusy(false) }
  }, [loadActiveFollowUpIds, refreshParent, toast, undo, write])

  const addToFollowUp = useCallback((ids: string[], confirmBulk?: boolean) => { void confirmBulk; return setMark(ids, 'is_starred', true) }, [setMark])
  const removeFromFollowUp = useCallback((ids: string[]) => setMark(ids, 'is_starred', false), [setMark])
  const setNoReply = useCallback((ids: string[], value: boolean) => setMark(ids, 'no_reply', value), [setMark])
  const moveToSevered = useCallback(async (targets: CustomerActionTarget[]) => {
    if (busyRef.current) return false
    const unique = [...new Map(targets.filter(t => t.previousRank !== '切れた').map(t => [t.id, t])).values()]
    if (!unique.length || !window.confirm(unique.length + '人を「切れた」にしますか？')) return false
    busyRef.current = true
    setBusy(true)
    try {
      const results = await Promise.allSettled(unique.map(async t => { await write(t.id, { customer_rank: '切れた' }); return t }))
      const changed = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])
      await refreshParent()
      if (changed.length) undo.show(changed.length + '人を「切れた」にしました', async () => {
        const restored = await Promise.allSettled(changed.map(t => write(t.id, { customer_rank: t.previousRank ?? null })))
        await refreshParent()
        if (restored.some(r => r.status === 'rejected')) throw new Error('一部を元に戻せませんでした')
      })
      if (results.some(r => r.status === 'rejected')) toast('一部のお客様は変更できませんでした', 'error')
      return changed.length > 0
    } finally { busyRef.current = false; setBusy(false) }
  }, [refreshParent, toast, undo, write])
  return { activeFollowUpIds, noReplyIds, busy, loadActiveFollowUpIds, addToFollowUp, removeFromFollowUp, setNoReply, moveToSevered, ToastView: <>{ToastView}{undo.ToastView}</> }
}
