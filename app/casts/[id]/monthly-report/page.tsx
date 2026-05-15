'use client'

// キャスト個人月次レポート（印刷向け）
//   /casts/[id]/monthly-report?month=YYYY-MM
//   - 個人売上 / 達成率 / 順位 / 主要KPI
//   - 前月との差分
//   - 担当顧客のランク内訳
//   - 場内→本指名 転換履歴
//   印刷で PDF 化（window.print()）
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCasts } from '@/hooks/useCasts'
import { CastKPI, CastProfile } from '@/types'
import MonthSwitcher from '@/components/MonthSwitcher'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { useBackOrHome } from '@/hooks/useBackOrHome'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'

type RankingApi = {
  cast: CastProfile
  kpi: CastKPI
  prevSales: number
  targetSales: number
  achievementRate: number
}

export default function CastMonthlyReportPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 40 }}><Spinner size="md" label="読み込み中..." /></div>
      }
    >
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { getCastTarget, getConversionDetails } = useCasts()

  const castId = params?.id ?? ''
  const goBack = useBackOrHome(`/casts/${castId}`)
  useScrollTopOnMount()

  const initialMonth = useMemo(() => {
    const q = search?.get('month')
    if (q && /^\d{4}-\d{2}$/.test(q)) return q
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [search])
  const [month, setMonth] = useState<string>(initialMonth)
  useEffect(() => { setMonth(initialMonth) }, [initialMonth])
  const handleChangeMonth = useCallback((next: string) => {
    setMonth(next)
    router.replace(`/casts/${castId}/monthly-report?month=${next}`, { scroll: false })
  }, [router, castId])

  const [cast, setCast] = useState<CastProfile | null>(null)
  const [rows, setRows] = useState<RankingApi[]>([])
  const [convDetails, setConvDetails] = useState<{
    history: { customerName: string; changedAt: string; daysTaken: number }[]
    avgDays: number
    banaTotal: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  // ─── 認証ガード ──────────────────────────────────────────
  //   閲覧可能なのは:
  //     - オーナー
  //     - 'レポート.閲覧' 権限を持つ管理者ロール
  //     - キャスト本人 (castId === 自分のID)
  //   それ以外は「権限がありません」表示後にホームへリダイレクト
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) {
          setAuthorized(false)
          return
        }
        const me = await res.json()
        const isOwner = me.is_owner === true
        const hasReportPerm = me.permissions?.['レポート.閲覧'] === true
        const isSelf = me.id === castId
        setAuthorized(isOwner || hasReportPerm || isSelf)
      } catch {
        setAuthorized(false)
      }
    }
    if (castId) check()
  }, [castId])

  useEffect(() => {
    if (authorized === false) {
      const t = setTimeout(() => router.push('/home'), 1200)
      return () => clearTimeout(t)
    }
  }, [authorized, router])

  // 自分のプロフィール（cast_name 取得用）
  useEffect(() => {
    const fetchCast = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, role, cast_name, display_name, cast_tier, is_active, created_at')
        .eq('id', castId)
        .maybeSingle()
      if (data) setCast(data as CastProfile)
    }
    if (castId) fetchCast()
  }, [castId, supabase])

  // ランキングAPIを叩いて自分含む全キャストの集計を取得
  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await window.fetch(`/api/cast-rankings?month=${month}`, { cache: 'no-store' })
        if (!res.ok) return
        const data: RankingApi[] = await res.json()
        setRows(data)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [month])

  // 転換詳細
  useEffect(() => {
    if (!castId) return
    getConversionDetails(castId, month).then(setConvDetails)
  }, [castId, month, getConversionDetails])

  // ─── PDF拡充用の追加データ ────────────────────────
  type RecentMonth = { month: string; sales: number; target: number; achievement: number; workDays: number; perWorkDay: number; avgSpend: number }
  const [recentMonths, setRecentMonths] = useState<RecentMonth[]>([])
  type CompatBucket = { key: string; total: number; count: number; repeatRate: number }
  type CompatGroups = {
    rank: CompatBucket[]
    region: CompatBucket[]
    age: CompatBucket[]
    occupation: CompatBucket[]
  }
  const [compat, setCompat] = useState<CompatGroups | null>(null)
  type DowStat = { dow: string; sales: number; count: number }
  const [dowStats, setDowStats] = useState<DowStat[]>([])
  type LtvCustomer = { id: string; name: string; rank: string | null; region: string | null; total: number; visits: number }
  const [ltvTop10, setLtvTop10] = useState<LtvCustomer[]>([])
  type DetectionSummary = {
    noContact: number
    douhanInactive: number
    dropoutRisk: number
    salesDecline: number
    birthdayApproach: number
    banaiOver60: number
  }
  const [detectionSummary, setDetectionSummary] = useState<DetectionSummary | null>(null)

  useEffect(() => {
    if (!cast || !castId) return
    const load = async () => {
      // 直近12ヶ月のKPI（自分のものだけ）— ranking API を順次叩く
      const months: string[] = []
      const baseDate = new Date(month + '-01')
      for (let i = 11; i >= 0; i--) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1)
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
      const recents: RecentMonth[] = []
      for (const m of months) {
        try {
          const res = await fetch(`/api/cast-rankings?month=${m}`, { cache: 'no-store' })
          if (!res.ok) { recents.push({ month: m, sales: 0, target: 0, achievement: 0, workDays: 0, perWorkDay: 0, avgSpend: 0 }); continue }
          const data: RankingApi[] = await res.json()
          const me = data.find(r => r.cast.id === castId)
          if (!me) { recents.push({ month: m, sales: 0, target: 0, achievement: 0, workDays: 0, perWorkDay: 0, avgSpend: 0 }); continue }
          recents.push({
            month: m,
            sales: me.kpi.monthlySales,
            target: me.targetSales,
            achievement: me.targetSales > 0 ? Math.round((me.kpi.monthlySales / me.targetSales) * 100) : 0,
            workDays: me.kpi.workDays ?? 0,
            perWorkDay: me.kpi.workDays > 0 ? Math.round(me.kpi.monthlySales / me.kpi.workDays) : 0,
            avgSpend: me.kpi.avgSpend ?? 0,
          })
        } catch { recents.push({ month: m, sales: 0, target: 0, achievement: 0, workDays: 0, perWorkDay: 0, avgSpend: 0 }) }
      }
      setRecentMonths(recents)

      // 担当顧客のフルデータ取得
      const { data: cs } = await supabase
        .from('customers')
        .select('id, customer_name, customer_rank, region, age_group, occupation, nomination_status, last_contact_date, first_visit_date, has_douhan, birthday')
        .eq('cast_name', cast.cast_name)
      const custList = (cs ?? []) as Array<{
        id: string; customer_name: string; customer_rank: string | null
        region: string | null; age_group: string | null; occupation: string | null
        nomination_status: string | null; last_contact_date: string | null
        first_visit_date: string | null; has_douhan: boolean | null; birthday: string | null
      }>
      if (custList.length === 0) { setCompat(null); setDowStats([]); setLtvTop10([]); setDetectionSummary(null); return }

      const ids = custList.map(c => c.id)
      // ⚠ 1000件制限対策: トップキャストの累計 visits は 1000+ になる
      const visits = await fetchAllPaginated<{ customer_id: string; visit_date: string; amount_spent: number; has_douhan: boolean }>(
        (from, to) =>
          supabase
            .from('customer_visits')
            .select('customer_id, visit_date, amount_spent, has_douhan')
            .in('customer_id', ids)
            .range(from, to)
      ).catch(e => { console.error('[monthly-report visits]', e); return [] })
      const visitArr = visits.filter(v => Number(v.amount_spent) > 0)

      // 顧客別合計
      const totalByCust = new Map<string, { total: number; count: number; douhan: boolean }>()
      const lastVisitByCust = new Map<string, string>()
      for (const v of visitArr) {
        const cur = totalByCust.get(v.customer_id) ?? { total: 0, count: 0, douhan: false }
        cur.total += Number(v.amount_spent) || 0
        cur.count += 1
        if (v.has_douhan) cur.douhan = true
        totalByCust.set(v.customer_id, cur)
        const last = lastVisitByCust.get(v.customer_id)
        if (!last || v.visit_date > last) lastVisitByCust.set(v.customer_id, v.visit_date)
      }

      // 相性Top — 簡易版（ランク/地域/年齢/職業 各カテゴリの売上Top）
      const aggregateBy = (getKey: (c: typeof custList[number]) => string | null): CompatBucket[] => {
        const groups = new Map<string, { total: number; ids: Set<string>; repeat: number }>()
        for (const c of custList) {
          const k = getKey(c) ?? '未設定'
          const t = totalByCust.get(c.id)
          if (!t) continue
          const g = groups.get(k) ?? { total: 0, ids: new Set(), repeat: 0 }
          g.total += t.total
          g.ids.add(c.id)
          if (t.count >= 2) g.repeat += 1
          groups.set(k, g)
        }
        const arr: CompatBucket[] = []
        for (const [key, g] of groups) {
          arr.push({
            key, total: g.total, count: g.ids.size,
            repeatRate: g.ids.size > 0 ? Math.round((g.repeat / g.ids.size) * 100) : 0,
          })
        }
        return arr.sort((a, b) => b.total - a.total).slice(0, 5)
      }
      setCompat({
        rank: aggregateBy(c => c.customer_rank),
        region: aggregateBy(c => c.region),
        age: aggregateBy(c => c.age_group),
        occupation: aggregateBy(c => c.occupation),
      })

      // 曜日別売上（過去6ヶ月）
      const cutoff180 = Date.now() - 180 * 86400000
      const dowSales = Array(7).fill(0) as number[]
      const dowCount = Array(7).fill(0) as number[]
      for (const v of visitArr) {
        const t = new Date(v.visit_date).getTime()
        if (t < cutoff180) continue
        const d = new Date(v.visit_date + 'T00:00:00')
        const dow = (d.getDay() + 6) % 7 // 月=0
        dowSales[dow] += Number(v.amount_spent) || 0
        dowCount[dow] += 1
      }
      const labels = ['月', '火', '水', '木', '金', '土', '日']
      setDowStats(labels.map((l, i) => ({ dow: l, sales: dowSales[i], count: dowCount[i] })))

      // LTV Top 10
      const ltv: LtvCustomer[] = custList
        .map(c => {
          const t = totalByCust.get(c.id)
          return {
            id: c.id, name: c.customer_name, rank: c.customer_rank, region: c.region,
            total: t?.total ?? 0, visits: t?.count ?? 0,
          }
        })
        .filter(x => x.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
      setLtvTop10(ltv)

      // 検知要約（しきい値はデフォルト値を使用）
      const today = Date.now()
      const daysSince = (d: string | null | undefined) => d ? Math.floor((today - new Date(d).getTime()) / 86400000) : null
      let noContact = 0, douhanInactive = 0, dropoutRisk = 0, salesDecline = 0, birthdayApproach = 0, banaiOver60 = 0
      const cutoff90 = today - 90 * 86400000
      const cutoff180b = today - 180 * 86400000
      const todayD = new Date()
      todayD.setHours(0, 0, 0, 0)
      for (const c of custList) {
        // S/A連絡なし(30日)
        if (['S', 'A'].includes(c.customer_rank ?? '')) {
          const ds = daysSince(c.last_contact_date)
          if (ds === null || ds >= 30) noContact += 1
        }
        // 同伴 × 60日未来店
        const lv = lastVisitByCust.get(c.id)
        if (lv) {
          const lvDays = Math.floor((today - new Date(lv).getTime()) / 86400000)
          const t = totalByCust.get(c.id)
          if (t && t.douhan && lvDays >= 60) douhanInactive += 1
          if (c.nomination_status === '本指名' && lvDays >= 90) dropoutRisk += 1
        }
        // 売上下降
        let recent = 0, prev = 0
        for (const v of visitArr) {
          if (v.customer_id !== c.id) continue
          const t = new Date(v.visit_date).getTime()
          if (t >= cutoff90) recent += Number(v.amount_spent) || 0
          else if (t >= cutoff180b) prev += Number(v.amount_spent) || 0
        }
        if (prev > 0 && (prev - recent) / prev >= 0.3) salesDecline += 1
        // 誕生日近接14日 × 30日連絡なし
        if (c.birthday) {
          const parts = c.birthday.split('-')
          const bm = parseInt(parts[1] ?? '0', 10)
          const bd = parseInt(parts[2] ?? '0', 10)
          if (!isNaN(bm) && !isNaN(bd) && bm > 0 && bd > 0) {
            let next = new Date(todayD.getFullYear(), bm - 1, bd)
            if (next < todayD) next = new Date(todayD.getFullYear() + 1, bm - 1, bd)
            const dtb = Math.floor((next.getTime() - todayD.getTime()) / 86400000)
            if (dtb <= 14) {
              const ds = daysSince(c.last_contact_date)
              if (ds === null || ds >= 30) birthdayApproach += 1
            }
          }
        }
        // 場内60日経過
        if (c.nomination_status === '場内' && c.first_visit_date) {
          const ds = Math.floor((today - new Date(c.first_visit_date).getTime()) / 86400000)
          if (ds >= 60 && ds <= 180) banaiOver60 += 1
        }
      }
      setDetectionSummary({ noContact, douhanInactive, dropoutRisk, salesDecline, birthdayApproach, banaiOver60 })
    }
    load()
  }, [cast, castId, month, supabase])

  const my = useMemo(() => rows.find(r => r.cast.id === castId), [rows, castId])
  const sortedBySales = useMemo(
    () => [...rows].sort((a, b) => b.kpi.monthlySales - a.kpi.monthlySales),
    [rows]
  )
  const myRank = useMemo(
    () => sortedBySales.findIndex(r => r.cast.id === castId) + 1,
    [sortedBySales, castId]
  )

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return `${y}年${m}月`
  }, [month])

  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const diff = my ? my.kpi.monthlySales - my.prevSales : 0
  const diffPct = my && my.prevSales > 0 ? Math.round((diff / my.prevSales) * 100) : null

  if (!castId) return <div style={{ padding: 40 }}>不正なURLです</div>

  // 認証チェック中
  if (authorized === null) {
    return <div style={{ padding: 40 }}><Spinner size="md" label="認証情報を確認中..." /></div>
  }
  // 権限なし
  if (!authorized) {
    return (
      <div style={{ padding: 40, maxWidth: 420, margin: '0 auto' }}>
        <EmptyState
          variant="warning"
          title="権限がありません"
          message="この個人レポートを閲覧する権限がありません。ホームへ戻ります..."
        />
      </div>
    )
  }

  return (
    <div
      style={{
        background: '#FFF',
        minHeight: '100vh',
        padding: 0,
        fontFamily: '"Yu Gothic", -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* 印刷時に隠すコントロール */}
      <div
        className="no-print"
        style={{
          padding: '14px 20px',
          background: '#FAFAFA',
          borderBottom: '1px solid #E8DDE0',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={goBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#E8789A',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          ← 戻る
        </button>
        <MonthSwitcher value={month} onChange={handleChangeMonth} size="sm" />
        <span style={{ fontSize: 11, color: '#6B5060' }}>個人レポート</span>
        <button
          onClick={() => window.print()}
          style={{
            marginLeft: 'auto',
            background: '#E8789A',
            color: '#FFF',
            border: 'none',
            padding: '8px 18px',
            fontSize: 12,
            cursor: 'pointer',
            borderRadius: 8,
          }}
        >
          PDF 保存（印刷）
        </button>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #FFF; }
        }
      `}</style>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 60px' }}>
        {/* タイトル */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#E8789A' }}>
            INDIVIDUAL MONTHLY REPORT
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 600,
              color: '#5A2840',
              margin: '8px 0 4px',
              letterSpacing: '0.05em',
            }}
          >
            {cast?.cast_name ?? '...'} さん
          </h1>
          <div style={{ fontSize: 13, color: '#6B5060' }}>
            {monthLabel} の成績まとめ
          </div>
        </div>

        {loading || !my ? (
          <div style={{ padding: 40 }}>
            <Spinner size="md" label="読み込み中..." />
          </div>
        ) : (
          <>
            {/* 上段サマリー */}
            <section
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                marginBottom: 24,
              }}
            >
              {[
                { label: '今月売上', value: formatYen(my.kpi.monthlySales), accent: true },
                {
                  label: '達成率',
                  value: my.targetSales > 0 ? `${my.achievementRate}%` : '—',
                  accent: false,
                },
                { label: '店舗順位', value: `${myRank}位 / ${rows.length}名`, accent: false },
                {
                  label: '前月比',
                  value:
                    my.prevSales === 0
                      ? '—'
                      : diffPct == null
                      ? '—'
                      : `${diff >= 0 ? '+' : ''}${diffPct}%`,
                  accent: false,
                },
              ].map((s, i) => (
                <div
                  key={i}
                  style={{
                    background: '#FCF1F4',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#B0909A' }}>{s.label}</div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 500,
                      color: s.accent ? '#E8789A' : '#3D2D38',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </section>

            {/* 主要 KPI */}
            <section style={{ marginBottom: 24 }}>
              <h2 style={SectionH2}>主要KPI</h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 6,
                  fontSize: 11,
                }}
              >
                <KpiCell label="本指名" value={`${my.kpi.honshimeiCount}人`} />
                <KpiCell label="場内" value={`${my.kpi.banaiMonthlyCount}件`} />
                <KpiCell label="転換" value={`${my.kpi.conversionCount}件`} />
                <KpiCell label="同伴" value={`${my.kpi.douhanCount}回`} />
                <KpiCell label="アフター" value={`${my.kpi.afterCount}回`} />
                <KpiCell label="客単価" value={formatYen(my.kpi.avgSpend)} />
                <KpiCell label="来店組数" value={`${my.kpi.visitGroups}組`} />
                <KpiCell label="出勤日" value={`${my.kpi.totalVisitCount}回`} />
                <KpiCell label="顧客数" value={`${my.kpi.customerCount}人`} />
                <KpiCell label="県外顧客" value={`${my.kpi.kengaiCount}人`} />
              </div>
            </section>

            {/* ランク別 */}
            <section style={{ marginBottom: 24 }}>
              <h2 style={SectionH2}>ランク別 売上内訳</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#FBEAF0', color: '#5A2840' }}>
                    <th style={th}>ランク</th>
                    <th style={{ ...th, textAlign: 'right' }}>売上</th>
                    <th style={{ ...th, textAlign: 'right' }}>来店</th>
                    <th style={{ ...th, textAlign: 'right' }}>客単価</th>
                  </tr>
                </thead>
                <tbody>
                  {(['S', 'A', 'B', 'C'] as const).map(r => {
                    const v = my.kpi.rankBreakdown[r] ?? { sales: 0, visits: 0 }
                    const avg = v.visits > 0 ? Math.round(v.sales / v.visits) : 0
                    return (
                      <tr key={r} style={{ borderBottom: '1px solid #E8DDE0' }}>
                        <td style={td}>{r}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{formatYen(v.sales)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{v.visits}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{formatYen(avg)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>

            {/* 転換履歴 */}
            {convDetails && convDetails.history.length > 0 && (
              <section style={{ marginBottom: 24 }}>
                <h2 style={SectionH2}>場内→本指名 転換履歴</h2>
                <div style={{ fontSize: 11, color: '#6B5060', marginBottom: 8 }}>
                  平均転換日数: {convDetails.avgDays}日 / 母数{convDetails.banaTotal}名
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#FBEAF0', color: '#5A2840' }}>
                      <th style={th}>顧客</th>
                      <th style={th}>転換日</th>
                      <th style={{ ...th, textAlign: 'right' }}>所要日数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {convDetails.history.map((h, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #E8DDE0' }}>
                        <td style={td}>{h.customerName}</td>
                        <td style={td}>{h.changedAt.slice(0, 10)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{h.daysTaken}日</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* ────── 達成率推移（直近12ヶ月） ────── */}
            {recentMonths.some(m => m.target > 0) && (
              <section style={{ marginBottom: 24 }}>
                <h2 style={SectionH2}>達成率推移（直近{recentMonths.length}ヶ月）</h2>
                <AchievementSparkline months={recentMonths} />
              </section>
            )}

            {/* ────── 売上推移 + 出勤日数 ────── */}
            {recentMonths.length > 0 && (
              <section style={{ marginBottom: 24 }}>
                <h2 style={SectionH2}>売上 / 出勤日数 推移</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#FBEAF0' }}>
                      <th style={th}>月</th>
                      <th style={{ ...th, textAlign: 'right' }}>売上</th>
                      <th style={{ ...th, textAlign: 'right' }}>目標</th>
                      <th style={{ ...th, textAlign: 'right' }}>達成率</th>
                      <th style={{ ...th, textAlign: 'right' }}>出勤</th>
                      <th style={{ ...th, textAlign: 'right' }}>日均</th>
                      <th style={{ ...th, textAlign: 'right' }}>客単価</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMonths.map((m, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #E8DDE0' }}>
                        <td style={td}>{m.month}</td>
                        <td style={{ ...td, textAlign: 'right' }}>¥{m.sales.toLocaleString()}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{m.target > 0 ? `¥${m.target.toLocaleString()}` : '—'}</td>
                        <td style={{ ...td, textAlign: 'right',
                          color: m.achievement >= 100 ? '#8E4A5C' : m.achievement >= 80 ? '#E8879B' : '#D45060',
                          fontWeight: 600,
                        }}>{m.target > 0 ? `${m.achievement}%` : '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{m.workDays}日</td>
                        <td style={{ ...td, textAlign: 'right' }}>{m.perWorkDay > 0 ? `¥${m.perWorkDay.toLocaleString()}` : '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{m.avgSpend > 0 ? `¥${m.avgSpend.toLocaleString()}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* ────── 曜日別売上ヒート ────── */}
            {dowStats.length > 0 && dowStats.some(d => d.sales > 0) && (
              <section style={{ marginBottom: 24 }}>
                <h2 style={SectionH2}>曜日別 売上分布（過去6ヶ月）</h2>
                <DowHeat stats={dowStats} />
              </section>
            )}

            {/* ────── 相性Top — 4カテゴリ ────── */}
            {compat && (
              <section style={{ marginBottom: 24 }}>
                <h2 style={SectionH2}>相性 Top — どの層に強いか（売上ベース Top5）</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <CompatBlock title="ランク別" items={compat.rank} />
                  <CompatBlock title="地域別" items={compat.region} />
                  <CompatBlock title="年齢層別" items={compat.age} />
                  <CompatBlock title="職業別" items={compat.occupation} />
                </div>
              </section>
            )}

            {/* ────── LTV Top 10 ────── */}
            {ltvTop10.length > 0 && (
              <section style={{ marginBottom: 24 }}>
                <h2 style={SectionH2}>累計売上 Top 10 顧客（VIP）</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#FBEAF0' }}>
                      <th style={th}>#</th>
                      <th style={th}>顧客名</th>
                      <th style={th}>ランク</th>
                      <th style={th}>地域</th>
                      <th style={{ ...th, textAlign: 'right' }}>来店</th>
                      <th style={{ ...th, textAlign: 'right' }}>累計売上</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ltvTop10.map((c, i) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #E8DDE0', background: i < 3 ? '#FFF8EC' : 'transparent' }}>
                        <td style={td}>{i + 1}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                        <td style={td}>{c.rank ?? '—'}</td>
                        <td style={td}>{c.region ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{c.visits}回</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#B25575' }}>¥{c.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* ────── 検知要約 ────── */}
            {detectionSummary && (
              <section style={{ marginBottom: 24 }}>
                <h2 style={SectionH2}>営業アクション 検知サマリ</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <DetCell label="🚨 S/A 30日連絡なし"   value={detectionSummary.noContact}        warn={5} alert={10} />
                  <DetCell label="⚠ 同伴経験 60日未来店" value={detectionSummary.douhanInactive} warn={3} alert={5} />
                  <DetCell label="🔻 本指名 90日離脱"     value={detectionSummary.dropoutRisk}      warn={3} alert={5} />
                  <DetCell label="📉 売上 -30% 下降"        value={detectionSummary.salesDecline}     warn={3} alert={5} />
                  <DetCell label="🎂 誕生日14日 × 未連絡"   value={detectionSummary.birthdayApproach} warn={1} alert={3} />
                  <DetCell label="🪑 場内 60日経過"          value={detectionSummary.banaiOver60}      warn={5} alert={10} />
                </div>
              </section>
            )}

            <div
              style={{
                fontSize: 9,
                color: '#B0909A',
                borderTop: '1px solid #E8DDE0',
                paddingTop: 10,
                marginTop: 24,
              }}
            >
              出力日: {new Date().toLocaleDateString('ja-JP')} / Éclat 内部資料
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── ヘルパー ─────────────────────────────────
function AchievementSparkline({ months }: { months: { month: string; achievement: number; target: number }[] }) {
  const W = 720, H = 100, padL = 30, padR = 8, padT = 8, padB = 18
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const valid = months.filter(m => m.target > 0)
  if (valid.length === 0) return null
  const maxRate = Math.max(120, ...valid.map(m => m.achievement))
  const xStep = months.length > 1 ? chartW / (months.length - 1) : chartW / 2
  const toX = (i: number) => padL + i * xStep
  const toY = (v: number) => padT + chartH - (v / maxRate) * chartH
  const points = months.map((m, i) => m.target > 0 ? `${toX(i)},${toY(m.achievement)}` : '').filter(Boolean).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {[0, 50, 100].map(v => (
        <g key={v}>
          <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)}
            stroke={v === 100 ? '#D45060' : '#F0DDE2'}
            strokeDasharray={v === 100 ? '4,3' : ''} strokeWidth="0.6" />
          <text x={padL - 4} y={toY(v) + 3} textAnchor="end" fontSize="8" fill="#B0909A">{v}%</text>
        </g>
      ))}
      <polyline points={points} fill="none" stroke="#E8789A" strokeWidth="2" />
      {months.map((m, i) => m.target > 0 && (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(m.achievement)} r="3"
            fill={m.achievement >= 100 ? '#8E4A5C' : m.achievement >= 80 ? '#E8879B' : '#D45060'} />
          <text x={toX(i)} y={toY(m.achievement) - 5} textAnchor="middle" fontSize="8" fontWeight="700"
            fill={m.achievement >= 100 ? '#8E4A5C' : m.achievement >= 80 ? '#E8879B' : '#D45060'}>
            {m.achievement}%
          </text>
        </g>
      ))}
      {months.map((m, i) => (
        <text key={`l${i}`} x={toX(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="#B0909A">
          {m.month.slice(5).replace(/^0/, '')}月
        </text>
      ))}
    </svg>
  )
}

function DowHeat({ stats }: { stats: { dow: string; sales: number; count: number }[] }) {
  const max = Math.max(1, ...stats.map(s => s.sales))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
      {stats.map(s => {
        const ratio = s.sales / max
        const r = Math.round(251 - (251 - 200) * ratio)
        const g = Math.round(234 - (234 - 79) * ratio)
        const b = Math.round(240 - (240 - 123) * ratio)
        const bg = `rgb(${r},${g},${b})`
        const fg = ratio > 0.5 ? '#FFF' : '#3D2D38'
        return (
          <div key={s.dow} style={{ background: bg, padding: '8px 4px', borderRadius: 6, textAlign: 'center', border: '1px solid #E8DDE0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: fg }}>{s.dow}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: fg, marginTop: 2 }}>
              {s.sales >= 10000 ? `¥${Math.round(s.sales / 10000)}万` : `¥${s.sales.toLocaleString()}`}
            </div>
            <div style={{ fontSize: 8, color: fg, opacity: 0.85, marginTop: 1 }}>{s.count}件</div>
          </div>
        )
      })}
    </div>
  )
}

function CompatBlock({ title, items }: { title: string; items: { key: string; total: number; count: number; repeatRate: number }[] }) {
  return (
    <div style={{ background: '#FCF1F4', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#5A2840', marginBottom: 4 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 9, color: '#B0909A' }}>データなし</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid #EDE3E6' }}>
                <td style={{ padding: '3px 4px', fontSize: 10, fontWeight: i === 0 ? 700 : 500 }}>
                  {i === 0 && '⭐ '}{it.key}
                </td>
                <td style={{ padding: '3px 4px', fontSize: 10, textAlign: 'right' }}>{it.count}名</td>
                <td style={{ padding: '3px 4px', fontSize: 10, textAlign: 'right', fontWeight: 600, color: '#B25575' }}>
                  ¥{it.total >= 10000 ? `${Math.round(it.total / 10000)}万` : it.total.toLocaleString()}
                </td>
                <td style={{ padding: '3px 4px', fontSize: 9, textAlign: 'right',
                  color: it.repeatRate >= 50 ? '#8E4A5C' : it.repeatRate >= 25 ? '#E8879B' : '#B0909A',
                }}>{it.repeatRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function DetCell({ label, value, warn, alert }: { label: string; value: number; warn: number; alert: number }) {
  const color = value >= alert ? '#D45060' : value >= warn ? '#E8879B' : value > 0 ? '#3D2D38' : '#B0909A'
  const bg = value >= alert ? '#FFEBED' : value >= warn ? '#FFEBED' : '#FCF1F4'
  return (
    <div style={{ padding: '8px 10px', background: bg, borderRadius: 8, border: '1px solid #E8DDE0' }}>
      <div style={{ fontSize: 9, color: '#B0909A' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 2 }}>
        {value}名
      </div>
    </div>
  )
}

const SectionH2: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#5A2840',
  borderLeft: '3px solid #E8789A',
  paddingLeft: 8,
  marginBottom: 10,
}

const th: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 10,
  fontWeight: 500,
  textAlign: 'left',
  letterSpacing: '0.05em',
}

const td: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 11,
  color: '#3D2D38',
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: '#FCF1F4',
        borderRadius: 8,
        padding: '6px 8px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 9, color: '#B0909A' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#3D2D38', marginTop: 1 }}>{value}</div>
    </div>
  )
}
