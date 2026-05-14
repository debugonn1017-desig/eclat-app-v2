'use client'

import { useEffect, useState } from 'react'
import type { ManualData } from '@/types/manual'

// /public/manual/data.json をクライアントで一度だけ fetch するシングルトン
let cache: ManualData | null = null
let inflight: Promise<ManualData> | null = null

async function load(): Promise<ManualData> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = fetch('/manual/data.json', { cache: 'force-cache' })
    .then((r) => {
      if (!r.ok) throw new Error('failed to load /manual/data.json')
      return r.json()
    })
    .then((d: ManualData) => {
      cache = d
      return d
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function useManualData() {
  const [data, setData] = useState<ManualData | null>(cache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cache) {
      setData(cache)
      return
    }
    let cancelled = false
    load()
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)) })
    return () => { cancelled = true }
  }, [])

  return { data, error, loading: !data && !error }
}
