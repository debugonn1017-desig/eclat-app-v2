'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { C } from '@/lib/colors'

// ─── 4タブ構成（2026-05-14リファイン） ──────────────────────────────
// ホーム / 顧客 / 接客 / キャスト
// 「管理」「教科書」はホーム画面の円ボタンから到達できるため bottom nav から削除。
const navItems = [
  {
    href: '/home',
    label: 'ホーム',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />
      </svg>
    ),
  },
  {
    href: '/',
    label: '顧客',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/calendar',
    label: '接客',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: '/casts',
    label: 'キャスト',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    // ホームタブ : /home のみ
    if (href === '/home') return pathname === '/home'
    // 顧客タブ : / と /customer/*。/home, /calendar, /casts は除外。
    if (href === '/') {
      return pathname === '/' || pathname.startsWith('/customer')
    }
    return pathname.startsWith(href)
  }

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      display: 'flex',
      borderTop: `1px solid ${C.border}`,
      background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFAFC 100%)',
      boxShadow: '0 -4px 16px rgba(232,135,154,0.08)',
      backdropFilter: 'blur(8px)',
      zIndex: 50,
      // iOS のホームインジケータ分の余白
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {navItems.map((item) => {
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            // ⚡ RSC プリフェッチ抑制: ナビ常時表示なので各ページの先読みは不要
            //    クリック時に通常のナビゲーション。これで起動時の RSC リクエストが消える。
            prefetch={false}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '10px 0 10px',
              textDecoration: 'none',
              color: active ? C.pink : C.pinkMuted,
              fontSize: '10px',
              letterSpacing: '0.18em',
              fontWeight: active ? 600 : 400,
              background: 'transparent',
              transition: 'color 0.2s ease',
              position: 'relative',
            }}
          >
            {/* アクティブ時の上に出る小さな桜ピンクのドットインジケータ */}
            {active && (
              <span style={{
                position: 'absolute',
                top: 0,
                width: 22,
                height: 3,
                borderRadius: '0 0 3px 3px',
                background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight})`,
              }} />
            )}
            <div style={{
              transform: active ? 'translateY(-1px)' : 'none',
              transition: 'transform 0.2s ease',
            }}>
              {item.icon}
            </div>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
