'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCasts } from '@/hooks/useCasts'
import { C } from '@/lib/colors'
import { CastProfile, CastShift, Customer, CustomerVisit } from '@/types'
import BottomNav from '@/components/BottomNav'
import CustomerForm from '@/components/CustomerForm'
import { useCustomers } from '@/hooks/useCustomers'
import { useViewMode } from '@/hooks/useViewMode'

// ─── 入力行の型 ─────────────────────────────────────────────
type EntryRow = {
  id?: string // 既存レコードのID（編集時）
  customerId: string
  customerName: string
  amount: string
  partySize: string
  hasDouhan: boolean
  hasAfter: boolean
  isFirstVisit: boolean
  memo: string
}

const emptyRow = (): EntryRow => ({
  customerId: '',
  customerName: '',
  amount: '',
  partySize: '1',
  hasDouhan: false,
  hasAfter: false,
  isFirstVisit: false,
  memo: '',
})

export default function DailySalesPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { casts, isLoaded: castsLoaded } = useCasts()
  const { customers: allCustomers, addCustomer } = useCustomers()
  const { isPC } = useViewMode()

  // 権限
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  // 日付
  const [date, setDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  // シフトデータ（全キャスト分）
  const [shifts, setShifts] = useState<Map<string, CastShift['status']>>(new Map())

  // 出勤確認チェック: Set<castId>
  const [attendanceChecked, setAttendanceChecked] = useState<Set<string>>(new Set())

  // 選択中キャスト
  const [selectedCastId, setSelectedCastId] = useState<string | null>(null)

  // 入力行
  const [rows, setRows] = useState<EntryRow[]>([emptyRow()])
  const [saving, setSaving] = useState(false)
  const [savedCasts, setSavedCasts] = useState<Set<string>>(new Set())

  // 顧客検索
  const [searchIdx, setSearchIdx] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // 新規顧客オーバーレイ
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCustomerForRow, setNewCustomerForRow] = useState<number | null>(null)

  // キャスト詳細オーバーレイ
  const [overlayCastId, setOverlayCastId] = useState<string | null>(null)

  // 各キャストの入力済みデータ（キャッシュ）
  const [castEntries, setCastEntries] = useState<Map<string, EntryRow[]>>(new Map())
  // 各キャストの日計
  const castDailySales = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    for (const [castId, entries] of castEntries) {
      const total = entries.reduce((s, r) => s + (parseInt(r.amount.replace(/,/g, '')) || 0), 0)
      const count = entries.filter(r => r.customerId).length
      map.set(castId, { total, count })
    }
    return map
  }, [castEntries])

  // ─── 権限チェック ─────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { setAuthorized(false); return }
        const data = await res.json()
        if (data.role === 'cast') { setAuthorized(false); return }
        setAuthorized(data.is_owner === true || data.permissions?.['売上入力'] === true)
      } catch { setAuthorized(false) }
    }
    check()
  }, [])

  // ─── シフトデータ取得（日付変更時） ───────────────────────
  useEffect(() => {
    if (!castsLoaded || casts.length === 0) return
    const fetchShifts = async () => {
      const { data } = await supabase
        .from('cast_shifts')
        .select('cast_id, status')
        .eq('shift_date', date)
      const map = new Map<string, CastShift['status']>()
      if (data) {
        for (const s of data) map.set(s.cast_id, s.status as CastShift['status'])
      }
      setShifts(map)
      // 出勤確認チェックの初期値: 既に「出勤」ステータスのキャストはチェック済み
      const checked = new Set<string>()
      if (data) {
        for (const s of data) {
          if (s.status === '出勤') checked.add(s.cast_id)
        }
      }
      setAttendanceChecked(checked)
    }
    fetchShifts()
  }, [date, castsLoaded, casts, supabase])

  // ─── 既存の来店データ読み込み（日付変更時） ────────────────
  useEffect(() => {
    if (!castsLoaded || casts.length === 0) return
    const fetchExisting = async () => {
      // その日の全来店データ取得
      const { data: visits } = await supabase
        .from('customer_visits')
        .select('*, customers!inner(id, customer_name, cast_name)')
        .eq('visit_date', date)

      const entriesMap = new Map<string, EntryRow[]>()
      const savedSet = new Set<string>()

      if (visits) {
        // キャスト名→IDのマップ
        const castNameToId = new Map(casts.map(c => [c.cast_name, c.id]))

        for (const v of visits) {
          const castName = (v.customers as any)?.cast_name
          const castId = castName ? castNameToId.get(castName) : null
          if (!castId) continue

          const row: EntryRow = {
            id: v.id,
            customerId: v.customer_id,
            customerName: (v.customers as any)?.customer_name || '',
            amount: v.amount_spent.toLocaleString(),
            partySize: String(v.party_size),
            hasDouhan: v.has_douhan,
            hasAfter: v.has_after,
            isFirstVisit: v.is_first_visit ?? false,
            memo: v.memo || '',
          }

          const existing = entriesMap.get(castId) || []
          existing.push(row)
          entriesMap.set(castId, existing)
          savedSet.add(castId)
        }
      }

      setCastEntries(entriesMap)
      setSavedCasts(savedSet)

      // 最初のキャスト選択
      if (!selectedCastId && casts.length > 0) {
        setSelectedCastId(casts[0].id)
      }
    }
    fetchExisting()
  }, [date, castsLoaded, casts, supabase])

  // ─── キャスト切替時にrowsを復元 ──────────────────────────
  useEffect(() => {
    if (!selectedCastId) return
    const existing = castEntries.get(selectedCastId)
    if (existing && existing.length > 0) {
      setRows([...existing])
    } else {
      setRows([emptyRow()])
    }
  }, [selectedCastId, castEntries])

  // ─── キャストを出勤順にソート ─────────────────────────────
  const sortedCasts = useMemo(() => {
    const working = casts.filter(c => {
      const status = shifts.get(c.id)
      return status === '出勤' || status === '希望出勤' || status === '来客出勤'
    })
    const notWorking = casts.filter(c => {
      const status = shifts.get(c.id)
      return status !== '出勤' && status !== '希望出勤' && status !== '来客出勤'
    })
    return [...working, ...notWorking]
  }, [casts, shifts])

  // ─── 選択キャストの担当顧客 ───────────────────────────────
  const selectedCast = casts.find(c => c.id === selectedCastId)
  const castCustomers = useMemo(() => {
    if (!selectedCast) return []
    return allCustomers.filter(c => c.cast_name === selectedCast.cast_name)
  }, [selectedCast, allCustomers])

  // ─── 顧客検索候補 ─────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchTerm || searchTerm.length < 1) return castCustomers.slice(0, 10)
    const term = searchTerm.toLowerCase()
    return castCustomers
      .filter(c =>
        c.customer_name.toLowerCase().includes(term) ||
        (c.nickname && c.nickname.toLowerCase().includes(term))
      )
      .slice(0, 10)
  }, [searchTerm, castCustomers])

  // ─── 行操作 ───────────────────────────────────────────────
  const updateRow = (idx: number, field: keyof EntryRow, value: any) => {
    setRows(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const addRow = () => setRows(prev => [...prev, emptyRow()])

  const removeRow = (idx: number) => {
    setRows(prev => prev.length <= 1 ? [emptyRow()] : prev.filter((_, i) => i !== idx))
  }

  const selectCustomer = (idx: number, customer: Customer) => {
    setRows(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], customerId: customer.id, customerName: customer.customer_name }
      return next
    })
    setSearchIdx(null)
    setSearchTerm('')
  }

  // ─── 出勤確認トグル ────────────────────────────────────────
  const toggleAttendance = (castId: string) => {
    setAttendanceChecked(prev => {
      const next = new Set(prev)
      if (next.has(castId)) {
        next.delete(castId)
      } else {
        next.add(castId)
      }
      return next
    })
  }

  // ─── 出勤確認をシフトに反映 ───────────────────────────────
  const syncAttendanceToShifts = async () => {
    const upserts: { cast_id: string; shift_date: string; status: string; memo: string }[] = []
    for (const cast of casts) {
      const isChecked = attendanceChecked.has(cast.id)
      const currentStatus = shifts.get(cast.id)
      // チェックあり → 出勤、チェックなし → 休み（既に確定済みのものも更新）
      const newStatus = isChecked ? '出勤' : '休み'
      if (currentStatus !== newStatus) {
        upserts.push({ cast_id: cast.id, shift_date: date, status: newStatus, memo: '' })
      }
    }
    if (upserts.length > 0) {
      await supabase
        .from('cast_shifts')
        .upsert(upserts, { onConflict: 'cast_id,shift_date' })
      // ローカルのシフトデータも更新
      setShifts(prev => {
        const next = new Map(prev)
        for (const u of upserts) next.set(u.cast_id, u.status as CastShift['status'])
        return next
      })
    }
  }

  // ─── 保存 ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedCastId || !selectedCast) return
    setSaving(true)

    try {
      const validRows = rows.filter(r => r.customerId && r.amount)

      // 既存レコードのIDを集めて、なくなったものを削除
      const existingIds = rows.filter(r => r.id).map(r => r.id!)
      const prevEntries = castEntries.get(selectedCastId) || []
      const deletedIds = prevEntries.filter(r => r.id && !existingIds.includes(r.id)).map(r => r.id!)
      if (deletedIds.length > 0) {
        await supabase.from('customer_visits').delete().in('id', deletedIds)
      }

      for (const row of validRows) {
        const visitData = {
          customer_id: row.customerId,
          visit_date: date,
          amount_spent: parseInt(row.amount.replace(/[¥,]/g, '')) || 0,
          party_size: parseInt(row.partySize) || 1,
          has_douhan: row.hasDouhan,
          has_after: row.hasAfter,
          is_first_visit: row.isFirstVisit,
          is_planned: false,
          companion_honshimei: '',
          companion_banai: '',
          memo: row.memo,
        }

        if (row.id) {
          await supabase.from('customer_visits').update(visitData).eq('id', row.id)
        } else {
          const { data } = await supabase.from('customer_visits').insert(visitData).select('id').single()
          if (data) row.id = data.id
        }
      }

      // 出勤確認をシフトに反映
      await syncAttendanceToShifts()

      // キャッシュ更新
      setCastEntries(prev => {
        const next = new Map(prev)
        next.set(selectedCastId, validRows.length > 0 ? [...validRows] : [])
        return next
      })
      setSavedCasts(prev => new Set(prev).add(selectedCastId))

      // 次の未入力キャストへ
      const nextCast = sortedCasts.find(c => c.id !== selectedCastId && !savedCasts.has(c.id) && !castEntries.has(c.id))
      if (nextCast) setSelectedCastId(nextCast.id)

    } catch (err) {
      console.error('Save error:', err)
      alert('保存に失敗しました')
    }
    setSaving(false)
  }

  // ─── 日付変更 ──────────────────────────────────────────────
  const changeDate = (delta: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    setSelectedCastId(null)
  }

  const dateLabel = useMemo(() => {
    const d = new Date(date)
    const days = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`
  }, [date])

  // ─── 合計計算 ──────────────────────────────────────────────
  const currentTotal = rows.reduce((s, r) => s + (parseInt(r.amount.replace(/[¥,]/g, '')) || 0), 0)
  const currentCount = rows.filter(r => r.customerId).length
  const grandTotal = useMemo(() => {
    let total = 0
    for (const [, info] of castDailySales) total += info.total
    return total
  }, [castDailySales])

  const isWorking = (castId: string) => {
    const status = shifts.get(castId)
    return status === '出勤' || status === '希望出勤' || status === '来客出勤'
  }

  // ─── 権限チェック中 / 権限なし ─────────────────────────────
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

  // ─── メインレンダリング ────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <div style={{ display: 'flex', height: '100vh' }}>
        {/* ─── 左サイドバー：キャスト一覧 ─── */}
        <div style={{
          width: 210, flexShrink: 0, background: '#FDF8F9',
          borderRight: `1px solid ${C.border}`, overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
            <button onClick={() => router.push('/admin/casts')} style={{
              background: 'transparent', border: 'none', color: C.pink,
              fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              ← 管理ページ
            </button>
          </div>

          <div style={{ padding: '10px 14px 4px', fontSize: 9, letterSpacing: '0.2em', color: C.pinkMuted, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>出勤確認</span>
            <span>出勤 {attendanceChecked.size}名</span>
          </div>
          {sortedCasts.map(cast => {
            const info = castDailySales.get(cast.id)
            const isSaved = savedCasts.has(cast.id) || (info && info.count > 0)
            const isChecked = attendanceChecked.has(cast.id)
            const shiftStatus = shifts.get(cast.id)
            const isScheduledWork = shiftStatus === '出勤' || shiftStatus === '希望出勤' || shiftStatus === '来客出勤'
            return (
              <div
                key={cast.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 10px 7px 8px', cursor: 'pointer',
                  background: selectedCastId === cast.id ? 'rgba(232,120,154,0.1)' : 'transparent',
                  borderLeft: selectedCastId === cast.id ? `3px solid ${C.pink}` : '3px solid transparent',
                  opacity: isChecked || isScheduledWork ? 1 : 0.5,
                }}
              >
                {/* 出勤チェックボックス */}
                <div
                  onClick={(e) => { e.stopPropagation(); toggleAttendance(cast.id) }}
                  style={{
                    width: 18, height: 18, flexShrink: 0,
                    border: isChecked ? 'none' : `1.5px solid ${C.border}`,
                    borderRadius: 3,
                    background: isChecked ? '#1D9E75' : '#FFF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {isChecked && <span style={{ color: '#FFF', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                </div>
                {/* キャスト名 */}
                <div
                  onClick={() => setSelectedCastId(cast.id)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <span style={{ fontSize: 12, fontWeight: selectedCastId === cast.id ? 500 : 400, color: C.dark }}>
                    {cast.cast_name}
                  </span>
                  {!isScheduledWork && !isChecked && (
                    <span style={{ fontSize: 8, color: '#999' }}>予定外</span>
                  )}
                </div>
                <span style={{ fontSize: 9, color: C.pinkMuted }}>
                  {info && info.count > 0 ? `${info.count}組 ¥${Math.round(info.total / 1000)}k` : isSaved ? '0組' : ''}
                </span>
              </div>
            )
          })}

          {/* 日計サマリー */}
          <div style={{ marginTop: 'auto', padding: '12px 14px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, letterSpacing: '0.2em', color: C.pinkMuted, marginBottom: 4 }}>日計サマリー</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: C.pink }}>¥{grandTotal.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: C.pinkMuted, marginTop: 2 }}>
              出勤 {attendanceChecked.size}名 / 入力済 {savedCasts.size}名
            </div>
          </div>
        </div>

        {/* ─── メインエリア ─── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* トップバー */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px',
            borderBottom: `1px solid ${C.border}`, background: C.headerBg, flexWrap: 'wrap',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#FFF', border: `1px solid ${C.border}`, padding: '8px 14px', fontSize: 14, fontWeight: 500,
            }}>
              <span onClick={() => changeDate(-1)} style={{ cursor: 'pointer', color: C.pinkMuted, fontSize: 16, userSelect: 'none' }}>‹</span>
              <span>{dateLabel}</span>
              <span onClick={() => changeDate(1)} style={{ cursor: 'pointer', color: C.pinkMuted, fontSize: 16, userSelect: 'none' }}>›</span>
            </div>
            <div style={{ fontSize: 12, color: C.pinkMuted, padding: '6px 14px', background: '#FFF', border: `1px solid ${C.border}` }}>
              出勤確認 <span style={{ color: '#1D9E75', fontWeight: 500 }}>{attendanceChecked.size}名</span>
            </div>
            <div style={{ fontSize: 11, letterSpacing: '0.15em', color: C.pinkMuted, marginLeft: 'auto' }}>
              日次売上入力
            </div>
          </div>

          {/* 入力テーブル */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
            {selectedCast ? (
              <>
                {/* キャストヘッダー */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <button
                    onClick={() => setOverlayCastId(selectedCastId)}
                    style={{
                      fontSize: 16, fontWeight: 500, color: C.pink, background: 'transparent',
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                      textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: 'rgba(232,120,154,0.3)',
                    }}
                  >
                    {selectedCast.cast_name}
                  </button>
                  {selectedCast.cast_tier && (
                    <span style={{ fontSize: 10, padding: '3px 10px', background: '#FBEAF0', color: '#72243E' }}>
                      {selectedCast.cast_tier}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: C.pinkMuted }}>担当顧客 {castCustomers.length}人</span>
                  {attendanceChecked.has(selectedCastId!) ? (
                    <span style={{ fontSize: 10, padding: '2px 8px', background: '#E1F5EE', color: '#085041' }}>出勤確認済</span>
                  ) : (
                    <span style={{ fontSize: 10, padding: '2px 8px', background: '#F1EFE8', color: '#5F5E5A' }}>未確認</span>
                  )}
                </div>

                {/* テーブル */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: 200, textAlign: 'left' }}>顧客</th>
                      <th style={{ ...thStyle, width: 110 }}>金額</th>
                      <th style={{ ...thStyle, width: 50 }}>人数</th>
                      <th style={{ ...thStyle, width: 44 }}>同伴</th>
                      <th style={{ ...thStyle, width: 44 }}>アフ</th>
                      <th style={{ ...thStyle, width: 44 }}>初</th>
                      <th style={{ ...thStyle, width: 44 }}>リピ</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>メモ</th>
                      <th style={{ ...thStyle, width: 30 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                        {/* 顧客名（検索） */}
                        <td style={{ padding: '5px 8px', position: 'relative' }}>
                          <input
                            ref={searchIdx === idx ? searchRef : undefined}
                            value={searchIdx === idx ? searchTerm : row.customerName}
                            placeholder="顧客名を入力して検索..."
                            onFocus={() => {
                              setSearchIdx(idx)
                              setSearchTerm(row.customerName)
                            }}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onBlur={() => setTimeout(() => setSearchIdx(null), 200)}
                            style={{ ...inputStyle, paddingLeft: 28, width: '100%' }}
                          />
                          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: C.pinkMuted }}>🔍</span>
                          {searchIdx === idx && (
                            <div style={{
                              position: 'absolute', top: '100%', left: 8, right: 8,
                              background: '#FFF', border: `1px solid ${C.border}`, zIndex: 20,
                              maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            }}>
                              {searchResults.map(c => (
                                <div
                                  key={c.id}
                                  onMouseDown={() => selectCustomer(idx, c)}
                                  style={{
                                    padding: '7px 10px', cursor: 'pointer', fontSize: 12,
                                    display: 'flex', justifyContent: 'space-between',
                                  }}
                                >
                                  <span>{c.customer_name}{c.nickname ? ` (${c.nickname})` : ''}</span>
                                  <span style={{ fontSize: 10, color: C.pinkMuted }}>{c.customer_rank}ランク・{c.age_group}</span>
                                </div>
                              ))}
                              <div
                                onMouseDown={() => {
                                  setNewCustomerForRow(idx)
                                  setShowNewCustomer(true)
                                  setSearchIdx(null)
                                }}
                                style={{
                                  padding: '7px 10px', cursor: 'pointer', fontSize: 12, color: C.pink,
                                  fontWeight: 500, borderTop: `1px solid ${C.border}`,
                                }}
                              >
                                + 新規顧客を登録
                              </div>
                            </div>
                          )}
                        </td>
                        {/* 金額 */}
                        <td style={{ padding: '5px 8px' }}>
                          <input
                            value={row.amount}
                            placeholder="¥0"
                            onChange={(e) => updateRow(idx, 'amount', e.target.value)}
                            onBlur={(e) => {
                              const num = parseInt(e.target.value.replace(/[¥,]/g, '')) || 0
                              if (num > 0) updateRow(idx, 'amount', num.toLocaleString())
                            }}
                            style={{ ...inputStyle, textAlign: 'right', width: '100%' }}
                          />
                        </td>
                        {/* 人数 */}
                        <td style={{ padding: '5px 8px' }}>
                          <input
                            value={row.partySize}
                            onChange={(e) => updateRow(idx, 'partySize', e.target.value)}
                            style={{ ...inputStyle, textAlign: 'center', width: '100%' }}
                          />
                        </td>
                        {/* 同伴 */}
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <ToggleButton active={row.hasDouhan} label="同" color="douhan" onClick={() => updateRow(idx, 'hasDouhan', !row.hasDouhan)} />
                        </td>
                        {/* アフター */}
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <ToggleButton active={row.hasAfter} label="ア" color="after" onClick={() => updateRow(idx, 'hasAfter', !row.hasAfter)} />
                        </td>
                        {/* 初 */}
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <ToggleButton active={row.isFirstVisit} label="初" color="first" onClick={() => {
                            updateRow(idx, 'isFirstVisit', !row.isFirstVisit)
                            if (!row.isFirstVisit) updateRow(idx, 'isFirstVisit', true)
                          }} />
                        </td>
                        {/* リピ */}
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <ToggleButton active={!row.isFirstVisit && !!row.customerId} label="リピ" color="repeat" onClick={() => {
                            updateRow(idx, 'isFirstVisit', false)
                          }} />
                        </td>
                        {/* メモ */}
                        <td style={{ padding: '5px 8px' }}>
                          <input
                            value={row.memo}
                            placeholder="メモ"
                            onChange={(e) => updateRow(idx, 'memo', e.target.value)}
                            style={{ ...inputStyle, width: '100%' }}
                          />
                        </td>
                        {/* 削除 */}
                        <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                          <button onClick={() => removeRow(idx)} style={{
                            background: 'transparent', border: 'none', fontSize: 16,
                            color: C.pinkMuted, cursor: 'pointer', padding: '2px 6px',
                          }}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={addRow} style={{
                    background: 'transparent', color: C.pink, border: `1px dashed ${C.pink}`,
                    padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    + 行を追加
                  </button>
                  <span style={{ fontSize: 12, color: C.pinkMuted }}>Tab / Enter で次のセルに移動</span>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.pinkMuted }}>
                左のキャスト一覧から選択してください
              </div>
            )}
          </div>

          {/* フッター */}
          {selectedCast && (
            <div style={{
              padding: '12px 24px', borderTop: `1px solid ${C.border}`, background: C.headerBg,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 12, color: C.pinkMuted }}>{selectedCast.cast_name} 日計:</span>
                <span style={{ fontSize: 20, fontWeight: 500, color: C.pink }}>¥{currentTotal.toLocaleString()}</span>
                <span style={{ fontSize: 12, color: C.pinkMuted }}>
                  {currentCount}組
                  {rows.filter(r => r.hasDouhan).length > 0 && ` / 同伴${rows.filter(r => r.hasDouhan).length}`}
                  {rows.filter(r => r.hasAfter).length > 0 && ` / アフター${rows.filter(r => r.hasAfter).length}`}
                </span>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  background: saving ? C.pinkMuted : C.pink, color: '#FFF', border: 'none',
                  padding: '10px 28px', fontSize: 13, fontWeight: 500, cursor: saving ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {saving ? '保存中...' : '保存して次のキャストへ →'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── 新規顧客登録オーバーレイ ─── */}
      {showNewCustomer && (
        <>
          <div onClick={() => setShowNewCustomer(false)} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.3)', zIndex: 100,
          }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '50%',
            background: C.bg, zIndex: 101, overflowY: 'auto',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          }}>
            <div style={{
              position: 'sticky', top: 0, zIndex: 10, background: C.headerBg,
              borderBottom: `1px solid ${C.border}`, padding: '10px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button onClick={() => setShowNewCustomer(false)} style={{
                background: 'transparent', border: 'none', color: C.pink,
                fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              }}>← 戻る</button>
              <span style={{ fontSize: 11, letterSpacing: '0.15em', color: C.dark, fontWeight: 600 }}>新規顧客登録</span>
              <div style={{ width: 60 }} />
            </div>
            <CustomerForm
              initialData={{ cast_name: selectedCast?.cast_name || '' }}
              inOverlay
              onCancel={() => setShowNewCustomer(false)}
              onSubmit={async (data) => {
                const result = await addCustomer({ ...data, cast_name: selectedCast?.cast_name || '' })
                if (result && newCustomerForRow !== null) {
                  selectCustomer(newCustomerForRow, result)
                }
                setShowNewCustomer(false)
                setNewCustomerForRow(null)
              }}
            />
          </div>
        </>
      )}

      {/* ─── キャスト詳細オーバーレイ ─── */}
      {overlayCastId && (
        <>
          <div onClick={() => setOverlayCastId(null)} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.3)', zIndex: 100,
          }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '60%',
            background: C.bg, zIndex: 101, overflowY: 'auto',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          }}>
            <div style={{
              position: 'sticky', top: 0, zIndex: 10, background: C.headerBg,
              borderBottom: `1px solid ${C.border}`, padding: '10px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button onClick={() => setOverlayCastId(null)} style={{
                background: 'transparent', border: 'none', color: C.pink,
                fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              }}>← 戻る</button>
              <button onClick={() => {
                setOverlayCastId(null)
                router.push(`/casts/${overlayCastId}`)
              }} style={{
                background: 'transparent', border: `1px solid ${C.border}`,
                color: C.pinkMuted, fontSize: 10, fontFamily: 'inherit',
                cursor: 'pointer', padding: '4px 10px',
              }}>全画面で開く</button>
            </div>
            <iframe
              src={`/casts/${overlayCastId}`}
              style={{ width: '100%', height: 'calc(100% - 45px)', border: 'none' }}
            />
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── トグルボタンコンポーネント ──────────────────────────────
function ToggleButton({ active, label, color, onClick }: {
  active: boolean; label: string; color: 'douhan' | 'after' | 'first' | 'repeat'; onClick: () => void
}) {
  const colors = {
    douhan: { bg: '#FCB69F', text: '#7A2E0E' },
    after: { bg: '#F4C0D1', text: '#72243E' },
    first: { bg: '#B5D4F4', text: '#0C447C' },
    repeat: { bg: '#C0DD97', text: '#27500A' },
  }
  const c = colors[color]
  return (
    <button
      onClick={onClick}
      style={{
        minWidth: 32, height: 26, fontSize: 10, fontWeight: 500,
        border: active ? 'none' : `1px solid ${C.border}`,
        background: active ? c.bg : '#FFF',
        color: active ? c.text : C.pinkMuted,
        cursor: 'pointer', fontFamily: 'inherit', padding: '0 6px',
      }}
    >{label}</button>
  )
}

// ─── スタイル定義 ────────────────────────────────────────────
const thStyle: React.CSSProperties = {
  fontSize: 11, color: '#999', fontWeight: 400,
  padding: '8px 8px', borderBottom: `1px solid #E8E0E4`,
  textAlign: 'center',
}

const inputStyle: React.CSSProperties = {
  background: '#F8F5F6', border: `1px solid #E8E0E4`,
  borderRadius: 4, padding: '7px 10px', fontSize: 13,
  color: '#2A2A2A', fontFamily: 'inherit',
  outline: 'none',
}
