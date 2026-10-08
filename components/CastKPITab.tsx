'use client'

import { C } from '@/lib/colors'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CastKPI, CastTarget } from '@/types'
import { useCasts } from '@/hooks/useCasts'

type Props = { castId: string; castName: string; month: string; kpi: CastKPI; castTarget: CastTarget | null; workDays: number; plannedDays?: number; isPC?: boolean; onCustomerClick?: (id: string) => void }
type Series = { label: string; color: string; values: number[]; dashed?: boolean }
const panel: CSSProperties = { background: C.white, border: '1px solid ' + C.border, borderRadius: 16, minWidth: 0 }
const yen = (n: number) => '¥' + n.toLocaleString('ja-JP')
const colors = [C.pinkDeep, C.chartBlue, C.chartPurple]

export function YearChart({ months, series, money = false, isPC = false }: { months: string[]; series: Series[]; money?: boolean; isPC?: boolean }) {
  const max = Math.max(1, ...series.flatMap(s => s.values))
  const w = isPC ? 720 : 360, h = isPC ? 230 : 190
  const x = (i: number) => 42 + i * (w - 58) / 11
  const y = (v: number) => h - 28 - v / max * (h - 46)
  return <div style={{ minWidth: 0 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 11, color: C.dark2 }}>
      {series.map(s => <span key={s.label}><span aria-hidden="true" style={{ color: s.color }}>● </span>{s.label}</span>)}
    </div>
    <svg viewBox={'0 0 ' + w + ' ' + h} role="img" aria-label={money ? '年間売上推移' : '年間指名実績'} style={{ display: 'block', width: '100%', height: isPC ? 230 : 190, marginTop: 8 }}>
      {[0, .5, 1].map(t => <g key={t}>
        <line x1="42" x2={w - 14} y1={y(max * t)} y2={y(max * t)} stroke={C.border} />
        <text x="36" y={y(max * t) + 4} textAnchor="end" fontSize="11" fill={C.dark2}>{money ? Math.round(max * t / 10000) + '万' : Math.round(max * t)}</text>
      </g>)}
      {series.map(s => <g key={s.label}>
        <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? '5 4' : undefined} points={s.values.map((v, i) => x(i) + ',' + y(v)).join(' ')} />
        {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.color}><title>{months[i]} {s.label}: {money ? yen(v) : v}</title></circle>)}
      </g>)}
      {months.map((m, i) => <text key={m} x={x(i)} y={h - 8} textAnchor="middle" fontSize="10" fill={C.dark2}>{Number(m.slice(5))}月</text>)}
    </svg>
    <details><summary style={{ cursor: 'pointer', fontSize: 11, color: C.dark2, padding: '10px 0' }}>月ごとの数値を見る</summary><div style={{ overflowX: 'auto' }}>
      <table style={{ fontSize: 12, width: '100%', textAlign: 'right' }}><thead><tr><th>月</th>{series.map(s => <th key={s.label}>{s.label}</th>)}</tr></thead><tbody>{months.map((m, i) => <tr key={m}><td>{m}</td>{series.map(s => <td key={s.label}>{money ? yen(s.values[i]) : s.values[i]}</td>)}</tr>)}</tbody></table>
    </div></details>
  </div>
}

/** 計算は変えず、取得済みの実績・設定を表示する。プレビューもこの表示を共用。 */
export function CastPerformanceSummary({ kpi, castTarget, workDays, plannedDays = 0, isPC = false }: Pick<Props, 'kpi' | 'castTarget' | 'workDays' | 'plannedDays' | 'isPC'>) {
  const workTarget = castTarget?.target_work_days ?? 0
  const salesPanel: CSSProperties = { ...panel, padding: isPC ? 18 : 12 }
  const amount: CSSProperties = { fontSize: isPC ? 30 : 'clamp(17px, 5vw, 24px)', fontWeight: 800, margin: '7px 0 10px', overflowWrap: 'anywhere', lineHeight: 1.25, fontVariantNumeric: 'tabular-nums' }
  const unit: CSSProperties = { display: 'block', marginTop: 3, fontSize: isPC ? 18 : 16, color: C.dark, overflowWrap: 'anywhere' }
  const unitRow: CSSProperties = { borderTop: '1px solid ' + C.border, paddingTop: 8, fontSize: 11, color: C.dark2 }
  return <div style={{ display: 'grid', gap: 10 }}>
    <div aria-label="月間売上と設定売上" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: isPC ? 12 : 8 }}>
      <section style={{ ...salesPanel, background: 'linear-gradient(145deg, ' + C.tagBg2 + ', ' + C.white + ')' }}>
        <h3 style={{ fontSize: 12, color: C.dark2, margin: 0 }}>月間売上</h3>
        <p style={{ ...amount, color: C.pinkDeep }}>{yen(kpi.monthlySales)}</p>
        <div style={unitRow}>今月の客単価<strong style={unit}>{yen(kpi.avgSpend)}</strong></div>
      </section>
      <section style={{ ...salesPanel, background: 'linear-gradient(145deg, ' + C.goldBg + ', ' + C.white + ')' }}>
        <h3 style={{ fontSize: 12, color: C.dark2, margin: 0 }}>設定売上</h3>
        <p style={amount}>{castTarget?.target_sales ? yen(castTarget.target_sales) : '未設定'}</p>
        <div style={unitRow}>設定単価<strong style={unit}>{castTarget?.target_avg_spend ? yen(castTarget.target_avg_spend) : '未設定'}</strong></div>
      </section>
    </div>
    <section aria-label="出勤日数・シフト" style={{ ...panel, padding: '12px 14px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6, alignItems: 'center', marginBottom: 9 }}>
        <h3 style={{ fontSize: 12, color: C.dark2, margin: 0 }}>出勤日数・シフト</h3>
        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: C.tagBg2, color: C.tagTextStrong, fontWeight: 700 }}>{!workTarget ? '設定未登録' : workDays >= workTarget ? '設定日数を達成' : 'あと' + (workTarget - workDays) + '日'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', textAlign: 'center' }}>
        {[['今月の出勤', workDays + '日'], ['設定出勤', workTarget ? workTarget + '日' : '未設定'], ['希望出勤', plannedDays + '日']].map(([label, value], i) => <div key={label} style={{ minWidth: 0, borderLeft: i ? '1px solid ' + C.border : undefined }}>
          <div style={{ fontSize: 11, color: C.dark2 }}>{label}</div>
          <strong style={{ display: 'block', marginTop: 3, fontSize: isPC ? 24 : 21, color: i === 0 ? C.pinkDeep : C.dark }}>{value}</strong>
        </div>)}
      </div>
    </section>
    <section aria-label="顧客カテゴリ内訳" style={{ ...panel, padding: '10px 6px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', textAlign: 'center' }}>
        {[
          ['県内顧客', kpi.kokyakuCount], ['県外顧客', kpi.kengaiCount], ['場内', kpi.banaiMonthlyCount ?? 0],
        ].map(([label, n], i) => <div key={label} style={{ minWidth: 0, borderLeft: i ? '1px solid ' + C.border : undefined }}>
          <div style={{ fontSize: 11, color: C.dark2 }}><span aria-hidden="true" style={{ color: colors[i] }}>● </span>{label}</div>
          <strong style={{ fontSize: isPC ? 24 : 20, color: C.dark }}>{n}</strong><small style={{ marginLeft: 3, fontSize: 11, color: C.dark2 }}>{i === 2 ? '本' : '人'}</small>
        </div>)}
      </div>
    </section>
    <details style={{ fontSize: 11, color: C.dark2 }}><summary style={{ cursor: 'pointer', padding: '8px 2px' }}>客単価の計算について</summary><p style={{ margin: '4px 2px' }}>月間売上 ÷ 本指名来店 {kpi.honshimeiMonthlyVisits ?? 0}回</p></details>
  </div>
}

