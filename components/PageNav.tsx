'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { C } from '@/lib/colors'

const navItems = [
  { href: '/', label: '顧客' },
  { href: '/casts', label: 'キャスト' },
  { href: '/admin/casts', label: '管理' },
]

export default function PageNav() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname.startsWith('/customer') || pathname === '/new'
    if (href === '/casts') return pathname.startsWith('/casts')
    if (href === '/admin/casts') return pathname.startsWith('/admin')
    return false
  }

  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {navItems.map((nav) => {
        const active = isActive(nav.href)
        return (
          <Link key={nav.href} href={nav.href} style={{
            flex: 1, textAlign: 'center', padding: '9px 0',
            fontSize: '10px', letterSpacing: '0.15em', fontWeight: active ? 600 : 400,
            color: active ? C.pink : C.pinkMuted,
            background: active ? '#FFF5F7' : 'transparent',
            border: `1px solid ${active ? C.pink : C.border}`,
            textDecoration: 'none', transition: 'all 0.2s',
          }}>
            {nav.label}
          </Link>
        )
      })}
    </div>
  )
}
