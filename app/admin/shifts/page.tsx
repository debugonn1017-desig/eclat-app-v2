'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCasts } from '@/hooks/useCasts'
import { useToast } from '@/hooks/useToast'
import { useBackOrHome } from '@/hooks/useBackOrHome'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'
import { C } from '@/lib/colors'
import { CastShift, CAST_TIER_GROUPS } from '@/types'
import BottomNav from '@/components/BottomNav'
import ShiftSuggestionCard, { ShiftHistoryVisit } from '@/components/ShiftSuggestionCard'
import ViewModeToggle from '@/components/ViewModeToggle'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { useViewMode } from '@/hooks/useViewMode'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { todayJST } from '@/lib/dateUtils'
import { SHIFT_TIME_OPTIONS, getShiftTimeMemo, setShiftTimeMemo, type ShiftDraft, type ShiftTime } from '@/lib/shiftTimeMemo'
import { groupCastManagementRows } from '@/lib/castManagementOrder'
// v0.3.40: /api/auth/me を sessionStorage 5分キャッシュ化 (lib/authCache.ts)
import { fetchMe } from '@/lib/authCache'

// ─── シフトステータス定義 ──────────────────────────────────────
const SHIFT_STATUSES: CastShift['status'][] = ['出勤', '休み', '希望出勤', '希望休み', '来客出勤', '未定']

const statusStyle = (status?: CastShift['status']): { bg: string; fg: string; label: string } => {
  switch (status) {
    case '出勤':     return { bg: C.pink, fg: '#FFF', label: '出' }
    case '休み':     return { bg: '#E0E0E0', fg: '#999', label: '休' }
    case '希望出勤': return { bg: '#FFE0E8', fg: C.pink, label: '希出' }
    case '希望休み': return { bg: '#E8F4FD', fg: '#185FA5', label: '希休' }
    case '来客出勤': return { bg: '#E1F5EE', fg: '#0F6E56', label: '来客' }
    case '未定':     return { bg: '#F5F5F5', fg: '#BBB', label: '未' }
    default:         return { bg: 'transparent', fg: '#DDD', label: '−' }
  }
}

// 「消去」用の特殊値
type BrushStatus = CastShift['status'] | 'clear' | 'timeMemo'

