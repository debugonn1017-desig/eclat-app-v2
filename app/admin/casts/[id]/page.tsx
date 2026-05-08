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
import ViewModeToggle from '@/components/ViewModeToggle'

type TabKey = 'overview' | 'timeline' | 'customers' | 'contact' | 'shift' | 'detection' | 'compare' | 'export'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: '概要', icon: '📊' },
  { key: 'timeline', label: '時系列', icon: '📈' },
  { key: 'customers', label: 'お客様', icon: '👥' },
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
      // 入店日 = profiles.created_at から現在月までのリストを生成
      const start = new Date(cast.created_at)
      start.setDate(1)
      const now = new Date()
      const months: string[] = []
      const cur = new Date(start)
      while (cur <= now) {
        months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
        cur.setMonth(cur.getMonth() + 1)
        if (months.length > 36) break // 安全弁
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
            isPC={isPC}
          />
        )}
        {activeTab === 'timeline' && (
          <TimelineTab
            multiKPI={multiKPI}
            multiTarget={multiTarget}
            allMonths={allMonths}
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

export function PlaceholderTab({ title, message }: { title: string; message: string }) {
  return (
    <div style={{
      padding: 30, textAlign: 'center',
      background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.dark, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: C.pinkMuted }}>{message}</div>
    </div>
  )
}

// ─── 概要タブ：直近3〜6ヶ月のミニチャート ──────────────────
export function OverviewTab({
  month, multiKPI, multiTarget, allMonths, isPC,
}: {
  month: string
  multiKPI: Record<string, CastKPI>
  multiTarget: Record<string, number>
  allMonths: string[]
  isPC: boolean
}) {
  const formatYen = (n: number) => `¥${n.toLocaleString()}`

  // 直近6ヶ月のデータ
  const recent = useMemo(() => {
    const idx = allMonths.indexOf(month)
    if (idx < 0) return allMonths.slice(-6)
    return allMonths.slice(Math.max(0, idx - 5), idx + 1)
  }, [allMonths, month])

  const cur = multiKPI[month]
  const target = multiTarget[month] ?? 0
  const achievement = target > 0 && cur ? Math.round((cur.monthlySales / target) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 当月の主要指標 */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '14px 16px',
      }}>
        <div style={{ fontSize: 11, color: C.pinkMuted, marginBottom: 8 }}>
          今月の主要指標
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isPC ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
          gap: 8,
        }}>
          <MetricBox label="売上" value={cur ? formatYen(cur.monthlySales) : '—'} accent />
          <MetricBox label="達成率" value={target > 0 ? `${achievement}%` : '—'} />
          <MetricBox label="本指名" value={cur ? `${cur.honshimeiCount}人` : '—'} />
          <MetricBox label="客単価" value={cur ? formatYen(cur.avgSpend) : '—'} />
          <MetricBox label="場内→本転換" value={cur ? `${cur.conversionCount}件` : '—'} />
          <MetricBox label="同伴" value={cur ? `${cur.douhanCount}回` : '—'} />
          <MetricBox label="アフター" value={cur ? `${cur.afterCount}回` : '—'} />
          <MetricBox label="来店組数" value={cur ? `${cur.visitGroups}組` : '—'} />
        </div>
      </div>

      {/* 直近6ヶ月のミニライン: 売上 / 客単価 / 指名数 / 同伴 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isPC ? 'repeat(2, 1fr)' : '1fr',
        gap: 10,
      }}>
        <MiniLineCard
          title="売上推移（直近6ヶ月）"
          months={recent}
          values={recent.map(m => multiKPI[m]?.monthlySales ?? 0)}
          format={(n) => `¥${Math.round(n / 10000)}万`}
        />
        <MiniLineCard
          title="客単価推移"
          months={recent}
          values={recent.map(m => multiKPI[m]?.avgSpend ?? 0)}
          format={(n) => `${Math.round(n / 1000)}K`}
        />
        <MiniLineCard
          title="本指名数推移"
          months={recent}
          values={recent.map(m => multiKPI[m]?.honshimeiCount ?? 0)}
          format={(n) => `${n}人`}
        />
        <MiniLineCard
          title="同伴回数"
          months={recent}
          values={recent.map(m => multiKPI[m]?.douhanCount ?? 0)}
          format={(n) => `${n}回`}
        />
      </div>
    </div>
  )
}

function MetricBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background: '#F9F6F7',
      borderRadius: 8,
      padding: '8px 10px',
    }}>
      <div style={{ fontSize: 9, color: C.pinkMuted, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 16, fontWeight: 500,
        color: accent ? C.pink : C.dark,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</div>
    </div>
  )
}

// 直近 N 月のラインを SVG で描画する小型カード
function MiniLineCard({
  title, months, values, format,
}: {
  title: string
  months: string[]
  values: number[]
  format: (v: number) => string
}) {
  const W = 280, H = 90, padL = 30, padR = 8, padT = 14, padB = 18
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const maxVal = values.length > 0 ? Math.max(...values, 1) : 1
  const xStep = values.length > 1 ? chartW / (values.length - 1) : chartW / 2
  const toX = (i: number) => padL + (values.length > 1 ? i * xStep : chartW / 2)
  const toY = (v: number) => padT + chartH - (v / maxVal) * chartH

  const points = values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 6 }}>
        {title}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        <polyline points={points} fill="none" stroke={C.pink} strokeWidth="2" strokeLinejoin="round" />
        {values.map((v, i) => (
          <g key={i}>
            <circle cx={toX(i)} cy={toY(v)} r="3" fill={C.pink} />
            <text x={toX(i)} y={toY(v) - 5} textAnchor="middle" fill={C.dark} fontSize="8" fontWeight="600">
              {format(v)}
            </text>
          </g>
        ))}
        {months.map((m, i) => (
          <text key={m} x={toX(i)} y={H - 4} textAnchor="middle" fill={C.pinkMuted} fontSize="8">
            {m.slice(5).replace(/^0/, '')}月
          </text>
        ))}
      </svg>
    </div>
  )
}

// ─── 時系列タブ：過去全期間のグラフ＋データテーブル ──────────
export function TimelineTab({
  multiKPI, multiTarget, allMonths, isPC,
}: {
  multiKPI: Record<string, CastKPI>
  multiTarget: Record<string, number>
  allMonths: string[]
  isPC: boolean
}) {
  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const sales = allMonths.map(m => multiKPI[m]?.monthlySales ?? 0)
  const targets = allMonths.map(m => multiTarget[m] ?? 0)

  // メインの売上グラフ（フル期間）
  const W = 700, H = 220, padL = 50, padR = 14, padT = 14, padB = 28
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const allVals = [...sales, ...targets].filter(v => v > 0)
  const maxVal = allVals.length > 0 ? Math.max(...allVals) * 1.1 : 100000
  const xStep = allMonths.length > 1 ? chartW / (allMonths.length - 1) : chartW / 2
  const toX = (i: number) => padL + (allMonths.length > 1 ? i * xStep : chartW / 2)
  const toY = (v: number) => padT + chartH - (v / maxVal) * chartH
  const salesPoints = sales.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
  const targetPoints = targets.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
  const gridLines = 4
  const gridVals = Array.from({ length: gridLines + 1 }, (_, i) => Math.round((maxVal / gridLines) * i))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 売上推移グラフ（全期間） */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 6 }}>
          売上推移（{allMonths.length}ヶ月分・点線=目標）
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
          {gridVals.map((v, i) => (
            <g key={i}>
              <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)} stroke="#F0E8EB" strokeWidth="0.5" />
              <text x={padL - 4} y={toY(v) + 3} textAnchor="end" fill={C.pinkMuted} fontSize="8">
                {Math.round(v / 10000)}万
              </text>
            </g>
          ))}
          {targets.some(v => v > 0) && (
            <polyline points={targetPoints} fill="none" stroke={C.pinkMuted} strokeWidth="1.5" strokeDasharray="5,4" />
          )}
          <polyline points={salesPoints} fill="none" stroke={C.pink} strokeWidth="2.5" strokeLinejoin="round" />
          {sales.map((v, i) => (
            <circle key={i} cx={toX(i)} cy={toY(v)} r="3" fill={C.pink} />
          ))}
          {allMonths.map((m, i) => (
            (allMonths.length <= 12 || i % Math.ceil(allMonths.length / 12) === 0) && (
              <text key={m} x={toX(i)} y={H - 4} textAnchor="middle" fill={C.pinkMuted} fontSize="8">
                {m.slice(5).replace(/^0/, '')}月
              </text>
            )
          ))}
        </svg>
      </div>

      {/* 月別データテーブル */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', overflowX: 'auto' }}>
        <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 8 }}>
          月別データ（新しい順）
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ background: '#FBEAF0', color: '#5A2840' }}>
              <th style={tdH}>月</th>
              <th style={{ ...tdH, textAlign: 'right' }}>売上</th>
              <th style={{ ...tdH, textAlign: 'right' }}>目標</th>
              <th style={{ ...tdH, textAlign: 'right' }}>達成率</th>
              <th style={tdH}>本指名</th>
              <th style={tdH}>転換</th>
              <th style={tdH}>同伴</th>
              <th style={tdH}>アフ</th>
              <th style={{ ...tdH, textAlign: 'right' }}>客単価</th>
            </tr>
          </thead>
          <tbody>
            {[...allMonths].reverse().map(m => {
              const k = multiKPI[m]
              const t = multiTarget[m] ?? 0
              const ach = t > 0 && k ? Math.round((k.monthlySales / t) * 100) : 0
              return (
                <tr key={m} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={td}>{m}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: C.pink }}>
                    {k ? formatYen(k.monthlySales) : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{t > 0 ? formatYen(t) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{t > 0 ? `${ach}%` : '—'}</td>
                  <td style={td}>{k?.honshimeiCount ?? 0}</td>
                  <td style={td}>{k?.conversionCount ?? 0}</td>
                  <td style={td}>{k?.douhanCount ?? 0}</td>
                  <td style={td}>{k?.afterCount ?? 0}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{k ? formatYen(k.avgSpend) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!isPC && (
          <div style={{ fontSize: 9, color: C.pinkMuted, marginTop: 4 }}>※ 横スクロールで全列確認</div>
        )}
      </div>
    </div>
  )
}

const tdH: React.CSSProperties = { padding: '6px 6px', fontSize: 10, fontWeight: 500, textAlign: 'left', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '5px 6px', fontSize: 10, color: '#3D2D38', textAlign: 'center' }

// ─── お客様タブ：担当顧客一覧（ソート・フィルタ・各セクション） ──────
export function CustomersTab({
  customers, monthVisits, month, onCustomerClick, isPC,
}: {
  customers: Array<{
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
  }>
  monthVisits: Array<{ customer_id: string; visit_date: string; amount_spent: number; has_douhan: boolean; nomination_status?: string }>
  month: string
  onCustomerClick: (id: string) => void
  isPC: boolean
}) {
  const formatYen = (n: number) => `¥${n.toLocaleString()}`

  // 当月の本指名・場内・フリー・転換にあたるお客様を集計
  const monthlyByCustomer = useMemo(() => {
    const map = new Map<string, { sales: number; visits: number; douhan: number; nomination: string | undefined }>()
    for (const v of monthVisits) {
      if (Number(v.amount_spent) <= 0) continue
      const e = map.get(v.customer_id) ?? { sales: 0, visits: 0, douhan: 0, nomination: v.nomination_status }
      e.sales += Number(v.amount_spent) || 0
      e.visits += 1
      if (v.has_douhan) e.douhan += 1
      e.nomination = v.nomination_status ?? e.nomination
      map.set(v.customer_id, e)
    }
    return map
  }, [monthVisits])

  // セクション分類
  const honshimei = customers.filter(c => monthlyByCustomer.get(c.id) && (monthlyByCustomer.get(c.id)?.nomination === '本指名'))
  const banai = customers.filter(c => monthlyByCustomer.get(c.id) && (monthlyByCustomer.get(c.id)?.nomination === '場内'))
  const top20 = [...customers].sort((a, b) => b.total_spent - a.total_spent).slice(0, 20)
  const today = new Date()
  const dropouts = customers
    .filter(c => c.last_visit_date)
    .map(c => {
      const last = new Date(c.last_visit_date!)
      const days = Math.floor((today.getTime() - last.getTime()) / 86400000)
      return { c, days }
    })
    .filter(x => x.days >= 90)
    .sort((a, b) => b.days - a.days)

  const douhanList = customers.filter(c => c.has_douhan)

  // 新規（first_visit_date が当月）
  const newCustomers = customers.filter(c => {
    if (!c.first_visit_date) return false
    return String(c.first_visit_date).startsWith(month)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionBlock
        title={`今月の本指名 — ${honshimei.length}人`}
        emptyText="今月の本指名来店はまだありません"
        items={honshimei}
        onCustomerClick={onCustomerClick}
        showMonthly={monthlyByCustomer}
        isPC={isPC}
        accent="#B25575"
      />
      <SectionBlock
        title={`今月の場内 — ${banai.length}人`}
        emptyText="今月の場内来店はまだありません"
        items={banai}
        onCustomerClick={onCustomerClick}
        showMonthly={monthlyByCustomer}
        isPC={isPC}
        accent="#7A4060"
      />
      <SectionBlock
        title={`今月の新規お客様 — ${newCustomers.length}人`}
        emptyText="今月の新規はまだありません"
        items={newCustomers}
        onCustomerClick={onCustomerClick}
        showMonthly={monthlyByCustomer}
        isPC={isPC}
        accent="#0F6E56"
      />
      <SectionBlock
        title={`累計売上 トップ20`}
        items={top20}
        onCustomerClick={onCustomerClick}
        showMonthly={monthlyByCustomer}
        isPC={isPC}
        accent="#D4A017"
        useTotal
      />
      <SectionBlock
        title={`同伴経験あり — ${douhanList.length}人`}
        items={douhanList}
        onCustomerClick={onCustomerClick}
        showMonthly={monthlyByCustomer}
        isPC={isPC}
        accent="#E8789A"
      />
      <SectionBlock
        title={`離脱リスク（90日以上未来店） — ${dropouts.length}人`}
        emptyText="離脱リスクのお客様はいません 👏"
        items={dropouts.map(x => x.c)}
        onCustomerClick={onCustomerClick}
        showMonthly={monthlyByCustomer}
        isPC={isPC}
        accent="#C53030"
        showLastVisitDays
      />
    </div>
  )
}

function SectionBlock({
  title, emptyText, items, onCustomerClick, showMonthly, isPC, accent, useTotal, showLastVisitDays,
}: {
  title: string
  emptyText?: string
  items: Array<{
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
  }>
  onCustomerClick: (id: string) => void
  showMonthly: Map<string, { sales: number; visits: number; douhan: number; nomination: string | undefined }>
  isPC: boolean
  accent: string
  useTotal?: boolean
  showLastVisitDays?: boolean
}) {
  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const today = new Date()
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: accent,
        borderLeft: `3px solid ${accent}`, paddingLeft: 8,
        marginBottom: 8,
      }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, padding: 12 }}>{emptyText ?? 'データなし'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(c => {
            const m = showMonthly.get(c.id)
            const lastDays = c.last_visit_date
              ? Math.floor((today.getTime() - new Date(c.last_visit_date).getTime()) / 86400000)
              : null
            return (
              <button
                key={c.id}
                onClick={() => onCustomerClick(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 8,
                  background: '#F9F6F7', border: `1px solid ${C.border}`,
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  width: '100%', flexWrap: 'wrap',
                }}
              >
                {c.customer_rank && (
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 4,
                    background: c.customer_rank === 'S' ? '#FBEAF0' : c.customer_rank === 'A' ? '#FAEEDA' : C.tagBg,
                    color: C.dark, fontWeight: 500,
                  }}>{c.customer_rank}</span>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: C.dark, textDecoration: 'underline', textDecorationColor: 'rgba(232,120,154,0.3)' }}>
                  {c.customer_name} 様
                </span>
                {c.has_douhan && (
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, background: '#FBEAF0', color: '#72243E' }}>同伴経験</span>
                )}
                {c.nomination_status && (
                  <span style={{ fontSize: 9, color: C.pinkMuted }}>{c.nomination_status}</span>
                )}
                {showLastVisitDays && lastDays != null && (
                  <span style={{ fontSize: 10, color: lastDays >= 120 ? '#C53030' : '#BA7517', fontWeight: 500 }}>
                    {lastDays}日未来店
                  </span>
                )}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  {useTotal ? (
                    <>
                      <span style={{ fontSize: 13, fontWeight: 600, color: accent }}>
                        {formatYen(c.total_spent)}
                      </span>
                      <span style={{ fontSize: 9, color: C.pinkMuted }}>累計 / {c.visit_count}回</span>
                    </>
                  ) : m ? (
                    <>
                      <span style={{ fontSize: 13, fontWeight: 600, color: accent }}>
                        {formatYen(m.sales)}
                      </span>
                      <span style={{ fontSize: 9, color: C.pinkMuted }}>{m.visits}回</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 11, color: C.pinkMuted }}>累計 {formatYen(c.total_spent)}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {!isPC && items.length > 5 && (
        <div style={{ fontSize: 9, color: C.pinkMuted, marginTop: 4 }}>※ タップでお客様詳細を開く</div>
      )}
    </div>
  )
}
