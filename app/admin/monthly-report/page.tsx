'use client'

// 月次レポート（印刷向け） — ブラウザの印刷機能で PDF として保存できる
//   /admin/monthly-report?month=YYYY-MM で対象月を指定（省略時は前月）
// 構成:
//   - ヘッダー: 月 / 出力日
//   - 店舗サマリー（売上・達成率・来店数・新規顧客数・場内→本指名転換数）
//   - キャスト別実績ランキング
//   - 曜日別来店パターン
//   - ランク別売上内訳
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCasts } from '@/hooks/useCasts'
import { CastKPI, CastProfile, CastTier } from '@/types'
import WeekdayPatternCard from '@/components/WeekdayPatternCard'

type CastRow = {
  cast: CastProfile
  kpi: CastKPI
  prevSales: number
  targetSales: number
  achievementRate: number
}

export default function MonthlyReportPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const { casts, isLoaded: castsLoaded, getCastKPI, getCastTarget } = useCasts()

  // 対象月（クエリで指定 or デフォルトは前月）
  const month = useMemo(() => {
    const q = searchParams?.get('month')
    if (q && /^\d{4}-\d{2}$/.test(q)) return q
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [searchParams])

  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [rows, setRows] = useState<CastRow[]>([])
  const [newCustomerCount, setNewCustomerCount] = useState<number | null>(null)
  const [storeRankBreakdown, setStoreRankBreakdown] = useState<Record<string, { sales: number; visits: number }>>({})
  const [loading, setLoading] = useState(true)

  // 権限チェック
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { setAuthorized(false); return }
        const data = await res.json()
        if (data.role === 'cast') { setAuthorized(false); return }
        setAuthorized(data.is_owner === true || data.permissions?.['レポート閲覧'] === true)
      } catch { setAuthorized(false) }
    }
    check()
  }, [])

  // 月初日 / 月末日
  const { startDate, endDate, monthLabel, prevMonth } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const start = `${month}-01`
    const end = `${month}-${String(lastDay).padStart(2, '0')}`
    const pd = new Date(y, m - 2, 1)
    const prev = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`
    return { startDate: start, endDate: end, monthLabel: `${y}年${m}月`, prevMonth: prev }
  }, [month])

  // キャスト別実績 + 前月売上 を集計
  useEffect(() => {
    if (!authorized || !castsLoaded || casts.length === 0) {
      if (authorized && castsLoaded) setLoading(false)
      return
    }
    let cancelled = false
    const fetchAll = async () => {
      setLoading(true)
      const out: CastRow[] = []
      for (const c of casts) {
        const [kpi, prevKpi, targetData] = await Promise.all([
          getCastKPI(c.cast_name, month, c.id),
          getCastKPI(c.cast_name, prevMonth, c.id),
          getCastTarget(c.id, month),
        ])
        const targetSales = targetData?.target_sales ?? 0
        const achievementRate = targetSales > 0 ? Math.round((kpi.monthlySales / targetSales) * 100) : 0
        out.push({
          cast: c, kpi,
          prevSales: prevKpi.monthlySales,
          targetSales, achievementRate,
        })
      }
      if (cancelled) return
      // 売上順
      out.sort((a, b) => b.kpi.monthlySales - a.kpi.monthlySales)
      setRows(out)

      // 店舗全体のランク別集計（rankBreakdown を合算）
      const sumRank: Record<string, { sales: number; visits: number }> = {
        S: { sales: 0, visits: 0 }, A: { sales: 0, visits: 0 },
        B: { sales: 0, visits: 0 }, C: { sales: 0, visits: 0 },
      }
      for (const r of out) {
        const ranks: Array<'S' | 'A' | 'B' | 'C'> = ['S', 'A', 'B', 'C']
        for (const k of ranks) {
          sumRank[k].sales += r.kpi.rankBreakdown[k]?.sales ?? 0
          sumRank[k].visits += r.kpi.rankBreakdown[k]?.visits ?? 0
        }
      }
      setStoreRankBreakdown(sumRank)
      setLoading(false)
    }
    fetchAll()
    return () => { cancelled = true }
  }, [authorized, castsLoaded, casts, month, prevMonth, getCastKPI, getCastTarget])

  // 当月の新規顧客数（first_visit_date が当月）
  useEffect(() => {
    if (!authorized) return
    const fetchNew = async () => {
      const { count } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .gte('first_visit_date', startDate)
        .lte('first_visit_date', endDate)
      setNewCustomerCount(count ?? 0)
    }
    fetchNew()
  }, [authorized, startDate, endDate, supabase])

  // 集計ヘルパー
  const summary = useMemo(() => {
    const totalSales = rows.reduce((s, r) => s + r.kpi.monthlySales, 0)
    const totalTarget = rows.reduce((s, r) => s + r.targetSales, 0)
    const avgRate = totalTarget > 0 ? Math.round((totalSales / totalTarget) * 100) : 0
    const totalVisitGroups = rows.reduce((s, r) => s + r.kpi.visitGroups, 0)
    const totalConv = rows.reduce((s, r) => s + r.kpi.conversionCount, 0)
    const totalDouhan = rows.reduce((s, r) => s + r.kpi.douhanCount, 0)
    const totalAfter = rows.reduce((s, r) => s + r.kpi.afterCount, 0)
    const totalVisits = rows.reduce((s, r) => s + r.kpi.totalVisitCount, 0)
    return { totalSales, totalTarget, avgRate, totalVisitGroups, totalConv, totalDouhan, totalAfter, totalVisits }
  }, [rows])

  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const tierLabel = (tier: CastTier | null) => tier ?? '未分類'

  if (authorized === null) {
    return <div style={{ padding: 40, textAlign: 'center', fontSize: 12 }}>読み込み中...</div>
  }
  if (!authorized) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontSize: 13 }}>
        <p>この機能へのアクセス権限がありません</p>
        <button onClick={() => router.push('/admin/casts')} style={{ marginTop: 12, padding: '8px 18px' }}>
          管理ページに戻る
        </button>
      </div>
    )
  }

  return (
    <div style={{ background: '#FFF', minHeight: '100vh', color: '#222', fontFamily: 'inherit' }}>
      {/* 操作バー（印刷時は非表示） */}
      <div className="report-toolbar" style={{
        position: 'sticky', top: 0, zIndex: 10, background: '#FFF',
        borderBottom: '1px solid #E5DCDF',
        padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => router.push('/admin/casts')} style={{
          background: 'transparent', border: '1px solid #E5DCDF', color: '#5A2840',
          padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6,
        }}>← 管理ページへ</button>
        <div style={{ flex: 1, fontSize: 13, color: '#666' }}>
          月次レポート — {monthLabel}
        </div>
        <button
          onClick={() => window.print()}
          style={{
            background: '#E8789A', color: '#FFF', border: 'none',
            padding: '8px 18px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6,
          }}
        >🖨 印刷 / PDFで保存</button>
      </div>

      {/* レポート本体 — A4 想定で max-width 制御 */}
      <div className="report-body" style={{ maxWidth: 800, margin: '0 auto', padding: '32px 28px 80px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>集計中…</p>
        ) : (
          <>
            {/* 表紙 */}
            <header style={{ borderBottom: '2px solid #5A2840', paddingBottom: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#888' }}>ÉCLAT — MONTHLY REPORT</div>
              <h1 style={{ fontSize: 28, fontWeight: 600, margin: '8px 0 4px', letterSpacing: '0.05em', color: '#5A2840' }}>
                {monthLabel} 月次レポート
              </h1>
              <div style={{ fontSize: 11, color: '#666' }}>出力日: {today}</div>
            </header>

            {/* 1. 店舗サマリー */}
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#5A2840', borderLeft: '3px solid #E8789A', paddingLeft: 10, marginBottom: 12 }}>
                1. 店舗サマリー
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <SummaryCell label="月間売上" value={formatYen(summary.totalSales)} highlight />
                <SummaryCell label="目標 / 達成率" value={`${formatYen(summary.totalTarget)} / ${summary.avgRate}%`} />
                <SummaryCell label="来店組数" value={`${summary.totalVisitGroups}組`} />
                <SummaryCell label="総来店本数" value={`${summary.totalVisits}本`} />
                <SummaryCell label="同伴" value={`${summary.totalDouhan}回`} />
                <SummaryCell label="アフター" value={`${summary.totalAfter}回`} />
                <SummaryCell label="場内→本指名 転換" value={`${summary.totalConv}件`} />
                <SummaryCell label="新規顧客（初回来店）" value={newCustomerCount !== null ? `${newCustomerCount}名` : '—'} />
              </div>
            </section>

            {/* 2. キャスト別実績ランキング */}
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#5A2840', borderLeft: '3px solid #E8789A', paddingLeft: 10, marginBottom: 12 }}>
                2. キャスト別実績（売上順）
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#FBEAF0', color: '#5A2840' }}>
                    <th style={th}>順位</th>
                    <th style={{ ...th, textAlign: 'left' }}>キャスト</th>
                    <th style={th}>層</th>
                    <th style={{ ...th, textAlign: 'right' }}>売上</th>
                    <th style={{ ...th, textAlign: 'right' }}>達成率</th>
                    <th style={{ ...th, textAlign: 'right' }}>前月比</th>
                    <th style={th}>本指名</th>
                    <th style={th}>場内</th>
                    <th style={th}>転換</th>
                    <th style={th}>同伴</th>
                    <th style={th}>アフ</th>
                    <th style={{ ...th, textAlign: 'right' }}>客単価</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={12} style={{ padding: 14, textAlign: 'center', color: '#999' }}>データなし</td></tr>
                  ) : rows.map((r, i) => {
                    const diff = r.prevSales > 0 ? Math.round(((r.kpi.monthlySales - r.prevSales) / r.prevSales) * 100) : null
                    return (
                      <tr key={r.cast.id} style={{ borderBottom: '1px solid #F0E5E9' }}>
                        <td style={td}>{i + 1}</td>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{r.cast.cast_name}</td>
                        <td style={td}>{tierLabel(r.cast.cast_tier)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#E8789A' }}>{formatYen(r.kpi.monthlySales)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{r.targetSales > 0 ? `${r.achievementRate}%` : '—'}</td>
                        <td style={{ ...td, textAlign: 'right', color: diff === null ? '#999' : diff >= 0 ? '#1D9E75' : '#C04060' }}>
                          {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff}%`}
                        </td>
                        <td style={td}>{r.kpi.honshimeiCount}</td>
                        <td style={td}>{r.kpi.banaiMonthlyCount}</td>
                        <td style={td}>{r.kpi.conversionCount}</td>
                        <td style={td}>{r.kpi.douhanCount}</td>
                        <td style={td}>{r.kpi.afterCount}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{formatYen(r.kpi.avgSpend)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>

            {/* 3. 曜日別パターン */}
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#5A2840', borderLeft: '3px solid #E8789A', paddingLeft: 10, marginBottom: 12 }}>
                3. 曜日別の来店パターン
              </h2>
              <WeekdayPatternCard month={month} />
            </section>

            {/* 4. ランク別売上内訳 */}
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#5A2840', borderLeft: '3px solid #E8789A', paddingLeft: 10, marginBottom: 12 }}>
                4. ランク別売上内訳
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#FBEAF0', color: '#5A2840' }}>
                    <th style={th}>ランク</th>
                    <th style={{ ...th, textAlign: 'right' }}>売上</th>
                    <th style={{ ...th, textAlign: 'right' }}>来店本数</th>
                    <th style={{ ...th, textAlign: 'right' }}>客単価</th>
                    <th style={{ ...th, textAlign: 'right' }}>売上構成比</th>
                  </tr>
                </thead>
                <tbody>
                  {(['S', 'A', 'B', 'C'] as const).map(rank => {
                    const s = storeRankBreakdown[rank] ?? { sales: 0, visits: 0 }
                    const avg = s.visits > 0 ? Math.round(s.sales / s.visits) : 0
                    const pct = summary.totalSales > 0 ? Math.round((s.sales / summary.totalSales) * 1000) / 10 : 0
                    return (
                      <tr key={rank} style={{ borderBottom: '1px solid #F0E5E9' }}>
                        <td style={{ ...td, fontWeight: 600 }}>{rank}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{formatYen(s.sales)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{s.visits}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{formatYen(avg)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{pct.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>

            <footer style={{ borderTop: '1px solid #E5DCDF', paddingTop: 12, marginTop: 24, fontSize: 10, color: '#999', textAlign: 'center' }}>
              Éclat 月次レポート · 出力日 {today} · ブラウザの「印刷 → PDFで保存」で保管できます
            </footer>
          </>
        )}
      </div>

      {/* 印刷向け CSS */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm 14mm;
          }
          .report-toolbar { display: none !important; }
          .report-body { max-width: none !important; padding: 0 !important; }
          /* 表が長い場合のページ送りを綺麗に */
          section { break-inside: avoid; page-break-inside: avoid; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          /* 全体的に色が出るように */
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  )
}

// ─── ヘルパー / 共通スタイル ─────────────────────────────────
const th: React.CSSProperties = {
  padding: '8px 6px', fontSize: 10, fontWeight: 600, textAlign: 'center',
  borderBottom: '1px solid #E5DCDF',
}
const td: React.CSSProperties = {
  padding: '7px 6px', fontSize: 11, textAlign: 'center',
}

function SummaryCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: highlight ? '#FFF8FA' : '#FAFAFB',
      border: `1px solid ${highlight ? '#E8789A' : '#E5DCDF'}`,
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 9, color: '#888', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: highlight ? 17 : 14, fontWeight: 600, color: highlight ? '#E8789A' : '#222', marginTop: 4 }}>
        {value}
      </div>
    </div>
  )
}
