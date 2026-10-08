'use client'
import { C } from '@/lib/colors'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CastKPI, CastTarget } from '@/types'
import { useCasts } from '@/hooks/useCasts'

type Props = { castId: string; castName: string; month: string; kpi: CastKPI; castTarget: CastTarget | null; workDays: number; plannedDays?: number; isPC?: boolean; onCustomerClick?: (id: string) => void }
const panel: CSSProperties = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 18, padding: 18, minWidth: 0 }
const yen = (n: number) => '¥' + n.toLocaleString('ja-JP')
const colors = [C.pink, C.chartBlue, C.chartPurple]
function YearChart({ months, series, money = false }: { months: string[]; series: { label: string; color: string; values: number[] }[]; money?: boolean }) {
  const max = Math.max(1, ...series.flatMap(s => s.values)), w = 720, h = 240
  const x = (i: number) => 60 + i * (w - 80) / 11
  const y = (v: number) => h - 40 - v / max * (h - 70)
  return <div style={{ overflowX:'auto', maxWidth:'100%' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13 }}>{series.map(s => <span key={s.label} style={{ color: s.color }}>● {s.label}</span>)}</div>
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={money ? '年間売上推移' : '年間指名実績'} style={{ width: '100%', minWidth: 600, minHeight: 220 }}>
      {[0, .5, 1].map(t => <g key={t}><line x1="60" x2="700" y1={y(max*t)} y2={y(max*t)} stroke={C.border} /><text x="54" y={y(max*t)+4} textAnchor="end" fontSize="11" fill={C.dark2}>{money ? Math.round(max*t/10000)+'万' : Math.round(max*t)}</text></g>)}
      {series.map(s => <g key={s.label}><polyline fill="none" stroke={s.color} strokeWidth="3" points={s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} />
        {s.values.map((v,i)=><circle key={i} cx={x(i)} cy={y(v)} r="4" fill={s.color}><title>{months[i]} {s.label}: {money ? yen(v) : v}</title></circle>)}
      </g>)}
      {months.map((m,i)=><text key={m} x={x(i)} y="229" textAnchor="middle" fontSize="11" fill={C.dark2}>{Number(m.slice(5))}月</text>)}
    </svg>
    <details><summary style={{ cursor: 'pointer', fontSize: 12 }}>グラフの数値を見る</summary><div style={{ overflowX: 'auto' }}>
      <table style={{ fontSize: 12, width: '100%', textAlign: 'right' }}><thead><tr><th>月</th>{series.map(s=><th key={s.label}>{s.label}</th>)}</tr></thead><tbody>{months.map((m,i)=><tr key={m}><td>{m}</td>{series.map(s=><td key={s.label}>{money ? yen(s.values[i]) : s.values[i]}</td>)}</tr>)}</tbody></table>
    </div></details>
  </div>
}
export default function CastKPITab({ castId, castName, month, kpi, castTarget, workDays, plannedDays=0 }: Props) {
  const { getMultiMonthKPI, getCastTarget } = useCasts()
  const [annual, setAnnual] = useState<Record<string, CastKPI>>({})
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const months = useMemo(() => {
    const [y,m] = month.split('-').map(Number)
    return Array.from({ length: 12 }, (_,i) => { const d = new Date(y, m - 12 + i, 1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0') })
  }, [month])
  useEffect(() => {
    let cancelled=false
    void (async()=>{
      setLoading(true)
      setError(false)
      const [data, goals] = await Promise.all([
        getMultiMonthKPI(castName, castId, months),
        Promise.all(months.map(async m=>[m, (await getCastTarget(castId,m))?.target_sales ?? 0] as const)),
      ])
      if (!cancelled) { setAnnual(data); setTargets(Object.fromEntries(goals)); setLoading(false) }
    })().catch(()=>{ if(!cancelled) { setAnnual({}); setTargets({}); setError(true); setLoading(false) } })
    return ()=>{ cancelled=true }
  }, [castId, castName, months, getMultiMonthKPI, getCastTarget])
  const workTarget = castTarget?.target_work_days ?? 0
  return <div style={{ display:'grid', gap:14, paddingTop:16 }}>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:14 }}>
      <section style={{ ...panel, background:C.tagBg2 }}><h3 style={{ fontSize:14, margin:0 }}>月間売上</h3><p style={{ fontSize:28, fontWeight:800, color:C.pinkDeep, margin:'12px 0' }}>{yen(kpi.monthlySales)}</p><div>今月の客単価 <strong>{yen(kpi.avgSpend)}</strong></div><small style={{ color:C.dark2 }}>月間売上 ÷ 本指名来店 {kpi.honshimeiMonthlyVisits ?? 0}回</small></section>
      <section style={panel}><h3 style={{ fontSize:14, margin:0 }}>設定売上</h3><p style={{ fontSize:28, fontWeight:800, margin:'12px 0' }}>{castTarget?.target_sales ? yen(castTarget.target_sales) : '未設定'}</p><div>設定単価 <strong>{castTarget?.target_avg_spend ? yen(castTarget.target_avg_spend) : '未設定'}</strong></div></section>
    </div>
    <section style={{ ...panel, border:`2px solid ${C.pink}`, background:C.bgLight }}><h3 style={{ margin:'0 0 12px',fontSize:16 }}>出勤日数・シフト</h3><div style={{ display:'flex', flexWrap:'wrap',gap:24 }}>
      <span>今月の出勤 <strong style={{ fontSize:24 }}>{workDays}日</strong></span><span>設定出勤日数 <strong style={{ fontSize:24 }}>{workTarget ? workTarget+'日' : '未設定'}</strong></span><span>希望出勤 {plannedDays}日</span>
    </div><p style={{ marginBottom:0, color:C.pinkDeep }}>{!workTarget ? '設定タブから出勤日数を設定できます' : workDays >= workTarget ? '設定出勤日数を達成' : '設定まであと'+(workTarget-workDays)+'日'}</p></section>
    <section style={panel}><h3 style={{ fontSize:14,margin:'0 0 14px' }}>顧客カテゴリ内訳</h3><div style={{ display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:10 }}>{[
      ['県内顧客', kpi.kokyakuCount], ['県外顧客',kpi.kengaiCount], ['場内',kpi.banaiMonthlyCount ?? 0],
    ].map(([label,n],i)=><div key={label} style={{ background:C.tagBg,borderRadius:12,padding:12,textAlign:'center',color:colors[i] }}><div style={{ fontSize:12 }}>{label}</div><strong style={{ fontSize:24 }}>{n}</strong><small>{i===2?'本':'人'}</small></div>)}</div></section>
    <section style={panel}><h3 style={{ fontSize:15 }}>年間売上推移</h3>{loading ? <p>読み込み中…</p> : error ? <p role="alert">グラフを取得できませんでした。再読み込みしてください。</p> : <YearChart months={months} money series={[
      {label:'実績',color:colors[0],values:months.map(m=>annual[m]?.monthlySales ?? 0)},
      {label:'設定売上',color:C.pinkMuted,values:months.map(m=>targets[m] ?? 0)},
    ]}/>}</section>
    <section style={panel}><h3 style={{ fontSize:15 }}>年間指名実績</h3><p style={{ fontSize:12,color:C.dark2 }}>本指名は月ごとの実人数（同じお客様は1人）。地域未設定は県外に含みます。場内は本数です。</p>{loading ? <p>読み込み中…</p> : error ? <p role="alert">グラフを取得できませんでした。再読み込みしてください。</p> : <YearChart months={months} series={[
      {label:'県内・本指名人数',color:colors[0],values:months.map(m=>annual[m]?.localMonthlyPeople ?? 0)},
      {label:'県外・本指名人数',color:colors[1],values:months.map(m=>annual[m]?.outsideMonthlyPeople ?? 0)},
      {label:'場内本数',color:colors[2],values:months.map(m=>annual[m]?.banaiMonthlyCount ?? 0)},
    ]}/>}</section>
  </div>
}
