'use client'

// ─────────────────────────────────────────────────────────────────────
//  Éclat /home – 円形アイコンボタン6つ＋KPIカードのホーム画面
//  Phase 1 リブランドの新ホーム導線。既存の / は顧客一覧として残す。
//  - 認証ガード: 未ログインなら /login へ
//  - cast の場合は CastHomeDashboard、admin/owner は AdminHomeDashboard を組み込み
//  - 6つの円形アイコンボタンで各ページへ遷移
//  - KPI カードは /api/cast/home-dashboard or /api/admin/home-dashboard から取得
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCustomers } from '@/hooks/useCustomers'
import { useCasts } from '@/hooks/useCasts'
import type { CastKPI } from '@/types'
import { C } from '@/lib/colors'
import BottomNav from '@/components/BottomNav'
import UserChip from '@/components/UserChip'
import NotificationBell from '@/components/NotificationBell'

const CastHomeDashboard = dynamic(() => import('@/components/CastHomeDashboard'), { ssr: false, loading: () => null })
const AdminHomeDashboard = dynamic(() => import('@/components/AdminHomeDashboard'), { ssr: false, loading: () => null })

type Role = 'admin' | 'owner' | 'cast' | null

// ─── 円形アイコンボタン定義 ────────────────────────────────────────
type CircleAction = {
  label: string
  href: string
  icon: React.ReactNode
}

const ICON_STROKE = 1.6

const UsersIcon = (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const StarIcon = (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
  </svg>
)

const CalendarIcon = (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const BookIcon = (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
)

const SparklesIcon = (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
    <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />
    <path d="M5 14l.7 1.7L7.5 16.5l-1.8.8L5 19l-.7-1.7L2.5 16.5l1.8-.8L5 14z" />
  </svg>
)

const SettingsIcon = (
  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

// ─── 円形アイコンボタン本体 ────────────────────────────────────────
// 可愛さ重視リファイン：深みのあるグラデ＋柔らかい桜影＋内側ハイライト＋装飾ドット
function CircleButton({ action, isPC, index }: { action: CircleAction; isPC: boolean; index: number }) {
  const size = isPC ? 104 : 90
  const iconSize = isPC ? 46 : 40
  // 円ごとに微妙にグラデの色合いをずらして単調さを回避（全部桜系の範囲内で）
  const grads = [
    'linear-gradient(135deg, #F299AE 0%, #F4A5B8 55%, #FFC8D4 100%)',
    'linear-gradient(135deg, #E8879B 0%, #F299AE 55%, #FBC0CB 100%)',
    'linear-gradient(140deg, #ED93A8 0%, #F4A5B8 60%, #FFD2DC 100%)',
    'linear-gradient(135deg, #E8879B 0%, #EFA1B4 55%, #FFC8D4 100%)',
    'linear-gradient(140deg, #F299AE 0%, #F4A5B8 60%, #FFD8E0 100%)',
    'linear-gradient(135deg, #ED93A8 0%, #F299AE 55%, #FBC0CB 100%)',
  ]
  const grad = grads[index % grads.length]
  return (
    <Link
      href={action.href}
      prefetch={false}
      className="eclat-circle-link"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
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
          background: grad,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFF',
          boxShadow:
            '0 12px 28px rgba(232,135,154,0.35), inset 0 -3px 8px rgba(212,80,96,0.18), inset 0 3px 8px rgba(255,255,255,0.45)',
          transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease',
          position: 'relative',
        }}
      >
        {/* 装飾：左上の小さな白い光 */}
        <span style={{
          position: 'absolute',
          top: '14%',
          left: '18%',
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          width: iconSize, height: iconSize,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          // アイコンを少しだけ右下に影を落として浮き出させる
          filter: 'drop-shadow(0 2px 3px rgba(120,40,60,0.18))',
        }}>
          {action.icon}
        </div>
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: C.dark,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textAlign: 'center',
          lineHeight: 1.4,
        }}
      >
        {action.label}
      </div>
    </Link>
  )
}

