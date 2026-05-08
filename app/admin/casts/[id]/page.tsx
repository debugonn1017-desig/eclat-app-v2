'use client'

// キャスト個別 管理者向け詳細分析ページ
//   /admin/casts/[id]
//
//   閲覧可能: オーナー or 'キャスト分析' 権限保持スタッフのみ
//   キャスト本人は見られない（管理者向けの異変アラート等を含むため）
//
//   構成（タブ）:
//     📊 概要 / 📈 時系列 / 👥 お客様 / 📞 連絡 / 🗓 出勤
//     ⚠ 検知 / 🆚 比較 / 📁 出力
//
//   常に表示：
//     - キャリアサマリー（入店日からの累計、最高月、現在の層）
//     - 異変アラート（前月比 -20% / -40% / +30%）

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCasts } from '@/hooks/useCasts'
import { useViewMode } from '@/hooks/useViewMode'
import { C } from '@/lib/colors'
import { CastKPI, CastProfile } from '@/types'
import MonthSwitcher from '@/components/MonthSwitcher'
import CustomerDetailPanel from '@/components/CustomerDetailPanel'
import BottomNav from '@/components/BottomNav'
import { ContactTab, ShiftTab, DetectionTab, CompareTab, ExportTab } from '@/components/CastAnalysisAdvancedTabs'
import { OverviewTab, TimelineTab, CustomersTab } from '@/components/CastAnalysisBasicTabs'
import { CompatibilityTab } from '@/components/CastCompatibilityTab'
import ViewModeToggle from '@/components/ViewModeToggle'

type TabKey = 'overview' | 'timeline' | 'customers' | 'compatibility' | 'contact' | 'shift' | 'detection' | 'compare' | 'export'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: '概要', icon: '📊' },
  { key: 'timeline', label: '時系列', icon: '📈' },
  { key: 'customers', label: 'お客様', icon: '👥' },
  { key: 'compatibility', label: '相性', icon: '🧲' },
  { key: 'contact', label: '連絡', icon: '📞' },
  { key: 'shift', label: '出勤', icon: '🗓' },
  { key: 'detection', label: '検知', icon: '⚠' },
  { key: 'compare', label: '比較', icon: '🆚' },
  { key: 'export', label: '出力', icon: '📁' },
]

