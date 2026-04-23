'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCasts } from '@/hooks/useCasts'
import BottomNav from '@/components/BottomNav'
import { C } from '@/lib/colors'
import { CastProfile, CastKPI, CastShift, CastTierTarget, CastTarget, Customer, CAST_TIERS } from '@/types'
import { createClient } from '@/lib/supabase/client'
import CastKPITab from '@/components/CastKPITab'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import CastSettingTab from '@/components/CastSettingTab'

type Tab = 'KPI' | 'SALES' | 'SHIFT' | 'CUSTOMERS' | 'SETTING'

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
  const [allCasts, setAllCasts] = useState<CastProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [canViewReport, setCanViewReport] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

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

  // キャスト一覧取得（サイドバー用）
  useEffect(() => {
    const fetchCasts = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'cast')
          .eq('is_active', true)
          .order('cast_name', { ascending: true })
        if (data) setAllCasts(data as CastProfile[])
      } catch { /* ignore */ }
    }
    fetchCasts()
  }, [supabase])

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

      // 管理者判定 + 権限取得
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        const admin = profile?.role === 'admin'
        setIsAdmin(admin)

        if (admin) {
          // 権限チェック
          try {
            const meRes = await fetch('/api/auth/me')
            if (meRes.ok) {
              const meData = await meRes.json()
              // オーナーは全権限あり。スタッフはレポート閲覧権限を確認
              setCanViewReport(meData.is_owner === true || meData.permissions?.['レポート閲覧'] === true)
            }
          } catch { /* ignore */ }
        } else {
          // キャストは自分のレポートを見れる
          setCanViewReport(true)
        }
      }

      const [kpiData, shiftData, tierTargets, ct] = await Promise.all([
        getCastKPI(castData.cast_name, month, castId),
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
  }, [castId, month, refreshKey, getCast, getCastKPI, getShifts, getTierTargets, getCastTarget, supabase])

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

  const tabs: Tab[] = isAdmin
    ? ['KPI', 'SALES', 'SHIFT', 'CUSTOMERS', 'SETTING']
    : ['KPI', 'SALES', 'SHIFT', 'CUSTOMERS']

  const sidebarWidth = 180

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: '60px', display: 'flex' }}>
      {/* ─── キャスト一覧サイドバー（PC only） ─── */}
      {allCasts.length > 0 && (
        <div className="cast-sidebar" style={{
          width: sidebarWidth, minWidth: sidebarWidth,
          background: C.headerBg,
          borderRight: `1px solid ${C.border}`,
          position: 'sticky', top: 0, height: '100vh',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          <div style={{
            padding: '14px 12px 8px',
            fontSize: '8px', letterSpacing: '0.25em', color: C.pinkMuted, fontWeight: 600,
          }}>CAST LIST</div>
          {(() => {
            // 層ごとにグループ化
            const tierGroups = CAST_TIERS.map(tier => ({
              tier,
              casts: allCasts.filter(c => c.cast_tier === tier),
            }))
            // 未設定の層
            const unset = allCasts.filter(c => !c.cast_tier)
            if (unset.length > 0) {
              tierGroups.push({ tier: '未設定' as never, casts: unset })
            }
            return tierGroups.filter(g => g.casts.length > 0).map(group => (
              <div key={group.tier}>
                <div style={{
                  padding: '8px 12px 4px',
                  fontSize: '9px', fontWeight: 700,
                  color: C.pink, letterSpacing: '0.1em',
                  borderBottom: `1px solid ${C.border}`,
                  marginTop: '4px',
                }}>
                  {group.tier}
                  <span style={{ color: C.pinkMuted, fontWeight: 400, marginLeft: '4px' }}>
                    {group.casts.length}人
                  </span>
                </div>
                {group.casts.map(c => {
                  const isActive = c.id === castId
                  return (
                    <div
                      key={c.id}
                      onClick={() => router.push(`/casts/${c.id}`)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        background: isActive ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})` : 'transparent',
                        color: isActive ? '#FFF' : C.dark,
                        borderLeft: isActive ? `3px solid ${C.pink}` : '3px solid transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: isActive ? 600 : 400, letterSpacing: '0.05em' }}>
                        {c.display_name || c.cast_name}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          })()}
        </div>
      )}

      {/* ─── メインコンテンツ ─── */}
      <div style={{ flex: 1, minWidth: 0 }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{
          maxWidth: activeTab === 'SALES' ? '1400px' : '700px', margin: '0 auto',
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
        background: C.white, maxWidth: activeTab === 'SALES' ? '1400px' : '700px', margin: '0 auto',
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
      <div style={{ maxWidth: activeTab === 'SALES' ? '1400px' : '700px', margin: '0 auto', padding: '16px' }}>
        {/* お知らせバナー */}
        <AnnouncementBanner />
      </div>
      <div style={{ maxWidth: activeTab === 'SALES' ? '1400px' : '700px', margin: '0 auto', padding: '0 16px 16px' }}>

        {/* ── KPI タブ ── */}
        {activeTab === 'KPI' && !canViewReport && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.pinkMuted, fontSize: '13px' }}>
            レポート閲覧の権限がありません
          </div>
        )}
        {activeTab === 'KPI' && canViewReport && kpi && (
          <CastKPITab
            castId={castId}
            castName={cast.cast_name}
            month={month}
            kpi={kpi}
            castTarget={castTarget}
            workDays={workDays}
          />
        )}

        {/* ── SALES タブ ── */}
        {activeTab === 'SALES' && (
          <div>
            <SalesTab castName={cast.cast_name} castId={castId} month={month} supabase={supabase} onCustomerClick={(cid) => router.push(`/customer/${cid}`)} isAdmin={isAdmin} />
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

        {/* ── SETTING タブ（管理者専用） ── */}
        {activeTab === 'SETTING' && (
          <CastSettingTab castId={castId} month={month} isAdmin={isAdmin}
            onSave={() => setRefreshKey(k => k + 1)} />
        )}
      </div>

      <BottomNav />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .cast-sidebar { display: none; }
        @media (min-width: 900px) {
          .cast-sidebar { display: block !important; }
        }
      `}</style>
      </div>{/* メインコンテンツ end */}
    </div>
  )
}

// ─── SALES サブコンポーネント（スプレッドシート風カレンダーグリッド） ───
function SalesTab({ castName, castId, month, supabase, onCustomerClick, isAdmin }: {
  castName: string
  castId: string
  month: string
  supabase: ReturnType<typeof createClient>
  onCustomerClick?: (customerId: string) => void
  isAdmin?: boolean
}) {
  const [visits, setVisits] = useState<Array<{
    id: string; customer_id: string; visit_date: string;
    amount_spent: number; party_size: number;
    has_douhan: boolean; has_after: boolean; is_planned: boolean;
    memo: string; customer_name?: string
  }>>([])
  const [allCustomers, setAllCustomers] = useState<string[]>([])
  const [customerIdMap, setCustomerIdMap] = useState<Map<string, string>>(new Map())
  const [customerRegionMap, setCustomerRegionMap] = useState<Map<string, string>>(new Map())
  const [customerVisitCountMap, setCustomerVisitCountMap] = useState<Map<string, number>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [sortKeys, setSortKeys] = useState<Array<'region' | 'visits' | 'amount'>>([])

  // 来店予定
  type PV = { id: number; customer_id: number; planned_date: string; planned_time: string | null; party_size: number | null; has_douhan: boolean | null; memo: string | null; status: string; customer_name: string; cast_name: string }
  const [plannedVisits, setPlannedVisits] = useState<PV[]>([])

  const fetchPlannedVisits = useCallback(async () => {
    try {
      const res = await fetch(`/api/planned-visits?cast_id=${castId}&month=${month}`)
      if (res.ok) {
        const data = await res.json()
        setPlannedVisits(Array.isArray(data) ? data : [])
      }
    } catch { /* ignore */ }
  }, [castId, month])

  useEffect(() => { fetchPlannedVisits() }, [fetchPlannedVisits])

  // セル直接入力（管理者のみ）
  const [editCell, setEditCell] = useState<{ customerName: string; day: number } | null>(null)
  const [cellForm, setCellForm] = useState({
    amount_spent: '', party_size: '1',
    has_douhan: false, has_after: false, is_planned: false,
    companion_honshimei: '', companion_banai: '', memo: '',
  })
  // 来店予定の編集
  const [editPlanned, setEditPlanned] = useState<PV | null>(null)
  const [pvForm, setPvForm] = useState({
    planned_date: '', planned_time: '', party_size: '', has_douhan: false, memo: '',
  })

  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  useEffect(() => {
    const fetchSales = async () => {
      const startDate = `${month}-01`
      const endDate = `${month}-${String(daysInMonth).padStart(2, '0')}`

      const { data: custs } = await supabase
        .from('customers')
        .select('id, customer_name, region')
        .eq('cast_name', castName)
        .order('customer_name', { ascending: true })

      if (!custs || custs.length === 0) {
        setLoaded(true)
        return
      }

      const custMap = new Map(custs.map(c => [c.id, c.customer_name]))
      const custIds = custs.map(c => c.id)
      // 重複名をIDで区別するためID一覧をベースにする
      const uniqueNames: string[] = []
      const seenNames = new Set<string>()
      for (const c of custs) {
        if (!seenNames.has(c.customer_name)) {
          uniqueNames.push(c.customer_name)
          seenNames.add(c.customer_name)
        }
      }
      setAllCustomers(uniqueNames)
      setCustomerIdMap(new Map(custs.map(c => [c.customer_name, c.id])))
      setCustomerRegionMap(new Map(custs.map(c => [c.customer_name, c.region || ''])))

      // 全期間の来店回数を取得
      const { data: allVisits } = await supabase
        .from('customer_visits')
        .select('customer_id')
        .in('customer_id', custIds)
      const vcMap = new Map<string, number>()
      allVisits?.forEach(v => {
        const name = custMap.get(v.customer_id) ?? ''
        vcMap.set(name, (vcMap.get(name) ?? 0) + 1)
      })
      setCustomerVisitCountMap(vcMap)

      const { data: visitData } = await supabase
        .from('customer_visits')
        .select('id, customer_id, visit_date, amount_spent, party_size, has_douhan, has_after, is_planned, memo')
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
    fetchSales()
  }, [castName, month, supabase, daysInMonth])

  const formatYen = (n: number) =>
    n.toLocaleString('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })

  const shortYen = (n: number) => {
    if (n >= 10000) return `¥${Math.round(n / 10000)}万`
    if (n >= 1000) return `¥${(n / 1000).toFixed(0)}K`
    return `¥${n}`
  }

  // セルクリック → 来店記録 + 来店予定の両方を操作可能に
  const handleCellClick = (customerName: string, day: number) => {
    const existing = visitGrid.get(`${customerName}-${day}`)
    const planned = plannedGrid.get(`${customerName}-${day}`)

    // 来店予定があれば編集フォームにセット
    if (planned) {
      setEditPlanned(planned)
      setPvForm({
        planned_date: planned.planned_date,
        planned_time: planned.planned_time || '',
        party_size: planned.party_size ? String(planned.party_size) : '',
        has_douhan: planned.has_douhan ?? false,
        memo: planned.memo || '',
      })
    } else {
      setEditPlanned(null)
      // 新規来店予定用のフォーム初期値
      const dateStr = `${month}-${String(day).padStart(2, '0')}`
      setPvForm({
        planned_date: dateStr,
        planned_time: '',
        party_size: '',
        has_douhan: false,
        memo: '',
      })
    }

    // 来店記録のフォームもセット
    if (existing) {
      setCellForm({
        amount_spent: String(existing.amount_spent || ''),
        party_size: String(existing.party_size || 1),
        has_douhan: existing.has_douhan ?? false,
        has_after: existing.has_after ?? false,
        is_planned: existing.is_planned ?? false,
        companion_honshimei: '', companion_banai: '',
        memo: existing.memo || '',
      })
    } else {
      setCellForm({
        amount_spent: '', party_size: '1',
        has_douhan: false, has_after: false, is_planned: false,
        companion_honshimei: '', companion_banai: '', memo: '',
      })
    }
    setEditCell({ customerName, day })
  }

  // セル保存
  const handleCellSave = async () => {
    if (!editCell) return
    const customerId = customerIdMap.get(editCell.customerName)
    if (!customerId) return
    const visitDate = `${month}-${String(editCell.day).padStart(2, '0')}`
    const existing = visitGrid.get(`${editCell.customerName}-${editCell.day}`)

    const payload = {
      visit_date: visitDate,
      amount_spent: Number(cellForm.amount_spent) || 0,
      party_size: Number(cellForm.party_size) || 1,
      has_douhan: cellForm.has_douhan,
      has_after: cellForm.has_after,
      is_planned: cellForm.is_planned,
      companion_honshimei: cellForm.companion_honshimei,
      companion_banai: cellForm.companion_banai,
      memo: cellForm.memo,
    }

    if (existing) {
      // 更新
      const { data } = await supabase
        .from('customer_visits')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single()
      if (data) {
        setVisits(prev => prev.map(v => v.id === existing.id
          ? { ...data, amount_spent: Number(data.amount_spent) || 0, customer_name: editCell.customerName }
          : v))
      }
    } else {
      // 新規
      const { data } = await supabase
        .from('customer_visits')
        .insert({ ...payload, customer_id: customerId })
        .select()
        .single()
      if (data) {
        setVisits(prev => [
          { ...data, amount_spent: Number(data.amount_spent) || 0, customer_name: editCell.customerName },
          ...prev,
        ])
      }
    }
    setEditCell(null)
  }

  // セル削除
  const handleCellDelete = async () => {
    if (!editCell) return
    const existing = visitGrid.get(`${editCell.customerName}-${editCell.day}`)
    if (!existing) return
    if (!window.confirm('この来店記録を削除しますか？')) return
    await supabase.from('customer_visits').delete().eq('id', existing.id)
    setVisits(prev => prev.filter(v => v.id !== existing.id))
    setEditCell(null)
  }

  if (!loaded) {
    return <div style={{ padding: '40px', textAlign: 'center', fontSize: '9px', color: C.pinkMuted }}>読み込み中...</div>
  }

  if (allCustomers.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.2em' }}>
          担当顧客がいません
        </p>
      </div>
    )
  }

  const total = visits.reduce((s, v) => s + v.amount_spent, 0)

  // 顧客ごと合計（並び替えで使うため先に計算）
  const customerTotals = new Map<string, number>()
  for (const v of visits) {
    customerTotals.set(v.customer_name!, (customerTotals.get(v.customer_name!) ?? 0) + v.amount_spent)
  }

  // 全担当顧客を表示（来店ありを上に、なしを下に）
  const visitedNames = new Set(visits.map(v => v.customer_name!))
  // 月間来店回数（当月）
  const monthlyVisitCount = new Map<string, number>()
  visits.forEach(v => {
    monthlyVisitCount.set(v.customer_name!, (monthlyVisitCount.get(v.customer_name!) ?? 0) + 1)
  })

  let customerNames = [
    ...allCustomers.filter(n => visitedNames.has(n)),
    ...allCustomers.filter(n => !visitedNames.has(n)),
  ]

  // 並び替え（複数条件対応：先に選んだ条件が優先）
  if (sortKeys.length > 0) {
    customerNames = [...customerNames].sort((a, b) => {
      for (const key of sortKeys) {
        let cmp = 0
        if (key === 'region') {
          const rA = customerRegionMap.get(a) ?? ''
          const rB = customerRegionMap.get(b) ?? ''
          const aF = rA === '福岡県' ? 0 : 1
          const bF = rB === '福岡県' ? 0 : 1
          cmp = aF !== bF ? aF - bF : rA.localeCompare(rB)
        } else if (key === 'visits') {
          cmp = (customerVisitCountMap.get(b) ?? 0) - (customerVisitCountMap.get(a) ?? 0)
        } else if (key === 'amount') {
          cmp = (customerTotals.get(b) ?? 0) - (customerTotals.get(a) ?? 0)
        }
        if (cmp !== 0) return cmp
      }
      return 0
    })
  }
  // 顧客×日付 → visit のマップ
  const visitGrid = new Map<string, typeof visits[0]>()
  for (const v of visits) {
    const day = Number(v.visit_date.split('-')[2])
    const key = `${v.customer_name}-${day}`
    visitGrid.set(key, v)
  }

  // 顧客×日付 → planned_visit のマップ
  const plannedGrid = new Map<string, PV>()
  for (const pv of plannedVisits) {
    const day = Number(pv.planned_date.split('-')[2])
    const key = `${pv.customer_name}-${day}`
    plannedGrid.set(key, pv)
  }

  // 日付ごと合計
  const dayTotals = new Map<number, number>()
  for (const v of visits) {
    const day = Number(v.visit_date.split('-')[2])
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + v.amount_spent)
  }

  const cellW = 52
  const nameColW = 120
  const totalColW = 70
  const weekDay = (d: number) => ['日','月','火','水','木','金','土'][new Date(y, m - 1, d).getDay()]

  return (
    <div>
      {/* 月間合計ヘッダー */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: C.white, border: `1px solid ${C.border}`,
        padding: '14px 16px', marginBottom: '10px',
      }}>
        <div>
          <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: C.pinkMuted }}>月間合計</div>
          <div style={{ fontSize: '22px', color: C.pink, fontWeight: 500, marginTop: '2px' }}>
            {formatYen(total)}
          </div>
        </div>
        <div style={{ fontSize: '10px', color: C.pinkMuted, textAlign: 'right' }}>
          {visits.length}件の来店<br />{visitedNames.size}/{allCustomers.length}名来店
        </div>
      </div>

      {/* ── 来店予定セクション ── */}
      {plannedVisits.filter(pv => pv.status === '予定').length > 0 && (
        <div style={{
          background: C.white, border: `1px solid ${C.border}`,
          padding: '12px 14px', marginBottom: '10px',
        }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: C.pinkMuted, marginBottom: '8px' }}>
            来店予定（{plannedVisits.filter(pv => pv.status === '予定').length}件）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {plannedVisits.filter(pv => pv.status === '予定').map(pv => (
              <div key={pv.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px', background: '#FFF8F0',
                border: `1px solid #FFE0B2`,
              }}>
                <div>
                  <div style={{ fontSize: '12px', color: C.dark, fontWeight: 500 }}>
                    {pv.customer_name}
                  </div>
                  <div style={{ fontSize: '9px', color: C.pinkMuted, marginTop: '2px' }}>
                    {pv.planned_date}
                    {pv.planned_time && ` ${pv.planned_time}`}
                    {pv.party_size && ` · ${pv.party_size}名`}
                    {pv.has_douhan && ' · 同伴'}
                    {pv.memo && ` · ${pv.memo}`}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={async () => {
                        if (!window.confirm(`${pv.customer_name}さんを来店済みにしますか？`)) return
                        const res = await fetch(`/api/planned-visits/${pv.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: '来店済み' }),
                        })
                        if (res.ok) fetchPlannedVisits()
                      }}
                      style={{
                        padding: '5px 10px', fontSize: '9px', fontFamily: 'inherit',
                        background: C.pink, color: '#FFF', border: 'none',
                        cursor: 'pointer', letterSpacing: '0.05em',
                      }}
                    >来店済み</button>
                    <button
                      onClick={async () => {
                        if (!window.confirm(`${pv.customer_name}さんの予定をキャンセルしますか？`)) return
                        const res = await fetch(`/api/planned-visits/${pv.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: 'キャンセル' }),
                        })
                        if (res.ok) fetchPlannedVisits()
                      }}
                      style={{
                        padding: '5px 10px', fontSize: '9px', fontFamily: 'inherit',
                        background: 'transparent', color: '#D45060',
                        border: `1px solid #D45060`,
                        cursor: 'pointer', letterSpacing: '0.05em',
                      }}
                    >キャンセル</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ソートボタン（複数選択可・クリック順で優先度） */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '6px', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <button onClick={() => setSortKeys([])} style={{
          padding: '5px 10px', fontSize: '9px', fontFamily: 'inherit',
          background: sortKeys.length === 0 ? C.pink : 'transparent',
          color: sortKeys.length === 0 ? C.white : C.pinkMuted,
          border: `1px solid ${sortKeys.length === 0 ? C.pink : C.border}`,
          cursor: 'pointer', letterSpacing: '0.1em',
        }}>標準</button>
        {([
          { key: 'amount' as const, label: '金額順' },
          { key: 'visits' as const, label: '回数順' },
          { key: 'region' as const, label: '地域順' },
        ]).map(s => {
          const idx = sortKeys.indexOf(s.key)
          const active = idx >= 0
          return (
            <button key={s.key} onClick={() => {
              setSortKeys(prev =>
                prev.includes(s.key)
                  ? prev.filter(k => k !== s.key)
                  : [...prev, s.key]
              )
            }} style={{
              padding: '5px 10px', fontSize: '9px', fontFamily: 'inherit',
              background: active ? C.pink : 'transparent',
              color: active ? C.white : C.pinkMuted,
              border: `1px solid ${active ? C.pink : C.border}`,
              cursor: 'pointer', letterSpacing: '0.1em',
            }}>{active && sortKeys.length > 1 ? `${idx + 1}. ` : ''}{s.label}</button>
          )
        })}
      </div>

      {/* スプレッドシート風グリッド */}
      <div style={{
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        border: `1px solid ${C.border}`, background: C.white,
      }}>
        <table style={{
          borderCollapse: 'collapse', fontSize: '10px',
          minWidth: `${nameColW + totalColW + dates.length * cellW}px`,
        }}>
          <thead>
            {/* 日付ヘッダー行 */}
            <tr>
              <th style={{
                position: 'sticky', left: 0, zIndex: 3,
                background: '#F8F2F4', padding: '6px 8px',
                borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`,
                fontSize: '8px', letterSpacing: '0.15em', color: C.pinkMuted,
                width: nameColW, minWidth: nameColW, textAlign: 'left',
              }}>顧客</th>
              <th style={{
                position: 'sticky', left: nameColW, zIndex: 3,
                background: '#F8F2F4', padding: '6px 4px',
                borderBottom: `1px solid ${C.border}`, borderRight: `2px solid ${C.border}`,
                fontSize: '8px', letterSpacing: '0.1em', color: C.pinkMuted,
                width: totalColW, minWidth: totalColW, textAlign: 'center',
              }}>合計</th>
              {dates.map(d => {
                const wd = weekDay(d)
                const isSun = wd === '日'
                const isSat = wd === '土'
                const hasVisit = dayTotals.has(d)
                return (
                  <th key={d} style={{
                    padding: '4px 2px',
                    borderBottom: `1px solid ${C.border}`,
                    borderRight: `1px solid ${wd === '土' ? C.border : '#F5F0F2'}`,
                    background: hasVisit ? '#FFF5F7' : '#F8F2F4',
                    textAlign: 'center', width: cellW, minWidth: cellW,
                    color: isSun ? '#D45060' : isSat ? '#5080C0' : C.pinkMuted,
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 500 }}>{d}</div>
                    <div style={{ fontSize: '7px' }}>{wd}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {customerNames.map((name, ri) => (
              <tr key={name}>
                {/* 顧客名（固定列・タップで顧客詳細へ） */}
                <td
                  onClick={() => {
                    const cid = customerIdMap.get(name)
                    if (cid && onCustomerClick) onCustomerClick(cid)
                  }}
                  style={{
                    position: 'sticky', left: 0, zIndex: 2,
                    background: ri % 2 === 0 ? C.white : '#FDFAFB',
                    padding: '6px 6px', fontWeight: 500, color: C.pink,
                    borderBottom: `1px solid #F5F0F2`, borderRight: `1px solid ${C.border}`,
                    maxWidth: nameColW, fontSize: '11px',
                    cursor: 'pointer',
                  }}>
                    <div style={{
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      textDecoration: 'underline',
                      textDecorationColor: 'rgba(232,120,154,0.3)',
                      textUnderlineOffset: '2px',
                    }}>{name}</div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '2px', fontSize: '8px', fontWeight: 400 }}>
                      {customerRegionMap.get(name) && (
                        <span style={{ color: C.pinkMuted }}>{customerRegionMap.get(name)?.replace('県', '').replace('都', '').replace('府', '')}</span>
                      )}
                      <span style={{ color: C.pinkMuted }}>
                        {customerVisitCountMap.get(name) ?? 0}回
                      </span>
                    </div>
                  </td>
                {/* 顧客合計 */}
                <td style={{
                  position: 'sticky', left: nameColW, zIndex: 2,
                  background: ri % 2 === 0 ? '#FFF8F9' : '#FFF5F7',
                  padding: '8px 4px', textAlign: 'center',
                  borderBottom: `1px solid #F5F0F2`, borderRight: `2px solid ${C.border}`,
                  color: customerTotals.has(name) ? C.pink : C.pinkMuted,
                  fontWeight: 600, fontSize: '11px',
                }}>{customerTotals.has(name) ? formatYen(customerTotals.get(name)!) : '—'}</td>
                {/* 日付セル */}
                {dates.map(d => {
                  const visit = visitGrid.get(`${name}-${d}`)
                  const planned = plannedGrid.get(`${name}-${d}`)
                  const wd = weekDay(d)
                  // 色分け
                  let cellBg = ri % 2 === 0 ? C.white : '#FDFAFB'
                  let textColor = '#8B4513'
                  if (visit) {
                    if (visit.has_douhan && visit.has_after) {
                      cellBg = 'linear-gradient(135deg, #F4A5B8, #E8789A)'
                      textColor = '#FFF'
                    } else if (visit.has_after) {
                      cellBg = '#F4C0D1'
                      textColor = '#72243E'
                    } else if (visit.has_douhan) {
                      cellBg = '#FCB69F'
                      textColor = '#7A2E0E'
                    } else {
                      cellBg = '#FFECD2'
                      textColor = '#8B4513'
                    }
                  } else if (planned) {
                    // 来店予定: 緑=予定, グレー=キャンセル
                    if (planned.status === '予定') {
                      cellBg = '#E8F5E9'
                      textColor = '#2E7D32'
                    } else if (planned.status === 'キャンセル') {
                      cellBg = '#F0F0F0'
                      textColor = '#999'
                    } else if (planned.status === '来店済み') {
                      cellBg = '#E3F2FD'
                      textColor = '#1565C0'
                    }
                  }
                  return (
                    <td key={d}
                      onClick={() => handleCellClick(name, d)}
                      style={{
                      padding: '4px 2px', textAlign: 'center',
                      borderBottom: `1px solid #F5F0F2`,
                      borderRight: `1px solid ${wd === '土' ? C.border : '#F5F0F2'}`,
                      background: cellBg,
                      verticalAlign: 'middle',
                      cursor: 'pointer',
                    }}>
                      {visit ? (
                        <div title={visit.memo || ''}>
                          <div style={{
                            fontSize: '10px', fontWeight: 600, color: textColor,
                          }}>{shortYen(visit.amount_spent)}</div>
                          {visit.party_size > 1 && (
                            <div style={{ fontSize: '7px', color: textColor, opacity: 0.7 }}>{visit.party_size}名</div>
                          )}
                          {(visit.has_douhan || visit.has_after || visit.is_planned) && (
                            <div style={{
                              display: 'flex', gap: '1px', justifyContent: 'center', marginTop: '2px',
                            }}>
                              {visit.has_douhan && (
                                <span style={{
                                  fontSize: '6px',
                                  background: visit.has_douhan && visit.has_after ? 'rgba(255,255,255,0.85)' : '#E8789A',
                                  color: visit.has_douhan && visit.has_after ? '#E8789A' : '#FFF',
                                  padding: '1px 3px', borderRadius: '2px', fontWeight: 700, lineHeight: '10px',
                                }}>同</span>
                              )}
                              {visit.has_after && (
                                <span style={{
                                  fontSize: '6px',
                                  background: visit.has_douhan && visit.has_after ? 'rgba(255,255,255,0.85)' : '#D4607A',
                                  color: visit.has_douhan && visit.has_after ? '#D4607A' : '#FFF',
                                  padding: '1px 3px', borderRadius: '2px', fontWeight: 700, lineHeight: '10px',
                                }}>ア</span>
                              )}
                              {visit.is_planned && (
                                <span style={{
                                  fontSize: '6px', background: '#7BAFCC', color: '#FFF',
                                  padding: '1px 3px', borderRadius: '2px', fontWeight: 700, lineHeight: '10px',
                                }}>予</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : planned ? (
                        <div title={planned.memo || ''}>
                          <div style={{ fontSize: '9px', fontWeight: 600, color: textColor }}>
                            {planned.status === '予定' ? '予定' : planned.status === 'キャンセル' ? '取消' : '済'}
                          </div>
                          {planned.planned_time && (
                            <div style={{ fontSize: '7px', color: textColor, opacity: 0.8 }}>{planned.planned_time}</div>
                          )}
                          {planned.has_douhan && (
                            <span style={{
                              fontSize: '6px', background: planned.status === '予定' ? '#4CAF50' : '#BBB',
                              color: '#FFF', padding: '1px 3px', borderRadius: '2px', fontWeight: 700,
                            }}>同</span>
                          )}
                        </div>
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            ))}
            {/* 日計行 */}
            <tr>
              <td style={{
                position: 'sticky', left: 0, zIndex: 2,
                background: '#F8F2F4', padding: '8px 8px',
                borderTop: `2px solid ${C.border}`,
                borderRight: `1px solid ${C.border}`,
                fontSize: '8px', letterSpacing: '0.15em', color: C.pinkMuted, fontWeight: 600,
              }}>日計</td>
              <td style={{
                position: 'sticky', left: nameColW, zIndex: 2,
                background: '#FFF0F3', padding: '8px 4px', textAlign: 'center',
                borderTop: `2px solid ${C.border}`,
                borderRight: `2px solid ${C.border}`,
                color: C.pink, fontWeight: 700, fontSize: '12px',
              }}>{formatYen(total)}</td>
              {dates.map(d => {
                const dt = dayTotals.get(d)
                const wd = weekDay(d)
                return (
                  <td key={d} style={{
                    padding: '6px 2px', textAlign: 'center',
                    borderTop: `2px solid ${C.border}`,
                    borderRight: `1px solid ${wd === '土' ? C.border : '#F5F0F2'}`,
                    background: dt ? '#FFF5F7' : '#F8F2F4',
                    fontSize: '10px', fontWeight: 600,
                    color: dt ? C.pink : 'transparent',
                  }}>
                    {dt ? shortYen(dt) : ''}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── セル操作パネル（来店予定 + 来店記録） ── */}
      {editCell && (
        <div style={{
          marginTop: '10px', background: C.white,
          border: `2px solid ${C.pink}`, padding: '14px',
        }}>
          {/* ヘッダー */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: C.dark }}>
                {editCell.customerName}
              </span>
              <span style={{ fontSize: '11px', color: C.pinkMuted, marginLeft: '8px' }}>
                {month}-{String(editCell.day).padStart(2, '0')}
              </span>
            </div>
            <button onClick={() => { setEditCell(null); setEditPlanned(null) }} style={{
              background: 'transparent', border: 'none', fontSize: '16px',
              color: C.pinkMuted, cursor: 'pointer', padding: '0 4px',
            }}>✕</button>
          </div>

          {/* ━━━ 来店予定セクション ━━━ */}
          <div style={{
            background: '#F8FFF8', border: `1px solid #C8E6C9`,
            padding: '12px', marginBottom: '12px',
          }}>
            <div style={{
              fontSize: '9px', letterSpacing: '0.2em', color: '#2E7D32',
              fontWeight: 600, marginBottom: '8px',
            }}>
              来店予定
              {editPlanned && (
                <span style={{
                  marginLeft: '8px', padding: '1px 6px',
                  background: editPlanned.status === '予定' ? '#E8F5E9' : editPlanned.status === 'キャンセル' ? '#F0F0F0' : '#E3F2FD',
                  color: editPlanned.status === '予定' ? '#2E7D32' : editPlanned.status === 'キャンセル' ? '#999' : '#1565C0',
                  fontSize: '9px',
                }}>{editPlanned.status}</span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '6px' }}>
              <div>
                <label style={{ fontSize: '8px', color: '#666' }}>時間</label>
                <input type="text" value={pvForm.planned_time}
                  onChange={e => setPvForm({ ...pvForm, planned_time: e.target.value })}
                  placeholder="20:00" style={{
                    width: '100%', padding: '6px 8px', fontSize: '12px',
                    border: `1px solid ${C.border}`, fontFamily: 'inherit', boxSizing: 'border-box',
                  }} />
              </div>
              <div>
                <label style={{ fontSize: '8px', color: '#666' }}>人数</label>
                <input type="number" min="1" value={pvForm.party_size}
                  onChange={e => setPvForm({ ...pvForm, party_size: e.target.value })}
                  placeholder="-" style={{
                    width: '100%', padding: '6px 8px', fontSize: '12px',
                    border: `1px solid ${C.border}`, fontFamily: 'inherit', boxSizing: 'border-box',
                  }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="button"
                  onClick={() => setPvForm({ ...pvForm, has_douhan: !pvForm.has_douhan })}
                  style={{
                    width: '100%', padding: '6px', fontSize: '10px', fontFamily: 'inherit',
                    background: pvForm.has_douhan ? '#E8789A' : 'transparent',
                    color: pvForm.has_douhan ? '#FFF' : C.pinkMuted,
                    border: `1px solid ${pvForm.has_douhan ? '#E8789A' : C.border}`,
                    cursor: 'pointer', fontWeight: pvForm.has_douhan ? 600 : 400,
                  }}
                >{pvForm.has_douhan ? '✓ 同伴' : '同伴'}</button>
              </div>
            </div>

            <input type="text" value={pvForm.memo}
              onChange={e => setPvForm({ ...pvForm, memo: e.target.value })}
              placeholder="予定メモ" style={{
                width: '100%', padding: '6px 8px', fontSize: '11px', marginBottom: '8px',
                border: `1px solid ${C.border}`, fontFamily: 'inherit', boxSizing: 'border-box',
              }} />

            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {editPlanned ? (
                <>
                  {editPlanned.status === '予定' && (
                    <>
                      <button onClick={async () => {
                        const res = await fetch(`/api/planned-visits/${editPlanned.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            planned_date: pvForm.planned_date,
                            planned_time: pvForm.planned_time || undefined,
                            party_size: pvForm.party_size ? Number(pvForm.party_size) : undefined,
                            has_douhan: pvForm.has_douhan,
                            memo: pvForm.memo || undefined,
                          }),
                        })
                        if (res.ok) { fetchPlannedVisits(); setEditPlanned(null); setEditCell(null) }
                      }} style={{
                        flex: 1, padding: '8px',
                        background: '#4CAF50', color: '#FFF', border: 'none',
                        fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      }}>予定を更新</button>
                      <button onClick={async () => {
                        if (!window.confirm('来店済みにしますか？')) return
                        const res = await fetch(`/api/planned-visits/${editPlanned.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: '来店済み' }),
                        })
                        if (res.ok) { fetchPlannedVisits(); setEditPlanned(null); setEditCell(null) }
                      }} style={{
                        padding: '8px 12px', background: C.pink, color: '#FFF',
                        border: 'none', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit',
                      }}>来店済み</button>
                      <button onClick={async () => {
                        if (!window.confirm('キャンセルしますか？')) return
                        const res = await fetch(`/api/planned-visits/${editPlanned.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: 'キャンセル' }),
                        })
                        if (res.ok) { fetchPlannedVisits(); setEditPlanned(null); setEditCell(null) }
                      }} style={{
                        padding: '8px 10px', background: 'transparent',
                        border: `1px solid #999`, color: '#999',
                        fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit',
                      }}>取消</button>
                    </>
                  )}
                  <button onClick={async () => {
                    if (!window.confirm('この来店予定を削除しますか？')) return
                    const res = await fetch(`/api/planned-visits/${editPlanned.id}`, { method: 'DELETE' })
                    if (res.ok) { fetchPlannedVisits(); setEditPlanned(null); setEditCell(null) }
                  }} style={{
                    padding: '8px 10px', background: 'transparent',
                    border: `1px solid #D45060`, color: '#D45060',
                    fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit',
                  }}>削除</button>
                </>
              ) : (
                <button onClick={async () => {
                  const cid = customerIdMap.get(editCell.customerName)
                  if (!cid) return
                  const res = await fetch('/api/planned-visits', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      customer_id: cid,
                      planned_date: pvForm.planned_date,
                      planned_time: pvForm.planned_time || null,
                      party_size: pvForm.party_size ? Number(pvForm.party_size) : null,
                      has_douhan: pvForm.has_douhan || null,
                      memo: pvForm.memo || null,
                    }),
                  })
                  if (res.ok) { fetchPlannedVisits(); setEditCell(null) }
                }} style={{
                  flex: 1, padding: '8px',
                  background: '#4CAF50', color: '#FFF', border: 'none',
                  fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>来店予定を追加</button>
              )}
            </div>
          </div>

          {/* ━━━ 来店記録セクション（管理者のみ） ━━━ */}
          {isAdmin && (
            <div style={{
              background: '#FFF8F5', border: `1px solid #FFE0D0`,
              padding: '12px',
            }}>
              <div style={{
                fontSize: '9px', letterSpacing: '0.2em', color: C.pink,
                fontWeight: 600, marginBottom: '8px',
              }}>来店記録</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ fontSize: '8px', color: '#666' }}>売上（円）</label>
                  <input type="number" value={cellForm.amount_spent}
                    onChange={e => setCellForm({ ...cellForm, amount_spent: e.target.value })}
                    placeholder="0" style={{
                      width: '100%', padding: '6px 8px', fontSize: '12px',
                      border: `1px solid ${C.border}`, fontFamily: 'inherit', boxSizing: 'border-box',
                    }} />
                </div>
                <div>
                  <label style={{ fontSize: '8px', color: '#666' }}>人数</label>
                  <input type="number" min="1" value={cellForm.party_size}
                    onChange={e => setCellForm({ ...cellForm, party_size: e.target.value })}
                    style={{
                      width: '100%', padding: '6px 8px', fontSize: '12px',
                      border: `1px solid ${C.border}`, fontFamily: 'inherit', boxSizing: 'border-box',
                    }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                {[
                  { key: 'has_douhan' as const, label: '同伴', color: '#E8789A' },
                  { key: 'has_after' as const, label: 'アフター', color: '#D4607A' },
                  { key: 'is_planned' as const, label: '予定あり', color: '#7BAFCC' },
                ].map(item => (
                  <button key={item.key} type="button"
                    onClick={() => setCellForm({ ...cellForm, [item.key]: !cellForm[item.key] })}
                    style={{
                      flex: 1, padding: '6px 4px', fontSize: '9px', fontFamily: 'inherit',
                      background: cellForm[item.key] ? item.color : 'transparent',
                      color: cellForm[item.key] ? '#FFF' : C.pinkMuted,
                      border: `1px solid ${cellForm[item.key] ? item.color : C.border}`,
                      cursor: 'pointer', fontWeight: cellForm[item.key] ? 600 : 400,
                    }}
                  >{cellForm[item.key] ? '✓ ' : ''}{item.label}</button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ fontSize: '8px', color: '#666' }}>お連れ様 本指名</label>
                  <input type="text" value={cellForm.companion_honshimei}
                    onChange={e => setCellForm({ ...cellForm, companion_honshimei: e.target.value })}
                    placeholder="キャスト名" style={{
                      width: '100%', padding: '6px 8px', fontSize: '11px',
                      border: `1px solid ${C.border}`, fontFamily: 'inherit', boxSizing: 'border-box',
                    }} />
                </div>
                <div>
                  <label style={{ fontSize: '8px', color: '#666' }}>お連れ様 場内指名</label>
                  <input type="text" value={cellForm.companion_banai}
                    onChange={e => setCellForm({ ...cellForm, companion_banai: e.target.value })}
                    placeholder="キャスト名" style={{
                      width: '100%', padding: '6px 8px', fontSize: '11px',
                      border: `1px solid ${C.border}`, fontFamily: 'inherit', boxSizing: 'border-box',
                    }} />
                </div>
              </div>

              <input type="text" value={cellForm.memo}
                onChange={e => setCellForm({ ...cellForm, memo: e.target.value })}
                placeholder="メモ" style={{
                  width: '100%', padding: '6px 8px', fontSize: '11px', marginBottom: '8px',
                  border: `1px solid ${C.border}`, fontFamily: 'inherit', boxSizing: 'border-box',
                }} />

              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={handleCellSave} style={{
                  flex: 1, padding: '8px',
                  background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                  color: '#FFF', border: 'none', fontSize: '10px', fontWeight: 600,
                  letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {visitGrid.has(`${editCell.customerName}-${editCell.day}`) ? '来店記録を更新' : '来店記録を登録'}
                </button>
                {visitGrid.has(`${editCell.customerName}-${editCell.day}`) && (
                  <button onClick={handleCellDelete} style={{
                    padding: '8px 12px', background: 'transparent',
                    border: `1px solid #D45060`, color: '#D45060',
                    fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit',
                  }}>削除</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 来店リスト（詳細） */}
      <div style={{ marginTop: '14px' }}>
        <div style={{ fontSize: '8px', letterSpacing: '0.2em', color: C.pinkMuted, marginBottom: '8px' }}>
          来店詳細
        </div>
        <div style={{ border: `1px solid ${C.border}`, borderBottom: 'none' }}>
          {visits.map(v => (
            <div key={v.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', background: C.white,
              borderBottom: `1px solid ${C.border}`,
              cursor: 'pointer',
            }}
              onClick={() => {
                const cid = customerIdMap.get(v.customer_name ?? '')
                if (cid && onCustomerClick) onCustomerClick(cid)
              }}
            >
              <div>
                <div style={{ fontSize: '12px', color: C.pink, fontWeight: 500 }}>
                  {v.customer_name}
                </div>
                <div style={{ fontSize: '9px', color: C.pinkMuted, marginTop: '2px' }}>
                  {v.visit_date}{v.memo && ` · ${v.memo}`}
                </div>
              </div>
              <div style={{ fontSize: '13px', color: C.pink, fontWeight: 500 }}>
                {formatYen(v.amount_spent)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
