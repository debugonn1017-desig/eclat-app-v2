'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CustomerRank } from '@/types'
import { useToast } from '@/hooks/useToast'
import { useUndoToast } from '@/hooks/useUndoToast'
import { invalidateCustomerDetail, invalidateAllCastsKPI } from '@/lib/cache'
import CustomerRankDialog from '@/components/CustomerRankDialog'
import { customerRankLabel, type CustomerRankTarget } from '@/lib/customerRankChange'

export type CustomerActionTarget = CustomerRankTarget
type Mark = { id: string | number; is_starred: boolean; no_reply: boolean }
type Options = { castName?: string; onRanksChanged?: () => void | Promise<void> }

export function useCustomerListActions(options: Options = {}) {
  const [activeFollowUpIds, setStarredIds] = useState<Set<string>>(new Set())
  const [noReplyIds, setNoReplyIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [rankTarget, setRankTarget] = useState<CustomerRankTarget | null>(null)
  const busyRef = useRef(false)
  const generation = useRef({ value: 0 })
  const { toast, ToastView } = useToast()
  const undo = useUndoToast()
  const onChanged = options.onRanksChanged
  const refreshParent = useCallback(async () => {
    try { await onChanged?.() } catch { toast('変更は保存済みです。一覧を再読み込みしてください', 'error') }
  }, [onChanged, toast])
  useEffect(() => {
    setRankTarget(null)
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
    return await response.json().catch(()=>({})) as {rank_undo_token?:string;customer_rank_revision?:number}
  }, [])

  const restoreRank = useCallback(async (id:string, previous:CustomerRank|null, expected:CustomerRank|null, saved:{rank_undo_token?:string;customer_rank_revision?:number}) => {
    if(saved.rank_undo_token){
      const response=await fetch('/api/customer-ranks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tokens:[saved.rank_undo_token]})})
      const data=await response.json()
      if(!response.ok||!data.results?.[0]?.ok)throw new Error(data.error||data.results?.[0]?.error||'元に戻せませんでした')
      invalidateCustomerDetail(id);invalidateAllCastsKPI()
    }else{
      if(Number.isSafeInteger(saved.customer_rank_revision))throw new Error('安全なUndoを発行できませんでした。ランク変更から確認してください')
      await write(id,{customer_rank:previous,expected_customer_rank:expected})
    }
  },[write])

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
      const results = await Promise.allSettled(unique.map(async t => { const saved=await write(t.id, { customer_rank: '切れた',expected_customer_rank:t.previousRank }); return {...t,saved} }))
      const changed = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])
      await refreshParent()
      const canUndo=changed.every(t=>t.saved.rank_undo_token||!Number.isSafeInteger(t.saved.customer_rank_revision))
      if (changed.length && canUndo) undo.show(changed.length + '人を「切れた」にしました', async () => {
        const restored = await Promise.allSettled(changed.map(t => restoreRank(t.id,t.previousRank ?? null,'切れた',t.saved)))
        await refreshParent()
        if (restored.some(r => r.status === 'rejected')) throw new Error('一部を元に戻せませんでした')
      })
      if(changed.length&&!canUndo)toast('変更は保存済みですが、安全なUndoを発行できませんでした。戻す場合はランク変更で確認してください','error')
      if (results.some(r => r.status === 'rejected')) toast('一部のお客様は変更できませんでした', 'error')
      return changed.length > 0
    } finally { busyRef.current = false; setBusy(false) }
  }, [refreshParent, toast, undo, write, restoreRank])
  const openRankEditor = useCallback((target: CustomerRankTarget) => {
    if (!busyRef.current) setRankTarget({ ...target })
  }, [])
  const saveRank = useCallback(async (rank: CustomerRank | null) => {
    if (!rankTarget || busyRef.current) return
    if (rank === rankTarget.previousRank) return
    const target = rankTarget
    busyRef.current = true
    setBusy(true)
    try {
      const saved=await write(target.id, { customer_rank: rank, expected_customer_rank: target.previousRank })
      setRankTarget(null)
      await refreshParent()
      if(!saved.rank_undo_token&&Number.isSafeInteger(saved.customer_rank_revision)){
        toast('変更は保存済みですが、安全なUndoを発行できませんでした。戻す場合はランク変更で確認してください','error')
        return
      }
      undo.show(`${target.name || 'お客様'}を${customerRankLabel(rank)}に変更しました`, async () => {
        if (busyRef.current) throw new Error('他の操作が完了してからお試しください')
        busyRef.current = true
        setBusy(true)
        try {
          await restoreRank(target.id,target.previousRank,rank,saved)
          await refreshParent()
        } finally { busyRef.current = false; setBusy(false) }
      })
    } finally { busyRef.current = false; setBusy(false) }
  }, [rankTarget, refreshParent, undo, write, restoreRank, toast])
  return { activeFollowUpIds, noReplyIds, busy, loadActiveFollowUpIds, addToFollowUp, removeFromFollowUp, setNoReply, moveToSevered, openRankEditor,
    ToastView: <>{ToastView}{undo.ToastView}{rankTarget && <CustomerRankDialog key={rankTarget.id} target={rankTarget} busy={busy}
      onClose={() => { if (!busyRef.current) setRankTarget(null) }} onSave={saveRank}/>}</> }
}
