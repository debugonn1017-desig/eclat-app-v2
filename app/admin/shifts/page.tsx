'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCasts } from '@/hooks/useCasts'
import { C } from '@/lib/colors'
import { CastShift } from '@/types'
import BottomNav from '@/components/BottomNav'

// ─── シフトステータス定義 ──────────────────────────────────────
const SHIFT_STATUSES: CastShift['status'][] = ['出勤', '休み', '希望出勤', '希望休み', '未定']

const statusStyle = (status?: CastShift['status']): { bg: string; fg: string; label: string } => {
  switch (status) {
    case '出勤':     return { bg: C.pink, fg: '#FFF', label: '出' }
    case '休み':     return { bg: '#E0E0E0', fg: '#999', label: '休' }
    case '希望出勤': return { bg: '#FFE0E8', fg: '#E8789A', label: '希出' }
    case '希望休み': return { bg: '#E8F4FD', fg: '#185FA5', label: '希休' }
    case '未定':     return { bg: '#F5F5F5', fg: '#BBB', label: '未' }
    default:         return { bg: 'transparent', fg: '#DDD', label: '−' }
  }
}

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

  // 変更されたセルの追跡: Set<`${castId}:${date}`>
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())

  // ─── 権限チェック ────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { setAuthorized(false); return }
        const data = await res.json()
        if (data.role === 'cast') { setAuthorized(false); return }
        setAuthorized(data.is_owner === true || data.permissions?.['キャスト管理'] === true)
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

  // ─── セルクリック：ステータス切替 ────────────────────────────
  const handleCellClick = useCallback((castId: string, day: number) => {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`
    const key = `${castId}:${dateStr}`
    const current = shiftData.get(key)
    const currentIdx = current ? SHIFT_STATUSES.indexOf(current) : -1
    const nextStatus = SHIFT_STATUSES[(currentIdx + 1) % SHIFT_STATUSES.length]

    setShiftData(prev => {
      const next = new Map(prev)
      next.set(key, nextStatus)
      return next
    })
    setDirtyKeys(prev => new Set(prev).add(key))
  }, [month, shiftData])

  // ─── 一括保存 ────────────────────────────────────────────────
  const handleSave = async () => {
    if (dirtyKeys.size === 0) return
    setSaving(true)

    try {
      const upserts: { cast_id: string; shift_date: string; status: string; memo: string }[] = []
      for (const key of dirtyKeys) {
        const [castId, date] = key.split(':')
        const status = shiftData.get(key)
        if (status) {
          upserts.push({ cast_id: castId, shift_date: date, status, memo: '' })
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
        }
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
      if (status === '出勤' || status === '希望出勤') count++
    }
    return count
  }, [month, daysInMonth, shiftData])

  // ─── 日別出勤者数 ────────────────────────────────────────────
  const getDayWorkCount = useCallback((day: number) => {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`
    let count = 0
    for (const c of casts) {
      const status = shiftData.get(`${c.id}:${dateStr}`)
      if (status === '出勤' || status === '希望出勤') count++
    }
    return count
  }, [month, casts, shiftData])

  // ─── 一括設定 ────────────────────────────────────────────────
  const bulkSetCast = useCallback((castId: string, status: CastShift['status']) => {
    setShiftData(prev => {
      const next = new Map(prev)
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${month}-${String(d).padStart(2, '0')}`
        const key = `${castId}:${dateStr}`
        // 既に希望が入ってるセルはスキップ
        const current = next.get(key)
        if (current === '希望出勤' || current === '希望休み') continue
        next.set(key, status)
        setDirtyKeys(prev2 => new Set(prev2).add(key))
      }
      return next
    })
  }, [month, daysInMonth])

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

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
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
          <span onClick={() => changeMonth(-1)} style={{ cursor: 'pointer', color: C.pinkMuted, fontSize: 16, userSelect: 'none' }}>‹</span>
          <span>{monthLabel}</span>
          <span onClick={() => changeMonth(1)} style={{ cursor: 'pointer', color: C.pinkMuted, fontSize: 16, userSelect: 'none' }}>›</span>
        </div>

        <div style={{ fontSize: 12, color: C.pinkMuted }}>
          キャスト {casts.length}名
        </div>

        {/* 凡例 */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {SHIFT_STATUSES.map(s => {
            const st = statusStyle(s)
            return (
              <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
                <span style={{
                  width: 14, height: 14, background: st.bg, color: st.fg,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, fontWeight: 500,
                }}>{st.label}</span>
                <span style={{ color: C.pinkMuted }}>{s}</span>
              </span>
            )
          })}
        </div>

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

      {/* ─── カレンダーグリッド ─── */}
      <div style={{ overflow: 'auto', padding: '16px 20px', maxHeight: 'calc(100vh - 60px)' }}>
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
              {casts.map(cast => {
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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{cast.cast_name}</span>
                      </div>
                    </td>

                    {/* 日付セル */}
                    {dayHeaders.map(h => {
                      const dateStr = `${month}-${String(h.day).padStart(2, '0')}`
                      const key = `${cast.id}:${dateStr}`
                      const status = shiftData.get(key)
                      const st = statusStyle(status)
                      const isDirty = dirtyKeys.has(key)
                      // 希望系はキャストが入力したもの → 枠線で強調
                      const isWish = status === '希望出勤' || status === '希望休み'

                      return (
                        <td
                          key={h.day}
                          onClick={() => handleCellClick(cast.id, h.day)}
                          style={{
                            width: cellW, height: 28, textAlign: 'center',
                            cursor: 'pointer', userSelect: 'none',
                            background: st.bg,
                            color: st.fg,
                            fontSize: 9, fontWeight: 500,
                            border: isDirty ? '2px solid #E8789A' : isWish ? `1px dashed ${st.fg}` : `0.5px solid ${C.border}`,
                            padding: 0,
                            transition: 'background 0.1s',
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
            </tbody>
          </table>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
