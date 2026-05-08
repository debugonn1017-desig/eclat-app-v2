'use client'

// 統合キャスト分析ページ
//   /admin/cast-analysis
//
//   閲覧可能: オーナー or 'KPI.詳細分析' 権限保持スタッフのみ
//
//   構成:
//     - 左サイドバー(PC) / ドロップダウン(モバイル) でキャスト切替
//     - タブ: 全キャスト概要 / 概要 / 時系列 / お客様 / その他
//     - 「全キャスト概要」では横並びで全員の売上・達成率・前月比・アラートを比較
//     - 個別キャスト選択時は既存の OverviewTab/TimelineTab/CustomersTab を再利用

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCasts } from '@/hooks/useCasts'
import { useViewMode } from '@/hooks/useViewMode'
import { C } from '@/lib/colors'
import { CAST_TIERS, CastKPI, CastProfile, CastTier } from '@/types'
import MonthSwitcher from '@/components/MonthSwitcher'
import CustomerDetailPanel from '@/components/CustomerDetailPanel'
import BottomNav from '@/components/BottomNav'
import ViewModeToggle from '@/components/ViewModeToggle'
import { OverviewTab, TimelineTab, CustomersTab } from '@/components/CastAnalysisBasicTabs'
import { ContactTab, ShiftTab, DetectionTab, CompareTab, ExportTab } from '@/components/CastAnalysisAdvancedTabs'
import { CompatibilityTab } from '@/components/CastCompatibilityTab'
import { CastRecommendedProfile } from '@/components/CastRecommendedProfile'
import { CastImprovementDiagnosis } from '@/components/CastImprovementDiagnosis'

type TabKey = 'overview' | 'recommended' | 'improvement' | 'timeline' | 'customers' | 'compatibility' | 'contact' | 'shift' | 'detection' | 'compare' | 'export'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: '概要', icon: '📊' },
  { key: 'recommended', label: 'おすすめ客像', icon: '🎯' },
  { key: 'improvement', label: '改善診断', icon: '🎓' },
  { key: 'timeline', label: '時系列', icon: '📈' },
  { key: 'customers', label: 'お客様', icon: '👥' },
  { key: 'compatibility', label: '相性', icon: '🧲' },
  { key: 'contact', label: '連絡', icon: '📞' },
  { key: 'shift', label: '出勤', icon: '🗓' },
  { key: 'detection', label: '検知', icon: '⚠' },
  { key: 'compare', label: '比較', icon: '🆚' },
  { key: 'export', label: '出力', icon: '📁' },
]

type RankingApi = {
  cast: CastProfile
  kpi: CastKPI
  prevSales: number
  targetSales: number
  achievementRate: number
}

