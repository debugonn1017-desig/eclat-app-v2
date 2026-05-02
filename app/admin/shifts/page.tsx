'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCasts } from '@/hooks/useCasts'
import { C } from '@/lib/colors'
import { CastShift, CAST_TIERS } from '@/types'
import BottomNav from '@/components/BottomNav'
import ShiftSuggestionCard, { ShiftHistoryVisit } from '@/components/ShiftSuggestionCard'

// ─── シフトステータス定義 ──────────────────────────────────────
const SHIFT_STATUSES: CastShift['status'][] = ['出勤', '休み', '希望出勤', '希望休み', '来客出勤', '未定']

const statusStyle = (status?: CastShift['status']): { bg: string; fg: string; label: string } => {
  switch (status) {
    case '出勤':     return { bg: C.pink, fg: '#FFF', label: '出' }
    case '休み':     return { bg: '#E0E0E0', fg: '#999', label: '休' }
    case '希望出勤': return { bg: '#FFE0E8', fg: '#E8789A', label: '希出' }
    case '希望休み': return { bg: '#E8F4FD', fg: '#185FA5', label: '希休' }
    case '来客出勤': return { bg: '#E1F5EE', fg: '#0F6E56', label: '来客' }
    case '未定':     return { bg: '#F5F5F5', fg: '#BBB', label: '未' }
    default:         return { bg: 'transparent', fg: '#DDD', label: '−' }
  }
}

// 「消去」用の特殊値
type BrushStatus = CastShift['status'] | 'clear'

