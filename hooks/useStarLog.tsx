'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StarCheckFilter, StarCycle, StarLogCustomer, StarLogDetail } from '@/lib/starLog'
import { todayJST } from '@/lib/dateUtils'
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
  const [confirming, setConfirming] = useState<string | null>(null)
  const confirmLock = useRef(false)
  const pendingConfirm = useRef<{ key: string; body: object } | null>(null)
  const [filterState, setFilterState] = useState<{ scope: string; value: StarCheckFilter } | null>(null)
  const onChangedRef = useRef(onChanged)
  const snapshot = useRef<{ scope: string; signature: string } | null>(null)
  useEffect(() => { onChangedRef.current = onChanged }, [onChanged])
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
        if (!controller.signal.aborted) {
          const items = data.items as StarCycle[]
          const signature = JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)))
          const changed = snapshot.current?.scope === scope && snapshot.current.signature !== signature
          snapshot.current = { scope, signature }
          setSummary({ scope, items }); setFailure(null)
          // 他スタッフによる記録も、スクロールを維持する親の再取得に反映する。
          if (changed) onChangedRef.current()
        }
      } catch (e) { if (!controller.signal.aborted) setFailure({ scope, message: e instanceof Error ? e.message : '取得失敗' }) }
    })()
    return () => controller.abort()
  }, [enabled, summaryEnabled, castName, scope, revision, refresh])
  useEffect(() => {
    if (!enabled || !summaryEnabled || busy || confirming || disabled) return
    const update = () => { if (document.visibilityState === 'visible') setRefresh(v => v + 1) }
    const interval = window.setInterval(update, 30000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update) }
  }, [enabled, summaryEnabled, busy, confirming, disabled])
  const confirmToday = async (customer: StarLogCustomer) => {
    if (confirmLock.current || busy || disabled) return
    confirmLock.current = true; setConfirming(customer.id)
    const today = todayJST(), key = `${scope}:${customer.id}:${today}`
    try {
      // 通信不明時の再送は同一requestId。確認は連絡日を変更せず、直前の状況を維持する。
      if (pendingConfirm.current?.key !== key) {
        const response = await fetch(`/api/star-logs/${customer.id}`, { cache: 'no-store' })
        const detail = await response.json() as StarLogDetail & { error?: string }
        if (!response.ok) throw new Error(detail.error || '確認状況を取得できませんでした')
        if (!detail.cycle || detail.cycle.ended_at) throw new Error('⭐️の状態を再取得してください')
        if (detail.cycle.last_checked_on === today) { setRefresh(v => v + 1); return }
        pendingConfirm.current = { key, body: { cycleId: detail.cycle.id, startedOn: detail.cycle.started_on, expectedStartedOn: detail.cycle.started_on,
          checkedOn: today, status: detail.cycle.last_status || '未連絡', note: '本日、連絡状況を確認しました。', requestId: crypto.randomUUID() } }
      }
      const response = await fetch(`/api/star-logs/${customer.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingConfirm.current.body) })
      const data = await response.json()
      if (!response.ok) { if (response.status < 500) pendingConfirm.current = null; throw new Error(data.error || '確認を保存できませんでした') }
      pendingConfirm.current = null
      const updated = await fetch(`/api/star-logs/${customer.id}`, { cache: 'no-store' })
      const detail = await updated.json() as StarLogDetail
      if (updated.ok && detail.cycle) {
        const cycle = detail.cycle
        setSummary(previous => previous?.scope === scope ? { scope, items: [...previous.items.filter(c => String(c.customer_id) !== customer.id), cycle] } : previous)
      }
      invalidateCustomerDetail(customer.id); setRefresh(v => v + 1); onChangedRef.current()
    } finally { confirmLock.current = false; setConfirming(null) }
  }
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
  return { summaries: map, ready, error, filter, setFilter: (value: StarCheckFilter) => setFilterState({ scope, value }), open, confirmToday, confirming, busy: busy || !!confirming, Toolbar, Overlays, HistoryButton }
}