export default function CastAnalysisPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', fontSize: 12 }}>読み込み中...</div>}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const router = useRouter()
  const search = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const { isPC } = useViewMode()
  const { casts, getMultiMonthKPI, getCastTarget } = useCasts()

  // 認証ガード
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  // スタッフ専用セクション（キャストタイプ別の相性）の表示判定
  const [isStaff, setIsStaff] = useState<boolean>(false)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { setAuthorized(false); return }
        const me = await res.json()
        const ok = me.is_owner === true || me.permissions?.['KPI.詳細分析'] === true
        setAuthorized(ok)
        // role === 'admin' なら owner も staff も true。'cast' は false。
        setIsStaff(me.role === 'admin')
      } catch { setAuthorized(false) }
    }
    check()
  }, [])
  useEffect(() => {
    if (authorized === false) {
      const t = setTimeout(() => router.push('/'), 1500)
      return () => clearTimeout(t)
    }
  }, [authorized, router])

  // 月（参照月）
  const initialMonth = useMemo(() => {
    const q = search?.get('month')
    if (q && /^\d{4}-\d{2}$/.test(q)) return q
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [search])
  const [month, setMonth] = useState<string>(initialMonth)
  useEffect(() => { setMonth(initialMonth) }, [initialMonth])

  // 選択中のキャストID
  const initialCastId = search?.get('castId') ?? ''
  const [selectedCastId, setSelectedCastId] = useState<string>(initialCastId)
  // タブ — デフォルトは 概要
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const handleChangeMonth = useCallback((next: string) => {
    setMonth(next)
    const params = new URLSearchParams()
    params.set('month', next)
    if (selectedCastId) params.set('castId', selectedCastId)
    router.replace(`/admin/cast-analysis?${params.toString()}`, { scroll: false })
  }, [router, selectedCastId])

  const handleSelectCast = useCallback((id: string) => {
    setSelectedCastId(id)
    const params = new URLSearchParams()
    params.set('month', month)
    if (id) params.set('castId', id)
    router.replace(`/admin/cast-analysis?${params.toString()}`, { scroll: false })
  }, [router, month])

  // 全キャストランキング（C案: 全キャスト概要タブで使う）
  const [allRows, setAllRows] = useState<RankingApi[]>([])
  useEffect(() => {
    if (!authorized) return
    const fetchRanking = async () => {
      try {
        const res = await fetch(`/api/cast-rankings?month=${month}`, { cache: 'no-store' })
        if (!res.ok) return
        const data: RankingApi[] = await res.json()
        setAllRows(data)
      } catch { /* noop */ }
    }
    fetchRanking()
  }, [authorized, month])

  // 選択中キャストのプロフィール / 全期間 KPI（個別タブ用）
  const selectedCast = useMemo(() => casts.find(c => c.id === selectedCastId) ?? null, [casts, selectedCastId])
  const [allMonths, setAllMonths] = useState<string[]>([])
  const [multiKPI, setMultiKPI] = useState<Record<string, CastKPI>>({})
  const [multiTarget, setMultiTarget] = useState<Record<string, number>>({})
  const [careerTotal, setCareerTotal] = useState({ sales: 0, visits: 0, douhan: 0, conv: 0 })
  const [bestMonth, setBestMonth] = useState<{ month: string; sales: number } | null>(null)

  useEffect(() => {
    if (!authorized || !selectedCast) {
      setAllMonths([]); setMultiKPI({}); setMultiTarget({})
      setCareerTotal({ sales: 0, visits: 0, douhan: 0, conv: 0 }); setBestMonth(null)
      return
    }
    const fetchAll = async () => {
      // 月リストの起点は「アカウント作成日」だけでなく、実データの最古日も見て
      // 一番古い日付を採用する。これにより手入力で過去月の売上を入れた場合も拾える。
      const candidates: Date[] = [new Date(selectedCast.created_at)]

      // customer_visits の最古日（このキャスト担当顧客）
      const { data: cs } = await supabase
        .from('customers')
        .select('id')
        .eq('cast_name', selectedCast.cast_name)
      const customerIds = (cs ?? []).map((c: { id: string }) => c.id)
      if (customerIds.length > 0) {
        const { data: oldestV } = await supabase
          .from('customer_visits')
          .select('visit_date')
          .in('customer_id', customerIds)
          .order('visit_date', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (oldestV?.visit_date) candidates.push(new Date(oldestV.visit_date))
      }
      // cast_extension_sales の最古日
      const { data: oldestExt } = await supabase
        .from('cast_extension_sales')
        .select('sale_date')
        .eq('cast_id', selectedCast.id)
        .order('sale_date', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (oldestExt?.sale_date) candidates.push(new Date(oldestExt.sale_date))
      // cast_targets の最古月
      const { data: oldestT } = await supabase
        .from('cast_targets')
        .select('month')
        .eq('cast_id', selectedCast.id)
        .order('month', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (oldestT?.month) candidates.push(new Date(oldestT.month + '-01'))

      const start = new Date(Math.min(...candidates.map(d => d.getTime())))
      start.setDate(1)
      const now = new Date()
      const months: string[] = []
      const cur = new Date(start)
      while (cur <= now) {
        months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
        cur.setMonth(cur.getMonth() + 1)
        if (months.length > 60) break
      }
      setAllMonths(months)
      const kpis = await getMultiMonthKPI(selectedCast.cast_name, selectedCast.id, months)
      setMultiKPI(kpis)
      const targets: Record<string, number> = {}
      for (const m of months) {
        const t = await getCastTarget(selectedCast.id, m)
        targets[m] = t?.target_sales ?? 0
      }
      setMultiTarget(targets)
      let sales = 0, visits = 0, douhan = 0, conv = 0
      let best: { month: string; sales: number } | null = null
      for (const m of months) {
        const k = kpis[m]
        if (!k) continue
        sales += k.monthlySales; visits += k.totalVisitCount
        douhan += k.douhanCount; conv += k.conversionCount
        if (!best || k.monthlySales > best.sales) best = { month: m, sales: k.monthlySales }
      }
      setCareerTotal({ sales, visits, douhan, conv })
      setBestMonth(best)
    }
    fetchAll()
  }, [authorized, selectedCast, getMultiMonthKPI, getCastTarget])

  // 担当顧客 / 当月 visits（お客様タブ用）
  type CustomerWithStats = {
    id: string; customer_name: string; customer_rank: string | null
    region: string | null; nomination_status: string | null
    first_visit_date: string | null; last_visit_date: string | null
    visit_count: number; total_spent: number; has_douhan: boolean
    avg_spent: number; last_contact_date: string | null
  }
  const [customers, setCustomers] = useState<CustomerWithStats[]>([])
  const [monthVisits, setMonthVisits] = useState<Array<{ customer_id: string; visit_date: string; amount_spent: number; has_douhan: boolean; nomination_status?: string }>>([])
  useEffect(() => {
    if (!authorized || !selectedCast) {
      setCustomers([]); setMonthVisits([]); return
    }
    const load = async () => {
      const { data: cs } = await supabase
        .from('customers')
        .select('id, customer_name, customer_rank, region, nomination_status, first_visit_date, last_contact_date')
        .eq('cast_name', selectedCast.cast_name)
      const customerIds = (cs ?? []).map((c: { id: string }) => c.id)
      let visits: Array<{ customer_id: string; visit_date: string; amount_spent: number; has_douhan: boolean }> = []
      if (customerIds.length > 0) {
        const { data } = await supabase
          .from('customer_visits')
          .select('customer_id, visit_date, amount_spent, has_douhan')
          .in('customer_id', customerIds)
          .order('visit_date', { ascending: false })
        visits = (data ?? []) as typeof visits
      }
      const visitsByCust = new Map<string, typeof visits>()
      for (const v of visits) {
        const list = visitsByCust.get(v.customer_id) ?? []
        list.push(v)
        visitsByCust.set(v.customer_id, list)
      }
      const enriched: CustomerWithStats[] = (cs ?? []).map((c: {
        id: string; customer_name: string; customer_rank: string | null
        region: string | null; nomination_status: string | null
        first_visit_date: string | null; last_contact_date: string | null
      }) => {
        const vs = visitsByCust.get(c.id) ?? []
        const paid = vs.filter(v => Number(v.amount_spent) > 0)
        const total = paid.reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
        const lastVisit = vs.length > 0 ? vs[0].visit_date : null
        return {
          ...c,
          last_visit_date: lastVisit,
          visit_count: paid.length,
          total_spent: total,
          has_douhan: vs.some(v => v.has_douhan),
          avg_spent: paid.length > 0 ? Math.round(total / paid.length) : 0,
        }
      })
      setCustomers(enriched)

      const monStart = `${month}-01`
      const [my, mm] = month.split('-').map(Number)
      const monEnd = `${month}-${String(new Date(my, mm, 0).getDate()).padStart(2, '0')}`
      if (customerIds.length > 0) {
        const { data: mv } = await supabase
          .from('customer_visits')
          .select('customer_id, visit_date, amount_spent, has_douhan, customers!inner(nomination_status)')
          .in('customer_id', customerIds)
          .gte('visit_date', monStart)
          .lte('visit_date', monEnd)
        setMonthVisits((mv as Array<{
          customer_id: string; visit_date: string; amount_spent: number; has_douhan: boolean
          customers?: { nomination_status?: string }
        }> | null ?? []).map(v => ({
          customer_id: v.customer_id,
          visit_date: v.visit_date,
          amount_spent: Number(v.amount_spent) || 0,
          has_douhan: !!v.has_douhan,
          nomination_status: v.customers?.nomination_status,
        })))
      } else {
        setMonthVisits([])
      }
    }
    load()
  }, [authorized, selectedCast, supabase, month])

  // 顧客詳細オーバーレイ
  const [overlayCustomerId, setOverlayCustomerId] = useState<string | null>(null)

  // 異変アラート（個別キャスト選択時）
  const cur = multiKPI[month]
  const prevMonth = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [month])
  const prev = multiKPI[prevMonth]
  const alerts = useMemo(() => {
    const list: { level: 'red' | 'yellow' | 'green'; text: string }[] = []
    if (!cur || !prev) return list
    const ratio = prev.monthlySales > 0 ? (cur.monthlySales - prev.monthlySales) / prev.monthlySales : 0
    if (prev.monthlySales > 0) {
      if (ratio <= -0.4) list.push({ level: 'red', text: `売上 前月比 ${Math.round(ratio * 100)}% — 急激な落ち込み` })
      else if (ratio <= -0.2) list.push({ level: 'yellow', text: `売上 前月比 ${Math.round(ratio * 100)}% — 注意` })
      else if (ratio >= 0.3) list.push({ level: 'green', text: `売上 前月比 +${Math.round(ratio * 100)}% — 好調` })
    }
    return list
  }, [cur, prev])

  // 層別グルーピング（hooksは early return より前に呼ぶ。React error #310 防止）
  const tieredCasts: { tier: CastTier | null; list: CastProfile[] }[] = useMemo(() => {
    const active = casts.filter(c => c.is_active)
    const buckets: { tier: CastTier | null; list: CastProfile[] }[] = []
    for (const t of CAST_TIERS) {
      const list = active.filter(c => c.cast_tier === t)
      if (list.length > 0) buckets.push({ tier: t, list })
    }
    const noTier = active.filter(c => !c.cast_tier)
    if (noTier.length > 0) buckets.push({ tier: null, list: noTier })
    return buckets
  }, [casts])

  const tierColor = (t: CastTier | null): string => {
    const map: Record<string, string> = {
      'A層': '#FBEAF0', 'B層': '#E6F1FB', '新人層': '#E1F5EE',
      '無類': '#FAEEDA', 'C層': '#F1EFE8',
    }
    return (t && map[t]) ? map[t] : '#F5F5F5'
  }

  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const shortYen = (n: number) => Math.abs(n) >= 10000 ? `¥${Math.round(n / 10000)}万` : `¥${n}`

  // ─── 認証ガードによる早期 return（hooksは全てこの前に呼ぶ） ───
  if (authorized === null) return <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#888' }}>読み込み中...</div>
  if (!authorized) return (
    <div style={{ padding: 40, textAlign: 'center', fontSize: 13 }}>
      <p style={{ color: '#5A2840', fontWeight: 600 }}>このページを閲覧する権限がありません</p>
      <p style={{ color: '#888', fontSize: 11 }}>「キャスト分析」権限が必要です。ホームへ戻ります...</p>
    </div>
  )

  // ─── レンダリング ───────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: !isPC ? 60 : 0 }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: isPC ? '12px 20px' : '8px 12px',
        borderBottom: `1px solid ${C.border}`, background: C.headerBg,
        flexWrap: 'wrap',
      }}>
        <button onClick={() => router.push('/admin/casts')} style={{
          background: 'transparent', border: 'none', color: C.pink,
          fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
        }}>← 管理</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>キャスト分析</span>
        {selectedCast && (
          <span style={{
            fontSize: 12, padding: '3px 10px', borderRadius: 12,
            background: '#FBEAF0', color: '#72243E', fontWeight: 500,
          }}>
            {selectedCast.cast_name}
            {selectedCast.cast_tier ? ` ・${selectedCast.cast_tier}` : ''}
          </span>
        )}
        <MonthSwitcher value={month} onChange={handleChangeMonth} size="sm" style={{ marginLeft: 'auto' }} />
        <ViewModeToggle />

        {/* モバイル: キャスト切替ドロップダウン */}
        {!isPC && (
          <select
            value={selectedCastId}
            onChange={(e) => handleSelectCast(e.target.value)}
            style={{
              flex: '1 1 100%', marginTop: 4,
              padding: '6px 10px', fontSize: 12,
              border: `1px solid ${C.border}`, background: '#FFF',
              fontFamily: 'inherit', borderRadius: 6,
            }}
          >
            <option value="">— 全キャスト概要を見る —</option>
            {casts.filter(c => c.is_active).map(c => (
              <option key={c.id} value={c.id}>
                {c.cast_name}{c.cast_tier ? ` (${c.cast_tier})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* メイン領域: PC=サイドバー+コンテンツ / モバイル=コンテンツのみ */}
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
        {/* サイドバー（PCのみ） */}
        {isPC && (
          <div style={{
            width: 200, flexShrink: 0,
            background: '#FDF8F9', borderRight: `1px solid ${C.border}`,
            overflowY: 'auto', maxHeight: 'calc(100vh - 60px)',
          }}>
            {tieredCasts.map(({ tier, list }) => (
              <div key={tier ?? 'none'}>
                <div style={{
                  padding: '6px 10px', fontSize: 9, fontWeight: 500,
                  letterSpacing: '0.15em', color: C.pinkMuted,
                  background: tierColor(tier),
                  borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
                }}>
                  {tier ?? '未分類'}（{list.length}名）
                </div>
                {list.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCast(c.id)}
                    style={{
                      width: '100%', padding: '8px 12px 8px 14px',
                      background: selectedCastId === c.id ? 'rgba(232,120,154,0.1)' : 'transparent',
                      border: 'none', borderBottom: `1px solid ${C.border}`,
                      borderLeft: selectedCastId === c.id ? `3px solid ${C.pink}` : '3px solid transparent',
                      fontSize: 12, color: selectedCastId === c.id ? C.pink : C.dark,
                      fontWeight: selectedCastId === c.id ? 600 : 400,
                      textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {c.cast_name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* コンテンツ */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 個別キャスト選択時：キャリアサマリー＋アラート */}
          {selectedCast && (
            <>
              <div style={{
                padding: isPC ? '12px 20px' : '10px 12px',
                background: 'linear-gradient(135deg, #FFF0F5 0%, #FFE4ED 60%, #FFD7E4 100%)',
                borderBottom: `1px solid ${C.border}`,
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isPC ? 'repeat(5, 1fr)' : 'repeat(2, 1fr)',
                  gap: 8,
                }}>
                  <CareerCell label="入店からの月数" value={`${Math.max(1, allMonths.length)}ヶ月`} />
                  <CareerCell label="累計売上" value={formatYen(careerTotal.sales)} accent />
                  <CareerCell label="累計来店本数" value={`${careerTotal.visits}本`} />
                  <CareerCell label="累計同伴" value={`${careerTotal.douhan}回`} />
                  <CareerCell label="ベスト月" value={bestMonth ? `${bestMonth.month.slice(5)}月 ${shortYen(bestMonth.sales)}` : '—'} />
                </div>
              </div>

              {alerts.length > 0 && (
                <div style={{
                  padding: '8px 16px', background: '#FFF',
                  borderBottom: `1px solid ${C.border}`,
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  {alerts.map((a, i) => {
                    const colors = {
                      red:    { bg: '#FCEBEB', fg: '#C53030', border: '#F5A5A5' },
                      yellow: { bg: '#FFF4E0', fg: '#B8860B', border: '#F5C97B' },
                      green:  { bg: '#E1F5EE', fg: '#0F6E56', border: '#A0D9BC' },
                    }[a.level]
                    return (
                      <div key={i} style={{
                        fontSize: 11, padding: '5px 10px',
                        background: colors.bg, color: colors.fg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: 6, fontWeight: 500,
                      }}>
                        {a.level === 'red' ? '🚨' : a.level === 'yellow' ? '⚠️' : '🌟'} {a.text}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* タブ切替 */}
          <div style={{
            display: 'flex', gap: 0, padding: isPC ? '0 16px' : '0 8px',
            background: '#FFF', borderBottom: `1px solid ${C.border}`,
            overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          }}>
            {TABS.map(t => {
              const disabled = !selectedCastId
              return (
                <button
                  key={t.key}
                  onClick={() => !disabled && setActiveTab(t.key)}
                  disabled={disabled}
                  style={{
                    padding: isPC ? '10px 16px' : '8px 10px',
                    fontSize: 11,
                    fontWeight: activeTab === t.key ? 600 : 400,
                    background: 'transparent', border: 'none',
                    borderBottom: activeTab === t.key ? `2px solid ${C.pink}` : '2px solid transparent',
                    color: activeTab === t.key ? C.pink : disabled ? '#CCC' : C.pinkMuted,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  {t.icon} {t.label}
                </button>
              )
            })}
          </div>

          {/* タブコンテンツ */}
          <div style={{ padding: isPC ? '16px 20px' : '12px 10px' }}>
            {!selectedCast && (
              <div style={{
                padding: '40px 20px', textAlign: 'center',
                background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.dark, marginBottom: 8 }}>
                  キャストを選択してください
                </div>
                <div style={{ fontSize: 11, color: C.pinkMuted }}>
                  {isPC ? '左のサイドバー' : '上のドロップダウン'} からキャストを選ぶと、詳細な分析が表示されます。
                </div>
              </div>
            )}
            {activeTab === 'overview' && selectedCast && (
              <OverviewTab month={month} multiKPI={multiKPI} multiTarget={multiTarget} allMonths={allMonths} customers={customers} isPC={isPC} />
            )}
            {activeTab === 'recommended' && selectedCast && (
              <CastRecommendedProfile customers={customers} isPC={isPC} />
            )}
            {activeTab === 'improvement' && selectedCast && (
              <CastImprovementDiagnosis
                cast={selectedCast}
                currentMonth={month}
                currentKPI={multiKPI[month]}
                allRows={allRows}
                isPC={isPC}
              />
            )}
            {activeTab === 'timeline' && selectedCast && (
              <TimelineTab multiKPI={multiKPI} multiTarget={multiTarget} allMonths={allMonths} customers={customers} isPC={isPC} />
            )}
            {activeTab === 'customers' && selectedCast && (
              <CustomersTab
                customers={customers}
                monthVisits={monthVisits}
                month={month}
                onCustomerClick={setOverlayCustomerId}
                isPC={isPC}
              />
            )}
            {activeTab === 'compatibility' && selectedCast && (
              <CompatibilityTab
                customers={customers}
                isPC={isPC}
                isStaff={isStaff}
                onCustomerClick={setOverlayCustomerId}
              />
            )}
            {activeTab === 'contact' && selectedCast && (
              <ContactTab castName={selectedCast.cast_name} customers={customers} isPC={isPC} onCustomerClick={setOverlayCustomerId} />
            )}
            {activeTab === 'shift' && selectedCast && (
              <ShiftTab castId={selectedCast.id} multiKPI={multiKPI} allMonths={allMonths} isPC={isPC} />
            )}
            {activeTab === 'detection' && selectedCast && (
              <DetectionTab customers={customers} currentMonth={month} multiKPI={multiKPI} multiTarget={multiTarget} isPC={isPC} onCustomerClick={setOverlayCustomerId} />
            )}
            {activeTab === 'compare' && selectedCast && (
              <CompareTab cast={selectedCast} currentMonth={month} multiKPI={multiKPI} isPC={isPC} />
            )}
            {activeTab === 'export' && selectedCast && (
              <ExportTab cast={selectedCast} customers={customers} isPC={isPC}
                multiKPI={multiKPI} multiTarget={multiTarget} allMonths={allMonths} />
            )}
          </div>
        </div>
      </div>

      {/* 顧客詳細オーバーレイ */}
      {overlayCustomerId && (
        <>
          <div
            onClick={() => setOverlayCustomerId(null)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.3)', zIndex: 100,
              display: isPC ? 'block' : 'none',
            }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: isPC ? '52%' : '100%',
            left: isPC ? 'auto' : 0,
            background: C.bg, zIndex: 101,
            overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            boxShadow: isPC ? '-4px 0 20px rgba(0,0,0,0.1)' : 'none',
          }}>
            <div style={{
              position: 'sticky', top: 0, zIndex: 5,
              padding: '8px 12px', background: C.bg,
              borderBottom: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <button onClick={() => setOverlayCustomerId(null)} style={{
                background: 'transparent', border: 'none',
                color: C.pink, fontSize: 12, cursor: 'pointer', padding: 0,
              }}>← 戻る</button>
              <span style={{ fontSize: 11, color: C.pinkMuted }}>顧客詳細</span>
            </div>
            <CustomerDetailPanel customerId={overlayCustomerId} isPC={isPC} isAdmin={true} />
          </div>
        </>
      )}

      {!isPC && <BottomNav />}
    </div>
  )
}

function CareerCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.55)',
      borderRadius: 8, padding: '8px 10px',
    }}>
      <div style={{ fontSize: 9, color: C.pinkMuted, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 14, fontWeight: 600,
        color: accent ? C.pink : C.dark,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</div>
    </div>
  )
}
