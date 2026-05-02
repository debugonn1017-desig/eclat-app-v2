'use client'

// 接客カレンダー
//   月カレンダー × 本指名/場内/フリーの件数バッジ
//   日付タップで当日のお客様リストオーバーレイを開き、顧客名タップで顧客詳細へ
//   - cast role: 自分の担当顧客だけ
//   - admin/owner: 店舗全体（cast_name バッジ付き）
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/colors'
import BottomNav from '@/components/BottomNav'
import UserChip from '@/components/UserChip'
import CustomerDetailPanel from '@/components/CustomerDetailPanel'

type VisitRow = {
  id: string
  customer_id: string
  customer_name: string
  cast_name: string
  nomination_status: 'フリー' | '場内' | '本指名' | string
  visit_date: string
  amount_spent: number
  has_douhan: boolean
  has_after: boolean
  table_number: string
}
type FirstBanaiRow = {
  customer_id: string
  customer_name: string
  cast_name: string
  first_visit_date: string
}

type DayBucket = {
  honshimei: VisitRow[]
  banai: VisitRow[]
  free: VisitRow[]
  // first_visit_date マッチで拾った場内（来店記録に出てない人）
  banaiFirsts: FirstBanaiRow[]
}

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), [])
  const [me, setMe] = useState<{ id: string; role: 'cast' | 'admin'; is_owner: boolean; cast_name: string | null } | null>(null)
  const [loaded, setLoaded] = useState(false)

  // 対象月（YYYY-MM）
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [visits, setVisits] = useState<VisitRow[]>([])
  const [firstBanai, setFirstBanai] = useState<FirstBanaiRow[]>([])
  const [openDay, setOpenDay] = useState<number | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  // 自分のロール取得
  useEffect(() => {
    const fetchMe = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoaded(true); return }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, cast_name, is_owner')
        .eq('id', user.id)
        .single()
      if (profile) {
        setMe({
          id: profile.id,
          role: profile.role as 'cast' | 'admin',
          is_owner: profile.is_owner ?? false,
          cast_name: profile.cast_name ?? null,
        })
      }
      setLoaded(true)
    }
    fetchMe()
  }, [supabase])

  // 月内の来店データを取得（cast の場合は cast_name で絞り込み）
  useEffect(() => {
    if (!me) return
    const fetchVisits = async () => {
      const [y, m] = month.split('-').map(Number)
      const start = `${month}-01`
      const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`

      // 来店データ + 顧客情報を join
      let q = supabase
        .from('customer_visits')
        .select('id, customer_id, visit_date, amount_spent, has_douhan, has_after, table_number, customers!inner(id, customer_name, cast_name, nomination_status)')
        .gte('visit_date', start)
        .lte('visit_date', end)
        .order('visit_date', { ascending: true })
        .order('id', { ascending: true })

      const { data } = await q
      if (data) {
        let rows = (data as any[]).map(v => ({
          id: v.id,
          customer_id: v.customer_id,
          customer_name: v.customers?.customer_name ?? '',
          cast_name: v.customers?.cast_name ?? '',
          nomination_status: v.customers?.nomination_status ?? '',
          visit_date: v.visit_date,
          amount_spent: Number(v.amount_spent) || 0,
          has_douhan: v.has_douhan ?? false,
          has_after: v.has_after ?? false,
          table_number: v.table_number ?? '',
        }))
        // cast 本人の場合は自分の担当顧客に絞る
        if (me.role === 'cast' && me.cast_name) {
          rows = rows.filter(r => r.cast_name === me.cast_name)
        }
        setVisits(rows)
      }

      // 場内お客様で「first_visit_date が当月」の人（来店記録になくても拾う）
      const { data: custData } = await supabase
        .from('customers')
        .select('id, customer_name, cast_name, nomination_status, first_visit_date')
        .eq('nomination_status', '場内')
        .gte('first_visit_date', start)
        .lte('first_visit_date', end)
      if (custData) {
        let firsts = (custData as any[]).map(c => ({
          customer_id: c.id,
          customer_name: c.customer_name ?? '',
          cast_name: c.cast_name ?? '',
          first_visit_date: c.first_visit_date,
        }))
        if (me.role === 'cast' && me.cast_name) {
          firsts = firsts.filter(f => f.cast_name === me.cast_name)
        }
        setFirstBanai(firsts)
      }
    }
    fetchVisits()
  }, [me, month, supabase])

  // 日別バケット
  const dayBuckets = useMemo(() => {
    const map = new Map<number, DayBucket>()
    const ensure = (d: number): DayBucket => {
      let b = map.get(d)
      if (!b) {
        b = { honshimei: [], banai: [], free: [], banaiFirsts: [] }
        map.set(d, b)
      }
      return b
    }
    for (const v of visits) {
      const d = Number(v.visit_date.split('-')[2])
      if (!Number.isFinite(d)) continue
      const b = ensure(d)
      if (v.nomination_status === '本指名') b.honshimei.push(v)
      else if (v.nomination_status === '場内') b.banai.push(v)
      else b.free.push(v)
    }
    for (const f of firstBanai) {
      const d = Number(f.first_visit_date.split('-')[2])
      if (!Number.isFinite(d)) continue
      const b = ensure(d)
      // 同じお客様が visits にも出てたら重複させない
      const already = b.banai.some(v => v.customer_id === f.customer_id)
      if (!already) b.banaiFirsts.push(f)
    }
    return map
  }, [visits, firstBanai])

  // カレンダー生成
  const { calendarDays, year, monthNumber, monthLabel } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const firstDay = new Date(y, m - 1, 1).getDay()
    const daysInMonth = new Date(y, m, 0).getDate()
    const days: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    return {
      calendarDays: days,
      year: y, monthNumber: m,
      monthLabel: `${y}年${m}月`,
    }
  }, [month])

  const changeMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const todayY = Number(todayStr.split('-')[0])
  const todayM = Number(todayStr.split('-')[1])
  const todayD = Number(todayStr.split('-')[2])

  const formatYen = (n: number) => `¥${n.toLocaleString()}`

  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, color: C.pinkMuted }}>読み込み中…</div>
      </div>
    )
  }

  const openBucket = openDay !== null ? dayBuckets.get(openDay) : null
  const openDateStr = openDay !== null ? `${month}-${String(openDay).padStart(2, '0')}` : ''
  const openWd = openDay !== null
    ? ['日','月','火','水','木','金','土'][new Date(year, monthNumber - 1, openDay).getDay()]
    : ''
  const openTotal = openBucket
    ? [...openBucket.honshimei, ...openBucket.banai, ...openBucket.free].reduce((s, v) => s + v.amount_spent, 0)
    : 0
  const openCount = openBucket
    ? openBucket.honshimei.length + openBucket.banai.length + openBucket.free.length + openBucket.banaiFirsts.length
    : 0

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: '76px' }}>
      {/* ヘッダー */}
      <div style={{
        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{
          maxWidth: '420px', margin: '0 auto',
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <Image
              src="/logo.png" alt="Éclat" width={100} height={30}
              className="object-contain"
              style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
            />
            <p style={{ fontSize: '7px', letterSpacing: '0.35em', color: C.pinkMuted, margin: '2px 0 0 0' }}>
              SERVICE CALENDAR
            </p>
          </div>
          <UserChip />
        </div>
      </div>

      <div style={{ maxWidth: '420px', margin: '0 auto', padding: '14px 16px' }}>
        {/* 月ナビ */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: C.white, border: `1px solid ${C.border}`,
          padding: '10px 14px', marginBottom: '12px',
        }}>
          <button onClick={() => changeMonth(-1)} style={{
            background: 'transparent', border: 'none', color: C.pink, fontSize: '18px',
            cursor: 'pointer', fontFamily: 'inherit', padding: '0 8px',
          }}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: C.dark }}>{monthLabel}</div>
            {me && (
              <div style={{ fontSize: '9px', color: C.pinkMuted, marginTop: '2px' }}>
                {me.role === 'cast' ? `${me.cast_name} さんの接客履歴` : '店舗全体'}
              </div>
            )}
          </div>
          <button onClick={() => changeMonth(1)} style={{
            background: 'transparent', border: 'none', color: C.pink, fontSize: '18px',
            cursor: 'pointer', fontFamily: 'inherit', padding: '0 8px',
          }}>›</button>
        </div>

        {/* カレンダー */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px',
          background: C.white, border: `1px solid ${C.border}`, padding: '8px',
        }}>
          {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
            <div key={d} style={{
              textAlign: 'center', fontSize: '9px', padding: '4px 0',
              color: i === 0 ? '#D45060' : i === 6 ? '#5080C0' : C.pinkMuted,
              letterSpacing: '0.1em',
            }}>{d}</div>
          ))}
          {calendarDays.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />
            const b = dayBuckets.get(day)
            const honN = b?.honshimei.length ?? 0
            const banaN = (b?.banai.length ?? 0) + (b?.banaiFirsts.length ?? 0)
            const freeN = b?.free.length ?? 0
            const total = honN + banaN + freeN
            const isToday = year === todayY && monthNumber === todayM && day === todayD
            const wd = new Date(year, monthNumber - 1, day).getDay()
            return (
              <button
                key={day}
                onClick={() => setOpenDay(day)}
                style={{
                  width: '100%', minHeight: 70,
                  display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                  border: `1px solid ${isToday ? C.pink : C.border}`,
                  background: isToday ? '#FFF5F7' : (total > 0 ? '#FFFAFB' : C.white),
                  cursor: 'pointer', fontFamily: 'inherit',
                  padding: '4px 3px',
                }}
              >
                <div style={{
                  fontSize: '12px', fontWeight: isToday ? 700 : 500,
                  color: wd === 0 ? '#D45060' : wd === 6 ? '#5080C0' : C.dark,
                  textAlign: 'center',
                }}>{day}</div>
                {total > 0 && (
                  <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: '1px',
                    marginTop: '2px',
                  }}>
                    {honN > 0 && <span style={{ fontSize: '8px', fontWeight: 700, color: '#B25575', lineHeight: 1 }}>本{honN}</span>}
                    {banaN > 0 && <span style={{ fontSize: '8px', fontWeight: 700, color: '#7A4060', lineHeight: 1 }}>場{banaN}</span>}
                    {freeN > 0 && <span style={{ fontSize: '8px', fontWeight: 700, color: '#888', lineHeight: 1 }}>フ{freeN}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* 凡例 */}
        <div style={{
          marginTop: '10px', display: 'flex', gap: '12px', flexWrap: 'wrap',
          fontSize: '9px', color: C.pinkMuted,
        }}>
          <span><span style={{ color: '#B25575', fontWeight: 700 }}>本</span> 本指名</span>
          <span><span style={{ color: '#7A4060', fontWeight: 700 }}>場</span> 場内</span>
          <span><span style={{ color: '#888', fontWeight: 700 }}>フ</span> フリー</span>
        </div>
      </div>

      {/* 当日詳細オーバーレイ */}
      {openDay !== null && openBucket && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpenDay(null) }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.45)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div style={{
            background: C.white, width: '100%', maxWidth: 460,
            maxHeight: '85vh', overflowY: 'auto', borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            {/* ヘッダー */}
            <div style={{
              position: 'sticky', top: 0, background: C.white, zIndex: 1,
              padding: '14px 16px 12px', borderBottom: `1px solid ${C.border}`,
              borderRadius: '12px 12px 0 0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>
                  {openDateStr}（{openWd}）
                </div>
                <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 4 }}>
                  接客 {openCount}件 ・ 売上 {formatYen(openTotal)}
                </div>
              </div>
              <button onClick={() => setOpenDay(null)} style={{
                background: '#F5F0F2', border: 'none', fontSize: 14,
                color: C.pinkMuted, cursor: 'pointer',
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            </div>

            <div style={{ padding: '12px 16px 16px' }}>
              <Section
                label="本指名"
                color="#B25575"
                bg="#FBEAF0"
                rows={openBucket.honshimei}
                onClick={(cid) => { setOpenDay(null); setSelectedCustomerId(cid) }}
                showCast={me?.role !== 'cast'}
                formatYen={formatYen}
              />
              <BanaiSection
                visits={openBucket.banai}
                firsts={openBucket.banaiFirsts}
                onClick={(cid) => { setOpenDay(null); setSelectedCustomerId(cid) }}
                showCast={me?.role !== 'cast'}
                formatYen={formatYen}
              />
              <Section
                label="フリー"
                color="#888"
                bg="#F0F0F0"
                rows={openBucket.free}
                onClick={(cid) => { setOpenDay(null); setSelectedCustomerId(cid) }}
                showCast={me?.role !== 'cast'}
                formatYen={formatYen}
              />
              {openCount === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: 11, color: C.pinkMuted }}>
                  この日の接客記録はありません
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 顧客詳細オーバーレイ */}
      {selectedCustomerId && (
        <>
          <div
            onClick={() => setSelectedCustomerId(null)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.3)', zIndex: 100,
            }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
            background: C.bg, zIndex: 101, overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}>
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              background: C.headerBg, borderBottom: `1px solid ${C.border}`,
              padding: '10px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button onClick={() => setSelectedCustomerId(null)} style={{
                background: 'transparent', border: 'none', color: C.pink,
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              }}>← 戻る</button>
              <span style={{ fontSize: 11, letterSpacing: '0.15em', color: C.dark, fontWeight: 600 }}>
                顧客詳細
              </span>
              <div style={{ width: 60 }} />
            </div>
            <CustomerDetailPanel
              customerId={selectedCustomerId}
              isPC={false}
              isAdmin={me?.role === 'admin' || me?.is_owner === true}
            />
          </div>
        </>
      )}

      <BottomNav />
    </div>
  )
}

// ─── 各セクション ─────────────────────────────────────────
function Section({ label, color, bg, rows, onClick, showCast, formatYen }: {
  label: string
  color: string
  bg: string
  rows: VisitRow[]
  onClick: (customerId: string) => void
  showCast: boolean
  formatYen: (n: number) => string
}) {
  if (rows.length === 0) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color, background: bg,
          padding: '3px 10px', borderRadius: 10,
        }}>{label}</span>
        <span style={{ fontSize: 10, color: C.pinkMuted }}>{rows.length}件</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(v => (
          <button
            key={v.id}
            onClick={() => onClick(v.customer_id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px',
              background: '#FFF8FA', border: `1px solid ${C.border}`, borderRadius: 6,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
              borderLeft: `3px solid ${color}`,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: C.dark,
                  textDecoration: 'underline', textDecorationColor: 'rgba(232,120,154,0.3)',
                }}>{v.customer_name}</span>
                {showCast && v.cast_name && (
                  <span style={{
                    fontSize: 9, color: C.pinkMuted,
                    background: '#FFF', padding: '1px 6px', border: `1px solid ${C.border}`, borderRadius: 8,
                  }}>{v.cast_name}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, fontSize: 9 }}>
                {v.table_number && <span style={{ color: C.pinkMuted }}>卓 {v.table_number}</span>}
                {v.has_douhan && (
                  <span style={{ background: '#E8789A', color: '#FFF', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>同</span>
                )}
                {v.has_after && (
                  <span style={{ background: '#D4607A', color: '#FFF', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>ア</span>
                )}
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.pink, whiteSpace: 'nowrap' }}>
              {v.amount_spent > 0 ? formatYen(v.amount_spent) : '—'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function BanaiSection({ visits, firsts, onClick, showCast, formatYen }: {
  visits: VisitRow[]
  firsts: FirstBanaiRow[]
  onClick: (customerId: string) => void
  showCast: boolean
  formatYen: (n: number) => string
}) {
  if (visits.length === 0 && firsts.length === 0) return null
  const total = visits.length + firsts.length
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#7A4060', background: '#F4E4EE',
          padding: '3px 10px', borderRadius: 10,
        }}>場内</span>
        <span style={{ fontSize: 10, color: C.pinkMuted }}>{total}件</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visits.map(v => (
          <button
            key={v.id}
            onClick={() => onClick(v.customer_id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px',
              background: '#FFF8FA', border: `1px solid ${C.border}`, borderRadius: 6,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
              borderLeft: `3px solid #7A4060`,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: C.dark,
                  textDecoration: 'underline', textDecorationColor: 'rgba(232,120,154,0.3)',
                }}>{v.customer_name}</span>
                {showCast && v.cast_name && (
                  <span style={{
                    fontSize: 9, color: C.pinkMuted,
                    background: '#FFF', padding: '1px 6px', border: `1px solid ${C.border}`, borderRadius: 8,
                  }}>{v.cast_name}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, fontSize: 9 }}>
                {v.table_number && <span style={{ color: C.pinkMuted }}>卓 {v.table_number}</span>}
                {v.has_douhan && (
                  <span style={{ background: '#E8789A', color: '#FFF', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>同</span>
                )}
                {v.has_after && (
                  <span style={{ background: '#D4607A', color: '#FFF', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>ア</span>
                )}
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.pink, whiteSpace: 'nowrap' }}>
              {v.amount_spent > 0 ? formatYen(v.amount_spent) : '—'}
            </span>
          </button>
        ))}
        {firsts.map(f => (
          <button
            key={`first-${f.customer_id}`}
            onClick={() => onClick(f.customer_id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px',
              background: '#F4E4EE', border: `1px solid ${C.border}`, borderRadius: 6,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
              borderLeft: `3px solid #7A4060`,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: C.dark,
                  textDecoration: 'underline', textDecorationColor: 'rgba(232,120,154,0.3)',
                }}>{f.customer_name}</span>
                {showCast && f.cast_name && (
                  <span style={{
                    fontSize: 9, color: C.pinkMuted,
                    background: '#FFF', padding: '1px 6px', border: `1px solid ${C.border}`, borderRadius: 8,
                  }}>{f.cast_name}</span>
                )}
                <span style={{ fontSize: 9, color: '#7A4060', fontWeight: 600 }}>初回来店</span>
              </div>
            </div>
            <span style={{ fontSize: 11, color: C.pinkMuted }}>—</span>
          </button>
        ))}
      </div>
    </div>
  )
}