export default function ShiftCalendarPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { casts, isLoaded: castsLoaded, upsertShift } = useCasts()

  // 権限
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  // 月選択
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // シフトデータ: Map<`${castId}:${date}`, status>
  const [shiftData, setShiftData] = useState<Map<string, CastShift['status']>>(new Map())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // シフト最適化提案用の過去 visits
  const [historyVisits, setHistoryVisits] = useState<ShiftHistoryVisit[]>([])
  const [showSuggestion, setShowSuggestion] = useState(false)

  // 変更されたセルの追跡: Set<`${castId}:${date}`>
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())

  // ─── ペイントモード ─────────────────────────────────────────
  const [activeBrush, setActiveBrush] = useState<BrushStatus>('出勤')
  const isDragging = useRef(false)
  const dragChanged = useRef(false)

  // ─── Undo / Redo 履歴 ───────────────────────────────────────
  type Snapshot = { data: Map<string, CastShift['status']>; dirty: Set<string> }
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

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const snapshot = next.pop()!
      // 現在の状態をredoに入れる
      setRedoStack(r => [...r, { data: new Map(shiftData), dirty: new Set(dirtyKeys) }])
      setShiftData(snapshot.data)
      setDirtyKeys(snapshot.dirty)
      return next
    })
  }, [shiftData, dirtyKeys])

  const handleRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const snapshot = next.pop()!
      // 現在の状態をundoに入れる
      setUndoStack(u => [...u, { data: new Map(shiftData), dirty: new Set(dirtyKeys) }])
      setShiftData(snapshot.data)
      setDirtyKeys(snapshot.dirty)
      return next
    })
  }, [shiftData, dirtyKeys])

  // Ctrl+Z / Ctrl+Shift+Z キーボードショートカット
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  // ペイント実行（1セル）
  const paintCell = useCallback((castId: string, day: number) => {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`
    const key = `${castId}:${dateStr}`

    setShiftData(prev => {
      const next = new Map(prev)
      if (activeBrush === 'clear') {
        next.delete(key)
      } else {
        next.set(key, activeBrush)
      }
      return next
    })
    setDirtyKeys(prev => new Set(prev).add(key))
    dragChanged.current = true
  }, [month, activeBrush])

  // マウスイベント
  const handleMouseDown = useCallback((castId: string, day: number) => {
    // ドラッグ開始前のスナップショットを保存
    preActionSnapshot.current = { data: new Map(shiftData), dirty: new Set(dirtyKeys) }
    dragChanged.current = false
    isDragging.current = true
    paintCell(castId, day)
  }, [paintCell, shiftData, dirtyKeys])

  const handleMouseEnter = useCallback((castId: string, day: number) => {
    if (!isDragging.current) return
    paintCell(castId, day)
  }, [paintCell])

  // グローバルmouseupでドラッグ終了 → 履歴にpush
  useEffect(() => {
    const onUp = () => {
      if (isDragging.current && dragChanged.current && preActionSnapshot.current) {
        pushUndo(preActionSnapshot.current)
        preActionSnapshot.current = null
      }
      isDragging.current = false
      dragChanged.current = false
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [pushUndo])

  // ─── 権限チェック ────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { setAuthorized(false); return }
        const data = await res.json()
        if (data.role === 'cast') { setAuthorized(false); return }
        setAuthorized(data.is_owner === true || data.permissions?.['シフト管理'] === true)
      } catch { setAuthorized(false) }
    }
    check()
  }, [])

  // ─── カレンダー日数生成 ──────────────────────────────────────
  const { daysInMonth, dayHeaders, firstDayOfWeek } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const dim = new Date(y, m, 0).getDate()
    const fdow = new Date(y, m - 1, 1).getDay()
    const dayNames = ['日', '月', '火', '水', '木', '金', '土']
    const headers: { day: number; dow: string }[] = []
    for (let d = 1; d <= dim; d++) {
      const dow = dayNames[new Date(y, m - 1, d).getDay()]
      headers.push({ day: d, dow })
    }
    return { daysInMonth: dim, dayHeaders: headers, firstDayOfWeek: fdow }
  }, [month])

  // ─── シフトデータ取得 ────────────────────────────────────────
  useEffect(() => {
    if (!castsLoaded || casts.length === 0) return
    const fetchShifts = async () => {
      setLoading(true)
      const startDate = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const endDate = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`

      const { data } = await supabase
        .from('cast_shifts')
        .select('cast_id, shift_date, status')
        .gte('shift_date', startDate)
        .lte('shift_date', endDate)

      const map = new Map<string, CastShift['status']>()
      if (data) {
        for (const s of data) {
          map.set(`${s.cast_id}:${s.shift_date}`, s.status as CastShift['status'])
        }
      }
      setShiftData(map)
      setDirtyKeys(new Set())
      setLoading(false)
    }
    fetchShifts()
  }, [month, castsLoaded, casts, supabase])

  // 過去6ヶ月の visits を読み込んでシフト最適化提案に渡す
  useEffect(() => {
    const fetchHistory = async () => {
      const today = new Date()
      const six = new Date(today)
      six.setMonth(six.getMonth() - 6)
      const startISO = `${six.getFullYear()}-${String(six.getMonth() + 1).padStart(2, '0')}-01`
      const endISO = today.toISOString().slice(0, 10)
      const { data } = await supabase
        .from('customer_visits')
        .select('visit_date, visit_time, customer_id, amount_spent')
        .gte('visit_date', startISO)
        .lte('visit_date', endISO)
      setHistoryVisits(
        (data ?? []).map((v: any) => ({
          visit_date: v.visit_date,
          visit_time: v.visit_time ?? null,
          customer_id: v.customer_id,
          amount_spent: Number(v.amount_spent) || 0,
        }))
      )
    }
    fetchHistory()
  }, [supabase])

  // ─── 一括保存 ────────────────────────────────────────────────
  const handleSave = async () => {
    if (dirtyKeys.size === 0) return
    setSaving(true)

    try {
      const upserts: { cast_id: string; shift_date: string; status: string; memo: string }[] = []
      const deleteKeys: { cast_id: string; shift_date: string }[] = []

      for (const key of dirtyKeys) {
        const [castId, date] = key.split(':')
        const status = shiftData.get(key)
        if (status) {
          upserts.push({ cast_id: castId, shift_date: date, status, memo: '' })
        } else {
          // 消去されたセル
          deleteKeys.push({ cast_id: castId, shift_date: date })
        }
      }

      // バッチupsert
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('cast_shifts')
          .upsert(upserts, { onConflict: 'cast_id,shift_date' })

        if (error) {
          console.error('Shift save error:', error)
          alert('保存に失敗しました: ' + error.message)
          setSaving(false)
          return
        }
      }

      // 消去されたセルを削除
      for (const dk of deleteKeys) {
        await supabase
          .from('cast_shifts')
          .delete()
          .eq('cast_id', dk.cast_id)
          .eq('shift_date', dk.shift_date)
      }

      setDirtyKeys(new Set())
    } catch (err) {
      console.error('Shift save error:', err)
      alert('保存に失敗しました')
    }
    setSaving(false)
  }

  // ─── 月変更 ──────────────────────────────────────────────────
  const changeMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
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
      const status = shiftData.get(`${castId}:${dateStr}`)
      if (status === '出勤' || status === '希望出勤' || status === '来客出勤') count++
    }
    return count
  }, [month, daysInMonth, shiftData])

  // ─── 日別出勤者数 ────────────────────────────────────────────
  const getDayWorkCount = useCallback((day: number) => {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`
    let count = 0
    for (const c of casts) {
      const status = shiftData.get(`${c.id}:${dateStr}`)
      if (status === '出勤' || status === '希望出勤' || status === '来客出勤') count++
    }
    return count
  }, [month, casts, shiftData])

  // ─── 権限チェックUI ──────────────────────────────────────────
  if (authorized === null) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: `2px solid ${C.pink}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 14, color: C.dark }}>この機能へのアクセス権限がありません</p>
        <button onClick={() => router.push('/admin/casts')} style={{ background: C.pink, color: '#FFF', border: 'none', padding: '10px 24px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          管理ページに戻る
        </button>
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
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, userSelect: 'none' }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
        borderBottom: `1px solid ${C.border}`, background: C.headerBg, flexWrap: 'wrap',
      }}>
        <button onClick={() => router.push('/admin/casts')} style={{
          background: 'transparent', border: 'none', color: C.pink,
          fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
        }}>
          ← 管理ページ
        </button>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#FFF', border: `1px solid ${C.border}`, padding: '8px 14px', fontSize: 14, fontWeight: 500,
        }}>
          <span onClick={() => changeMonth(-1)} style={{ cursor: 'pointer', color: C.pinkMuted, fontSize: 16 }}>‹</span>
          <span>{monthLabel}</span>
          <span onClick={() => changeMonth(1)} style={{ cursor: 'pointer', color: C.pinkMuted, fontSize: 16 }}>›</span>
        </div>

        <div style={{ fontSize: 12, color: C.pinkMuted }}>
          キャスト {casts.length}名
        </div>

        <button
          onClick={() => setShowSuggestion(v => !v)}
          style={{
            background: showSuggestion ? '#FBEAF0' : '#FFF',
            color: '#72243E',
            border: `1px solid ${showSuggestion ? '#ED93B1' : C.border}`,
            padding: '6px 14px', fontSize: 11, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto',
          }}
        >
          {showSuggestion ? '提案を隠す' : 'シフト最適化提案を表示'}
        </button>

        {dirtyKeys.size > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: saving ? C.pinkMuted : C.pink, color: '#FFF', border: 'none',
              padding: '8px 24px', fontSize: 12, fontWeight: 500, cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {saving ? '保存中...' : `保存（${dirtyKeys.size}件変更）`}
          </button>
        )}
      </div>

      {showSuggestion && (
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
          <ShiftSuggestionCard visits={historyVisits} startHour={19} endHour={26} />
        </div>
      )}

      {/* ─── ブラシパレット（ステータス選択） ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px',
        borderBottom: `1px solid ${C.border}`, background: '#FEFBFC',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <span style={{ fontSize: 10, color: C.pinkMuted, marginRight: 4, whiteSpace: 'nowrap' }}>
          ブラシ:
        </span>
        {brushOptions.map(opt => {
          const isActive = activeBrush === opt.value
          return (
            <button
              key={opt.value}
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
              {opt.value !== 'clear' && (
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
            disabled={undoStack.length === 0}
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
            disabled={redoStack.length === 0}
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

      {/* ─── カレンダーグリッド ─── */}
      <div style={{ overflow: 'auto', padding: '8px 20px 20px', maxHeight: 'calc(100vh - 110px)' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <div style={{ width: 32, height: 32, border: `2px solid ${C.pink}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
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
              {[...CAST_TIERS, null].map(tier => {
                const tierCasts = casts.filter(c => tier === null ? !c.cast_tier : c.cast_tier === tier)
                if (tierCasts.length === 0) return null
                return (
                  <Fragment key={tier ?? 'none'}>
                    {/* 層ヘッダー */}
                    <tr>
                      <td
                        colSpan={daysInMonth + 2}
                        style={{
                          position: 'sticky', left: 0, zIndex: 2,
                          background: '#F5F0F2', padding: '4px 8px',
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
                            const status = shiftData.get(key)
                            const st = statusStyle(status)
                            const isDirty = dirtyKeys.has(key)
                            const isWish = status === '希望出勤' || status === '希望休み'

                            return (
                              <td
                                key={h.day}
                                onMouseDown={(e) => { e.preventDefault(); handleMouseDown(cast.id, h.day) }}
                                onMouseEnter={() => handleMouseEnter(cast.id, h.day)}
                                style={{
                                  width: cellW, height: 28, textAlign: 'center',
                                  cursor: 'crosshair',
                                  background: st.bg,
                                  color: st.fg,
                                  fontSize: 9, fontWeight: 500,
                                  border: isDirty ? '2px solid #E8789A' : isWish ? `1px dashed ${st.fg}` : `0.5px solid ${C.border}`,
                                  padding: 0,
                                  transition: 'background 0.05s',
                                }}
                              >
                                {st.label}
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
    </div>
  )
}
