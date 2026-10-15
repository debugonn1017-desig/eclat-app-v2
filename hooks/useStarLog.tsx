'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { StarCheckFilter, StarCycle, StarLogCustomer } from '@/lib/starLog'
import { invalidateCustomerDetail, invalidateAllCastsKPI } from '@/lib/cache'
import StarLogPanel from '@/components/StarLogPanel'
import StarLogHistory from '@/components/StarLogHistory'
import { starLogColors } from '@/components/StarLogSummary'
import styles from '@/components/StarLog.module.css'

export function useStarLog({ enabled, summaryEnabled = enabled, disabled = false, scopeKey, castName, revision, onChanged, onFilterChange, casts = [] }: {
  enabled: boolean; scopeKey: string; castName?: string; revision: number; onChanged: () => void
  summaryEnabled?: boolean
  disabled?: boolean
  onFilterChange?: () => void
  casts?: { cast_name: string; display_name?: string | null; cast_tier?: string | null }[]
}) {
  const scope = scopeKey + ':' + (castName || '')
  const [summary, setSummary] = useState<{ scope: string; items: StarCycle[] } | null>(null)
  const [failure, setFailure] = useState<{ scope: string; message: string } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState<{ scope: string; queue: StarLogCustomer[]; index: number } | null>(null)
  const [history, setHistory] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [filterState, setFilterState] = useState<{ scope: string; value: StarCheckFilter } | null>(null)
  const filter = filterState?.scope === scope ? filterState.value : 'all'
  const map = useMemo(() => new Map((summary?.scope === scope ? summary.items : []).map(c => [String(c.customer_id), c])), [summary, scope])
  const ready = summary?.scope === scope
  const error = failure?.scope === scope ? failure.message : ''
  useEffect(() => {
    if (!enabled || !summaryEnabled) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/star-logs?view=active' + (castName ? '&castName=' + encodeURIComponent(castName) : ''), { cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '⭐️記録を取得できませんでした')
        if (!controller.signal.aborted) { setSummary({ scope, items: data.items }); setFailure(null) }
      } catch (e) { if (!controller.signal.aborted) setFailure({ scope, message: e instanceof Error ? e.message : '取得失敗' }) }
    })()
    return () => controller.abort()
  }, [enabled, summaryEnabled, castName, scope, revision, refresh])
  useEffect(() => {
    if (!enabled) return
    const update = () => setRefresh(v => v + 1)
    window.addEventListener('focus', update)
    return () => window.removeEventListener('focus', update)
  }, [enabled])
  const open = useCallback((target: StarLogCustomer, queue: StarLogCustomer[] = []) => {
    const start = queue.findIndex(c => c.id === target.id)
    setSelected({ scope, queue: start >= 0 ? queue : [target], index: start >= 0 ? start : 0 })
  }, [scope])
  const target = selected?.scope === scope ? selected.queue[selected.index] : undefined
  const saved = () => {
    if (target) invalidateCustomerDetail(target.id)
    invalidateAllCastsKPI()
    setRefresh(v => v + 1)
    onChanged()
  }
  const HistoryButton = <button type="button" className={styles.historyButton} style={starLogColors} disabled={busy || disabled} onClick={() => setHistory(scope)}>終了履歴</button>
  const Toolbar = enabled ? <div className={styles.toolbar} style={starLogColors}>
    <div role="group" aria-label="確認状況の絞り込み">{([{ value: 'all', label: '全員' }, { value: 'unchecked', label: '今日未確認' }, { value: 'checked', label: '今日確認済み' }] as const).map(option => <button type="button" key={option.value} aria-pressed={filter === option.value} disabled={busy || disabled || !ready || !!error} onClick={() => { if (filter !== option.value) { onFilterChange?.(); setFilterState({ scope, value: option.value }) } }}>{option.label}</button>)}</div>
    {HistoryButton}
    {error && <span role="alert">{error}<button type="button" onClick={() => setRefresh(v => v + 1)}>再取得</button></span>}
  </div> : null
  const Overlays = enabled ? <>
    {history === scope && <StarLogHistory castName={castName} casts={casts} revision={refresh + revision} onClose={() => setHistory(null)} onOpen={open}/>}
    {target && <StarLogPanel key={`${target.id}:${target.cycleId || 'current'}`} target={target} onClose={() => setSelected(null)} onSaved={saved} onBusyChange={setBusy}
      onRestart={() => open({ ...target, cycleId: undefined })} onNext={selected && selected.index + 1 < selected.queue.length ? () => setSelected(previous => previous ? { ...previous, index: previous.index + 1 } : null) : undefined}/>}
  </> : null
  return { summaries: map, ready, error, filter, open, busy, Toolbar, Overlays, HistoryButton }
}
