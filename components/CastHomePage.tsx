'use client'
import { Suspense, useEffect, useState } from 'react'
import { fetchMe } from '@/lib/authCache'
import CastWorkspace from '@/components/CastWorkspace'
import StaffStarsPage from '@/components/StaffStarsPage'
import CastsPage from '@/app/casts/page'
import { useRouter } from 'next/navigation'
type Me = NonNullable<Awaited<ReturnType<typeof fetchMe>>>
function Content({ starsOnly }: { starsOnly: boolean }) {
  const [me,setMe]=useState<Me | null>(null)
  const [loaded,setLoaded]=useState(false)
  const router=useRouter()
  useEffect(()=>{
    let cancelled=false
    void fetchMe().then(profile=>{ if(cancelled) return; setMe(profile); setLoaded(true); if(!profile) router.replace('/login') })
    return ()=>{cancelled=true}
  },[router])
  if (!loaded || !me) return <p style={{padding:24}}>読み込み中…</p>
  if (me.role==='cast') return <CastWorkspace key={me.id} castIdOverride={me.id} starsOnly={starsOnly}/>
  if (!starsOnly) return <CastsPage />
  return <StaffStarsPage profile={me}/>
}
export default function CastHomePage({ starsOnly=false }: { starsOnly?: boolean }) {
  return <Suspense fallback={<p>読み込み中…</p>}><Content starsOnly={starsOnly}/></Suspense>
}
