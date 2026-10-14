'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { C } from '@/lib/colors'
import { fetchMe } from '@/lib/authCache'
import { invalidateAllCastsKPI, invalidateCustomerDetail } from '@/lib/cache'
import { RANK_ORIGIN_LABELS, type RankOrigin } from '@/lib/rankRecovery'
import PageHeader from './PageHeader'
import CompactListField from './CompactListField'

export type RecoveryRow = {id:string;name:string;castName:string;origin:RankOrigin;lastVisitDate:string|null;days:number|null;
  recommended:string;canRestore:boolean;token:string|null;keepToken:string|null;reasons:string[]}
type Data = {items:RecoveryRow[];casts:string[];counts:{unknown:number;manual:number;auto:number;candidates:number};total:number;pageCount:number}
const fieldStyle={fontSize:13,minHeight:38,padding:'6px 10px',color:C.dark,border:`1px solid ${C.border}`,borderRadius:8,background:C.white,fontFamily:'inherit'}
const buttonStyle={...fieldStyle,fontSize:12,cursor:'pointer'}
export function RankRecoveryCards({rows, selected, busy, canEdit, onSelect, onKeep}: {
  rows:RecoveryRow[];selected:Set<string>;busy:boolean;canEdit:boolean;onSelect:(id:string)=>void;onKeep:(row:RecoveryRow)=>void
}) {
  return <div style={{display:'grid',gap:8}}>{rows.map(row=><div key={row.id} style={{border:`1px solid ${C.border}`,borderRadius:12,padding:12,background:C.white}}>
    <label style={{display:'flex',alignItems:'center',gap:10,minHeight:44,cursor:canEdit&&row.canRestore?'pointer':'default'}}>
      <input type="checkbox" aria-label={`${row.name}の復帰を選択`} checked={selected.has(row.id)} disabled={busy||!canEdit||!row.canRestore} onChange={()=>onSelect(row.id)} style={{width:18,height:18,flexShrink:0}}/>
      <span style={{minWidth:0,flex:1}}><strong style={{fontSize:14,overflowWrap:'anywhere',color:C.dark}}>{row.name}</strong>
        <span style={{display:'block',fontSize:11,color:C.dark2,marginTop:3}}>{row.castName} · {RANK_ORIGIN_LABELS[row.origin]}</span></span>
      <strong style={{fontSize:13,color:C.dark,whiteSpace:'nowrap'}}>{row.days===null?'来店未記録':`${row.days}日前`}</strong>
    </label>
    <div style={{fontSize:12,color:C.dark2,marginTop:5,lineHeight:1.6}}>
      最終実来店：{row.lastVisitDate || '未記録'}<br/>
      {row.canRestore ? `確認後の復帰先：${row.recommended}ランク` : row.origin==='manual' ? '手動のため自動復帰しません' : '現在の基準では復帰対象ではありません'}
    </div>
    {row.origin==='unknown' && <p style={{fontSize:11,color:C.caution,margin:'6px 0'}}>過去の変更元は不明です。手動で切れたにした人が含まれる場合があります。</p>}
    <details style={{fontSize:11,color:C.dark2,marginTop:6}}><summary>判定理由</summary>{row.reasons.map((reason,i)=><p key={i}>{reason}</p>)}</details>
    {canEdit&&row.keepToken&&<button type="button" disabled={busy} onClick={()=>onKeep(row)} style={{fontSize:11,minHeight:36,border:`1px solid ${C.border}`,borderRadius:8,color:C.dark2,background:C.bg,marginTop:6,padding:'5px 10px'}}>手動の「切れた」として残す</button>}
  </div>)}</div>
}