export default function AdminCastDetailPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', fontSize: 12 }}>読み込み中...</div>}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const search = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const { isPC } = useViewMode()
  const { getMultiMonthKPI, getCastTarget } = useCasts()

  const castId = params?.id ?? ''

  // 月（参照月）
  const initialMonth = useMemo(() => {
    const q = search?.get('month')
    if (q && /^\d{4}-\d{2}$/.test(q)) return q
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [search])
  const [month, setMonth] = useState<string>(initialMonth)
  useEffect(() => { setMonth(initialMonth) }, [initialMonth])
  const handleChangeMonth = useCallback((next: string) => {
    setMonth(next)
    router.replace(`/admin/casts/${castId}?month=${next}`, { scroll: false })
  }, [router, castId])

  // 認証ガード（オーナー or 'キャスト分析'）
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { setAuthorized(false); return }
        const me = await res.json()
        const ok = me.is_owner === true || me.permissions?.['キャスト分析'] === true
        setAuthorized(ok)
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

  // キャストプロフィール
  const [cast, setCast] = useState<CastProfile | null>(null)
  useEffect(() => {
    if (!castId) return
    const fetchCast = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
        .eq('id', castId)
        .maybeSingle()
      if (data) setCast(data as CastProfile)
    }
    fetchCast()
  }, [castId, supabase])

  // 過去全期間の月別 KPI（最大36ヶ月）
  const [allMonths, setAllMonths] = useState<string[]>([])
  const [multiKPI, setMultiKPI] = useState<Record<string, CastKPI>>({})
  const [multiTarget, setMultiTarget] = useState<Record<string, number>>({})
  const [careerTotal, setCareerTotal] = useState({ sales: 0, visits: 0, douhan: 0, conv: 0 })
  const [bestMonth, setBestMonth] = useState<{ month: string; sales: number } | null>(null)

  useEffect(() => {
    if (!authorized || !cast) return
    const fetchAll = async () => {
      // 月リストの始点 = 「profiles.created_at」「最古の来店記録」「最古の場外売上」「最古の目標」のうち最も古いもの
      // 入店前にデータが入っている可能性（例: 1月・2月の来店記録など）があるので複数ソースから検出する
      const candidates: Date[] = [new Date(cast.created_at)]

      const { data: cs } = await supabase
        .from('customers')
        .select('id')
        .eq('cast_name', cast.cast_name)
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
      const { data: oldestExt } = await supabase
        .from('cast_extension_sales')
        .select('sale_date')
        .eq('cast_id', cast.id)
        .order('sale_date', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (oldestExt?.sale_date) candidates.push(new Date(oldestExt.sale_date))
      const { data: oldestT } = await supabase
        .from('cast_targets')
        .select('month')
        .eq('cast_id', cast.id)
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
        if (months.length > 60) break // 安全弁（36 → 60 に拡張）
      }
      setAllMonths(months)

      const kpis = await getMultiMonthKPI(cast.cast_name, cast.id, months)
      setMultiKPI(kpis)

      const targets: Record<string, number> = {}
      for (const m of months) {
        const t = await getCastTarget(cast.id, m)
        targets[m] = t?.target_sales ?? 0
      }
      setMultiTarget(targets)

      // 累計
      let sales = 0, visits = 0, douhan = 0, conv = 0
      let best: { month: string; sales: number } | null = null
      for (const m of months) {
        const k = kpis[m]
        if (!k) continue
        sales += k.monthlySales
        visits += k.totalVisitCount
        douhan += k.douhanCount
        conv += k.conversionCount
        if (!best || k.monthlySales > best.sales) {
          best = { month: m, sales: k.monthlySales }
        }
      }
      setCareerTotal({ sales, visits, douhan, conv })
      setBestMonth(best)
    }
    fetchAll()
  }, [authorized, cast, getMultiMonthKPI, getCastTarget])

  // 顧客詳細オーバーレイ
  const [overlayCustomerId, setOverlayCustomerId] = useState<string | null>(null)

  // タブ
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  // ─── 担当顧客＋来店履歴データ（お客様タブ＆オーバーレイ用） ───
  type CustomerWithStats = {
    id: string
    customer_name: string
    customer_rank: string | null
    region: string | null
    nomination_status: string | null
    first_visit_date: string | null
    last_visit_date: string | null
    visit_count: number
    total_spent: number
    has_douhan: boolean
    avg_spent: number
    last_contact_date: string | null
  }
  const [customers, setCustomers] = useState<CustomerWithStats[]>([])
  // 当月の visits（お客様詳細にぶら下げる用）
  const [monthVisits, setMonthVisits] = useState<Array<{ customer_id: string; visit_date: string; amount_spent: number; has_douhan: boolean; nomination_status?: string }>>([])

  useEffect(() => {
    if (!authorized || !cast) return
    const load = async () => {
      // 担当顧客
      const { data: cs } = await supabase
        .from('customers')
        .select('id, customer_name, customer_rank, region, nomination_status, first_visit_date, last_contact_date')
        .eq('cast_name', cast.cast_name)
      const customerIds = (cs ?? []).map((c: any) => c.id)
      // 全期間の visits（最終来店日と累計売上算出のため）
      let visits: any[] = []
      if (customerIds.length > 0) {
        const { data } = await supabase
          .from('customer_visits')
          .select('customer_id, visit_date, amount_spent, has_douhan')
          .in('customer_id', customerIds)
          .order('visit_date', { ascending: false })
        visits = data ?? []
      }
      const visitsByCust = new Map<string, any[]>()
      for (const v of visits) {
        const list = visitsByCust.get(v.customer_id) ?? []
        list.push(v)
        visitsByCust.set(v.customer_id, list)
      }
      const enriched: CustomerWithStats[] = (cs ?? []).map((c: any) => {
        const vs = visitsByCust.get(c.id) ?? []
        const paid = vs.filter(v => Number(v.amount_spent) > 0)
        const total = paid.reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
        const lastVisit = vs.length > 0 ? vs[0].visit_date : null
        return {
          id: c.id,
          customer_name: c.customer_name,
          customer_rank: c.customer_rank,
          region: c.region,
          nomination_status: c.nomination_status,
          first_visit_date: c.first_visit_date,
          last_visit_date: lastVisit,
          visit_count: paid.length,
          total_spent: total,
          has_douhan: vs.some(v => v.has_douhan),
          avg_spent: paid.length > 0 ? Math.round(total / paid.length) : 0,
          last_contact_date: c.last_contact_date,
        }
      })
      setCustomers(enriched)

      // 当月の visits
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
        setMonthVisits(((mv ?? []) as any[]).map(v => ({
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
  }, [authorized, cast, supabase, month])

  // ヘルパー: 顧客 ID → CustomerWithStats（将来タブで使用予定）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const customerById = useMemo(() => {
    const m = new Map<string, CustomerWithStats>()
    for (const c of customers) m.set(c.id, c)
    return m
  }, [customers])

  // 当月 / 前月 KPI
  const currentKPI = multiKPI[month]
  const prevMonth = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [month])
  const prevKPI = multiKPI[prevMonth]

  // 異変アラート
  const alerts = useMemo(() => {
    const list: { level: 'red' | 'yellow' | 'green'; text: string }[] = []
    if (!currentKPI || !prevKPI) return list
    const ratioSales = prevKPI.monthlySales > 0
      ? (currentKPI.monthlySales - prevKPI.monthlySales) / prevKPI.monthlySales
      : 0
    if (prevKPI.monthlySales > 0) {
      if (ratioSales <= -0.4) list.push({ level: 'red', text: `売上 前月比 ${Math.round(ratioSales * 100)}% — 急激な落ち込み` })
      else if (ratioSales <= -0.2) list.push({ level: 'yellow', text: `売上 前月比 ${Math.round(ratioSales * 100)}% — 注意` })
      else if (ratioSales >= 0.3) list.push({ level: 'green', text: `売上 前月比 +${Math.round(ratioSales * 100)}% — 好調` })
    }
    const ratioAvg = prevKPI.avgSpend > 0
      ? (currentKPI.avgSpend - prevKPI.avgSpend) / prevKPI.avgSpend
      : 0
    if (prevKPI.avgSpend > 0) {
      if (ratioAvg <= -0.4) list.push({ level: 'red', text: `客単価 前月比 ${Math.round(ratioAvg * 100)}% — 大幅減` })
      else if (ratioAvg <= -0.2) list.push({ level: 'yellow', text: `客単価 前月比 ${Math.round(ratioAvg * 100)}% — 低下傾向` })
    }
    return list
  }, [currentKPI, prevKPI])

  // 認証中／権限なし
  if (!castId) return <div style={{ padding: 40 }}>不正なURL</div>
  if (authorized === null) return <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#888' }}>読み込み中...</div>
  if (!authorized) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontSize: 13 }}>
        <p style={{ color: '#5A2840', fontWeight: 600, marginBottom: 8 }}>このページを閲覧する権限がありません</p>
        <p style={{ color: '#888', fontSize: 11 }}>「キャスト分析」権限が必要です。ホームへ戻ります...</p>
      </div>
    )
  }

  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const shortYen = (n: number) => {
    if (Math.abs(n) >= 10000) return `¥${Math.round(n / 10000)}万`
    return `¥${n.toLocaleString()}`
  }
  const monthsSinceJoin = cast ? Math.max(1, allMonths.length) : 0

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
        <span style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>
          {cast?.cast_name ?? '...'}
        </span>
        {cast?.cast_tier && (
          <span style={{
            fontSize: 9, padding: '2px 8px', borderRadius: 10,
            background: '#FBEAF0', color: '#72243E',
          }}>{cast.cast_tier}</span>
        )}
        <span style={{ fontSize: 11, color: C.pinkMuted }}>詳細分析</span>
        <MonthSwitcher value={month} onChange={handleChangeMonth} size="sm" style={{ marginLeft: 'auto' }} />
        <ViewModeToggle />
      </div>

      {/* キャリアサマリー（常に表示） */}
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
          <CareerCell label="入店からの月数" value={`${monthsSinceJoin}ヶ月`} />
          <CareerCell label="累計売上" value={formatYen(careerTotal.sales)} accent />
          <CareerCell label="累計来店本数" value={`${careerTotal.visits}本`} />
          <CareerCell label="累計同伴" value={`${careerTotal.douhan}回`} />
          <CareerCell
            label="ベスト月"
            value={bestMonth ? `${bestMonth.month.slice(5)}月 ${shortYen(bestMonth.sales)}` : '—'}
          />
        </div>
      </div>

      {/* 異変アラート */}
      {alerts.length > 0 && (
        <div style={{
          padding: '8px 16px',
          background: '#FFF',
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
                background: colors.bg,
                color: colors.fg,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                fontWeight: 500,
              }}>
                {a.level === 'red' ? '🚨' : a.level === 'yellow' ? '⚠️' : '🌟'} {a.text}
              </div>
            )
          })}
        </div>
      )}

      {/* タブ切替 */}
      <div style={{
        display: 'flex', gap: 0, padding: isPC ? '0 16px' : '0 8px',
        background: '#FFF', borderBottom: `1px solid ${C.border}`,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: isPC ? '10px 16px' : '8px 10px',
              fontSize: 11,
              fontWeight: activeTab === t.key ? 600 : 400,
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === t.key ? `2px solid ${C.pink}` : '2px solid transparent',
              color: activeTab === t.key ? C.pink : C.pinkMuted,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* タブコンテンツ — 第1段階で実装 */}
      <div style={{ padding: isPC ? '16px 20px' : '12px 10px' }}>
        {activeTab === 'overview' && (
          <OverviewTab
            month={month}
            multiKPI={multiKPI}
            multiTarget={multiTarget}
            allMonths={allMonths}
            customers={customers}
            isPC={isPC}
          />
        )}
        {activeTab === 'timeline' && (
          <TimelineTab
            multiKPI={multiKPI}
            multiTarget={multiTarget}
            allMonths={allMonths}
            customers={customers}
            isPC={isPC}
          />
        )}
        {activeTab === 'customers' && (
          <CustomersTab
            customers={customers}
            monthVisits={monthVisits}
            month={month}
            onCustomerClick={setOverlayCustomerId}
            isPC={isPC}
          />
        )}
        {activeTab === 'compatibility' && (
          <CompatibilityTab customers={customers} isPC={isPC} />
        )}
        {activeTab === 'contact' && cast && (
          <ContactTab castName={cast.cast_name} customers={customers} isPC={isPC} onCustomerClick={setOverlayCustomerId} />
        )}
        {activeTab === 'shift' && (
          <ShiftTab castId={castId} multiKPI={multiKPI} allMonths={allMonths} isPC={isPC} />
        )}
        {activeTab === 'detection' && (
          <DetectionTab customers={customers} currentMonth={month} multiKPI={multiKPI} multiTarget={multiTarget} isPC={isPC} onCustomerClick={setOverlayCustomerId} />
        )}
        {activeTab === 'compare' && cast && (
          <CompareTab cast={cast} currentMonth={month} multiKPI={multiKPI} isPC={isPC} />
        )}
        {activeTab === 'export' && cast && (
          <ExportTab cast={cast} customers={customers} isPC={isPC} />
        )}
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
              <button
                onClick={() => setOverlayCustomerId(null)}
                style={{
                  background: 'transparent', border: 'none',
                  color: C.pink, fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit', padding: 0,
                }}
              >← 戻る</button>
              <span style={{ fontSize: 11, color: C.pinkMuted }}>顧客詳細</span>
            </div>
            <CustomerDetailPanel
              customerId={overlayCustomerId}
              isPC={isPC}
              isAdmin={true}
            />
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
      borderRadius: 8,
      padding: '8px 10px',
    }}>
      <div style={{ fontSize: 9, color: C.pinkMuted, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 14, fontWeight: 600,
        color: accent ? C.pink : C.dark,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {value}
      </div>
    </div>
  )
}

