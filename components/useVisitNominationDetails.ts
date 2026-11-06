'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CustomerVisit, NominationStatus } from '@/types'
import type { VisitNominationCorrectionHistory } from '@/lib/visitNominationCorrection'

type Resource = { customerId: string; customerStatus: NominationStatus | null; visits: CustomerVisit[]; history: VisitNominationCorrectionHistory[]; canEdit: boolean }

/** Keep unavailable data distinct from an empty visit history. */
export function useVisitNominationDetails(customerId: string, enabled: boolean) {
  const [loaded, setLoaded] = useState<{ customerId: string; version: number; data: Resource } | null>(null)
  const [failure, setFailure] = useState<{ customerId: string; version: number; message: string } | null>(null)
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion(value => value + 1), [])
  useEffect(() => {
    if (!enabled || !customerId) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/visit-nominations?customerId=${encodeURIComponent(customerId)}`, { cache: 'no-store', signal: controller.signal })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '指名区分の来店記録を取得できませんでした')
        if (result.customerId !== customerId || !Array.isArray(result.visits) || !Array.isArray(result.history) || typeof result.canEdit !== 'boolean') throw new Error('来店記録の取得結果を確認できませんでした')
        if (controller.signal.aborted) return
        const visits = result.visits.map((visit: CustomerVisit) => ({ ...visit, id: String(visit.id), customer_id: String(visit.customer_id) }))
        setLoaded({ customerId, version, data: { customerId, customerStatus: result.customerStatus, visits, history: result.history, canEdit: result.canEdit } })
        setFailure(null)
      } catch (error) {
        if (!controller.signal.aborted) setFailure({ customerId, version, message: error instanceof Error ? error.message : '来店記録を取得できませんでした' })
      }
    })()
    return () => controller.abort()
  }, [customerId, enabled, version])
  const data = enabled && loaded?.customerId === customerId ? loaded.data : null
  const error = failure?.customerId === customerId && failure.version === version ? failure.message : ''
  const ready = enabled && !!data && loaded?.version === version && !error
  return { data, ready, error, loading: enabled && !ready && !error, reload }
}