export default function ShiftCalendarPage() {
  // v0.3.49-E: alert → 非ブロッキングトースト (一括保存の成功通知も追加)
  const { toast, ToastView } = useToast()
  const router = useRouter()
  const goBack = useBackOrHome('/admin/casts')
  useScrollTopOnMount()
  const supabase = useMemo(() => createClient(), [])
  const { casts, isLoaded: castsLoaded } = useCasts()
  const sortedCasts = useMemo(() => groupCastManagementRows(casts).flatMap(group => group.rows), [casts])
  const { isPC } = useViewMode()

  // 権限
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  // 月選択
  const [month, setMonth] = useState(() => todayJST().slice(0, 7))

  // メモも同じスナップショットで保持し、状態だけの変更で消さない。
  const [shiftData, setShiftData] = useState<Map<string, ShiftDraft>>(new Map())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null)
  const baselineRef = useRef(new Map<string, { status: CastShift['status']; memo: string | null }>())

  // シフト最適化提案用の過去 visits
  const [historyVisits, setHistoryVisits] = useState<ShiftHistoryVisit[]>([])
  const [showSuggestion, setShowSuggestion] = useState(false)

  // 来店予定（cast_id × planned_date キーでまとめる）
  type PlannedVisitRow = {
    id: number | string
    customer_id: string
    customer_name: string
    cast_id: string
    planned_date: string
    planned_time: string | null
    party_size: number | null
    has_douhan: boolean | null
    memo: string | null
    status: string
  }
  const [plannedVisits, setPlannedVisits] = useState<Map<string, PlannedVisitRow[]>>(new Map())
  // 予定オーバーレイ
  const [plannedOverlay, setPlannedOverlay] = useState<{ castId: string; day: number; castName: string } | null>(null)

  // 変更されたセルの追跡: Set<`${castId}:${date}`>
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const [memoDirtyKeys, setMemoDirtyKeys] = useState<Set<string>>(new Set())

  // ─── ペイントモード ─────────────────────────────────────────
  const [activeBrush, setActiveBrush] = useState<BrushStatus>('出勤')
  const [selectedTime, setSelectedTime] = useState<ShiftTime | 'clear'>('20:00')
  const gridDisabled = !authorized || loading || saving || loadedMonth !== month || plannedOverlay !== null
  const draftRef = useRef({ data: shiftData, dirty: dirtyKeys, memoDirty: memoDirtyKeys, loadedMonth })
  draftRef.current = { data: shiftData, dirty: dirtyKeys, memoDirty: memoDirtyKeys, loadedMonth }
  const isDragging = useRef(false)
  const dragChanged = useRef(false)

  // ─── Undo / Redo 履歴 ───────────────────────────────────────
  type Snapshot = { data: Map<string, ShiftDraft>; dirty: Set<string>; memoDirty: Set<string> }
  const [undoStack, setUndoStack] = useState<Snapshot[]>([])
  const [redoStack, setRedoStack] = useState<Snapshot[]>([])
  const preActionSnapshot = useRef<Snapshot | null>(null)
  const MAX_HISTORY = 50

  const pushUndo = useCallback((snapshot: Snapshot) => {
    setUndoStack(prev => {
      const next = [...prev, snapshot]
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
    })
    setRedoStack([]) // 新しいアクションが入ったらredoはクリア
  }, [])

  const currentSnapshot = useCallback((): Snapshot => ({
    data: new Map(draftRef.current.data), dirty: new Set(draftRef.current.dirty), memoDirty: new Set(draftRef.current.memoDirty),
  }), [])

  const restoreSnapshot = useCallback((snapshot: Snapshot) => {
    draftRef.current = { ...draftRef.current, ...snapshot }
    setShiftData(snapshot.data)
    setDirtyKeys(snapshot.dirty)
    setMemoDirtyKeys(snapshot.memoDirty)
  }, [])

  const handleUndo = useCallback(() => {
    if (gridDisabled || undoStack.length === 0) return
    const before = currentSnapshot()
    setRedoStack(prev => [...prev, before])
    restoreSnapshot(undoStack[undoStack.length - 1])
    setUndoStack(prev => prev.slice(0, -1))
  }, [gridDisabled, undoStack, currentSnapshot, restoreSnapshot])

  const handleRedo = useCallback(() => {
    if (gridDisabled || redoStack.length === 0) return
    const before = currentSnapshot()
    setUndoStack(prev => [...prev, before])
    restoreSnapshot(redoStack[redoStack.length - 1])
    setRedoStack(prev => prev.slice(0, -1))
  }, [gridDisabled, redoStack, currentSnapshot, restoreSnapshot])

  // 入力中のネイティブUndoは奪わない。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  // 時間モードでは希望出勤のメモだけを変更し、出勤状態は変えない。
  const paintCell = useCallback((castId: string, day: number, notify = false) => {
    if (gridDisabled) return false
    const dateStr = `${month}-${String(day).padStart(2, '0')}`
    const key = `${castId}:${dateStr}`, current = draftRef.current.data.get(key)
    if (activeBrush === 'timeMemo' && current?.status !== '希望出勤') {
      if (notify) toast('時間メモは「希望出勤」の日に設定できます', 'warning')
      return false
    }
    const next = new Map(draftRef.current.data), memoDirty = new Set(draftRef.current.memoDirty)
    if (activeBrush === 'clear') {
      if (!current) return false
      next.delete(key)
      // 消去後に同じマスを塗り直しても、消したメモをDBから復活させない。
      memoDirty.add(key)
    } else if (activeBrush === 'timeMemo') {
      const memo = setShiftTimeMemo(current!.memo, selectedTime === 'clear' ? null : selectedTime)
      if (memo === current!.memo) return false
      next.set(key, { ...current!, memo })
      memoDirty.add(key)
    } else {
      if (current?.status === activeBrush) return false
      next.set(key, { status: activeBrush, memo: current?.memo ?? '' })
    }
    const dirty = new Set(draftRef.current.dirty).add(key)
    draftRef.current = { ...draftRef.current, data: next, dirty, memoDirty }
    setShiftData(next)
    setDirtyKeys(dirty)
    setMemoDirtyKeys(memoDirty)
    dragChanged.current = true
    return true
  }, [month, activeBrush, selectedTime, gridDisabled, toast])

  const handleMouseDown = useCallback((castId: string, day: number) => {
    if (gridDisabled) return
    preActionSnapshot.current = currentSnapshot()
    dragChanged.current = false
    isDragging.current = true
    paintCell(castId, day, true)
  }, [paintCell, currentSnapshot, gridDisabled])

  const handleMouseEnter = useCallback((castId: string, day: number) => {
    if (isDragging.current) paintCell(castId, day)
  }, [paintCell])

  const handleSingleCell = useCallback((castId: string, day: number) => {
    if (gridDisabled) return
    const before = currentSnapshot()
    if (paintCell(castId, day, true)) pushUndo(before)
    dragChanged.current = false
  }, [gridDisabled, currentSnapshot, paintCell, pushUndo])

  useEffect(() => {
    const onUp = () => {
      if (isDragging.current && dragChanged.current && preActionSnapshot.current) pushUndo(preActionSnapshot.current)
      preActionSnapshot.current = null
      isDragging.current = false
      dragChanged.current = false
    }
    window.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onUp)
    return () => { window.removeEventListener('mouseup', onUp); window.removeEventListener('blur', onUp) }
  }, [pushUndo])

  // ─── 権限チェック ────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        // v0.3.40: fetchMe() で sessionStorage キャッシュ + session 検証
        const data = await fetchMe()
        if (!data) { setAuthorized(false); return }
        if (data.role === 'cast') { setAuthorized(false); return }
        setAuthorized(data.is_owner === true || data.permissions?.['シフト.管理'] === true)
      } catch { setAuthorized(false) }
    }
    check()
  }, [])

  // ─── カレンダー日数生成 ──────────────────────────────────────
  const { daysInMonth, dayHeaders } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const dim = new Date(y, m, 0).getDate()
    const dayNames = ['日', '月', '火', '水', '木', '金', '土']
    const headers: { day: number; dow: string }[] = []
    for (let d = 1; d <= dim; d++) {
      const dow = dayNames[new Date(y, m - 1, d).getDay()]
      headers.push({ day: d, dow })
    }
    return { daysInMonth: dim, dayHeaders: headers }
  }, [month])

  // ─── シフトデータ取得 ────────────────────────────────────────
  useEffect(() => {
    if (!authorized || !castsLoaded) return
    // 同じ月の名簿更新で、入力中の下書きを上書きしない。
    if (draftRef.current.loadedMonth === month && draftRef.current.dirty.size > 0) return
    let cancelled = false
    const fetchShifts = async () => {
      setLoading(true)
      try {
        const startDate = `${month}-01`
        const [y, m] = month.split('-').map(Number)
        const endDate = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`

        // v0.3.50-C hotfix: 1000件制限を超える月 (2026-06 で 1101件) でシフトが取得漏れする問題対応。
        //   active キャストの id 集合に絞った上で、fetchAllPaginated でページング取得。
        //   .order で取得順を安定化し、Map 構築時の挙動を予測可能にする。
        // v0.3.50-C hotfix2: fetchAllPaginated は throw するので try/catch/finally で囲み、
        //   通信エラー / RLS / Supabase 一時障害でも setLoading(false) まで必ず到達するよう保証。
        //   Codex P2 指摘対応。
        const castIds = casts.map(c => c.id)
        const data = castIds.length === 0 ? [] : await fetchAllPaginated<{ cast_id: string; shift_date: string; status: CastShift['status']; memo: string | null }>(
          (from, to) =>
            supabase
              .from('cast_shifts')
              .select('cast_id, shift_date, status, memo')
              .in('cast_id', castIds)
              .gte('shift_date', startDate)
              .lte('shift_date', endDate)
              .order('cast_id', { ascending: true })
              .order('shift_date', { ascending: true })
              .range(from, to)
        )

        if (cancelled) return
        baselineRef.current = new Map(data.map(row => [`${row.cast_id}:${row.shift_date}`, { status: row.status, memo: row.memo }]))
        const map = new Map<string, ShiftDraft>()
        if (data) {
          for (const s of data) {
            map.set(`${s.cast_id}:${s.shift_date}`, { status: s.status, memo: s.memo ?? '' })
          }
        }
        draftRef.current = { data: map, dirty: new Set(), memoDirty: new Set(), loadedMonth: month }
        setShiftData(map)
        setDirtyKeys(new Set())
        setMemoDirtyKeys(new Set())
        setLoadedMonth(month)
        setUndoStack([])
        setRedoStack([])
      } catch (e) {
        if (!cancelled) {
          console.error('[shifts fetchShifts]', e)
          toast('シフト取得に失敗しました。月を切り替えて再取得してください', 'error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchShifts()
    return () => { cancelled = true }
  }, [month, castsLoaded, casts, supabase, toast, authorized])

  // 過去6ヶ月の visits を読み込んでシフト最適化提案に渡す
  useEffect(() => {
    if (!authorized) return
    let cancelled = false
    const fetchHistory = async () => {
      // ⚠ JST 固定: toISOString().slice(0,10) は UTC ベースなので JST 早朝に1日ズレる
      const endISO = todayJST()
      // 6ヶ月前の月初を JST で算出
      const [y, m] = endISO.split('-').map(Number)
      const sixD = new Date(y, m - 1 - 6, 1)
      const startISO = `${sixD.getFullYear()}-${String(sixD.getMonth() + 1).padStart(2, '0')}-01`
      // ⚠ 1000件制限対策: 6ヶ月分の visits は確実に 1000+ になる → 提案がズレる
      const data = await fetchAllPaginated<{ visit_date: string; visit_time: string | null; customer_id: string; amount_spent: number }>(
        (from, to) =>
          supabase
            .from('customer_visits')
            .select('visit_date, visit_time, customer_id, amount_spent')
            .gte('visit_date', startISO)
            .lte('visit_date', endISO)
            .range(from, to)
      ).catch(e => { console.error('[shifts history]', e); return [] })
      if (cancelled) return
      setHistoryVisits(
        data.map(v => ({
          visit_date: v.visit_date,
          visit_time: v.visit_time ?? null,
          customer_id: v.customer_id,
          amount_spent: Number(v.amount_spent) || 0,
        }))
      )
    }
    void fetchHistory()
    return () => { cancelled = true }
  }, [supabase, authorized])

  // 当月の来店予定を取得（cast×date キーでまとめる）
  useEffect(() => {
    if (!authorized) return
    let cancelled = false
    const fetchPlanned = async () => {
      const startDate = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const endDate = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
      const { data } = await supabase
        .from('planned_visits')
        .select('id, customer_id, cast_id, planned_date, planned_time, party_size, has_douhan, memo, status, customers!inner(customer_name)')
        .gte('planned_date', startDate)
        .lte('planned_date', endDate)
        .neq('status', 'キャンセル')
        .order('planned_time', { ascending: true })

      if (cancelled) return
      type PlannedQueryRow = Omit<PlannedVisitRow, 'customer_name'> & { customers: { customer_name: string | null } | null }
      const map = new Map<string, PlannedVisitRow[]>()
      for (const r of (data ?? []) as unknown as PlannedQueryRow[]) {
        const customerName = r.customers?.customer_name ?? '不明'
        const row: PlannedVisitRow = {
          id: r.id,
          customer_id: String(r.customer_id),
          customer_name: customerName,
          cast_id: r.cast_id,
          planned_date: r.planned_date,
          planned_time: r.planned_time ?? null,
          party_size: r.party_size ?? null,
          has_douhan: r.has_douhan ?? null,
          memo: r.memo ?? null,
          status: r.status,
        }
        const key = `${r.cast_id}:${r.planned_date}`
        const list = map.get(key) ?? []
        list.push(row)
        map.set(key, list)
      }
      setPlannedVisits(map)
    }
    void fetchPlanned()
    return () => { cancelled = true }
  }, [supabase, month, authorized])

  // ─── 一括保存 ────────────────────────────────────────────────
  const handleSave = async () => {
    if (gridDisabled || dirtyKeys.size === 0) return
    setSaving(true)
    let wroteAny = false
    try {
      type ShiftWrite = { cast_id: string; shift_date: string; status: CastShift['status'] }
      const statusUpserts: ShiftWrite[] = []
      const memoInserts: (ShiftWrite & { memo: string })[] = []
      const memoUpdates: { key: string; cast_id: string; shift_date: string; memo: string; expectedMemo: string | null; status?: CastShift['status'] }[] = []
      const savedData = new Map(shiftData)
      const deleteKeys: { cast_id: string; shift_date: string }[] = []
      for (const key of dirtyKeys) {
        const [castId, date] = key.split(':'), draft = shiftData.get(key)
        if (!draft) deleteKeys.push({ cast_id: castId, shift_date: date })
        else {
          const row = { cast_id: castId, shift_date: date, status: draft.status }
          const baseline = baselineRef.current.get(key)
          if (memoDirtyKeys.has(key) && baseline) memoUpdates.push({ key, cast_id: castId, shift_date: date, memo: draft.memo, expectedMemo: baseline.memo, ...(baseline.status !== draft.status ? { status: draft.status } : {}) })
          else if (memoDirtyKeys.has(key)) memoInserts.push({ ...row, memo: draft.memo })
          else statusUpserts.push(row)
        }
      }
      // 既存メモの書換えは同時編集を検出。メモだけの編集では出勤状態も送らない。
      for (const row of memoUpdates) {
        const values = { memo: row.memo, ...(row.status !== undefined ? { status: row.status } : {}) }
        let query = supabase.from('cast_shifts').update(values).eq('cast_id', row.cast_id).eq('shift_date', row.shift_date)
        query = row.expectedMemo === null ? query.is('memo', null) : query.eq('memo', row.expectedMemo)
        const { data, error } = await query.select('cast_id,shift_date,status,memo')
        if (error) throw new Error(error.message)
        if (!data || data.length !== 1) throw new Error('SHIFT_MEMO_CONFLICT')
        wroteAny = true
        const updated = data[0]
        savedData.set(row.key, { status: updated.status as CastShift['status'], memo: updated.memo ?? '' })
        const baseline = baselineRef.current.get(row.key)!
        baselineRef.current.set(row.key, { ...baseline, memo: updated.memo })
      }
      // 状態だけの保存では最新のDBメモを上書きしない。
      for (let offset = 0; offset < statusUpserts.length; offset += 200) {
        const batch = statusUpserts.slice(offset, offset + 200)
        const { data, error } = await supabase.from('cast_shifts').upsert(batch, { onConflict: 'cast_id,shift_date' }).select('cast_id,shift_date,status,memo')
        if (error) throw new Error(error.message)
        wroteAny = true
        if (!data || data.length !== batch.length) throw new Error('保存件数を確認できませんでした')
        for (const row of data) {
          const key = `${row.cast_id}:${row.shift_date}`
          const saved = { status: row.status as CastShift['status'], memo: row.memo ?? '' }
          savedData.set(key, saved)
          baselineRef.current.set(key, { status: saved.status, memo: row.memo })
        }
      }
      // 新しい時間メモの行はINSERT。読み込み後に別画面が作った行を上書きしない。
      for (let offset = 0; offset < memoInserts.length; offset += 200) {
        const batch = memoInserts.slice(offset, offset + 200)
        const { data, error } = await supabase.from('cast_shifts').insert(batch).select('cast_id,shift_date,status,memo')
        if (error) throw new Error(error.code === '23505' ? 'SHIFT_MEMO_CONFLICT' : error.message)
        wroteAny = true
        if (!data || data.length !== batch.length) throw new Error('保存件数を確認できませんでした')
        for (const row of data) {
          const key = `${row.cast_id}:${row.shift_date}`
          const saved = { status: row.status as CastShift['status'], memo: row.memo ?? '' }
          savedData.set(key, saved)
          // 後続の保存失敗から再試行するときは、INSERT済みの行を条件付きUPDATEにする。
          baselineRef.current.set(key, { status: saved.status, memo: row.memo })
        }
      }
      for (const row of deleteKeys) {
        const { error } = await supabase.from('cast_shifts').delete().eq('cast_id', row.cast_id).eq('shift_date', row.shift_date)
        if (error) throw new Error(error.message)
        wroteAny = true
      }
      baselineRef.current = new Map([...savedData].map(([key, row]) => [key, { ...row }]))
      draftRef.current = { ...draftRef.current, data: savedData, dirty: new Set(), memoDirty: new Set() }
      setShiftData(savedData)
      setDirtyKeys(new Set())
      setMemoDirtyKeys(new Set())
      setUndoStack([])
      setRedoStack([])
      toast('シフトを保存しました', 'success')
    } catch (error) {
      console.error('Shift save error:', error)
      // 一部が保存された後は、旧スナップショットへ戻して未保存0件に見せない。
      if (wroteAny) {
        setUndoStack([])
        setRedoStack([])
        preActionSnapshot.current = null
        isDragging.current = false
      }
      toast(error instanceof Error && error.message === 'SHIFT_MEMO_CONFLICT'
        ? 'ほかの画面でメモが変更・削除されました。入力は残っています。内容を確認して再読み込みしてください'
        : wroteAny ? '一部は保存済みです。変更は残っています。もう一度保存してください'
        : '保存に失敗しました。変更は残っています。もう一度保存してください', 'error')
    } finally { setSaving(false) }
  }

  // 保存前の月移動でメモや状態の下書きを失わない。
  const changeMonth = (delta: number) => {
    if (saving || loading || dirtyKeys.size > 0) return
    const [y, m] = month.split('-').map(Number), next = new Date(y, m - 1 + delta, 1)
    setLoading(true)
    setPlannedOverlay(null)
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return `${y}年${m}月`
  }, [month])

  // ─── キャストごとの出勤日数計算 ──────────────────────────────
  const getWorkDays = useCallback((castId: string) => {
    let count = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`
      const status = shiftData.get(`${castId}:${dateStr}`)?.status
      if (status === '出勤' || status === '希望出勤' || status === '来客出勤') count++
    }
    return count
  }, [month, daysInMonth, shiftData])

  // ─── 日別出勤者数 ────────────────────────────────────────────
  const getDayWorkCount = useCallback((day: number) => {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`
    let count = 0
    for (const c of casts) {
      const status = shiftData.get(`${c.id}:${dateStr}`)?.status
      if (status === '出勤' || status === '希望出勤' || status === '来客出勤') count++
    }
    return count
  }, [month, casts, shiftData])

  // ─── 権限チェックUI ──────────────────────────────────────────
  if (authorized === null) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size="md" label="認証情報を確認中..." />
      </div>
    )
  }

  if (!authorized) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 360, width: '100%' }}>
          <EmptyState
            variant="warning"
            title="権限がありません"
            message="この機能には「シフト.管理」の権限が必要です"
            action={
              <button onClick={goBack} style={{ background: C.pink, color: '#FFF', border: 'none', padding: '10px 24px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8 }}>
                戻る
              </button>
            }
          />
        </div>
      </div>
    )
  }

  // ─── セルの幅計算 ────────────────────────────────────────────
  const cellW = 36
  const nameColW = 70
  const workColW = 36
  const tableW = nameColW + (daysInMonth * cellW) + workColW

  // ─── ブラシパレット定義 ──────────────────────────────────────
  const brushOptions: { value: BrushStatus; label: string; bg: string; fg: string }[] = [
    ...SHIFT_STATUSES.map(s => {
      const st = statusStyle(s)
      return { value: s as BrushStatus, label: s, bg: st.bg, fg: st.fg }
    }),
    { value: 'clear', label: '消去', bg: '#FFF', fg: '#999' },
    { value: 'timeMemo', label: '時間メモ', bg: C.tagBg2, fg: C.tagTextStrong },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, userSelect: 'none',
      // v0.3.38: BottomNav は !isPC なのに paddingBottom が常時60だった既存バグを修正
      paddingBottom: !isPC ? 'calc(60px + env(safe-area-inset-bottom, 0px))' : 0,
    }}>
      {/* ─── ヘッダー ─── */}
      <PageHeader
        title="シフト管理"
        subtitle="シフト管理"
        backFallback="/admin/casts"
        actions={
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#FFF', border: `1px solid ${C.border}`,
              padding: isPC ? '8px 14px' : '6px 10px',
              fontSize: isPC ? 14 : 12, fontWeight: 500,
            }}>
              <button type="button" aria-label="前の月" disabled={saving || loading || dirtyKeys.size > 0} onClick={() => changeMonth(-1)} style={{ border: 0, background: 'transparent', color: C.dark2, fontSize: 16, cursor: 'pointer' }}>‹</button>
              <span>{monthLabel}</span>
              <button type="button" aria-label="次の月" disabled={saving || loading || dirtyKeys.size > 0} onClick={() => changeMonth(1)} style={{ border: 0, background: 'transparent', color: C.dark2, fontSize: 16, cursor: 'pointer' }}>›</button>
            </div>
            {isPC && (
              <div style={{ fontSize: 12, color: C.pinkMuted }}>
                キャスト {casts.length}名
              </div>
            )}
            <ViewModeToggle />
            <button
              onClick={() => router.push('/admin/planned-visits')}
              style={{
                background: '#FFF',
                color: C.dark,
                border: `1px solid ${C.border}`,
                padding: isPC ? '6px 14px' : '5px 10px',
                fontSize: isPC ? 11 : 10, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
              title="来店予定一覧"
            >
              {isPC ? '予定一覧' : '予定'}
            </button>
            <button
              onClick={() => setShowSuggestion(v => !v)}
              style={{
                background: showSuggestion ? C.tagBg2 : '#FFF',
                color: '#72243E',
                border: `1px solid ${showSuggestion ? C.pinkHover : C.border}`,
                padding: isPC ? '6px 14px' : '5px 10px',
                fontSize: isPC ? 11 : 10, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {isPC ? (showSuggestion ? '提案を隠す' : 'シフト最適化提案を表示') : (showSuggestion ? '提案閉' : '提案')}
            </button>
            {dirtyKeys.size > 0 && (
              <button
                onClick={handleSave}
                disabled={gridDisabled}
                style={{
                  background: saving ? C.pinkMuted : C.pink, color: '#FFF', border: 'none',
                  padding: '8px 24px', fontSize: 12, fontWeight: 500, cursor: saving ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {saving ? '保存中...' : `保存（${dirtyKeys.size}件変更）`}
              </button>
            )}
          </>
        }
      />

      {showSuggestion && (
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
          <ShiftSuggestionCard visits={historyVisits} startHour={19} endHour={26} />
        </div>
      )}

      {/* ─── ブラシパレット（ステータス選択） ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: isPC ? '8px 20px' : '6px 10px',
        borderBottom: `1px solid ${C.border}`, background: '#FEFBFC',
        position: 'sticky', top: 0, zIndex: 10,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, color: C.pinkMuted, marginRight: 4, whiteSpace: 'nowrap' }}>
          ブラシ:
        </span>
        {brushOptions.map(opt => {
          const isActive = activeBrush === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={gridDisabled}
              aria-pressed={isActive}
              onClick={() => setActiveBrush(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px', fontSize: 11, fontWeight: isActive ? 600 : 400,
                background: isActive ? opt.bg : '#FFF',
                color: isActive ? opt.fg : '#888',
                border: isActive ? `2px solid ${opt.fg}` : `1px solid ${C.border}`,
                cursor: 'pointer', fontFamily: 'inherit',
                borderRadius: 4,
                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {opt.value !== 'clear' && opt.value !== 'timeMemo' && (
                <span style={{
                  width: 12, height: 12, background: opt.bg,
                  border: `1px solid ${opt.fg}`, borderRadius: 2,
                  display: isActive ? 'none' : 'inline-block',
                }} />
              )}
              {opt.label}
            </button>
          )
        })}
        {/* Undo / Redo ボタン */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
          <button
            onClick={handleUndo}
            disabled={gridDisabled || undoStack.length === 0}
            title="元に戻す (Ctrl+Z)"
            style={{
              width: 32, height: 32, fontSize: 16,
              background: undoStack.length > 0 ? '#FFF' : '#F5F5F5',
              color: undoStack.length > 0 ? C.dark : '#CCC',
              border: `1px solid ${undoStack.length > 0 ? C.border : '#EEE'}`,
              borderRadius: 4, cursor: undoStack.length > 0 ? 'pointer' : 'default',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ↩
          </button>
          <button
            onClick={handleRedo}
            disabled={gridDisabled || redoStack.length === 0}
            title="やり直す (Ctrl+Shift+Z)"
            style={{
              width: 32, height: 32, fontSize: 16,
              background: redoStack.length > 0 ? '#FFF' : '#F5F5F5',
              color: redoStack.length > 0 ? C.dark : '#CCC',
              border: `1px solid ${redoStack.length > 0 ? C.border : '#EEE'}`,
              borderRadius: 4, cursor: redoStack.length > 0 ? 'pointer' : 'default',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ↪
          </button>
          <span style={{ fontSize: 9, color: '#BBB', marginLeft: 4 }}>
            {undoStack.length > 0 ? `${undoStack.length}件` : ''}
          </span>
        </div>
      </div>

      {activeBrush === 'timeMemo' && <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: isPC ? '8px 20px' : '8px 10px', background: C.white, borderBottom: `1px solid ${C.border}` }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.dark2, fontSize: 11 }}>
          希望時間
          <select aria-label="希望出勤の時間メモ" value={selectedTime} disabled={gridDisabled} onChange={event => setSelectedTime(event.target.value as ShiftTime | 'clear')} style={{ minHeight: 36, padding: '4px 10px', font: 'inherit', fontSize: 16, color: C.dark, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8 }}>
            {SHIFT_TIME_OPTIONS.map(time => <option key={time} value={time}>{time}</option>)}
            <option value="clear">時間を消す</option>
          </select>
        </label>
        <span style={{ color: C.dark2, fontSize: 11, lineHeight: 1.5 }}>希望出勤の日をタップ{isPC ? '・ドラッグ' : ''} → 上の「保存」。時間はメモとして表示します。</span>
      </div>}
      {dirtyKeys.size > 0 && <p style={{ margin: 0, padding: isPC ? '6px 20px' : '6px 10px', fontSize: 11, color: C.dark2 }}>変更が{dirtyKeys.size}件あります。保存すると月を切り替えられます。</p>}

      {/* ─── カレンダーグリッド ─── */}
      <div style={{
        overflow: 'auto',
        padding: isPC ? '8px 20px 20px' : '8px 8px 20px',
        maxHeight: 'calc(100vh - 110px)',
        WebkitOverflowScrolling: 'touch',
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <Spinner size="md" />
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', minWidth: tableW, fontSize: 10 }}>
            <thead>
              {/* 日付行 */}
              <tr>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 3, background: C.headerBg,
                  width: nameColW, minWidth: nameColW, padding: '4px 6px',
                  borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`,
                  fontSize: 9, color: C.pinkMuted, fontWeight: 400, textAlign: 'left',
                }}>
                  キャスト
                </th>
                {dayHeaders.map(h => {
                  const isSun = h.dow === '日'
                  const isSat = h.dow === '土'
                  const workCount = getDayWorkCount(h.day)
                  return (
                    <th key={h.day} style={{
                      width: cellW, minWidth: cellW, padding: '2px 0',
                      borderBottom: `1px solid ${C.border}`,
                      textAlign: 'center', fontWeight: 400,
                      color: isSun ? '#E24B4A' : isSat ? '#185FA5' : C.pinkMuted,
                      background: C.headerBg,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 500 }}>{h.day}</div>
                      <div style={{ fontSize: 8 }}>{h.dow}</div>
                      <div style={{ fontSize: 8, color: workCount > 0 ? '#1D9E75' : '#CCC', marginTop: 1 }}>
                        {workCount}名
                      </div>
                    </th>
                  )
                })}
                <th style={{
                  width: workColW, minWidth: workColW, padding: '4px 4px',
                  borderBottom: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}`,
                  fontSize: 8, color: C.pinkMuted, fontWeight: 400, textAlign: 'center',
                  background: C.headerBg,
                }}>
                  出勤<br/>日数
                </th>
              </tr>
            </thead>
            <tbody>
              {[...CAST_TIER_GROUPS, null].map(tier => {
                const tierCasts = sortedCasts.filter(c => tier === null ? !c.cast_tier : c.cast_tier === tier)
                if (tierCasts.length === 0) return null
                return (
                  <Fragment key={tier ?? 'none'}>
                    {/* 層ヘッダー */}
                    <tr>
                      <td
                        colSpan={daysInMonth + 2}
                        style={{
                          position: 'sticky', left: 0, zIndex: 2,
                          background: C.rankBadge, padding: '4px 8px',
                          fontSize: 9, fontWeight: 500, color: C.pinkMuted,
                          letterSpacing: '0.15em',
                          borderBottom: `1px solid ${C.border}`,
                          borderTop: `1px solid ${C.border}`,
                        }}
                      >
                        {tier ?? '未分類'}（{tierCasts.length}名）
                      </td>
                    </tr>
                    {tierCasts.map(cast => {
                      const workDays = getWorkDays(cast.id)
                      return (
                        <tr key={cast.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                          {/* キャスト名 */}
                          <td style={{
                            position: 'sticky', left: 0, zIndex: 2,
                            background: '#FDF8F9', padding: '4px 6px',
                            borderRight: `1px solid ${C.border}`,
                            fontSize: 11, fontWeight: 500, color: C.dark,
                            whiteSpace: 'nowrap',
                          }}>
                            {cast.cast_name}
                          </td>

                          {/* 日付セル */}
                          {dayHeaders.map(h => {
                            const dateStr = `${month}-${String(h.day).padStart(2, '0')}`
                            const key = `${cast.id}:${dateStr}`
                            const draft = shiftData.get(key), status = draft?.status
                            const timeMemo = getShiftTimeMemo(draft?.memo)
                            const st = statusStyle(status)
                            const isDirty = dirtyKeys.has(key)
                            const isWish = status === '希望出勤' || status === '希望休み'
                            const planned = plannedVisits.get(key) ?? []
                            const plannedTitle = planned.length > 0
                              ? planned.map(p => `${p.planned_time ?? '時刻未'} ${p.customer_name}様${p.has_douhan ? '（同伴）' : ''}`).join('\n')
                              : undefined

                            return (
                              <td
                                key={h.day}
                                role="button"
                                tabIndex={gridDisabled ? -1 : 0}
                                aria-disabled={gridDisabled}
                                aria-label={`${cast.cast_name} ${dateStr} ${status ?? '未設定'}${timeMemo ? ` 時間メモ ${timeMemo}` : ''}`}
                                data-shift-cell={key}
                                data-shift-time={timeMemo ?? undefined}
                                onMouseDown={(e) => { if (e.button !== 0) return; e.preventDefault(); handleMouseDown(cast.id, h.day) }}
                                onClick={(e) => { if (e.detail === 0) handleSingleCell(cast.id, h.day) }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSingleCell(cast.id, h.day) } }}
                                onMouseEnter={() => handleMouseEnter(cast.id, h.day)}
                                title={[draft?.memo, plannedTitle].filter(Boolean).join('\n') || undefined}
                                style={{
                                  width: cellW, height: 36, textAlign: 'center',
                                  cursor: gridDisabled ? 'default' : activeBrush === 'timeMemo' ? status === '希望出勤' ? 'pointer' : 'not-allowed' : 'crosshair',
                                  background: st.bg,
                                  color: st.fg,
                                  fontSize: 9, fontWeight: 500,
                                  border: isDirty ? '2px solid #E8789A' : isWish ? `1px dashed ${st.fg}` : `0.5px solid ${C.border}`,
                                  padding: 0,
                                  transition: 'background 0.05s',
                                  position: 'relative',
                                }}
                              >
                                {st.label}
                                {timeMemo && <span style={{ display: 'block', fontSize: 10, lineHeight: '12px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: status === '出勤' ? C.white : C.dark }}>{timeMemo}</span>}
                                {planned.length > 0 && (
                                  <span
                                    onMouseDown={(e) => { e.stopPropagation() }}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setPlannedOverlay({ castId: cast.id, day: h.day, castName: cast.cast_name })
                                    }}
                                    title={plannedTitle}
                                    style={{
                                      position: 'absolute',
                                      top: 1, right: 1,
                                      minWidth: 12, height: 12,
                                      borderRadius: '50%',
                                      background: C.pink,
                                      color: '#FFF',
                                      fontSize: 8,
                                      fontWeight: 700,
                                      lineHeight: '12px',
                                      padding: planned.length >= 10 ? '0 3px' : '0',
                                      cursor: 'pointer',
                                      boxShadow: '0 0 0 1px #FFF',
                                    }}
                                  >
                                    {planned.length}
                                  </span>
                                )}
                              </td>
                            )
                          })}

                          {/* 出勤日数 */}
                          <td style={{
                            textAlign: 'center', fontSize: 12, fontWeight: 500,
                            color: workDays > 0 ? C.pink : '#CCC',
                            borderLeft: `1px solid ${C.border}`,
                            padding: '4px',
                          }}>
                            {workDays}
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* 来店予定オーバーレイ */}
      {plannedOverlay && (() => {
        const dateStr = `${month}-${String(plannedOverlay.day).padStart(2, '0')}`
        const key = `${plannedOverlay.castId}:${dateStr}`
        const list = plannedVisits.get(key) ?? []
        const [py, pm, pd] = dateStr.split('-').map(Number)
        const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(py, pm - 1, pd).getDay()]
        return (
          <div
            onClick={() => setPlannedOverlay(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              background: 'rgba(61,45,56,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#FFF', borderRadius: 12,
                width: '100%', maxWidth: 420,
                maxHeight: 'calc(100vh - 80px)',
                overflow: 'auto',
              }}
            >
              <div style={{
                padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'linear-gradient(135deg, #FFF0F5, #FFE4ED)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.2em', color: C.pinkMuted }}>
                    来店予定 — {pm}/{pd}({dow})
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.dark, marginTop: 2 }}>
                    {plannedOverlay.castName}
                  </div>
                </div>
                <button
                  onClick={() => setPlannedOverlay(null)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: 'none', background: 'rgba(255,255,255,0.5)',
                    fontSize: 14, cursor: 'pointer', color: C.dark,
                  }}
                >✕</button>
              </div>

              <div style={{ padding: 14 }}>
                {list.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.pinkMuted, textAlign: 'center', padding: 20 }}>
                    予定はありません
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {list.map(p => (
                      <div
                        key={p.id}
                        onClick={() => router.push(`/customer/${p.customer_id}`)}
                        style={{
                          padding: '10px 12px', borderRadius: 8,
                          background: C.miniBg, border: `1px solid ${C.border}`,
                          cursor: 'pointer',
                          transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = C.pinkHover)}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                      >
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: C.pink, minWidth: 50 }}>
                            {p.planned_time ?? '時刻未'}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: C.dark }}>
                            {p.customer_name} 様
                          </span>
                          {p.has_douhan && (
                            <span style={{
                              fontSize: 9, padding: '1px 6px', borderRadius: 6,
                              background: C.tagBg2, color: '#72243E', fontWeight: 500,
                            }}>同伴</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: C.pinkMuted, display: 'flex', gap: 10 }}>
                          {p.party_size != null && <span>{p.party_size}名</span>}
                          {p.memo && <span style={{ flex: 1 }}>{p.memo}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 12, fontSize: 10, color: C.pinkMuted, textAlign: 'center' }}>
                  ※ 行をタップで顧客詳細へ
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* v0.3.49-E: 通知トースト */}
      {ToastView}

      {/* モバイル: ボトムナビ */}
      {!isPC && <BottomNav />}
    </div>
  )
}