export default function RankRecoveryPage({initialCastName=''}:{initialCastName?:string}) {
  const [castName,setCastName]=useState(initialCastName),[source,setSource]=useState('candidates'),[page,setPage]=useState(1)
  const [data,setData]=useState<Data|null>(null),[casts,setCasts]=useState<string[]>([]),[selected,setSelected]=useState(new Set<string>())
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[canEdit,setCanEdit]=useState(false),[isCast,setIsCast]=useState(false)
  const [confirmed,setConfirmed]=useState(false),[error,setError]=useState<string|null>(null),[actionError,setActionError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null)
  const [refresh,setRefresh]=useState(0),requestId=useRef(0),busyRef=useRef(false)
  useEffect(()=>{void fetchMe().then(me=>{setCanEdit(!!me&&(me.role==='cast'||me.is_owner===true||me.permissions?.['顧客.編集']===true));setIsCast(me?.role==='cast')})},[])
  useEffect(()=>{
    const id=++requestId.current
    let cancelled=false
    setLoading(true);setError(null);setData(null);setSelected(new Set());setConfirmed(false)
    const params=new URLSearchParams({mode:'recovery',source,page:String(page)})
    if(castName)params.set('castName',castName)
    void fetch('/api/customer-ranks?'+params,{cache:'no-store'}).then(async response=>{
      const json=await response.json();if(!response.ok)throw new Error(json.error||'取得失敗')
      if(cancelled||id!==requestId.current)return
      setData(json);setCasts(prev=>castName&&prev.length ? prev : json.casts)
    }).catch(e=>{if(!cancelled&&id===requestId.current)setError(e instanceof Error?e.message:'取得失敗')})
      .finally(()=>{if(!cancelled&&id===requestId.current)setLoading(false)})
    return ()=>{cancelled=true}
  },[castName,source,page,refresh])
  const apply=useCallback(async(rows:RecoveryRow[],keep=false)=>{
    if(busyRef.current||!rows.length)return
    if(!keep&&rows.some(r=>r.origin==='unknown')&&!confirmed){setActionError('手動の切れたではないことを確認してください');return}
    if(!window.confirm(keep ? `${rows[0].name}を手動の「切れた」として残します。以降の自動再評価では戻りません。よろしいですか？` : `選択した${rows.length}人だけを表示された推奨ランクへ復帰します。よろしいですか？`))return
    busyRef.current=true;setBusy(true);setActionError(null);setMessage(null)
    try{
      const response=await fetch('/api/customer-ranks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tokens:rows.map(r=>keep?r.keepToken:r.token),confirmLegacy:confirmed})})
      const json=await response.json();if(!response.ok)throw new Error(json.error||'保存失敗')
      const results=json.results as {id:string;ok:boolean;error?:string}[]
      for(const result of results)if(result.ok)invalidateCustomerDetail(result.id)
      if(json.changed)invalidateAllCastsKPI()
      setMessage(json.changed>0 ? `${json.changed}人${keep?'を手動として確認しました':'を復帰しました'}` : null)
      const failed=results.filter(r=>!r.ok)
      if(failed.length)setActionError(`${failed.length}人は反映できませんでした。再読み込みして再確認してください。`)
      setRefresh(r=>r+1)
    }catch(e){setActionError(e instanceof Error?e.message:'保存失敗')}
    finally{busyRef.current=false;setBusy(false)}
  },[confirmed])
  const selectedRows=data?.items.filter(r=>selected.has(r.id))||[]
  return <div style={{minHeight:'100vh',background:C.bg,color:C.dark,fontFamily:'inherit'}}>
    <PageHeader title="切れたのお客様・復帰確認" subtitle="ランク確認" backFallback="/home"/>
    <main style={{maxWidth:900,margin:'0 auto',padding:'14px 16px 100px'}}>
      <p style={{fontSize:12,lineHeight:1.7}}>見るだけではランクは変わりません。履歴なしのお客様は、担当キャストが手動で切った人でないか確認してください。</p>
      <div style={{display:'flex',flexWrap:'wrap',gap:10,marginBottom:12}}>
        {!isCast&&<CompactListField compact><select style={fieldStyle} aria-label="確認するキャスト" value={castName} disabled={busy||loading} onChange={e=>{setCastName(e.target.value);setPage(1);setMessage(null)}}><option value="">全キャスト</option>{[...new Set([...(initialCastName?[initialCastName]:[]),...casts])].map(name=><option key={name}>{name}</option>)}</select></CompactListField>}
        <CompactListField compact><select style={fieldStyle} aria-label="確認する分類" value={source} disabled={busy||loading} onChange={e=>{setSource(e.target.value);setPage(1);setMessage(null)}}>
          <option value="candidates">復帰候補のみ</option><option value="unknown">履歴なし</option><option value="manual">手動の切れた</option><option value="auto">自動の切れた</option><option value="all">全ての切れた</option>
        </select></CompactListField>
        <button style={buttonStyle} disabled={busy||loading} onClick={()=>setRefresh(r=>r+1)}>再読み込み</button>
      </div>
      {data&&<p style={{fontSize:12}}>復帰候補 {data.counts.candidates}人 ／ 履歴なし {data.counts.unknown}人 ／ 手動 {data.counts.manual}人 ／ 自動 {data.counts.auto}人</p>}
      {(error||actionError)&&<p role="alert" style={{fontSize:12,color:C.dangerDeep}}>{error||actionError}</p>}{message&&<p role="status" style={{fontSize:12,color:C.successDeep}}>{message}</p>}
      {loading?<p role="status">確認中…</p>:data&&<>
        <p style={{fontSize:12}}>表示 {data.total}人 · {page}/{data.pageCount}ページ</p>
        <RankRecoveryCards rows={data.items} selected={selected} busy={busy} canEdit={canEdit}
          onSelect={id=>setSelected(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);return next})} onKeep={row=>void apply([row],true)}/>
        {!data.items.length&&<p>該当するお客様はいません。</p>}
        {canEdit&&selectedRows.length>0&&<div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,padding:12,marginTop:12}}>
          {selectedRows.some(r=>r.origin==='unknown')&&<label style={{display:'flex',gap:8,minHeight:44,alignItems:'center',fontSize:12}}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>選んだ履歴なしのお客様は、手動の「切れた」ではないと確認しました</label>}
          <button disabled={busy||(selectedRows.some(r=>r.origin==='unknown')&&!confirmed)} onClick={()=>void apply(selectedRows)} style={{fontSize:12,minHeight:44,padding:'8px 16px',border:0,borderRadius:8,background:C.pink,color:C.white}}>選んだ{selectedRows.length}人だけ復帰する</button>
        </div>}
        <div style={{display:'flex',gap:12,marginTop:16}}><button style={buttonStyle} disabled={busy||page===1} onClick={()=>setPage(p=>p-1)}>前へ</button><button style={buttonStyle} disabled={busy||page>=data.pageCount} onClick={()=>setPage(p=>p+1)}>次へ</button></div>
      </>}
    </main>
  </div>
}
