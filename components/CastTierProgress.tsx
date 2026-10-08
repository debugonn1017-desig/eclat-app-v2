import { C } from '@/lib/colors'
import type { CastProfile } from '@/types'
import CastTenureBadge from '@/components/CastTenureBadge'
import { useJstToday } from '@/hooks/useJstToday'
const stages=['新人','BC','BB','BA','AC','AB','AA']
export default function CastTierProgress({cast}:{cast:CastProfile}) {
  const today = useJstToday()
  return <div style={{padding:'8px 16px 14px',maxWidth:1000,margin:'0 auto'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',flexWrap:'wrap',gap:12,fontSize:12,marginBottom:10}}>
      <CastTenureBadge cast={cast} today={today} />
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <span style={{color:C.danger}}>現在：<strong>{cast.cast_tier || '未設定'}</strong></span>
        <span style={{color:C.goldText}}>目標：<strong>{cast.target_cast_tier || '未設定'}</strong></span>
      </div>
    </div>
    <div style={{display:'flex',gap:6,overflowX:'auto',justifyContent:'center'}}>{stages.map(t=>{
      const current=cast.cast_tier===t || t==='新人'&&cast.cast_tier==='新人層',goal=cast.target_cast_tier===t
      return <span key={t} aria-label={t+(current?' 現在':'')+(goal?' 目標':'')} style={{flex:'0 0 auto',minWidth:34,padding:'8px 6px',borderRadius:10,fontWeight:700,fontSize:12,textAlign:'center',background:current?C.danger:goal?C.warningBg:C.white,color:current?C.white:C.dark2,border:goal?`3px solid ${C.warning}`:`1px solid ${C.border}`}}>{t}</span>
    })}</div>
  </div>
}