// ─── ホーム画面 ──────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { customers, isLoaded } = useCustomers()
  const { getCastKPI, getCastTarget } = useCasts()

  const [role, setRole] = useState<Role>(null)
  const [displayName, setDisplayName] = useState<string>('')
  const [authChecked, setAuthChecked] = useState(false)
  const [castProfile, setCastProfile] = useState<{ id: string; cast_name: string } | null>(null)

  // ─── KPI 関連 ─────────────────────────────────────────────────────
  const [castKpi, setCastKpi] = useState<{ monthlySales: number; targetSales: number; rank?: number } | null>(null)
  const [adminKpi, setAdminKpi] = useState<{ monthSales: number; monthTarget: number; shiftsCount: number } | null>(null)

  // 認証 + プロフィール取得
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        router.replace('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, cast_name, display_name')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (profile) {
        const r = (profile.role as Role) ?? null
        setRole(r)
        setDisplayName(profile.display_name ?? profile.cast_name ?? '')
        if (r === 'cast' && profile.cast_name) {
          setCastProfile({ id: profile.id, cast_name: profile.cast_name })
        }
      }
      setAuthChecked(true)
    }
    init()
    return () => { cancelled = true }
  }, [supabase, router])

  // 今月キー
  const month = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  // cast: 自分の KPI（月間売上 / 目標）と月内順位を並列取得
  useEffect(() => {
    if (role !== 'cast' || !castProfile) return
    let cancelled = false
    const load = async () => {
      try {
        const [kpi, target, rankRes] = await Promise.all([
          getCastKPI(castProfile.cast_name, month, castProfile.id),
          getCastTarget(castProfile.id, month),
          fetch(`/api/cast-rankings?month=${month}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
        ])
        if (cancelled) return
        const monthlySales = (kpi as CastKPI | null)?.monthlySales ?? 0
        const targetSales = target?.target_sales ?? 0
        let rank: number | undefined
        if (rankRes && Array.isArray(rankRes)) {
          const sorted = [...rankRes as Array<{ cast: { id: string }; kpi: { monthlySales: number } }>]
            .sort((a, b) => b.kpi.monthlySales - a.kpi.monthlySales)
          const idx = sorted.findIndex(r => r.cast.id === castProfile.id)
          if (idx >= 0) rank = idx + 1
        }
        setCastKpi({ monthlySales, targetSales, rank })
      } catch (e) {
        console.error('home cast kpi load error', e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [role, castProfile, month, getCastKPI, getCastTarget])

  // admin/owner: KPI を /api/admin/home-dashboard で集約取得
  useEffect(() => {
    if (role !== 'admin' && role !== 'owner') return
    let cancelled = false
    const load = async () => {
      try {
        const d = new Date()
        const y = new Date(d); y.setDate(y.getDate() - 1)
        const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
        const todayMD = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const params = new URLSearchParams({ month, today, yesterday, todayMD })
        const res = await fetch(`/api/admin/home-dashboard?${params.toString()}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setAdminKpi({
          monthSales: data.monthSales ?? 0,
          monthTarget: data.monthTarget ?? 0,
          shiftsCount: Array.isArray(data.shifts) ? data.shifts.length : 0,
        })
      } catch (e) {
        console.error('home admin kpi load error', e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [role, month, today])

  // PC / モバイル判定（最低限。後で useViewMode と統合してもよい）
  const [isPC, setIsPC] = useState(false)
  useEffect(() => {
    const update = () => setIsPC(window.innerWidth >= 768)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // ─── ローディング ────────────────────────────────────────────────
  if (!authChecked) {
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

  // ─── 6 円形アイコンボタン ─────────────────────────────────────────
  // admin/owner は「管理」ボタンを、cast には「設定」のままに（将来分岐余地）
  const isAdmin = role === 'admin' || role === 'owner'
  const actions: CircleAction[] = [
    { label: 'お客様一覧', href: '/', icon: UsersIcon },
    { label: 'キャスト', href: '/casts', icon: StarIcon },
    { label: '接客カレンダー', href: '/calendar', icon: CalendarIcon },
    { label: '接客マニュアル', href: '/manual', icon: BookIcon },
    { label: 'おすすめ診断', href: '/cast-matching', icon: SparklesIcon },
    isAdmin
      ? { label: '管理', href: '/admin/casts', icon: SettingsIcon }
      : { label: '設定', href: '#', icon: SettingsIcon },
  ]

  // ─── KPI カードの値 ──────────────────────────────────────────────
  const formatYen = (n: number) => `¥${n.toLocaleString()}`

  let kpiTitle = '今月のパフォーマンス'
  let kpiValue = ''
  let kpiSub = ''
  let kpiPct = 0
  let kpiRankLabel = ''

  if (role === 'cast' && castKpi) {
    kpiValue = formatYen(castKpi.monthlySales)
    kpiPct = castKpi.targetSales > 0
      ? Math.min(200, Math.round((castKpi.monthlySales / castKpi.targetSales) * 100))
      : 0
    kpiSub = castKpi.targetSales > 0 ? `目標 ${formatYen(castKpi.targetSales)}` : '目標未設定'
    kpiRankLabel = castKpi.rank ? `${castKpi.rank}位` : '—'
  } else if ((role === 'admin' || role === 'owner') && adminKpi) {
    kpiTitle = '今月の店舗パフォーマンス'
    kpiValue = formatYen(adminKpi.monthSales)
    kpiPct = adminKpi.monthTarget > 0
      ? Math.min(200, Math.round((adminKpi.monthSales / adminKpi.monthTarget) * 100))
      : 0
    kpiSub = adminKpi.monthTarget > 0 ? `目標 ${formatYen(adminKpi.monthTarget)}` : '目標未設定'
    kpiRankLabel = `出勤 ${adminKpi.shiftsCount}名`
  }

  const progressPct = kpiPct > 0 ? Math.min(100, kpiPct) : 0

  // 時間帯による挨拶のサブ文言（やわらかい）
  const hour = new Date().getHours()
  const greetSub = hour < 5 ? 'お疲れさまでした'
    : hour < 11 ? 'おはようございます'
    : hour < 17 ? 'こんにちは'
    : hour < 22 ? 'おかえりなさい'
    : 'お疲れさまです'

  return (
    <div className="eclat-home-bg" style={{
      minHeight: '100vh',
      paddingBottom: 96,
      fontFamily: 'var(--font-zen-maru), -apple-system, "Hiragino Sans", sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* ─── 背景の桜グラデ装飾（コンテンツの背面） ─── */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background:
          'radial-gradient(circle at 18% 12%, rgba(255,210,222,0.55) 0%, rgba(255,210,222,0) 38%),' +
          'radial-gradient(circle at 82% 88%, rgba(255,230,238,0.5) 0%, rgba(255,230,238,0) 40%),' +
          'radial-gradient(circle at 92% 18%, rgba(255,244,248,0.7) 0%, rgba(255,244,248,0) 35%)',
      }} />

      {/* ─── ヘッダー ─── */}
      <div style={{
        background: 'linear-gradient(160deg, #FFF1F4 0%, #FFFAFC 60%, #FFFFFF 100%)',
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
        boxShadow: '0 4px 14px rgba(232,135,154,0.06)',
      }}>
        <div style={{
          maxWidth: 720, margin: '0 auto',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link href="/home" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            <Image
              src="/logo.png" alt="Éclat" width={110} height={33}
              priority
              className="object-contain"
              style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
            />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NotificationBell />
            <UserChip />
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: 720, margin: '0 auto',
        padding: '24px 20px 0',
        position: 'relative', zIndex: 1,
      }}>
        {/* ─── 挨拶 ─── */}
        <div style={{ marginBottom: 22, padding: '0 4px' }}>
          <div style={{
            fontSize: 11, letterSpacing: '0.28em', color: C.pink,
            fontWeight: 700, marginBottom: 6,
          }}>
            ＊ {greetSub}
          </div>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap',
          }}>
            <div style={{
              fontSize: 26, fontWeight: 600,
              background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              letterSpacing: '0.04em',
              lineHeight: 1.3,
            }}>
              {role === 'cast'
                ? (displayName || castProfile?.cast_name || 'キャスト')
                : (displayName || '管理者')}
              <span style={{ fontSize: 18, marginLeft: 4 }}>さん</span>
            </div>
          </div>
          <div style={{
            fontSize: 12, color: C.pinkMuted, letterSpacing: '0.1em',
            marginTop: 4,
          }}>
            {role === 'cast'
              ? '今日もすてきな一日になりますように'
              : '店舗の今日のサマリーです'}
          </div>
        </div>

        {/* ─── KPI カード（リファイン版） ─── */}
        {(castKpi || adminKpi) && (
          <div className="eclat-kpi-card" style={{
            background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
            borderRadius: 24,
            padding: '20px 22px 22px',
            marginBottom: 28,
            border: '1px solid rgba(255, 218, 228, 0.7)',
            boxShadow: '0 12px 32px rgba(232,135,154,0.14), 0 2px 6px rgba(232,135,154,0.06)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* 装飾：右上に淡い放射ピンク */}
            <div aria-hidden style={{
              position: 'absolute', top: -40, right: -30,
              width: 160, height: 160,
              background: 'radial-gradient(circle, rgba(255,200,215,0.5) 0%, rgba(255,200,215,0) 65%)',
              pointerEvents: 'none',
            }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              }}>
                <span style={{
                  display: 'inline-block', width: 4, height: 14,
                  background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                  borderRadius: 2,
                }} />
                <div style={{
                  fontSize: 10.5, letterSpacing: '0.28em',
                  color: C.pink, fontWeight: 700,
                }}>
                  {kpiTitle}
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'flex-end',
                justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
                marginBottom: 14,
              }}>
                <div>
                  <div style={{
                    fontSize: 38, fontWeight: 700, lineHeight: 1.1,
                    background: 'linear-gradient(135deg, #D45060 0%, #E8879B 100%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                    letterSpacing: '0.01em',
                  }}>
                    {kpiValue || '—'}
                  </div>
                  <div style={{
                    fontSize: 12, color: C.pinkMuted, marginTop: 4,
                    letterSpacing: '0.06em',
                  }}>
                    {kpiSub}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: '#FFF',
                    background: `linear-gradient(135deg, ${C.pink}, #F4A5B8)`,
                    padding: '6px 14px',
                    borderRadius: 14,
                    letterSpacing: '0.04em',
                    boxShadow: '0 4px 12px rgba(232,135,154,0.32)',
                  }}>
                    {kpiPct > 0 ? `${kpiPct}%` : '—'}
                  </div>
                  <div style={{
                    fontSize: 11, color: C.dark2, fontWeight: 600,
                    letterSpacing: '0.1em',
                  }}>
                    {kpiRankLabel}
                  </div>
                </div>
              </div>
              {/* プログレスバー：カラフルに */}
              <div style={{
                height: 10, background: '#FCE6EE', borderRadius: 6, overflow: 'hidden',
                position: 'relative',
                boxShadow: 'inset 0 1px 2px rgba(180,100,120,0.1)',
              }}>
                <div style={{
                  height: '100%', width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #F4A5B8 0%, #E8879B 50%, #D45060 100%)',
                  transition: 'width .6s cubic-bezier(0.22, 1, 0.36, 1)',
                  borderRadius: 6,
                  boxShadow: '0 1px 4px rgba(212,80,96,0.3)',
                }} />
              </div>
            </div>
          </div>
        )}

        {/* ─── 6 円形アイコンボタン ─── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: isPC ? '32px 24px' : '26px 14px',
          padding: '8px 4px 36px',
          justifyItems: 'center',
          maxWidth: 480,
          margin: '0 auto',
        }}>
          {actions.map((a, i) => (
            <CircleButton key={a.label} action={a} isPC={isPC} index={i} />
          ))}
        </div>

        {/* ─── 既存ダッシュボード組み込み ─── */}
        {/* cast の場合のみ自分のダッシュボード（個人 KPI 詳細・営業要連絡など） */}
        {role === 'cast' && isLoaded && castProfile && (
          <CastHomeDashboard
            castName={castProfile.cast_name}
            castId={castProfile.id}
            customers={customers}
            onCustomerClick={(id) => router.push(`/customer/${id}`)}
          />
        )}
        {/* admin/owner だけ店舗ダッシュボード（キャストには非表示） */}
        {isAdmin && (
          <AdminHomeDashboard
            onCustomerClick={(id) => router.push(`/customer/${id}`)}
          />
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes eclat-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }
        .eclat-home-bg {
          background:
            radial-gradient(at 20% 10%, rgba(255, 224, 235, 0.55) 0%, transparent 42%),
            radial-gradient(at 80% 92%, rgba(255, 240, 245, 0.55) 0%, transparent 42%),
            linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 50%, #FFF8FA 100%);
        }
        .eclat-circle-link:hover .eclat-circle-btn {
          transform: translateY(-5px) scale(1.04);
          box-shadow:
            0 18px 34px rgba(232,135,154,0.42),
            inset 0 -3px 8px rgba(212,80,96,0.18),
            inset 0 3px 8px rgba(255,255,255,0.5);
        }
        .eclat-circle-link:active .eclat-circle-btn {
          transform: translateY(-2px) scale(0.98);
        }
      `}</style>

      <BottomNav />
    </div>
  )
}
