'use client'
import { C } from '@/lib/colors'
import { Suspense, useEffect, useState } from 'react'
import { fetchMe } from '@/lib/authCache'
import CastWorkspace from '@/components/CastWorkspace'
import BottomNav from '@/components/BottomNav'
import CastsPage from '@/app/casts/page'
import { useCasts } from '@/hooks/useCasts'
import { useRouter } from 'next/navigation'
type Me = NonNullable<Awaited<ReturnType<typeof fetchMe>>>
function Content({ starsOnly }: { starsOnly: boolean }) {
  const [me,setMe]=useState<Me | null>(null)
  const [selected,setSelected]=useState('')
  const [loaded,setLoaded]=useState(false)
  const { casts }=useCasts()
  const router=useRouter()
  useEffect(()=>{
    let cancelled=false
    void fetchMe().then(profile=>{ if(cancelled) return; setMe(profile); setLoaded(true); if(!profile) router.replace('/login') })
    return ()=>{cancelled=true}
  },[router])
  if (!loaded || !me) return <p style={{padding:24}}>読み込み中…</p>
  if (me.role==='cast') return <CastWorkspace key={me.id} castIdOverride={me.id} starsOnly={starsOnly}/>
  if (!starsOnly) return <CastsPage />
  return <div>
    <label style={{display:'block',padding:16}}>⭐️を表示するキャスト
      <select value={selected} onChange={e=>setSelected(e.target.value)} style={{display:'block',width:'100%',maxWidth:500,padding:12,marginTop:8,border:`1px solid ${C.border}`,borderRadius:12}}>
        <option value="">キャストを選択してください</option>{casts.map(c=><option key={c.id} value={c.id}>{c.display_name || c.cast_name}</option>)}
      </select>
    </label>
    {selected ? <CastWorkspace key={selected} castIdOverride={selected} starsOnly/> : <><p style={{padding:24}}>キャストを選ぶと、⭐️を付けたお客様を表示します。</p><BottomNav/></>}
  </div>
}
export default function CastHomePage({ starsOnly=false }: { starsOnly?: boolean }) {
  return <Suspense fallback={<p>読み込み中…</p>}><Content starsOnly={starsOnly}/></Suspense>
}