export default function CastKPITab({ castId, castName, month, kpi, castTarget, workDays, plannedDays = 0, isPC = false }: Props) {
  const { getMultiMonthKPI, getCastTarget } = useCasts()
  const [annual, setAnnual] = useState<Record<string, CastKPI>>({})
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [chartTab, setChartTab] = useState<'sales' | 'nominations'>('sales')
  const months = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return Array.from({ length: 12 }, (_, i) => { const d = new Date(y, m - 12 + i, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') })
  }, [month])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(false)
      const [data, goals] = await Promise.all([
        getMultiMonthKPI(castName, castId, months),
        Promise.all(months.map(async m => [m, (await getCastTarget(castId, m))?.target_sales ?? 0] as const)),
      ])
      if (!cancelled) { setAnnual(data); setTargets(Object.fromEntries(goals)); setLoading(false) }
    })().catch(() => { if (!cancelled) { setAnnual({}); setTargets({}); setError(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [castId, castName, months, getMultiMonthKPI, getCastTarget])
  const series: Series[] = chartTab === 'sales' ? [
    { label: '実績', color: colors[0], values: months.map(m => annual[m]?.monthlySales ?? 0) },
    { label: '設定売上', color: C.pinkMuted, dashed: true, values: months.map(m => targets[m] ?? 0) },
  ] : [
    { label: '県内・本指名人数', color: colors[0], values: months.map(m => annual[m]?.localMonthlyPeople ?? 0) },
    { label: '県外・本指名人数', color: colors[1], values: months.map(m => annual[m]?.outsideMonthlyPeople ?? 0) },
    { label: '場内本数', color: colors[2], values: months.map(m => annual[m]?.banaiMonthlyCount ?? 0) },
  ]
  return <div style={{ display: 'grid', gap: 10, paddingTop: 12, color: C.dark }}>
    <CastPerformanceSummary kpi={kpi} castTarget={castTarget} workDays={workDays} plannedDays={plannedDays} isPC={isPC} />
    <section style={{ ...panel, padding: isPC ? 18 : 12 }}>
      <div role="group" aria-label="年間グラフの切り替え" data-block-tab-swipe="true" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4, borderRadius: 12, background: C.miniBg, marginBottom: 10 }}>
        {([{ id: 'sales', label: '売上推移' }, { id: 'nominations', label: '指名推移' }] as const).map(tab => <button key={tab.id} type="button" aria-pressed={chartTab === tab.id} onClick={() => setChartTab(tab.id)} style={{ minHeight: 44, border: 'none', borderRadius: 9, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: chartTab === tab.id ? C.white : 'transparent', color: chartTab === tab.id ? C.tagTextStrong : C.dark2, boxShadow: chartTab === tab.id ? '0 2px 8px rgba(176,144,154,0.12)' : undefined }}>{tab.label}</button>)}
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 11, color: C.dark2 }}>{months[0].replace('-', '/')} 〜 {months[11].replace('-', '/')} · 1年間</p>
      {loading ? <p role="status" style={{ fontSize: 12 }}>読み込み中…</p> : error ? <p role="alert">グラフを取得できませんでした。再読み込みしてください。</p> : <YearChart months={months} series={series} money={chartTab === 'sales'} isPC={isPC} />}
      {chartTab === 'nominations' && <p style={{ fontSize: 11, color: C.dark2, margin: '8px 0 0', lineHeight: 1.6 }}>本指名は同じお客様を月に1人として集計。地域未設定は県外、場内は本数です。</p>}
    </section>
  </div>
}
