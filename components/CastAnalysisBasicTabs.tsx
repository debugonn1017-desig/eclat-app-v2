'use client'

// キャスト分析の基礎タブ部品
//   PlaceholderTab / OverviewTab / TimelineTab / CustomersTab
//   /admin/casts/[id] と /admin/cast-analysis の両方から import される。
//
//   ※ 以前は app/admin/casts/[id]/page.tsx から named export していたが、
//     Next.js の page ファイルから named export を拾うとビルドが落ちることが
//     あるため、独立した components/* に移動した。

import { useMemo } from 'react'
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
  month, multiKPI, multiTarget, allMonths, isPC,
}: {
  month: string
  multiKPI: Record<string, CastKPI>
  multiTarget: Record<string, number>
  allMonths: string[]
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
        gridTemplateColumns: isPC ? 'repeat(2, 1fr)' : '1fr',
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
