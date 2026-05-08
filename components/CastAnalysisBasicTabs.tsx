'use client'

// キャスト分析の基礎タブ部品
//   PlaceholderTab / OverviewTab / TimelineTab / CustomersTab
//   /admin/casts/[id] と /admin/cast-analysis の両方から import される。
//
//   ※ 以前は app/admin/casts/[id]/page.tsx から named export していたが、
//     Next.js の page ファイルから named export を拾うとビルドが落ちることが
//     あるため、独立した components/* に移動した。

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/colors'
import { CastKPI } from '@/types'

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

// ─── 概要タブ ──────────────────────────────────────────
export function OverviewTab({
  month, multiKPI, multiTarget, allMonths, customers, isPC,
}: {
  month: string
  multiKPI: Record<string, CastKPI>
  multiTarget: Record<string, number>
  allMonths: string[]
  customers?: CustomerLite[]
  isPC: boolean
}) {
  const formatYen = (n: number) => `¥${n.toLocaleString()}`

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

      <div style={{
        display: 'grid',
        gridTemplateColumns: isPC ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
        gap: 10,
      }}>
        <MiniLineCard
          title="売上推移(直近6ヶ月)"
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
        <MiniLineCard
          title="出勤日あたり売上"
          months={recent}
          values={recent.map(m => {
            const k = multiKPI[m]
            if (!k || !k.workDays || k.workDays === 0) return 0
            return Math.round(k.monthlySales / k.workDays)
          })}
          format={(n) => `¥${Math.round(n / 10000)}万`}
        />
        <MiniLineCard
          title="出勤日数"
          months={recent}
          values={recent.map(m => multiKPI[m]?.workDays ?? 0)}
          format={(n) => `${n}日`}
        />
      </div>

      {/* 売上構造分析（Phase 2-④⑤） */}
      {customers && customers.length > 0 && (
        <SalesStructureSection customers={customers} month={month} isPC={isPC} />
      )}
    </div>
  )
}

