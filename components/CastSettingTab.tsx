'use client'
import { C } from '@/lib/colors'
import { useEffect, useState } from 'react'
import { useCasts } from '@/hooks/useCasts'
import { CAST_TIERS, type CastProfile } from '@/types'
import { invalidateCastPage, invalidateAllCastsKPI } from '@/lib/cache'
type Props={castId:string;month:string;canEditTargets:boolean;canEditProfile:boolean;onSave?:()=>void}
export default function CastSettingTab({castId,month,canEditTargets,canEditProfile,onSave}:Props) {
  const {getCast,getCastTarget,upsertCastTarget}=useCasts()
  const [profile,setProfile]=useState<CastProfile|null>(null)
  const [sales,setSales]=useState('0'),[average,setAverage]=useState('0'),[days,setDays]=useState('0')
  const [tier,setTier]=useState(''),[goal,setGoal]=useState(''),[joined,setJoined]=useState('')
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  useEffect(()=>{let cancelled=false;void Promise.all([getCast(castId),getCastTarget(castId,month)]).then(([c,t])=>{
    if(cancelled)return;setProfile(c);setTier(c?.cast_tier ?? '');setGoal(c?.target_cast_tier ?? '');setJoined(c?.joined_at ?? c?.training_start_date ?? '')
    setSales(String(t?.target_sales ?? 0));setAverage(String(t?.target_avg_spend ?? 0));setDays(String(t?.target_work_days ?? 0));setLoading(false)
  });return()=>{cancelled=true}},[castId,month,getCast,getCastTarget])
  if(loading)return <p>読み込み中…</p>
  const saveTargets=async()=>{if(!canEditTargets||busy)return;setBusy(true);setMessage('');try{
    const saved=await upsertCastTarget(castId,month,{target_sales:Number(sales),target_avg_spend:Number(average),target_work_days:Number(days)})
    if(!saved)throw new Error('保存できませんでした（権限を確認してください）')
    setMessage('設定を保存しました');onSave?.()
  }catch(e){setMessage(e instanceof Error?e.message:'保存できませんでした')}finally{setBusy(false)}}
  const saveProfile=async()=>{if(!canEditProfile||busy)return;setBusy(true);setMessage('');try{
    const response=await fetch('/api/admin/casts/'+castId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({cast_tier:tier||null,target_cast_tier:goal||null,joined_at:joined||null})})
    const result=await response.json()
    if(!response.ok)throw new Error(result.error || '保存できませんでした')
    invalidateCastPage(castId);invalidateAllCastsKPI();setMessage('キャスト情報を保存しました');onSave?.()
  }catch(e){setMessage(e instanceof Error?e.message:'保存できませんでした')}finally{setBusy(false)}}
  const box={background:C.white,border:`1px solid ${C.border}`,borderRadius:18,padding:20,marginTop:16}
  const input={display:'block',width:'100%',padding:12,border:`1px solid ${C.border}`,borderRadius:10,marginTop:8,boxSizing:'border-box' as const}
  const button={marginTop:16,minHeight:46,padding:'10px 24px',border:0,borderRadius:12,background:C.pinkDeep,color:C.white,fontFamily:'inherit',fontWeight:700}
  return <div><p role="status">{message}</p>{!canEditTargets&&!canEditProfile&&<p>設定の変更は権限のあるスタッフ・管理者に依頼してください。</p>}
    <form style={box} onSubmit={e=>{e.preventDefault();void saveTargets()}}><h3>{month} の設定</h3>{!canEditTargets&&<p>月の設定を変更するには設定権限が必要です。</p>}<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:16}}>
      {[{label:'設定売上（円）',value:sales,set:setSales},{label:'設定単価（円）',value:average,set:setAverage},{label:'設定出勤日数',value:days,set:setDays}].map(f=><label key={f.label}>{f.label}<input style={input} type="number" min="0" step="1" required disabled={!canEditTargets||busy} value={f.value} onChange={e=>f.set(e.target.value)}/></label>)}
    </div>{canEditTargets&&<button disabled={busy} style={button}>月の設定を保存</button>}</form>
    <form style={box} onSubmit={e=>{e.preventDefault();void saveProfile()}}><h3>キャスト情報</h3>{!canEditProfile&&<p>キャスト情報を変更するにはアカウント管理権限が必要です。</p>}<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:16}}>
      <label>入店日<input type="date" style={input} value={joined} disabled={!canEditProfile||busy} onChange={e=>setJoined(e.target.value)}/></label>
      <label>現在のキャスト層<select style={input} value={tier} disabled={!canEditProfile||busy} onChange={e=>setTier(e.target.value)}><option value="">未設定</option>{profile?.cast_tier&&!CAST_TIERS.includes(profile.cast_tier)&&<option value={profile.cast_tier}>{profile.cast_tier}（旧設定）</option>}{CAST_TIERS.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>目標キャスト層<select style={input} value={goal} disabled={!canEditProfile||busy} onChange={e=>setGoal(e.target.value)}><option value="">未設定</option>{CAST_TIERS.map(t=><option key={t}>{t}</option>)}</select></label>
    </div>{canEditProfile&&<button disabled={busy} style={button}>キャスト情報を保存</button>}</form>
  </div>
}
