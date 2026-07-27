'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { C } from '@/lib/colors'

// ─── 5タブ構成（v0.3.54-B） ────────────────────────────────────────
// ホーム / 顧客 / 追いかけ / 接客 / キャスト
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
    // v0.3.47-A: 顧客一覧は / → /customers へ移動 (/ は /home へ redirect)
    href: '/customers',
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
    href: '/follow-ups',
    label: '追いかけ',
    featured: true,
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        <path d="M12 8v7" />
        <path d="M8.5 11.5h7" />
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
  const router = useRouter()

  const isActive = (href: string) => {
    // ホームタブ : /home のみ
    if (href === '/home') return pathname === '/home'
    // 顧客タブ : /customers と /customer/*。(startsWith('/customer') で両方にマッチ)
    if (href === '/customers') {
      return pathname.startsWith('/customer')
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
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
      minHeight: 58,
    }}>
      {navItems.map((item) => {
        const active = isActive(item.href)
        const featured = 'featured' in item && item.featured === true
        return (
          <Link
            key={item.href}
            href={item.href}
            // 常時表示だけでは全ページを先読みせず、触れた項目だけを先読みする。
            // 起動時の無駄な5本のリクエストを避けつつ、実際のタップ遷移を速くする。
            prefetch={false}
            onPointerEnter={() => router.prefetch(item.href)}
            onFocus={() => router.prefetch(item.href)}
            onPointerDown={() => router.prefetch(item.href)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: featured ? '2px' : '4px',
              padding: featured ? '5px 0 7px' : '9px 0 9px',
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
            <div style={featured ? {
              width: 48,
              height: 48,
              marginTop: -14,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFF',
              background: active
                ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                : 'linear-gradient(135deg, #F1A2B4, #F7C1CD)',
              border: '4px solid #FFF',
              boxShadow: '0 5px 14px rgba(232,135,154,0.28)',
              transition: 'transform 0.2s ease',
              transform: active ? 'translateY(-1px) scale(1.04)' : 'translateY(0)',
            } : {
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