// ─── 売上構造分析（客単価分布 + 指名構成比） ───────────────────
function SalesStructureSection({ customers, month, isPC }: { customers: CustomerLite[]; month: string; isPC: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  type VisitRow = { amount: number; nomination: string | null; has_douhan: boolean }
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const ids = customers.map(c => c.id)
      if (ids.length === 0) { setVisits([]); setLoading(false); return }
      const monStart = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const monEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
      const { data } = await supabase
        .from('customer_visits')
        .select('amount_spent, has_douhan, customers!inner(nomination_status)')
        .in('customer_id', ids)
        .gte('visit_date', monStart)
        .lte('visit_date', monEnd)
      const list: VisitRow[] = []
      for (const v of (data ?? []) as Array<{ amount_spent: number; has_douhan: boolean; customers: { nomination_status: string | null } | { nomination_status: string | null }[] }>) {
        const a = Number(v.amount_spent) || 0
        if (a <= 0) continue
        const cust = Array.isArray(v.customers) ? v.customers[0] : v.customers
        list.push({
          amount: a,
          nomination: cust?.nomination_status ?? null,
          has_douhan: !!v.has_douhan,
        })
      }
      setVisits(list)
      setLoading(false)
    }
    load()
  }, [supabase, customers, month])

  // 客単価ヒストグラム
  const buckets = [
    { label: '〜1万', min: 0, max: 10000 },
    { label: '1-2万', min: 10000, max: 20000 },
    { label: '2-3万', min: 20000, max: 30000 },
    { label: '3-5万', min: 30000, max: 50000 },
    { label: '5-10万', min: 50000, max: 100000 },
    { label: '10万〜', min: 100000, max: Infinity },
  ]
  const histo = buckets.map(b => ({
    ...b,
    count: visits.filter(v => v.amount >= b.min && v.amount < b.max).length,
  }))
  const maxCount = Math.max(1, ...histo.map(h => h.count))
  const sortedAmounts = [...visits.map(v => v.amount)].sort((a, b) => a - b)
  const mean = visits.length > 0 ? Math.round(visits.reduce((s, v) => s + v.amount, 0) / visits.length) : 0
  const median = sortedAmounts.length > 0 ? sortedAmounts[Math.floor(sortedAmounts.length / 2)] : 0

  // 指名構成比
  const nomCounts = { 本指名: 0, 場内: 0, フリー: 0, その他: 0 }
  const nomAmounts = { 本指名: 0, 場内: 0, フリー: 0, その他: 0 }
  for (const v of visits) {
    const key = (v.nomination === '本指名' || v.nomination === '場内' || v.nomination === 'フリー') ? v.nomination : 'その他'
    nomCounts[key] += 1
    nomAmounts[key] += v.amount
  }
  const totalAmount = visits.reduce((s, v) => s + v.amount, 0)
  const douhanCount = visits.filter(v => v.has_douhan).length

  const nomColors: Record<string, string> = {
    本指名: '#C84F7B',
    場内: '#7A4060',
    フリー: '#B25575',
    その他: '#BBB',
  }

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>💰</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{month} 売上構造分析</span>
      </div>
      <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 10 }}>
        客単価の分布と、指名・場内・フリーの構成比をその月で集計
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, textAlign: 'center', padding: 12 }}>読込中...</div>
      ) : visits.length === 0 ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, textAlign: 'center', padding: 12 }}>該当月の来店データなし</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isPC ? '1fr 1fr' : '1fr',
          gap: 14,
        }}>
          {/* 客単価ヒストグラム */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 8 }}>
              客単価分布（{visits.length}件）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {histo.map(h => {
                const pct = visits.length > 0 ? Math.round((h.count / visits.length) * 100) : 0
                const w = (h.count / maxCount) * 100
                return (
                  <div key={h.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                    <span style={{ minWidth: 50, color: C.pinkMuted }}>{h.label}</span>
                    <div style={{
                      flex: 1, height: 16, background: '#F5F0F2', borderRadius: 4, position: 'relative', overflow: 'hidden',
                    }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${w}%`,
                        background: 'linear-gradient(90deg, #ED93B1 0%, #C84F7B 100%)',
                      }} />
                    </div>
                    <span style={{ minWidth: 60, color: C.dark, fontWeight: 600, textAlign: 'right' }}>
                      {h.count}件 ({pct}%)
                    </span>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: C.pinkMuted }}>
              <span>平均 <strong style={{ color: C.dark }}>¥{mean.toLocaleString()}</strong></span>
              <span>中央値 <strong style={{ color: C.dark }}>¥{median.toLocaleString()}</strong></span>
            </div>
          </div>

          {/* 指名構成比 */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 8 }}>
              指名構成比（売上ベース）
            </div>
            {/* スタックバー */}
            <div style={{
              display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden',
              border: `1px solid ${C.border}`, marginBottom: 8,
            }}>
              {(['本指名', '場内', 'フリー', 'その他'] as const).map(k => {
                const w = totalAmount > 0 ? (nomAmounts[k] / totalAmount) * 100 : 0
                if (w < 0.5) return null
                return (
                  <div key={k} title={`${k}: ¥${nomAmounts[k].toLocaleString()}`} style={{
                    width: `${w}%`,
                    background: nomColors[k],
                    color: '#FFF',
                    fontSize: 9,
                    fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {w > 8 ? `${Math.round(w)}%` : ''}
                  </div>
                )
              })}
            </div>
            {/* 凡例＋数値 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(['本指名', '場内', 'フリー', 'その他'] as const).map(k => {
                const cnt = nomCounts[k]
                const amt = nomAmounts[k]
                if (cnt === 0) return null
                const sharePct = totalAmount > 0 ? Math.round((amt / totalAmount) * 100) : 0
                return (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: nomColors[k] }} />
                    <span style={{ color: C.dark, fontWeight: 500, minWidth: 50 }}>{k}</span>
                    <span style={{ color: C.pinkMuted, flex: 1 }}>{cnt}件</span>
                    <span style={{ color: C.dark, fontWeight: 600 }}>¥{amt.toLocaleString()}</span>
                    <span style={{ color: C.pinkMuted, minWidth: 36, textAlign: 'right' }}>{sharePct}%</span>
                  </div>
                )
              })}
              {douhanCount > 0 && (
                <div style={{
                  marginTop: 4, fontSize: 10,
                  padding: '4px 8px', background: '#FFF4E0',
                  color: '#9C6300', borderRadius: 4,
                }}>
                  🍷 同伴あり: {douhanCount}件 ({Math.round((douhanCount / visits.length) * 100)}%)
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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

// ─── 時系列タブ ──────────────────────────────────────────
export function TimelineTab({
  multiKPI, multiTarget, allMonths, customers, isPC,
}: {
  multiKPI: Record<string, CastKPI>
  multiTarget: Record<string, number>
  allMonths: string[]
  customers?: CustomerLite[]
  isPC: boolean
}) {
  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const sales = allMonths.map(m => multiKPI[m]?.monthlySales ?? 0)
  const targets = allMonths.map(m => multiTarget[m] ?? 0)

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

  const tdH: React.CSSProperties = { padding: '6px 6px', fontSize: 10, fontWeight: 500, textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '5px 6px', fontSize: 10, color: '#3D2D38', textAlign: 'center' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 6 }}>
          売上推移({allMonths.length}ヶ月分・点線=目標)
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

      {/* 目標達成率推移（Phase 2-⑥） */}
      <AchievementRateChart multiKPI={multiKPI} multiTarget={multiTarget} allMonths={allMonths} isPC={isPC} />

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', overflowX: 'auto' }}>
        <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 8 }}>
          月別データ(新しい順)
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

      {/* 曜日別ヒートマップ（A-1） */}
      {customers && customers.length > 0 && (
        <DayOfWeekHeatmap customers={customers} isPC={isPC} />
      )}

      {/* 月内リズム分析（Phase 3-③） */}
      {customers && customers.length > 0 && (
        <DayOfMonthRhythm customers={customers} isPC={isPC} />
      )}

      {/* 新規→リピート転換率＆コホート分析（Phase 2-②③） */}
      {customers && customers.length > 0 && (
        <RetentionSection customers={customers} isPC={isPC} />
      )}
    </div>
  )
}

// ─── 月内リズム分析（Phase 3-③） ──────────────────────────────
function DayOfMonthRhythm({ customers, isPC }: { customers: CustomerLite[]; isPC: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  type DayStat = { day: number; count: number; total: number }
  const [stats, setStats] = useState<DayStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const ids = customers.map(c => c.id)
      if (ids.length === 0) { setStats([]); setLoading(false); return }
      const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10) // 過去1年
      const { data } = await supabase
        .from('customer_visits')
        .select('visit_date, amount_spent')
        .in('customer_id', ids)
        .gte('visit_date', since)
      const byDay = new Map<number, { count: number; total: number }>()
      for (let d = 1; d <= 31; d++) byDay.set(d, { count: 0, total: 0 })
      for (const v of (data ?? []) as Array<{ visit_date: string; amount_spent: number }>) {
        const a = Number(v.amount_spent) || 0
        if (a <= 0) continue
        const day = parseInt(v.visit_date.split('-')[2] ?? '0', 10)
        if (day < 1 || day > 31) continue
        const cur = byDay.get(day) ?? { count: 0, total: 0 }
        cur.count += 1
        cur.total += a
        byDay.set(day, cur)
      }
      const arr: DayStat[] = []
      for (let d = 1; d <= 31; d++) {
        const cur = byDay.get(d) ?? { count: 0, total: 0 }
        arr.push({ day: d, ...cur })
      }
      setStats(arr)
      setLoading(false)
    }
    load()
  }, [supabase, customers])

  const maxTotal = Math.max(1, ...stats.map(s => s.total))
  // 期間グルーピング（給料日後/月末等）
  const period1 = stats.filter(s => s.day >= 1 && s.day <= 10) // 月初
  const period2 = stats.filter(s => s.day >= 11 && s.day <= 20) // 月中
  const period3 = stats.filter(s => s.day >= 21 && s.day <= 25) // 給料日前後
  const period4 = stats.filter(s => s.day >= 26 && s.day <= 31) // 月末
  const sum = (arr: DayStat[]) => arr.reduce((s, x) => s + x.total, 0)
  const cnt = (arr: DayStat[]) => arr.reduce((s, x) => s + x.count, 0)
  const totalAll = sum(stats)
  const periods = [
    { label: '月初(1-10日)', total: sum(period1), count: cnt(period1) },
    { label: '月中(11-20日)', total: sum(period2), count: cnt(period2) },
    { label: '給料日前後(21-25日)', total: sum(period3), count: cnt(period3) },
    { label: '月末(26-31日)', total: sum(period4), count: cnt(period4) },
  ]
  const bestPeriod = [...periods].sort((a, b) => b.total - a.total)[0]

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>📆</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>月内リズム（過去1年）</span>
      </div>
      <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 10 }}>
        日付ごとの売上分布。給料日後・月末などのパターンを発見
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, textAlign: 'center', padding: 12 }}>読込中...</div>
      ) : totalAll === 0 ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, textAlign: 'center', padding: 12 }}>来店データなし</div>
      ) : (
        <>
          {/* 31日のバーチャート */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80, marginBottom: 10 }}>
            {stats.map(s => {
              const h = (s.total / maxTotal) * 100
              const isPayday = s.day >= 21 && s.day <= 25
              return (
                <div key={s.day} title={`${s.day}日: ¥${s.total.toLocaleString()} (${s.count}件)`}
                  style={{
                    flex: 1, height: '100%',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    position: 'relative',
                  }}>
                  <div style={{
                    width: '100%',
                    height: `${Math.max(2, h)}%`,
                    background: isPayday ? 'linear-gradient(180deg, #E5B14C 0%, #B8860B 100%)' : 'linear-gradient(180deg, #ED93B1 0%, #C84F7B 100%)',
                    borderRadius: '2px 2px 0 0',
                    minHeight: 2,
                  }} />
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: C.pinkMuted, marginBottom: 12 }}>
            {[1, 5, 10, 15, 20, 25, 31].map(d => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* 期間別サマリ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isPC ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
            gap: 6,
          }}>
            {periods.map(p => {
              const isBest = p.label === bestPeriod?.label
              const sharePct = totalAll > 0 ? Math.round((p.total / totalAll) * 100) : 0
              return (
                <div key={p.label} style={{
                  padding: '8px 10px',
                  background: isBest ? 'linear-gradient(135deg, #FFF8EC 0%, #FFE9C8 100%)' : '#F9F6F7',
                  borderRadius: 8,
                  border: isBest ? '1px solid #E5B14C' : `1px solid ${C.border}`,
                }}>
                  <div style={{ fontSize: 9, color: isBest ? '#9C6300' : C.pinkMuted, marginBottom: 2 }}>
                    {isBest && '⭐ '}{p.label}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isBest ? '#5C3A00' : C.dark }}>
                    {p.total >= 10000 ? `¥${Math.round(p.total / 10000)}万` : `¥${p.total.toLocaleString()}`}
                  </div>
                  <div style={{ fontSize: 9, color: C.pinkMuted }}>{p.count}件 / {sharePct}%</div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── リピート転換率＆コホート分析（Phase 2-②③） ─────────────────
function RetentionSection({ customers, isPC }: { customers: CustomerLite[]; isPC: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  type CohortRow = {
    cohortMonth: string
    newCount: number
    repeatedAny: number   // 2回以上来店した数（全期間）
    within30: number
    within90: number
    within180: number
  }
  const [rows, setRows] = useState<CohortRow[]>([])
  const [overall, setOverall] = useState({ total: 0, repeated: 0, within30: 0, within90: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const ids = customers.map(c => c.id)
      if (ids.length === 0) { setRows([]); setLoading(false); return }
      const { data: visits } = await supabase
        .from('customer_visits')
        .select('customer_id, visit_date, amount_spent')
        .in('customer_id', ids)
        .order('visit_date', { ascending: true })
      const visitsByCust = new Map<string, string[]>()
      for (const v of (visits ?? []) as Array<{ customer_id: string; visit_date: string; amount_spent: number }>) {
        if (Number(v.amount_spent) <= 0) continue
        const list = visitsByCust.get(v.customer_id) ?? []
        list.push(v.visit_date)
        visitsByCust.set(v.customer_id, list)
      }
      // コホートグループ化
      const cohortMap = new Map<string, CohortRow>()
      let totalNew = 0, totalRepeated = 0, totalWithin30 = 0, totalWithin90 = 0
      for (const c of customers) {
        const dates = visitsByCust.get(c.id) ?? []
        if (dates.length === 0) continue
        const first = new Date(dates[0])
        const cohortMonth = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`
        const row = cohortMap.get(cohortMonth) ?? {
          cohortMonth, newCount: 0, repeatedAny: 0, within30: 0, within90: 0, within180: 0,
        }
        row.newCount += 1
        totalNew += 1
        if (dates.length >= 2) {
          row.repeatedAny += 1
          totalRepeated += 1
          // 2回目以降の中で「初回からの日数」最短
          let cameWithin30 = false, cameWithin90 = false, cameWithin180 = false
          for (let i = 1; i < dates.length; i++) {
            const days = (new Date(dates[i]).getTime() - first.getTime()) / 86400000
            if (days <= 30) cameWithin30 = true
            if (days <= 90) cameWithin90 = true
            if (days <= 180) cameWithin180 = true
          }
          if (cameWithin30) { row.within30 += 1; totalWithin30 += 1 }
          if (cameWithin90) { row.within90 += 1; totalWithin90 += 1 }
          if (cameWithin180) row.within180 += 1
        }
        cohortMap.set(cohortMonth, row)
      }
      const sorted = [...cohortMap.values()].sort((a, b) => b.cohortMonth.localeCompare(a.cohortMonth))
      setRows(sorted.slice(0, 12))
      setOverall({ total: totalNew, repeated: totalRepeated, within30: totalWithin30, within90: totalWithin90 })
      setLoading(false)
    }
    load()
  }, [supabase, customers])

  const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0
  const overallRepeat = pct(overall.repeated, overall.total)
  const overall30 = pct(overall.within30, overall.total)
  const overall90 = pct(overall.within90, overall.total)

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>🔁</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>新規→リピート転換 / コホート分析</span>
      </div>
      <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 10 }}>
        初回来店した月（コホート）ごとに、何%が再来店したかを追跡。30日以内・90日以内・全期間のリピート率を比較。
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, textAlign: 'center', padding: 12 }}>読込中...</div>
      ) : overall.total === 0 ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, textAlign: 'center', padding: 12 }}>新規来店データがありません</div>
      ) : (
        <>
          {/* 総合サマリ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isPC ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
            gap: 8, marginBottom: 10,
          }}>
            <SummaryBox label="新規総数" value={`${overall.total}名`} />
            <SummaryBox
              label="全期間リピート率"
              value={`${overallRepeat}%`}
              accent={overallRepeat >= 50 ? 'good' : overallRepeat >= 25 ? 'warn' : 'bad'}
            />
            <SummaryBox
              label="30日以内リピート率"
              value={`${overall30}%`}
              accent={overall30 >= 30 ? 'good' : overall30 >= 15 ? 'warn' : 'bad'}
            />
            <SummaryBox
              label="90日以内リピート率"
              value={`${overall90}%`}
              accent={overall90 >= 50 ? 'good' : overall90 >= 25 ? 'warn' : 'bad'}
            />
          </div>

          {/* コホート表 */}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{
              width: '100%', minWidth: isPC ? 'auto' : 540,
              borderCollapse: 'collapse', fontSize: 11,
            }}>
              <thead>
                <tr style={{ background: '#FBEAF0', color: '#5A2840' }}>
                  <th style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>初回月</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>新規数</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>30日以内</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>90日以内</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>180日以内</th>
                  <th style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>全期間</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const r30 = pct(r.within30, r.newCount)
                  const r90 = pct(r.within90, r.newCount)
                  const r180 = pct(r.within180, r.newCount)
                  const rAny = pct(r.repeatedAny, r.newCount)
                  return (
                    <tr key={r.cohortMonth} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '6px 8px', fontSize: 11, color: C.dark }}>{r.cohortMonth}</td>
                      <td style={{ padding: '6px 8px', fontSize: 11, color: C.dark, textAlign: 'right' }}>{r.newCount}名</td>
                      <td style={cellPct(r30)}>{r30}% ({r.within30})</td>
                      <td style={cellPct(r90)}>{r90}% ({r.within90})</td>
                      <td style={cellPct(r180)}>{r180}% ({r.within180})</td>
                      <td style={cellPct(rAny)}>{rAny}% ({r.repeatedAny})</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 8 }}>
            ※ セルの色：緑=高い / 黄=普通 / 赤=低い。直近月は母数が少ないため割合が極端になりやすい。
          </div>
        </>
      )}
    </div>
  )
}

