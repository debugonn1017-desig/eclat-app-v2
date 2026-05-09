'use client'

// 来店予定一覧ページ
//   全キャストの planned_visits を時系列で表示する。
//   フィルタ: 日付範囲 / キャスト / 同伴有無 / ステータス
//   行クリックで顧客詳細パネルへ。
//
//   レポート閲覧 or キャスト管理（または上位）権限が必要。
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCasts } from '@/hooks/useCasts'
import { useViewMode } from '@/hooks/useViewMode'
import { C } from '@/lib/colors'
import BottomNav from '@/components/BottomNav'
import ViewModeToggle from '@/components/ViewModeToggle'
import ClearableInput from '@/components/ClearableInput'

type PlannedVisit = {
  id: number
  customer_id: string
  customer_name: string
  cast_id: string
  cast_name: string
  cast_tier: string | null
  planned_date: string
  planned_time: string | null
  party_size: number | null
  has_douhan: boolean | null
  memo: string | null
  status: string
}

export default function PlannedVisitsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { casts } = useCasts()
  const { isPC } = useViewMode()

  // 認証
  // ⚠ 来店予定の管理者ビューは「顧客の予定を見る」画面なので、
  //    顧客.閲覧 を持っているスタッフ全員が閲覧可。
  //    旧: レポート.閲覧 OR キャスト.アカウント管理 OR キャスト.閲覧 でちぐはぐ
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { setAuthorized(false); return }
        const me = await res.json()
        const ok = me.is_owner === true
          || me.permissions?.['顧客.閲覧'] === true
          || me.permissions?.['顧客.編集'] === true
        setAuthorized(ok)
      } catch { setAuthorized(false) }
    }
    check()
  }, [])

  // フィルタ
  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const oneMonthLater = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(oneMonthLater)
  const [castFilter, setCastFilter] = useState<string>('') // cast id
  const [statusFilter, setStatusFilter] = useState<'予定' | '来店済み' | 'all'>('予定')
  const [douhanOnly, setDouhanOnly] = useState(false)

  // データ
  const [rows, setRows] = useState<PlannedVisit[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (!authorized) return
    setLoading(true)
    try {
      let q = supabase
        .from('planned_visits')
        .select(
          'id, customer_id, cast_id, planned_date, planned_time, party_size, has_douhan, memo, status, customers!inner(customer_name)'
        )
        .gte('planned_date', fromDate)
        .lte('planned_date', toDate)
        .order('planned_date', { ascending: true })
        .order('planned_time', { ascending: true })

      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      if (castFilter) q = q.eq('cast_id', castFilter)
      if (douhanOnly) q = q.eq('has_douhan', true)

      const { data } = await q
      const castMap = new Map(casts.map(c => [c.id, c]))
      const enriched: PlannedVisit[] = ((data ?? []) as any[]).map(r => {
        const c = castMap.get(r.cast_id)
        return {
          id: r.id,
          customer_id: String(r.customer_id),
          customer_name: r.customers?.customer_name ?? '不明',
          cast_id: r.cast_id,
          cast_name: c?.cast_name ?? '?',
          cast_tier: c?.cast_tier ?? null,
          planned_date: r.planned_date,
          planned_time: r.planned_time,
          party_size: r.party_size,
          has_douhan: r.has_douhan,
          memo: r.memo,
          status: r.status,
        }
      })
      setRows(enriched)
    } finally {
      setLoading(false)
    }
  }, [authorized, supabase, fromDate, toDate, castFilter, statusFilter, douhanOnly, casts])

  useEffect(() => { fetchData() }, [fetchData])

  // 認証中／権限なし
  if (authorized === null) {
    return <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#888' }}>読み込み中...</div>
  }
  if (!authorized) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontSize: 13 }}>
        <p>この機能には「顧客.閲覧」の権限が必要です</p>
        <button onClick={() => router.push('/admin/casts')} style={{ marginTop: 12, padding: '8px 18px' }}>
          管理ページに戻る
        </button>
      </div>
    )
  }

  // 日付ごとにグループ化
  const grouped = useMemo(() => {
    const map = new Map<string, PlannedVisit[]>()
    for (const r of rows) {
      const list = map.get(r.planned_date) ?? []
      list.push(r)
      map.set(r.planned_date, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  const formatDate = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, day).getDay()]
    return `${m}/${day}(${dow})`
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: !isPC ? 60 : 0 }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: isPC ? '12px 20px' : '8px 12px',
        borderBottom: `1px solid ${C.border}`, background: C.headerBg,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => router.push('/admin/casts')}
          style={{
            background: 'transparent', border: 'none', color: C.pink,
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
          }}
        >← 管理</button>
        <span style={{ fontSize: 13, fontWeight: 500, color: C.dark }}>
          来店予定一覧
        </span>
        <span style={{ fontSize: 11, color: C.pinkMuted }}>{rows.length}件</span>
        <ViewModeToggle style={{ marginLeft: 'auto' }} />
        <button
          onClick={fetchData}
          style={{
            background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.dark, padding: '5px 10px', fontSize: 11, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >再読込</button>
      </div>

      {/* フィルタ */}
      <div style={{
        padding: isPC ? '12px 20px' : '10px 12px',
        background: '#FEFBFC', borderBottom: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: C.pinkMuted, letterSpacing: '0.15em', minWidth: 30 }}>期間</span>
          <div style={{ minWidth: 130 }}>
            <ClearableInput
              type="date"
              value={fromDate}
              onChange={(v) => setFromDate(v)}
              style={{
                padding: '6px 8px', fontSize: 12,
                border: `1px solid ${C.border}`, background: '#FFF',
                fontFamily: 'inherit', borderRadius: 4,
              }}
            />
          </div>
          <span style={{ fontSize: 11, color: C.pinkMuted }}>〜</span>
          <div style={{ minWidth: 130 }}>
            <ClearableInput
              type="date"
              value={toDate}
              onChange={(v) => setToDate(v)}
              style={{
                padding: '6px 8px', fontSize: 12,
                border: `1px solid ${C.border}`, background: '#FFF',
                fontFamily: 'inherit', borderRadius: 4,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: C.pinkMuted, letterSpacing: '0.15em', minWidth: 30 }}>キャスト</span>
          <select
            value={castFilter}
            onChange={(e) => setCastFilter(e.target.value)}
            style={{
              padding: '5px 8px', fontSize: 12,
              border: `1px solid ${C.border}`, background: '#FFF',
              fontFamily: 'inherit', borderRadius: 4,
              minWidth: 130,
            }}
          >
            <option value="">全員</option>
            {casts.filter(c => c.is_active).map(c => (
              <option key={c.id} value={c.id}>{c.cast_name}</option>
            ))}
          </select>

          {(['予定', '来店済み', 'all'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '4px 10px', fontSize: 11, borderRadius: 12,
                background: statusFilter === s ? '#FBEAF0' : '#FFF',
                color: statusFilter === s ? '#72243E' : C.pinkMuted,
                border: `1px solid ${statusFilter === s ? '#ED93B1' : C.border}`,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {s === 'all' ? '全部' : s}
            </button>
          ))}

          <button
            onClick={() => setDouhanOnly(v => !v)}
            style={{
              padding: '4px 10px', fontSize: 11, borderRadius: 12,
              background: douhanOnly ? '#FBEAF0' : '#FFF',
              color: douhanOnly ? '#72243E' : C.pinkMuted,
              border: `1px solid ${douhanOnly ? '#ED93B1' : C.border}`,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            同伴のみ
          </button>
        </div>
      </div>

      {/* リスト */}
      <div style={{ padding: isPC ? '14px 20px 30px' : '10px 10px 30px' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 12 }}>読み込み中...</div>
        ) : grouped.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 12 }}>該当する来店予定がありません</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {grouped.map(([date, list]) => (
              <div key={date}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: C.pink,
                  letterSpacing: '0.1em',
                  marginBottom: 6,
                  paddingBottom: 4,
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  {formatDate(date)} — {list.length}件
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.map(r => (
                    <div
                      key={r.id}
                      onClick={() => router.push(`/customer/${r.customer_id}`)}
                      style={{
                        background: '#FFF',
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10,
                        flexWrap: 'wrap',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#ED93B1')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.pink, minWidth: 50 }}>
                        {r.planned_time ?? '時刻未'}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.dark }}>
                        {r.customer_name} 様
                      </span>
                      <span style={{
                        fontSize: 10, color: C.pinkMuted,
                        padding: '2px 6px', borderRadius: 4, background: C.tagBg,
                      }}>
                        {r.cast_name}
                      </span>
                      {r.has_douhan && (
                        <span style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 6,
                          background: '#FBEAF0', color: '#72243E', fontWeight: 500,
                        }}>同伴</span>
                      )}
                      {r.party_size != null && (
                        <span style={{ fontSize: 10, color: C.pinkMuted }}>{r.party_size}名</span>
                      )}
                      {r.status !== '予定' && (
                        <span style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 6,
                          background: '#E1F5EE', color: '#0F6E56', fontWeight: 500,
                        }}>{r.status}</span>
                      )}
                      {r.memo && (
                        <span style={{
                          fontSize: 11, color: '#666', flex: '1 1 100%',
                          marginTop: 2,
                        }}>
                          {r.memo}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isPC && <BottomNav />}
    </div>
  )
}
