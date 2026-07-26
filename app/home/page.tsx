'use client'

// ─────────────────────────────────────────────────────────────────────
//  Éclat /home – 日常操作に絞ったホーム画面
//
//  - 挨拶 / よく使う機能 / スマホ通知設定
//  - KPI・店舗/キャストダッシュボードは v0.3.54-A で廃止
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { fetchMe } from '@/lib/authCache'
import { useViewMode } from '@/hooks/useViewMode'
import { C } from '@/lib/colors'
import BottomNav from '@/components/BottomNav'
import UserChip from '@/components/UserChip'
import NotificationBell from '@/components/NotificationBell'
import PushSubscriptionButton from '@/components/PushSubscriptionButton'
import FollowUpNotificationSetting from '@/components/FollowUpNotificationSetting'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'

// v0.3.37: 現行DBに 'owner' ロールは存在しない (owner = role='admin' + is_owner=true)。
//   'owner' リテラルを Role 型から撤去し、すべて 'admin' 系判定に統一。
type Role = 'admin' | 'cast' | null

// ─── 円形アイコンボタン定義 ────────────────────────────────────────
type CircleAction = {
  label: string
  href: string
  icon: React.ReactNode
}

const ICON_STROKE = 1.6

const UsersIcon = (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const StarIcon = (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
  </svg>
)

const CalendarIcon = (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const BookIcon = (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
)

const SparklesIcon = (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
    <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />
    <path d="M5 14l.7 1.7L7.5 16.5l-1.8.8L5 19l-.7-1.7L2.5 16.5l1.8-.8L5 14z" />
  </svg>
)

const SettingsIcon = (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

// ─── 円形アイコンボタン本体 ────────────────────────────────────────
function CircleButton({ action, size }: { action: CircleAction; size: number }) {
  return (
    <Link
      href={action.href}
      prefetch={false}
      className="eclat-circle-link"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        textDecoration: 'none',
        color: C.dark,
      }}
    >
      <div
        className="eclat-circle-btn"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #F299AE 0%, #F4A5B8 55%, #FFC8D4 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFF',
          boxShadow:
            '0 10px 24px rgba(232,135,154,0.32), inset 0 -3px 8px rgba(212,80,96,0.18), inset 0 3px 8px rgba(255,255,255,0.5)',
          transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease',
          position: 'relative',
        }}
      >
        {/* 装飾：左上の小さな白い光 */}
        <span style={{
          position: 'absolute',
          top: '15%', left: '20%',
          width: 12, height: 12,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          filter: 'drop-shadow(0 2px 3px rgba(120,40,60,0.18))',
        }}>
          {action.icon}
        </div>
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: C.dark,
          fontWeight: 600,
          letterSpacing: '0.05em',
          textAlign: 'center',
          lineHeight: 1.4,
        }}
      >
        {action.label}
      </div>
    </Link>
  )
}

// ─── 桜花弁の控えめ装飾（左右下部） ────────────────────────────────
function SakuraDecorations() {
  return (
    <>
      <svg aria-hidden style={{
        position: 'absolute', bottom: 60, left: -20,
        width: 140, height: 140, opacity: 0.45, pointerEvents: 'none',
        zIndex: 0,
      }} viewBox="0 0 100 100">
        <g fill="#FFD0DE">
          <ellipse cx="20" cy="80" rx="8" ry="14" transform="rotate(-30 20 80)" />
          <ellipse cx="35" cy="65" rx="6" ry="10" transform="rotate(20 35 65)" />
          <ellipse cx="50" cy="85" rx="7" ry="12" transform="rotate(-10 50 85)" />
        </g>
        <g fill="#FFE8EE">
          <ellipse cx="15" cy="55" rx="5" ry="9" transform="rotate(40 15 55)" />
          <ellipse cx="40" cy="40" rx="4" ry="7" transform="rotate(-20 40 40)" />
        </g>
      </svg>
      <svg aria-hidden style={{
        position: 'absolute', bottom: 80, right: -30,
        width: 160, height: 160, opacity: 0.45, pointerEvents: 'none',
        zIndex: 0,
      }} viewBox="0 0 100 100">
        <g fill="#FFD0DE">
          <ellipse cx="80" cy="75" rx="9" ry="15" transform="rotate(30 80 75)" />
          <ellipse cx="65" cy="60" rx="6" ry="11" transform="rotate(-25 65 60)" />
          <ellipse cx="85" cy="50" rx="7" ry="12" transform="rotate(15 85 50)" />
        </g>
        <g fill="#FFE8EE">
          <ellipse cx="60" cy="80" rx="5" ry="9" transform="rotate(-40 60 80)" />
          <ellipse cx="75" cy="35" rx="4" ry="7" transform="rotate(25 75 35)" />
        </g>
      </svg>
    </>
  )
}