function SummaryBox({ label, value, accent }: { label: string; value: string; accent?: 'good' | 'warn' | 'bad' }) {
  const colorMap = {
    good: { fg: '#0F6E56', bg: '#E1F5EE' },
    warn: { fg: '#B8860B', bg: '#FFF4E0' },
    bad:  { fg: '#C53030', bg: '#FCEBEB' },
  }
  const c = accent ? colorMap[accent] : { fg: C.dark, bg: '#F9F6F7' }
  return (
    <div style={{
      background: c.bg,
      borderRadius: 8,
      padding: '8px 10px',
    }}>
      <div style={{ fontSize: 9, color: C.pinkMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: c.fg }}>{value}</div>
    </div>
  )
}

function cellPct(val: number): React.CSSProperties {
  const fg = val >= 50 ? '#0F6E56' : val >= 25 ? '#B8860B' : val > 0 ? '#C53030' : C.pinkMuted
  return {
    padding: '6px 8px',
    fontSize: 11,
    color: fg,
    textAlign: 'right',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }
}

// ─── 目標達成率推移（Phase 2-⑥） ─────────────────────────────
function AchievementRateChart({
  multiKPI, multiTarget, allMonths, isPC,
}: {
  multiKPI: Record<string, CastKPI>
  multiTarget: Record<string, number>
  allMonths: string[]
  isPC: boolean
}) {
  // 直近12ヶ月（または全期間）
  const months = allMonths.slice(-12)
  const rates = months.map(m => {
    const k = multiKPI[m]
    const t = multiTarget[m] ?? 0
    if (!k || t <= 0) return null
    return Math.round((k.monthlySales / t) * 100)
  })
  const validRates = rates.filter((v): v is number => v !== null)
  if (validRates.length === 0) return null

  const W = 700, H = 180, padL = 36, padR = 14, padT = 14, padB = 28
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const maxRate = Math.max(120, ...validRates)
  const xStep = months.length > 1 ? chartW / (months.length - 1) : chartW / 2
  const toX = (i: number) => padL + (months.length > 1 ? i * xStep : chartW / 2)
  const toY = (v: number) => padT + chartH - (v / maxRate) * chartH

  const points = rates
    .map((v, i) => v === null ? null : `${toX(i)},${toY(v)}`)
    .filter((p): p is string => p !== null)
    .join(' ')

  const avg = Math.round(validRates.reduce((s, v) => s + v, 0) / validRates.length)
  const grid = [0, 50, 100, 150].filter(v => v <= maxRate)

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>🎯</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>目標達成率推移（直近{months.length}ヶ月）</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: C.pinkMuted }}>
          平均 <strong style={{ color: avg >= 100 ? '#0F6E56' : avg >= 80 ? '#B8860B' : '#C53030', fontSize: 12 }}>{avg}%</strong>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {grid.map(v => (
          <g key={v}>
            <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)}
              stroke={v === 100 ? '#C53030' : '#F0E8EB'}
              strokeDasharray={v === 100 ? '5,3' : ''}
              strokeWidth="0.7" />
            <text x={padL - 4} y={toY(v) + 3} textAnchor="end" fill={v === 100 ? '#C53030' : C.pinkMuted} fontSize="8">
              {v}%
            </text>
          </g>
        ))}
        {points && (
          <polyline points={points} fill="none" stroke={C.pink} strokeWidth="2.5" strokeLinejoin="round" />
        )}
        {rates.map((v, i) => {
          if (v === null) return null
          const color = v >= 100 ? '#0F6E56' : v >= 80 ? '#B8860B' : '#C53030'
          return (
            <g key={i}>
              <circle cx={toX(i)} cy={toY(v)} r="3.5" fill={color} />
              <text x={toX(i)} y={toY(v) - 6} textAnchor="middle" fill={color} fontSize="8" fontWeight="700">
                {v}%
              </text>
            </g>
          )
        })}
        {months.map((m, i) => (
          (months.length <= 12 || i % Math.ceil(months.length / 12) === 0) && (
            <text key={m} x={toX(i)} y={H - 4} textAnchor="middle" fill={C.pinkMuted} fontSize="8">
              {m.slice(5).replace(/^0/, '')}月
            </text>
          )
        ))}
      </svg>
      <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 4 }}>
        ※ 緑=達成 / 黄=80%以上 / 赤=80%未満。赤点線=100% ライン
      </div>
    </div>
  )
}

