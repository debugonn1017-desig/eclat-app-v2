'use client'
import { C } from '@/lib/colors'
import { useEffect, useMemo, useState } from 'react'
import type { CastKPI,CastProfile } from '@/types'
type Row={cast:CastProfile;kpi:CastKPI;prevSales:number}
type Sort='sales'|'avgSpend'|'honshimei'|'douhan'|'diff'
export default function CastRankingTab(_props:{isPC:boolean;isAdmin:boolean;viewerCastId?:string|null}) {
  void _props
  const [month,setMonth]=useState(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')})
  const [rows,setRows]=useState<Row[]>([]),[sort,setSort]=useState<Sort>('sales'),[loading,setLoading]=useState(true),[error,setError]=useState('')
  useEffect(()=>{let cancelled=false;void(async()=>{
    setLoading(true);setError('')
    const response=await fetch('/api/cast-rankings?month='+month,{cache:'no-store'})
    if(!response.ok)throw new Error('ランキングを取得できませんでした')
    const data=await response.json() as Row[]
    if(!cancelled){setRows(data);setLoading(false)}
  })().catch(e=>{if(!cancelled){setRows([]);setError(e.message);setLoading(false)}});return()=>{cancelled=true}},[month])
  const sorted=useMemo(()=>{
    const value=(r:Row)=>sort==='sales'?r.kpi.monthlySales:sort==='avgSpend'?r.kpi.avgSpend:sort==='honshimei'?(r.kpi.honshimeiMonthlyVisits??0):sort==='douhan'?r.kpi.douhanCount:r.kpi.monthlySales-r.prevSales
    return [...rows].sort((a,b)=>value(b)-value(a)||a.cast.id.localeCompare(b.cast.id))
  },[rows,sort])
  const yen=(n:number)=>'¥'+n.toLocaleString('ja-JP')
  return <div style={{paddingTop:16}}>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
      <label>表示月<input type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value)}} style={{display:'block',padding:12,borderRadius:10,border:`1px solid ${C.border}`}}/></label>
      <label>並び順<select value={sort} onChange={e=>setSort(e.target.value as Sort)} style={{display:'block',padding:12,borderRadius:10,border:`1px solid ${C.border}`}}>
        <option value="sales">売上順</option><option value="avgSpend">客単価順</option><option value="honshimei">本指名本数順</option><option value="douhan">同伴数順</option><option value="diff">前月比順</option>
      </select></label>
    </div>
    {error&&<p role="alert">{error}</p>}{loading?<p>読み込み中…</p>:sorted.map((r,i)=><article key={r.cast.id} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,padding:16,marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}><strong style={{color:C.goldText,fontSize:20}}>{i+1}</strong><strong style={{fontSize:18}}>{r.cast.display_name||r.cast.cast_name}</strong><span style={{color:C.dark2,fontSize:12}}>{r.cast.cast_tier||'未設定'}</span></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:10,fontSize:13}}>
        <div>売上<br/><strong style={{color:C.pinkDeep}}>{yen(r.kpi.monthlySales)}</strong></div>
        <div>客単価<br/><strong>{yen(r.kpi.avgSpend)}</strong></div>
        <div>本指名<br/><strong>{r.kpi.honshimeiMonthlyVisits??0}本</strong></div>
        <div>同伴<br/><strong>{r.kpi.douhanCount}件</strong></div>
        <div>前月比<br/><strong>{yen(r.kpi.monthlySales-r.prevSales)}</strong></div>
      </div>
    </article>)}
  </div>
}