// ─── ホーム画面 ──────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  useScrollTopOnMount()

  const [role, setRole] = useState<Role>(null)
  const [displayName, setDisplayName] = useState<string>('')
  const [authChecked, setAuthChecked] = useState(false)
  const [castProfile, setCastProfile] = useState<{ id: string; cast_name: string } | null>(null)

  // 認証 + プロフィール取得
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      // v0.3.43-A: fetchMe() で sessionStorage キャッシュ + プロフィール一括取得。
      //   /api/auth/me は cast_name も返すよう v0.3.43-A 前提差分で拡張済み。
      const me = await fetchMe()
      if (cancelled) return
      if (!me) {
        router.replace('/login')
        return
      }
      const r = (me.role as Role) ?? null
      setRole(r)
      setDisplayName(me.display_name ?? me.cast_name ?? '')
      if (r === 'cast' && me.cast_name) {
        setCastProfile({ id: me.id, cast_name: me.cast_name })
      }
      setAuthChecked(true)
    }
    init()
    return () => { cancelled = true }
  }, [router])

  // PC / モバイル切替（useViewMode フックで他ページと同期＆localStorageで保存）
  const { isPC, toggle: toggleView, ready: viewReady } = useViewMode()

  // ─── ローディング ────────────────────────────────────────────────
  if (!authChecked || !viewReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{
          width: 32, height: 32,
          border: `1px solid ${C.pink}`, borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ─── 6 円形アイコンボタン（上3+下3配置） ─────────────────────────
  //  2026-05-15 拓馬さん指示：上3個 / 下3個 で 6個構成。
  //  - 上：お客様一覧 / キャスト / 接客カレンダー
  //  - 下：接客マニュアル / おすすめ診断 / 管理（cast=設定）
  const isAdmin = role === 'admin'
  const actions: CircleAction[] = [
    { label: 'お客様一覧', href: '/customers', icon: UsersIcon },
    { label: 'キャスト', href: '/casts', icon: StarIcon },
    { label: '接客カレンダー', href: '/calendar', icon: CalendarIcon },
    { label: '接客マニュアル', href: '/manual', icon: BookIcon },
    { label: 'おすすめ診断', href: '/cast-matching', icon: SparklesIcon },
    {
      // v0.3.36: cast 用は自分のキャスト詳細(マイページ)へ遷移。
      //   castProfile 未取得時は一覧(/casts)へ逃がす。'#' は残さない。
      label: isAdmin ? '管理' : 'マイページ',
      href: isAdmin
        ? '/admin/casts'
        : (castProfile?.id ? `/casts/${castProfile.id}` : '/casts'),
      icon: SettingsIcon,
    },
  ]

  // 時間帯による挨拶のサブ文言
  const hour = new Date().getHours()
  const greetSub = hour < 5 ? 'お疲れさまでした'
    : hour < 11 ? 'おはようございます'
    : hour < 17 ? 'こんにちは'
    : hour < 22 ? 'おかえりなさい'
    : 'お疲れさまです'

  return (
    <div className="eclat-home-bg" style={{
      minHeight: '100vh',
      // v0.3.38: paddingBottom 統一。BottomNav 常時表示なので常時 60px + iPhone safe-area
      paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
      fontFamily: 'var(--font-zen-maru), -apple-system, "Hiragino Sans", sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 背景の桜放射グラデ */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background:
          'radial-gradient(circle at 18% 12%, rgba(255,210,222,0.55) 0%, rgba(255,210,222,0) 38%),' +
          'radial-gradient(circle at 82% 88%, rgba(255,230,238,0.5) 0%, rgba(255,230,238,0) 40%),' +
          'radial-gradient(circle at 92% 18%, rgba(255,244,248,0.7) 0%, rgba(255,244,248,0) 35%)',
      }} />

      {/* 桜花弁の控えめ装飾 */}
      <SakuraDecorations />

      {/* ─── ヘッダー ─── */}
      <div style={{
        background: 'linear-gradient(160deg, #FFF1F4 0%, #FFFAFC 60%, #FFFFFF 100%)',
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        boxShadow: '0 4px 14px rgba(232,135,154,0.06)',
      }}>
        <div style={{
          maxWidth: 1080, margin: '0 auto',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/home" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none', position: 'relative' }}>
            <Image
              src="/logo.png" alt="Éclat" width={110} height={33}
              priority
              className="object-contain"
              style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
            />
            {/* キラキラ装飾 */}
            <span aria-hidden style={{
              position: 'absolute', top: -6, right: -10,
              fontSize: 12, color: C.pink, opacity: 0.7,
            }}>✦</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 表示切替 */}
            <button
              className="eclat-header-view-toggle"
              onClick={toggleView}
              style={{
                background: isPC
                  ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                  : 'rgba(255,255,255,0.85)',
                border: `1px solid ${C.pink}`,
                color: isPC ? C.white : C.pink,
                fontSize: 10, fontWeight: 600,
                letterSpacing: '0.15em',
                padding: '7px 12px',
                borderRadius: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 5,
                boxShadow: isPC ? '0 3px 10px rgba(232,135,154,0.28)' : '0 2px 6px rgba(232,135,154,0.08)',
                transition: 'all 0.2s',
              }}
              aria-label={isPC ? 'スマホ表示に切り替える' : 'パソコン表示に切り替える'}
            >
              {isPC ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  スマホ表示
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  パソコン表示
                </>
              )}
            </button>
            <NotificationBell />
            <UserChip />
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: 1080, margin: '0 auto',
        padding: '22px 20px 0',
        position: 'relative', zIndex: 1,
      }}>
        {/* ─── 挨拶 ─── */}
        <div style={{ marginBottom: 20, padding: '0 4px' }}>
          <div style={{
            fontSize: 10.5, letterSpacing: '0.28em', color: C.pink,
            fontWeight: 700, marginBottom: 6,
          }}>
            ＊ {greetSub}
          </div>
          <div style={{
            fontSize: 24, fontWeight: 700,
            background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            letterSpacing: '0.03em',
            lineHeight: 1.25,
          }}>
            {role === 'cast'
              ? (displayName || castProfile?.cast_name || 'キャスト')
              : (displayName || '管理者')}
            <span style={{ fontSize: 16, marginLeft: 4 }}>さん</span>
          </div>
        </div>

        {/* ─── 6 円形アイコンボタン（上3+下3） ─── */}
        {/*
            PC：3列×2行 横並び（中央寄せ）
            モバイル：3列×2行 中央寄せ
            どちらも「上：お客様一覧/キャスト/接客カレンダー」「下：接客マニュアル/おすすめ診断/管理」の構成
        */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          rowGap: isPC ? 32 : 26,
          columnGap: isPC ? 24 : 14,
          padding: isPC ? '8px 24px 28px' : '8px 8px 28px',
          maxWidth: isPC ? 720 : 360,
          margin: '0 auto',
          justifyItems: 'center',
        }}>
          {actions.map((a) => (
            <CircleButton key={a.label} action={a} size={isPC ? 104 : 92} />
          ))}
        </div>

        {/* 端末のスマホ通知設定 + 毎日の追いかけ通知の個別設定。 */}
        <div style={{ maxWidth: 560, margin: '0 auto 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PushSubscriptionButton />
          <FollowUpNotificationSetting />
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .eclat-home-bg {
          background:
            radial-gradient(at 20% 10%, rgba(255, 224, 235, 0.55) 0%, transparent 42%),
            radial-gradient(at 80% 92%, rgba(255, 240, 245, 0.55) 0%, transparent 42%),
            linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 50%, #FFF8FA 100%);
        }
        .eclat-circle-link:hover .eclat-circle-btn {
          transform: translateY(-5px) scale(1.04);
          box-shadow:
            0 16px 32px rgba(232,135,154,0.4),
            inset 0 -3px 8px rgba(212,80,96,0.18),
            inset 0 3px 8px rgba(255,255,255,0.55);
        }
        .eclat-circle-link:active .eclat-circle-btn {
          transform: translateY(-2px) scale(0.98);
        }
      `}</style>

      <BottomNav />
    </div>
  )
}