// ─── 曜日別売上ヒートマップ（A-1） ───────────────────────────────
function DayOfWeekHeatmap({ customers, isPC }: { customers: CustomerLite[]; isPC: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  type DayStat = { count: number; total: number }
  const [stats, setStats] = useState<DayStat[]>(Array.from({ length: 7 }, () => ({ count: 0, total: 0 })))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const ids = customers.map(c => c.id)
      if (ids.length === 0) { setLoading(false); return }
      // 過去6ヶ月の visits
      const since = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('customer_visits')
        .select('visit_date, amount_spent')
        .in('customer_id', ids)
        .gte('visit_date', since)
      const buckets: DayStat[] = Array.from({ length: 7 }, () => ({ count: 0, total: 0 }))
      for (const v of (data ?? []) as Array<{ visit_date: string; amount_spent: number }>) {
        const a = Number(v.amount_spent) || 0
        if (a <= 0) continue
        const d = new Date(v.visit_date)
        const dow = d.getDay() // 0=日, 1=月, ..., 6=土
        // 月始まりに並べ替え: 月=0, 火=1, ..., 日=6
        const idx = (dow + 6) % 7
        buckets[idx].count += 1
        buckets[idx].total += a
      }
      setStats(buckets)
      setLoading(false)
    }
    load()
  }, [supabase, customers])

  const labels = ['月', '火', '水', '木', '金', '土', '日']
  const maxTotal = Math.max(1, ...stats.map(s => s.total))
  const totalAll = stats.reduce((s, x) => s + x.total, 0)
  const visitsAll = stats.reduce((s, x) => s + x.count, 0)
  const bestIdx = stats.findIndex(s => s.total === maxTotal && s.total > 0)

  // 色合いを計算 — 強さに応じてピンクの濃さ
  const cellBg = (val: number) => {
    if (val === 0) return '#F5F0F2'
    const ratio = val / maxTotal
    // ピンクのグラデ: 薄(#FBEAF0) → 濃(#C84F7B)
    const r = Math.round(251 - (251 - 200) * ratio)
    const g = Math.round(234 - (234 - 79) * ratio)
    const b = Math.round(240 - (240 - 123) * ratio)
    return `rgb(${r}, ${g}, ${b})`
  }
  const cellFg = (val: number) => val / maxTotal > 0.5 ? '#FFF' : C.dark

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>📅</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>曜日別売上ヒートマップ</span>
      </div>
      <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 10 }}>
        過去6ヶ月の来店データから「どの曜日が稼げているか」を可視化。色が濃い曜日ほど売上が大きい。
      </div>
      {loading ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, textAlign: 'center', padding: 12 }}>読込中...</div>
      ) : visitsAll === 0 ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, textAlign: 'center', padding: 12 }}>来店データがありません</div>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 6,
          }}>
            {stats.map((s, i) => {
              const share = totalAll > 0 ? Math.round((s.total / totalAll) * 100) : 0
              const isBest = i === bestIdx
              const isWeekend = i >= 5
              return (
                <div key={i} style={{
                  background: cellBg(s.total),
                  borderRadius: 8,
                  padding: '10px 4px',
                  textAlign: 'center',
                  border: isBest ? '2px solid #E5B14C' : `1px solid ${C.border}`,
                  position: 'relative',
                }}>
                  {isBest && (
                    <div style={{
                      position: 'absolute', top: -8, right: -4,
                      fontSize: 10,
                    }}>⭐</div>
                  )}
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isWeekend ? (s.total / maxTotal > 0.5 ? '#FFF' : '#C53030') : cellFg(s.total),
                    marginBottom: 4,
                  }}>{labels[i]}</div>
                  <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: cellFg(s.total),
                    lineHeight: 1.2,
                  }}>
                    {s.total >= 10000 ? `¥${Math.round(s.total / 10000)}万` : `¥${s.total.toLocaleString()}`}
                  </div>
                  <div style={{ fontSize: 9, color: cellFg(s.total), opacity: 0.85, marginTop: 2 }}>
                    {s.count}件 / {share}%
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{
            marginTop: 10, fontSize: 10, color: C.pinkMuted,
            display: 'flex', gap: 12, flexWrap: 'wrap',
          }}>
            <span>合計 <strong style={{ color: C.dark }}>{visitsAll}件</strong></span>
            <span>累計売上 <strong style={{ color: C.dark }}>¥{totalAll.toLocaleString()}</strong></span>
            {bestIdx >= 0 && (
              <span>⭐ 最強曜日: <strong style={{ color: '#9C6300' }}>{labels[bestIdx]}曜日</strong></span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── お客様タブ ──────────────────────────────────────────
type CustomerLite = {
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

export function CustomersTab({
  customers, monthVisits, month, onCustomerClick, isPC,
}: {
  customers: CustomerLite[]
  monthVisits: Array<{ customer_id: string; visit_date: string; amount_spent: number; has_douhan: boolean; nomination_status?: string }>
  month: string
  onCustomerClick: (id: string) => void
  isPC: boolean
}) {
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
  const newCustomers = customers.filter(c => {
    if (!c.first_visit_date) return false
    return String(c.first_visit_date).startsWith(month)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionBlock title={`今月の本指名 — ${honshimei.length}人`} emptyText="今月の本指名来店はまだありません" items={honshimei} onCustomerClick={onCustomerClick} showMonthly={monthlyByCustomer} isPC={isPC} accent="#B25575" />
      <SectionBlock title={`今月の場内 — ${banai.length}人`} emptyText="今月の場内来店はまだありません" items={banai} onCustomerClick={onCustomerClick} showMonthly={monthlyByCustomer} isPC={isPC} accent="#7A4060" />
      <SectionBlock title={`今月の新規お客様 — ${newCustomers.length}人`} emptyText="今月の新規はまだありません" items={newCustomers} onCustomerClick={onCustomerClick} showMonthly={monthlyByCustomer} isPC={isPC} accent="#0F6E56" />
      <SectionBlock title={`累計売上 トップ20`} items={top20} onCustomerClick={onCustomerClick} showMonthly={monthlyByCustomer} isPC={isPC} accent="#D4A017" useTotal />
      <SectionBlock title={`同伴経験あり — ${douhanList.length}人`} items={douhanList} onCustomerClick={onCustomerClick} showMonthly={monthlyByCustomer} isPC={isPC} accent="#E8789A" />
      <SectionBlock title={`離脱リスク(90日以上未来店) — ${dropouts.length}人`} emptyText="離脱リスクのお客様はいません 👏" items={dropouts.map(x => x.c)} onCustomerClick={onCustomerClick} showMonthly={monthlyByCustomer} isPC={isPC} accent="#C53030" showLastVisitDays />
    </div>
  )
}

function SectionBlock({
  title, emptyText, items, onCustomerClick, showMonthly, isPC, accent, useTotal, showLastVisitDays,
}: {
  title: string
  emptyText?: string
  items: CustomerLite[]
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
