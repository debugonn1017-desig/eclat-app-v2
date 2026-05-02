'use client'

// キャスト個人月次レポート（印刷向け）
//   /casts/[id]/monthly-report?month=YYYY-MM
//   - 個人売上 / 達成率 / 順位 / 主要KPI
//   - 前月との差分
//   - 担当顧客のランク内訳
//   - 場内→本指名 転換履歴
//   印刷で PDF 化（window.print()）
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCasts } from '@/hooks/useCasts'
import { CastKPI, CastProfile } from '@/types'

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
        <div style={{ padding: 40, textAlign: 'center', fontSize: 12 }}>読み込み中...</div>
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

  const month = useMemo(() => {
    const q = search?.get('month')
    if (q && /^\d{4}-\d{2}$/.test(q)) return q
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [search])

  const [cast, setCast] = useState<CastProfile | null>(null)
  const [rows, setRows] = useState<RankingApi[]>([])
  const [convDetails, setConvDetails] = useState<{
    history: { customerName: string; changedAt: string; daysTaken: number }[]
    avgDays: number
    banaTotal: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

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
          onClick={() => router.push(`/casts/${castId}`)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#E8789A',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          ← キャストページへ
        </button>
        <span style={{ fontSize: 12, color: '#6B5060' }}>{monthLabel} 個人レポート</span>
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
          <div style={{ padding: 40, textAlign: 'center', color: '#6B5060', fontSize: 12 }}>
            読み込み中...
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
                    background: '#F9F6F7',
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
        background: '#F9F6F7',
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
