'use client'

import { useCallback, useRef, useState, type ReactElement } from 'react'
import type { CustomerRank } from '@/types'
import { useToast } from '@/hooks/useToast'
import { useUndoToast } from '@/hooks/useUndoToast'

export type CustomerActionTarget = {
  id: string
  name: string
  previousRank: CustomerRank | null
}

type FollowUpItem = {
  id: string
  customer_id: string | number
  is_active: boolean
}

type Options = {
  onRanksChanged?: () => void | Promise<void>
}

export function useCustomerListActions(options: Options = {}): {
  activeFollowUpIds: Set<string>
  busy: boolean
  loadActiveFollowUpIds: () => Promise<Set<string> | null>
  addToFollowUp: (customerIds: string[], confirmBulk?: boolean) => Promise<boolean>
  removeFromFollowUp: (customerIds: string[]) => Promise<boolean>
  moveToSevered: (targets: CustomerActionTarget[]) => Promise<boolean>
  ToastView: ReactElement
} {
  const [activeFollowUpIds, setActiveFollowUpIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  // customer_id → customer_follow_ups.id。解除APIは追いかけ行のidを必要とする。
  const activeFollowUpRecordIdsRef = useRef<Map<string, string>>(new Map())
  const { toast, ToastView: noticeToastView } = useToast()
  const undoToast = useUndoToast()
  const onRanksChanged = options.onRanksChanged

  const loadActiveFollowUpIds = useCallback(async (): Promise<Set<string> | null> => {
    try {
      const response = await fetch('/api/follow-ups?includeCandidates=0', {
        cache: 'no-store',
      })
      if (!response.ok) return null
      const data = await response.json() as { items?: FollowUpItem[] }
      const ids = new Set(
        (data.items ?? [])
          .filter(item => item.is_active)
          .map(item => String(item.customer_id)),
      )
      activeFollowUpRecordIdsRef.current = new Map(
        (data.items ?? [])
          .filter(item => item.is_active)
          .map(item => [String(item.customer_id), String(item.id)]),
      )
      setActiveFollowUpIds(ids)
      return ids
    } catch {
      // 追いかけ状態の取得失敗で顧客一覧・カレンダー自体は止めない。
      return null
    }
  }, [])

  const addToFollowUp = useCallback(async (
    customerIds: string[],
    confirmBulk = false,
  ) => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    try {
      // v0.3.61 hotfix と同じ二重防御:
      // 最新 GET の Set を直接利用し、GET 後の競合は POST の wasAlreadyActive で判定する。
      const latestIds = await loadActiveFollowUpIds()
      const knownActiveIds = latestIds ?? activeFollowUpIds
      const uniqueIds = [...new Set(customerIds.map(String))]
      const targetIds = uniqueIds.filter(id => !knownActiveIds.has(id))
      if (targetIds.length === 0) {
        toast('選択したお客様は全員、追いかけ中です', 'warning')
        return false
      }
      if (confirmBulk && !window.confirm(`${targetIds.length}人を追いかけリストに追加しますか？`)) {
        return false
      }

      const results = await Promise.all(targetIds.map(async customerId => {
        try {
          const response = await fetch('/api/follow-ups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId }),
          })
          const data = await response.json().catch(() => ({})) as {
            id?: string
            error?: string
            wasAlreadyActive?: boolean
          }
          if (!response.ok || !data.id) {
            throw new Error(data.error ?? '追いかけリストへの追加に失敗しました')
          }
          return {
            customerId,
            followUpId: data.id,
            wasAlreadyActive: data.wasAlreadyActive === true,
            ok: true as const,
          }
        } catch (error) {
          return { customerId, error, ok: false as const }
        }
      }))

      const completed = results.filter(result => result.ok)
      const added = completed.filter(result => !result.wasAlreadyActive)
      const alreadyActiveCount = completed.length - added.length
      const failedCount = results.length - completed.length
      if (completed.length === 0) throw new Error('追いかけリストへ追加できませんでした')

      await loadActiveFollowUpIds()
      if (added.length > 0) {
        undoToast.show(
          added.length === 1
            ? '追いかけリストに追加しました'
            : `${added.length}人を追いかけに追加しました`,
          async () => {
            const undoResults = await Promise.all(added.map(async result => {
              const response = await fetch(`/api/follow-ups/${result.followUpId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove' }),
              })
              return response.ok
            }))
            await loadActiveFollowUpIds()
            if (undoResults.some(ok => !ok)) throw new Error('一部を元に戻せませんでした')
            toast('追いかけ追加を取り消しました', 'success')
          },
        )
      } else {
        toast('選択したお客様は全員、すでに追いかけ中でした', 'warning')
      }
      if (alreadyActiveCount > 0 && added.length > 0) {
        toast(`${alreadyActiveCount}人はすでに追いかけ中のため追加していません`, 'warning')
      }
      if (failedCount > 0) toast(`${failedCount}人は追加できませんでした`, 'warning')
      return true
    } catch (error) {
      toast(error instanceof Error ? error.message : '追いかけリストへの追加に失敗しました', 'error')
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [activeFollowUpIds, loadActiveFollowUpIds, toast, undoToast])

  const removeFromFollowUp = useCallback(async (customerIds: string[]) => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    try {
      // 解除直前に最新状態を取得し、別タブでの追加・解除にも追従する。
      const latestIds = await loadActiveFollowUpIds()
      if (!latestIds) throw new Error('最新の追いかけ状態を確認できませんでした')
      const uniqueIds = [...new Set(customerIds.map(String))]
      const targets = uniqueIds
        .filter(customerId => latestIds.has(customerId))
        .map(customerId => ({
          customerId,
          followUpId: activeFollowUpRecordIdsRef.current.get(customerId),
        }))
        .filter((target): target is { customerId: string; followUpId: string } => Boolean(target.followUpId))

      if (targets.length === 0) {
        toast('このお客様は追いかけリストに入っていません', 'warning')
        return false
      }

      const results = await Promise.all(targets.map(async target => {
        try {
          const response = await fetch(`/api/follow-ups/${target.followUpId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove' }),
          })
          const data = await response.json().catch(() => ({})) as { error?: string }
          if (!response.ok) throw new Error(data.error ?? '追いかけリストから外せませんでした')
          return { ...target, ok: true as const }
        } catch (error) {
          return { ...target, error, ok: false as const }
        }
      }))

      const removed = results.filter(result => result.ok)
      const failedCount = results.length - removed.length
      if (removed.length === 0) throw new Error('追いかけリストから外せませんでした')

      await loadActiveFollowUpIds()
      undoToast.show(
        removed.length === 1
          ? '追いかけリストから外しました'
          : `${removed.length}人を追いかけリストから外しました`,
        async () => {
          const undoResults = await Promise.all(removed.map(async target => {
            const response = await fetch(`/api/follow-ups/${target.followUpId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'reactivate' }),
            })
            return response.ok
          }))
          await loadActiveFollowUpIds()
          if (undoResults.some(ok => !ok)) throw new Error('一部を元に戻せませんでした')
          toast('追いかけリストへ戻しました', 'success')
        },
      )
      if (failedCount > 0) toast(`${failedCount}人は外せませんでした`, 'warning')
      return true
    } catch (error) {
      toast(error instanceof Error ? error.message : '追いかけリストから外せませんでした', 'error')
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [loadActiveFollowUpIds, toast, undoToast])

  const moveToSevered = useCallback(async (targets: CustomerActionTarget[]) => {
    if (busyRef.current) return false
    const uniqueTargets = [...new Map(
      targets
        .filter(target => target.previousRank !== '切れた')
        .map(target => [target.id, target]),
    ).values()]
    if (uniqueTargets.length === 0) {
      toast('選択したお客様は全員「切れた」です', 'warning')
      return false
    }
    const label = uniqueTargets.length === 1
      ? `${uniqueTargets[0].name || 'このお客様'}を「切れた」へ移動しますか？`
      : `${uniqueTargets.length}人を「切れた」にしますか？`
    if (!window.confirm(`${label}\n追いかけ中のお客様は、外すまで追いかけリストに残ります。`)) {
      return false
    }

    busyRef.current = true
    setBusy(true)
    try {
      const results = await Promise.all(uniqueTargets.map(async target => {
        try {
          const response = await fetch(`/api/customers/${target.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_rank: '切れた' }),
          })
          const data = await response.json().catch(() => ({})) as { error?: string }
          if (!response.ok) throw new Error(data.error ?? '「切れた」への変更に失敗しました')
          return { ...target, ok: true as const }
        } catch (error) {
          return { ...target, error, ok: false as const }
        }
      }))
      const succeeded = results.filter(result => result.ok)
      const failedCount = results.length - succeeded.length
      if (succeeded.length === 0) throw new Error('「切れた」へ変更できませんでした')

      await onRanksChanged?.()
      undoToast.show(
        succeeded.length === 1
          ? '「切れた」へ移動しました'
          : `${succeeded.length}人を「切れた」にしました`,
        async () => {
          const undoResults = await Promise.all(succeeded.map(async target => {
            const response = await fetch(`/api/customers/${target.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ customer_rank: target.previousRank ?? null }),
            })
            return response.ok
          }))
          await onRanksChanged?.()
          if (undoResults.some(ok => !ok)) throw new Error('一部を元のランクへ戻せませんでした')
          toast('元のランクへ戻しました', 'success')
        },
      )
      if (failedCount > 0) toast(`${failedCount}人は変更できませんでした`, 'warning')
      return true
    } catch (error) {
      toast(error instanceof Error ? error.message : '「切れた」への変更に失敗しました', 'error')
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [onRanksChanged, toast, undoToast])

  return {
    activeFollowUpIds,
    busy,
    loadActiveFollowUpIds,
    addToFollowUp,
    removeFromFollowUp,
    moveToSevered,
    ToastView: (
      <>
        {noticeToastView}
        {undoToast.ToastView}
      </>
    ),
  }
}
