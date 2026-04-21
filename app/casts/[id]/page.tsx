'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCasts } from '@/hooks/useCasts'
import BottomNav from '@/components/BottomNav'
import { C } from '@/lib/colors'
import { CastProfile, CastKPI, CastShift, CastTierTarget, CastTarget, Customer } from '@/types'
import { createClient } from '@/lib/supabase/client'

type Tab = 'KPI' | 'SALES' | 'SHIFT' | 'CUSTOMERS'

export default function CastDetailPage() {
  const params = useParams()
  const router = useRouter()
  const castId = params.id as string

  const supabase = useMemo(() => createClient(), [])
  const { getCast, getCastKPI, getShifts, upsertShift, getTierTargets, getCastTarget } = useCasts()

  const [cast, setCast] = useState<CastProfile | null>(null)
  const [kpi, setKpi] = useState<CastKPI | null>(null)
  const [shifts, setShifts] = useState<CastShift[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [tierTarget, setTierTarget] = useState<CastTierTarget | null>(null)
  const [castTarget, setCastTarget] = useState<CastTarget | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('KPI')
  const [loading, setLoading] = useState(true)

  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-')
    return `${y}年${Number(m)}月`
  }, [month])

  const changeMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // データ取得
  useEffect(() => {
    if (!castId) return
    const fetchData = async () => {
      setLoading(true)
      const castData = await getCast(castId)
      if (!castData) {
        setLoading(false)
        return
      }
      setCast(castData)

      const [kpiData, shiftData, tierTargets, ct] = await Promise.all([
        getCastKPI(castData.cast_name, month),
        getShifts(castId, month),
        getTierTargets(month),
        getCastTarget(castId, month),
      ])

      // ノルマ反映: 個人目標 > 層ベース
      const tt = castData.cast_tier
        ? tierTargets.find(t => t.tier === castData.cast_tier) ?? null
        : null
      setTierTarget(tt)
      setCastTarget(ct)

      const effectiveSalesTarget = ct?.target_sales ?? tt?.target_sales ?? 0
      const achievementRate = effectiveSalesTarget > 0
        ? Math.round((kpiData.monthlySales / effectiveSalesTarget) * 100)
        : 0

      setKpi({
        ...kpiData,
        targetSales: effectiveSalesTarget,
        achievementRate,
      })
      setShifts(shiftData)

      // 担当顧客一覧
      const { data: custData } = await supabase
        .from('customers')
        .select('*')
        .eq('cast_name', castData.cast_name)
        .order('customer_rank', { ascending: true })

      if (custData) setCustomers(custData as Customer[])
      setLoading(false)
    }
    fetchData()
  }, [castId, month, getCast, getCastKPI, getShifts, getTierTargets, getCastTarget, supabase])

  // シフト更新
  const handleShiftToggle = useCallback(async (date: string, current: CastShift | undefined) => {
    const statuses: CastShift['status'][] = ['出勤', '休み', '希望出勤', '希望休み', '未定']
    const currentIdx = current ? statuses.indexOf(current.status) : -1
    const nextStatus = statuses[(currentIdx + 1) % statuses.length]
    const result = await upsertShift(castId, date, nextStatus)
    if (result) {
      setShifts(prev => {
        const filtered = prev.filter(s => s.shift_date !== date)
        return [...filtered, result].sort((a, b) => a.shift_date.localeCompare(b.shift_date))
      })
    }
  }, [castId, upsertShift])

  const formatYen = (n: number) =>
    n.toLocaleString('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })

  // ─── カレンダー生成（hooksは早期returnの前に置く） ─────────
  const calendarDays = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const firstDay = new Date(y, m - 1, 1).getDay()
    const daysInMonth = new Date(y, m, 0).getDate()
    const days: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    return days
  }, [month])

  const shiftMap = useMemo(() => {
    const map = new Map<string, CastShift>()
    for (const s of shifts) map.set(s.shift_date, s)
    return map
  }, [shifts])

  const workDays = useMemo(() =>
    shifts.filter(s => s.status === '出勤' || s.status === '希望出勤').length
  , [shifts])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{
          width: '32px', height: '32px',
          border: `1px solid ${C.pink}`, borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!cast) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: C.pinkMuted }}>キャストが見つかりません</p>
          <button onClick={() => router.push('/casts')} style={{
            marginTop: '12px', fontSize: '10px', color: C.pink,
            border: `1px solid ${C.pink}`, padding: '8px 20px',
            background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
          }}>一覧に戻る</button>
        </div>
        <BottomNav />
      </div>
    )
  }

  const shiftStatusStyle = (status?: string): React.CSSProperties => {
    switch (status) {
      case '出勤': return { background: C.pink, color: '#fff' }
      case '休み': return { background: '#E0E0E0', color: '#999' }
      case '希望出勤': return { background: '#FFE0E8', color: C.pink }
      case '希望休み': return { background: '#F5F5F5', color: '#BBB' }
      default: return { background: 'transparent', color: C.pinkMuted }
    }
  }

  const shiftStatusLabel = (status?: string) => {
    switch (status) {
      case '出勤': return '出'
      case '休み': return '休'
      case '希望出勤': return '希出'
      case '希望休み': return '希休'
      default: return '–'
    }
  }

  const tabs: Tab[] = ['KPI', 'SALES', 'SHIFT', 'CUSTOMERS']

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: '60px' }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{
          maxWidth: '700px', margin: '0 auto',
          padding: '14px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button onClick={() => router.push('/casts')} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            color: C.pinkMuted, fontSize: '9px', letterSpacing: '0.2em', padding: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            一覧
          </button>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', color: C.dark, fontWeight: 500, letterSpacing: '0.05em' }}>
              {cast.display_name || cast.cast_name}
            </div>
            {cast.cast_tier && (
              <span style={{
                fontSize: '9px', letterSpacing: '0.2em', color: C.pink,
                border: `1px solid ${C.pink}`, padding: '1px 8px',
                display: 'inline-block', marginTop: '3px',
              }}>
                {cast.cast_tier}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={() => changeMonth(-1)} style={{
              background: 'transparent', border: 'none', fontSize: '14px', color: C.pink, cursor: 'pointer', padding: '2px',
            }}>‹</button>
            <span style={{ fontSize: '10px', color: C.dark, letterSpacing: '0.05em', minWidth: '70px', textAlign: 'center' }}>
              {monthLabel}
            </span>
            <button onClick={() => changeMonth(1)} style={{
              background: 'transparent', border: 'none', fontSize: '14px', color: C.pink, cursor: 'pointer', padding: '2px',
            }}>›</button>
          </div>
        </div>
      </div>

      {/* ─── タブ ─── */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${C.border}`,
        background: C.white, maxWidth: '700px', margin: '0 auto',
      }}>
        {tabs.map((tab) => {
          const active = activeTab === tab
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '11px 0',
              fontSize: '10px', letterSpacing: '0.2em', textAlign: 'center',
              color: active ? C.pink : C.pinkMuted,
              fontWeight: active ? 600 : 400,
              background: 'transparent', border: 'none', cursor: 'pointer',
              position: 'relative', fontFamily: 'inherit',
            }}>
              {tab}
              {active && (
                <div style={{
                  position: 'absolute', bottom: 0, left: '20%', right: '20%',
                  height: '2px',
                  background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight})`,
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* ─── コンテンツ ─── */}
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '16px' }}>

        {/* ── KPI タブ ── */}
        {activeTab === 'KPI' && kpi && (
          <div>
            {/* KPIカード群 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              {[
                { label: '月間売上', value: formatYen(kpi.monthlySales), accent: true },
                { label: 'ノルマ', value: kpi.targetSales > 0 ? formatYen(kpi.targetSales) : '未設定' },
                { label: '達成率', value: kpi.targetSales > 0 ? `${kpi.achievementRate}%` : '—' },
                { label: '差額', value: kpi.targetSales > 0 ? formatYen(kpi.monthlySales - kpi.targetSales) : '—' },
              ].map((item, i) => (
                <div key={i} style={{
                  background: C.white, border: `1px solid ${C.border}`,
                  padding: '14px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: C.pinkMuted }}>{item.label}</div>
                  <div style={{
                    fontSize: item.accent ? '20px' : '16px',
                    color: item.accent ? C.pink : C.dark,
                    fontWeight: 500, marginTop: '4px',
                  }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {[
                { label: '担当顧客', value: `${kpi.customerCount}人` },
                { label: '場内追客', value: `${kpi.banaCount}人` },
                { label: '来店組数', value: `${kpi.visitGroups}組` },
                { label: '客単価', value: formatYen(kpi.avgSpend) },
                { label: '出勤日数', value: `${workDays}日` },
                { label: '1出勤あたり', value: workDays > 0 ? formatYen(Math.round(kpi.monthlySales / workDays)) : '—' },
              ].map((item, i) => (
                <div key={i} style={{
                  background: C.white, border: `1px solid ${C.border}`,
                  padding: '12px 8px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '7px', letterSpacing: '0.15em', color: C.pinkMuted }}>{item.label}</div>
                  <div style={{ fontSize: '14px', color: C.dark, fontWeight: 500, marginTop: '3px' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SALES タブ ── */}
        {activeTab === 'SALES' && (
          <div>
            <SalesTab castName={cast.cast_name} month={month} supabase={supabase} />
          </div>
        )}

        {/* ── SHIFT タブ ── */}
        {activeTab === 'SHIFT' && (
          <div>
            <div style={{ fontSize: '9px', color: C.pinkMuted, letterSpacing: '0.2em', marginBottom: '10px' }}>
              タップで切替: 出勤 → 休み → 希望出勤 → 希望休み → 未定
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px',
              background: C.white, border: `1px solid ${C.border}`, padding: '8px',
            }}>
              {['日', '月', '火', '水', '木', '金', '土'].map(d => (
                <div key={d} style={{
                  textAlign: 'center', fontSize: '9px', color: C.pinkMuted,
                  padding: '4px 0', letterSpacing: '0.1em',
                }}>{d}</div>
              ))}
              {calendarDays.map((day, i) => {
                if (day === null) return <div key={`e${i}`} />
                const dateStr = `${month}-${String(day).padStart(2, '0')}`
                const shift = shiftMap.get(dateStr)
                const sStyle = shiftStatusStyle(shift?.status)
                return (
                  <button
                    key={dateStr}
                    onClick={() => handleShiftToggle(dateStr, shift)}
                    style={{
                      width: '100%', aspectRatio: '1',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${C.border}`, cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: '10px',
                      ...sStyle,
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 500 }}>{day}</span>
                    <span style={{ fontSize: '7px', marginTop: '1px' }}>{shiftStatusLabel(shift?.status)}</span>
                  </button>
                )
              })}
            </div>
            <div style={{
              marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap',
              fontSize: '9px', color: C.pinkMuted,
            }}>
              {[
                { label: '出勤', bg: C.pink, fg: '#fff' },
                { label: '休み', bg: '#E0E0E0', fg: '#999' },
                { label: '希望出勤', bg: '#FFE0E8', fg: C.pink },
                { label: '希望休み', bg: '#F5F5F5', fg: '#BBB' },
              ].map(l => (
                <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    width: '12px', height: '12px', background: l.bg,
                    display: 'inline-block', border: `1px solid ${C.border}`,
                  }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── CUSTOMERS タブ ── */}
        {activeTab === 'CUSTOMERS' && (
          <div>
            {customers.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.2em' }}>
                  担当顧客がいません
                </p>
              </div>
            ) : (
              <div style={{ border: `1px solid ${C.border}`, borderBottom: 'none' }}>
                {customers.map(cust => (
                  <div
                    key={cust.id}
                    onClick={() => router.push(`/customer/${cust.id}`)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 16px', background: C.white,
                      borderBottom: `1px solid ${C.border}`,
                      cursor: 'pointer', transition: 'background 0.15s',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', color: C.dark, fontWeight: 500 }}>
                        {cust.customer_name}
                        {cust.nickname && (
                          <span style={{ fontSize: '10px', color: C.pinkMuted, marginLeft: '6px' }}>
                            ({cust.nickname})
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '9px', color: C.pinkMuted, marginTop: '2px' }}>
                        {cust.phase} · {cust.customer_rank}ランク · {cust.age_group}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        fontSize: '10px', letterSpacing: '0.15em',
                        color: C.pink, border: `1px solid ${C.pink}`,
                        padding: '2px 8px',
                      }}>
                        {cust.customer_rank}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── SALES サブコンポーネント ──────────────────────────────────
function SalesTab({ castName, month, supabase }: {
  castName: string
  month: string
  supabase: ReturnType<typeof createClient>
}) {
  const [visits, setVisits] = useState<Array<{
    id: string; customer_id: string; visit_date: string;
    amount_spent: number; memo: string; customer_name?: string
  }>>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const startDate = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const endDate = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`

      // 担当顧客ID取得
      const { data: custs } = await supabase
        .from('customers')
        .select('id, customer_name')
        .eq('cast_name', castName)

      if (!custs || custs.length === 0) {
        setLoaded(true)
        return
      }

      const custMap = new Map(custs.map(c => [c.id, c.customer_name]))
      const custIds = custs.map(c => c.id)

      const { data: visitData } = await supabase
        .from('customer_visits')
        .select('id, customer_id, visit_date, amount_spent, memo')
        .in('customer_id', custIds)
        .gte('visit_date', startDate)
        .lte('visit_date', endDate)
        .order('visit_date', { ascending: false })

      if (visitData) {
        setVisits(visitData.map(v => ({
          ...v,
          amount_spent: Number(v.amount_spent) || 0,
          customer_name: custMap.get(v.customer_id) ?? '不明',
        })))
      }
      setLoaded(true)
    }
    fetch()
  }, [castName, month, supabase])

  const formatYen = (n: number) =>
    n.toLocaleString('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })

  if (!loaded) {
    return <div style={{ padding: '40px', textAlign: 'center', fontSize: '9px', color: C.pinkMuted }}>読み込み中...</div>
  }

  if (visits.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.2em' }}>
          この月の来店データがありません
        </p>
      </div>
    )
  }

  const total = visits.reduce((s, v) => s + v.amount_spent, 0)

  return (
    <div>
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '14px', textAlign: 'center', marginBottom: '12px',
      }}>
        <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: C.pinkMuted }}>月間合計</div>
        <div style={{ fontSize: '22px', color: C.pink, fontWeight: 500, marginTop: '4px' }}>
          {formatYen(total)}
        </div>
        <div style={{ fontSize: '9px', color: C.pinkMuted, marginTop: '2px' }}>
          {visits.length}件の来店
        </div>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderBottom: 'none' }}>
        {visits.map(v => (
          <div key={v.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', background: C.white,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <div>
              <div style={{ fontSize: '13px', color: C.dark, fontWeight: 500 }}>
                {v.customer_name}
              </div>
              <div style={{ fontSize: '9px', color: C.pinkMuted, marginTop: '2px' }}>
                {v.visit_date}
                {v.memo && ` · ${v.memo}`}
              </div>
            </div>
            <div style={{ fontSize: '14px', color: C.pink, fontWeight: 500 }}>
              {formatYen(v.amount_spent)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
