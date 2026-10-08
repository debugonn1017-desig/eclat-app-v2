'use client'
import { C } from '@/lib/colors'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { fetchMe } from '@/lib/authCache'
const items=[{href:'/home',label:'ホーム',icon:'⌂'},{href:'/customers',label:'検索',icon:'⌕'},{href:'/stars',label:'⭐️',icon:'★'},{href:'/calendar',label:'接客',icon:'▦'},{href:'/admin/casts',label:'管理',icon:'⚙'}]
export default function BottomNav() {
  const pathname=usePathname()
  const [canManage,setCanManage]=useState(false)
  useEffect(()=>{let cancelled=false; void fetchMe().then(me=>{if(!cancelled) setCanManage(me?.role==='admin')});return()=>{cancelled=true}},[])
  return <nav aria-label="メインメニュー" style={{position:'fixed',bottom:0,left:0,right:0,zIndex:50,display:'flex',minHeight:62,paddingBottom:'env(safe-area-inset-bottom,0px)',background:C.white,borderTop:`1px solid ${C.border}`,boxShadow:`0 -4px 16px ${C.pink}12`}}>
    {items.map(item=>{
      const disabled=item.label==='管理'&&!canManage
      const active=pathname===item.href||(item.href==='/home'&&pathname.startsWith('/casts/'))||(item.href==='/customers'&&pathname==='/data-quality')
      const content=<><span aria-hidden style={{fontSize:26,lineHeight:1.2,color:item.href==='/stars'?C.warning:undefined}}>{item.icon}</span><span>{item.label}</span></>
      const style={flex:1,display:'flex',flexDirection:'column' as const,alignItems:'center',justifyContent:'center',gap:4,minHeight:60,fontSize:12,fontWeight:active?700:500,color:active?C.pinkDeep:C.dark2,textDecoration:'none',background:active?C.tagBg:C.white,border:0,fontFamily:'inherit',opacity:disabled?.4:1}
      return disabled ? <button key={item.href} type="button" disabled aria-label="管理（スタッフ・管理者専用）" style={style}>{content}</button> : <Link key={item.href} href={item.href} prefetch={false} style={style}>{content}</Link>
    })}
  </nav>
}
