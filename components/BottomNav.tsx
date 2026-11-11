'use client'
import { C } from '@/lib/colors'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { fetchMe } from '@/lib/authCache'
import styles from './BottomNav.module.css'
const items=[{href:'/home',label:'ホーム',icon:'⌂'},{href:'/customers',label:'検索',icon:'⌕'},{href:'/stars',label:'⭐️',icon:'★'},{href:'/calendar',label:'接客',icon:'▦'},{href:'/admin/casts',label:'管理',icon:'⚙'}]
const standaloneQuery = '(display-mode: standalone)'

function subscribeToDisplayMode(onChange: () => void) {
  const query = window.matchMedia(standaloneQuery)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getStandaloneNavSlot() {
  return window.matchMedia(standaloneQuery).matches
    ? document.getElementById('eclat-bottom-nav-slot')
    : null
}

const getServerNavSlot = () => null

export default function BottomNav() {
  const pathname=usePathname()
  const standaloneNavSlot = useSyncExternalStore(subscribeToDisplayMode, getStandaloneNavSlot, getServerNavSlot)
  const [canManage,setCanManage]=useState(false)
  useEffect(()=>{let cancelled=false; void fetchMe().then(me=>{if(!cancelled) setCanManage(me?.role==='admin')});return()=>{cancelled=true}},[])
  const nav = <nav aria-label="メインメニュー" className={styles.bar} style={{display:'flex',minHeight:62,paddingBottom:'env(safe-area-inset-bottom,0px)',background:C.white,borderTop:`1px solid ${C.border}`,boxShadow:`0 -4px 16px ${C.pink}12`}}>
    {items.map(item=>{
      const disabled=item.label==='管理'&&!canManage
      const active=pathname===item.href||(item.href==='/home'&&pathname.startsWith('/casts/'))||(item.href==='/customers'&&pathname==='/data-quality')
      const content=<><span aria-hidden style={{fontSize:26,lineHeight:1.2,color:item.href==='/stars'?C.warning:undefined}}>{item.icon}</span><span>{item.label}</span></>
      const style={flex:1,display:'flex',flexDirection:'column' as const,alignItems:'center',justifyContent:'center',gap:4,minHeight:60,fontSize:'var(--text-small, 12px)',lineHeight:1.25,fontWeight:active?600:400,color:active?C.pinkDeep:C.dark2,textDecoration:'none',background:active?C.tagBg:C.white,border:0,fontFamily:'inherit',letterSpacing:'normal',opacity:disabled?.4:1}
      return disabled ? <button key={item.href} type="button" disabled aria-label="管理（スタッフ・管理者専用）" style={style}>{content}</button> : <Link key={item.href} href={item.href} prefetch={false} style={style}>{content}</Link>
    })}
  </nav>
  return standaloneNavSlot ? createPortal(nav, standaloneNavSlot) : nav
}
