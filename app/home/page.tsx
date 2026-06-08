'use client'

// ─────────────────────────────────────────────────────────────────────
//  Éclat /home – モックアップ準拠の新ホーム画面（2026-05-15 リビルド版）
//
//  仕様：~/Documents/EclatManual/_ChatGPT_UI_Project用/mockup_仕様メモ.md 準拠
//  - モバイル：5円ボタン 2+2+1中央 / KPI 3列 / ラインチャート
//  - PC：5円ボタン 横1列 / KPI 3列横並び / 横長ラインチャート
//  - 桜花弁の控えめ装飾、ヘッダーにキラキラ
//  - 大方針：完全再現ではなく使いやすさメイン
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCustomers } from '@/hooks/useCustomers'
import { useCasts } from '@/hooks/useCasts'
import { useViewMode } from '@/hooks/useViewMode'
import type { CastKPI } from '@/types'
import { C } from '@/lib/colors'
import BottomNav from '@/components/BottomNav'
import UserChip from '@/components/UserChip'
import NotificationBell from '@/components/NotificationBell'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'

const CastHomeDashboard = dynamic(() => import('@/components/CastHomeDashboard'), { ssr: false, loading: () => null })
const AdminHomeDashboard = dynamic(() => import('@/components/AdminHomeDashboard'), { ssr: false, loading: () => null })

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

// ─── ラインチャート（軽量SVG実装） ─────────────────────────────────
function SalesLineChart({ data, width, height }: { data: { day: number; value: number }[]; width: number; height: number }) {
  const max = Math.max(...data.map(d => d.value), 1)
  const padX = 36
  const padY = 24
  const innerW = width - padX * 2
  const innerH = height - padY * 2
  const xStep = innerW / Math.max(data.length - 1, 1)
  const points = data.map((d, i) => {
    const x = padX + i * xStep
    const y = padY + innerH - (d.value / max) * innerH
    return { x, y, day: d.day, value: d.value }
  })
  const pathD = points.length > 0
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    : ''
  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height - padY} L ${padX} ${height - padY} Z`
    : ''
  // X軸ラベル：先頭・1/4・1/2・3/4・末尾の5箇所
  const labelIdxs = data.length > 1
    ? [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor(data.length * 3 / 4), data.length - 1]
    : [0]
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="eclat-sales-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4B0BF" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#F4B0BF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* グリッドライン（薄い水平4本） */}
      {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
        <line
          key={i}
          x1={padX} y1={padY + innerH * r}
          x2={width - padX} y2={padY + innerH * r}
          stroke="#F0DDE2" strokeWidth="0.5" strokeDasharray={r === 1 ? '0' : '3 3'}
        />
      ))}
      {/* エリア */}
      {areaD && <path d={areaD} fill="url(#eclat-sales-grad)" />}
      {/* ライン */}
      {pathD && <path d={pathD} stroke="#E8879B" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {/* データポイント（最初・最後・最大値のみ） */}
      {points.map((p, i) => {
        const isEdge = i === 0 || i === points.length - 1
        const isMax = p.value === max && max > 0
        if (!isEdge && !isMax) return null
        return (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#E8879B" stroke="#FFF" strokeWidth="1.5" />
        )
      })}
      {/* X軸ラベル */}
      {labelIdxs.map((idx) => {
        const p = points[idx]
        if (!p) return null
        return (
          <text key={idx} x={p.x} y={height - 6} fontSize="9" fill="#B0909A" textAnchor="middle">
            {p.day}日
          </text>
        )
      })}
    </svg>
  )
}

// ─── KPIミニ ─────────────────────────────────────────────────────
function KpiMini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const valueFontSize = value.length > 9 ? 18 : value.length > 7 ? 22 : 26
  return (
    <div style={{ minWidth: 0, textAlign: 'center' }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.18em',
        color: C.pinkMuted, fontWeight: 600,
        marginBottom: 6,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{label}</div>
      <div style={{
        fontSize: valueFontSize, fontWeight: 700,
        background: 'linear-gradient(135deg, #D45060 0%, #E8879B 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        lineHeight: 1.1,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{value}</div>
      {sub && (
        <div style={{
          fontSize: 9.5, color: C.pinkMuted,
          marginTop: 4, letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>{sub}</div>
      )}
    </div>
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
  const supabase = useMemo(() => createClient(), [])
  const { customers, isLoaded } = useCustomers()
  const { getCastKPI, getCastTarget } = useCasts()
  useScrollTopOnMount()

  const [role, setRole] = useState<Role>(null)
  const [displayName, setDisplayName] = useState<string>('')
  const [authChecked, setAuthChecked] = useState(false)
  const [castProfile, setCastProfile] = useState<{ id: string; cast_name: string } | null>(null)

  // ─── KPI 関連 ─────────────────────────────────────────────────────
  const [castKpi, setCastKpi] = useState<{ monthlySales: number; targetSales: number; rank?: number; visits?: number; honshimei?: number } | null>(null)
  const [adminKpi, setAdminKpi] = useState<{ monthSales: number; monthTarget: number; shiftsCount: number; visits?: number; honshimei?: number } | null>(null)
  // 月内日別売上（ラインチャート用）
  const [dailySales, setDailySales] = useState<{ day: number; value: number }[]>([])

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

  // 月内日別売上を取得（ライン用） + 月内 visits（合計件数・本指名数）
  //   v0.3.15: admin/owner の場合は home-dashboard で集約取得するためここはスキップ。
  //   cast の場合だけ RLS 経由で自分の来店データを直接取得する。
  useEffect(() => {
    if (!authChecked) return
    if (role !== 'cast') return
    if (!castProfile?.cast_name) return
    let cancelled = false
    const load = async () => {
      try {
        const d = new Date()
        const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        const monthEnd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

        // v0.3.32: 自分担当の顧客 + nomination_status を取得（RLSで自分のみに自動絞り込み）
        const { data: myCustomers } = await supabase
          .from('customers')
          .select('id, nomination_status')
        // v0.3.33: customer_id が string/number 混在しうるため Map key を String() で統一
        const customerNomMap = new Map<string, string | null>()
        for (const c of myCustomers ?? []) {
          customerNomMap.set(String(c.id), c.nomination_status ?? null)
        }
        const customerIds = (myCustomers ?? []).map(c => c.id)
        if (customerIds.length === 0) return

        // v0.3.32: customer_visits には cast_name / nomination_status 列が無いので削除。
        //   RLS が customer_visits を自動的に自分担当へ絞るが、二重防御で in(customer_id) も追加
        const { data } = await supabase
          .from('customer_visits')
          .select('customer_id, visit_date, amount_spent')
          .gte('visit_date', monthStart)
          .lte('visit_date', monthEnd)
          .in('customer_id', customerIds)
        if (cancelled) return

        const byDay = new Map<number, number>()
        let totalVisits = 0
        let honshimei = 0
        for (let i = 1; i <= daysInMonth; i++) byDay.set(i, 0)
        if (data) {
          for (const v of data as { customer_id: string; visit_date: string; amount_spent: number }[]) {
            const day = parseInt(v.visit_date.slice(8, 10), 10)
            byDay.set(day, (byDay.get(day) ?? 0) + (v.amount_spent ?? 0))
            totalVisits++
            if (customerNomMap.get(String(v.customer_id)) === '本指名') honshimei++
          }
        }
        setDailySales(Array.from(byDay.entries()).map(([day, value]) => ({ day, value })))
        setCastKpi(prev => prev
          ? { ...prev, visits: totalVisits, honshimei }
          : { monthlySales: 0, targetSales: 0, visits: totalVisits, honshimei })
      } catch (e) {
        console.error('home daily sales load error', e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [authChecked, role, castProfile, supabase])

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
        setCastKpi(prev => ({ monthlySales, targetSales, rank, visits: prev?.visits, honshimei: prev?.honshimei }))
      } catch (e) {
        console.error('home cast kpi load error', e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [role, castProfile, month, getCastKPI, getCastTarget])

  // admin/owner: KPI を /api/cast-rankings から集計し、shifts/monthTarget/dailySales は home-dashboard から取る
  //   v0.3.18 (2026-05-16): home-dashboard の visits 取得が不安定なため、
  //     売上・接客・本指名は cast-rankings で算出（admin/performance と同じ数字で確実）
  //     dailySales も cast-rankings で取れた visits を逆算するのが面倒なので、
  //     cast-rankings の各キャスト前月比などには使われていないが、本指名顧客を判定する
  //     ためには customer_visits の per-day 情報が必要 → 別途 home-dashboard の dailySales を使う。
  //     home-dashboard が壊れて dailySales が空でも、少なくとも KPI 値（売上等）は正しい数字が出る。
  useEffect(() => {
    if (role !== 'admin') return
    let cancelled = false
    const load = async () => {
      try {
        const d = new Date()
        const y = new Date(d); y.setDate(y.getDate() - 1)
        const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
        const todayMD = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const params = new URLSearchParams({ month, today, yesterday, todayMD })

        // 2つのAPIを並列で叩く
        const [homeRes, ranksRes] = await Promise.all([
          fetch(`/api/admin/home-dashboard?${params.toString()}`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/cast-rankings?month=${month}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
        ])
        if (cancelled) return

        // home-dashboard は shifts/monthTarget/dailySales 用
        const shiftsCount = homeRes && Array.isArray(homeRes.shifts) ? homeRes.shifts.length : 0
        const monthTarget = homeRes?.monthTarget ?? 0

        // ★ KPI 値は cast-rankings から集計（admin/performance と同じ・確実）
        type RankRow = {
          kpi?: {
            monthlySales?: number
            totalVisitCount?: number
            honshimeiMonthlyVisits?: number
          }
        }
        const ranks: RankRow[] = Array.isArray(ranksRes) ? ranksRes : []
        const totalSales = ranks.reduce((s, r) => s + (r.kpi?.monthlySales ?? 0), 0)
        const totalVisits = ranks.reduce((s, r) => s + (r.kpi?.totalVisitCount ?? 0), 0)
        const totalHonshimei = ranks.reduce((s, r) => s + (r.kpi?.honshimeiMonthlyVisits ?? 0), 0)

        setAdminKpi({
          monthSales: totalSales,
          monthTarget,
          shiftsCount,
          visits: totalVisits,
          honshimei: totalHonshimei,
        })

        // 日別売上は home-dashboard の dailySales を使う（あれば）
        if (Array.isArray(homeRes?.dailySales) && homeRes.dailySales.length > 0) {
          setDailySales(homeRes.dailySales as { day: number; value: number }[])
        }
      } catch (e) {
        console.error('home admin kpi load error', e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [role, month, today])

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
    { label: 'お客様一覧', href: '/', icon: UsersIcon },
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

  // ─── KPI 3列の値 ─────────────────────────────────────────────────
  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const formatYenShort = (n: number) => {
    if (n >= 10000000) return `¥${(n / 10000).toFixed(0)}万`
    if (n >= 1000000) return `¥${(n / 10000).toFixed(0)}万`
    if (n >= 10000) return `¥${(n / 10000).toFixed(1)}万`
    return `¥${n.toLocaleString()}`
  }

  let kpi1Label = '今月の売上'
  let kpi1Value = '—'
  let kpi1Sub = ''
  let kpi2Label = '今月の接客数'
  let kpi2Value = '—'
  let kpi2Sub = ''
  let kpi3Label = '本指名'
  let kpi3Value = '—'
  let kpi3Sub = ''

  if (role === 'cast' && castKpi) {
    kpi1Value = formatYenShort(castKpi.monthlySales)
    if (castKpi.targetSales > 0) {
      const pct = Math.min(200, Math.round((castKpi.monthlySales / castKpi.targetSales) * 100))
      kpi1Sub = `達成率 ${pct}%`
    } else {
      kpi1Sub = '目標未設定'
    }
    kpi2Value = `${castKpi.visits ?? 0}件`
    kpi2Sub = castKpi.rank ? `月内 ${castKpi.rank}位` : ''
    kpi3Label = '本指名'
    kpi3Value = `${castKpi.honshimei ?? 0}件`
    if ((castKpi.visits ?? 0) > 0) {
      const pct = Math.round(((castKpi.honshimei ?? 0) / (castKpi.visits ?? 1)) * 100)
      kpi3Sub = `指名率 ${pct}%`
    }
  } else if (role === 'admin' && adminKpi) {
    kpi1Label = '今月の店舗売上'
    kpi1Value = formatYenShort(adminKpi.monthSales)
    if (adminKpi.monthTarget > 0) {
      const pct = Math.min(200, Math.round((adminKpi.monthSales / adminKpi.monthTarget) * 100))
      kpi1Sub = `予算進捗 ${pct}%`
    }
    kpi2Label = '今月の来店数'
    kpi2Value = `${adminKpi.visits ?? 0}件`
    kpi2Sub = `出勤キャスト ${adminKpi.shiftsCount}名`
    kpi3Label = '本指名'
    kpi3Value = `${adminKpi.honshimei ?? 0}件`
    if ((adminKpi.visits ?? 0) > 0) {
      const pct = Math.round(((adminKpi.honshimei ?? 0) / (adminKpi.visits ?? 1)) * 100)
      kpi3Sub = `指名率 ${pct}%`
    }
  }

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
      paddingBottom: 96,
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
            {/* PC/モバイル切替トグル */}
            <button
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
              aria-label={isPC ? 'モバイル表示に切替' : 'PC表示に切替'}
            >
              {isPC ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  MOBILE
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  PC
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

        {/* ─── KPI カード（3列＋ラインチャート） ─── */}
        <div style={{
          background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
          borderRadius: 22,
          padding: isPC ? '20px 24px 24px' : '18px 18px 20px',
          marginBottom: 24,
          border: '1px solid rgba(255, 218, 228, 0.7)',
          boxShadow: '0 14px 36px rgba(232,135,154,0.14), 0 4px 10px rgba(232,135,154,0.06)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* 装飾：右上に淡い放射ピンク */}
          <div aria-hidden style={{
            position: 'absolute', top: -50, right: -40,
            width: 200, height: 200,
            background: 'radial-gradient(circle, rgba(255,200,215,0.5) 0%, rgba(255,200,215,0) 65%)',
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* ヘッダー：📊 + 今月のパフォーマンス + 「今月 ▼」 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 16, flexWrap: 'wrap', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
                  boxShadow: '0 4px 10px rgba(232,135,154,0.32)',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="12" width="4" height="9" rx="1" />
                    <rect x="10" y="6" width="4" height="15" rx="1" />
                    <rect x="17" y="9" width="4" height="12" rx="1" />
                  </svg>
                </span>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: C.dark,
                  letterSpacing: '0.05em',
                }}>今月のパフォーマンス</div>
              </div>
              <div style={{
                fontSize: 11, color: C.pinkMuted,
                padding: '5px 12px',
                background: 'rgba(255,255,255,0.85)',
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                letterSpacing: '0.05em',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                今月 <span style={{ fontSize: 8 }}>▼</span>
              </div>
            </div>

            {/* KPI 3列 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: isPC ? 16 : 10,
              marginBottom: isPC ? 20 : 16,
            }}>
              <KpiMini label={kpi1Label} value={kpi1Value} sub={kpi1Sub} />
              <KpiMini label={kpi2Label} value={kpi2Value} sub={kpi2Sub} />
              <KpiMini label={kpi3Label} value={kpi3Value} sub={kpi3Sub} />
            </div>

            {/* ラインチャート（売上0のときはプレースホルダ） */}
            {(() => {
              const totalSales = dailySales.reduce((s, d) => s + d.value, 0)
              if (dailySales.length === 0) return null
              if (totalSales === 0) {
                return (
                  <div style={{
                    width: '100%',
                    minHeight: isPC ? 160 : 130,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: 'linear-gradient(180deg, rgba(255,232,238,0.4), rgba(255,250,252,0))',
                    borderRadius: 14,
                    padding: '20px 16px',
                  }}>
                    <span style={{ fontSize: 22, opacity: 0.6 }}>🌸</span>
                    <div style={{
                      fontSize: 12, fontWeight: 600,
                      color: C.pinkMuted, letterSpacing: '0.08em',
                    }}>
                      今月の売上データはまだありません
                    </div>
                    <div style={{
                      fontSize: 10, color: C.pinkMuted,
                      letterSpacing: '0.04em', opacity: 0.75,
                    }}>
                      来店記録が入ると、ここに推移が描画されます
                    </div>
                  </div>
                )
              }
              return (
                <div style={{ width: '100%' }}>
                  <SalesLineChart
                    data={dailySales}
                    width={isPC ? 800 : 380}
                    height={isPC ? 160 : 130}
                  />
                </div>
              )
            })()}
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
          padding: isPC ? '8px 24px 36px' : '8px 8px 36px',
          maxWidth: isPC ? 720 : 360,
          margin: '0 auto',
          justifyItems: 'center',
        }}>
          {actions.map((a) => (
            <CircleButton key={a.label} action={a} size={isPC ? 104 : 92} />
          ))}
        </div>

        {/* ─── 既存ダッシュボード組み込み（任意・控えめ） ─── */}
        {/* cast の場合のみ自分のダッシュボード */}
        {role === 'cast' && isLoaded && castProfile && (
          <CastHomeDashboard
            castName={castProfile.cast_name}
            castId={castProfile.id}
            customers={customers}
            onCustomerClick={(id) => router.push(`/customer/${id}`)}
          />
        )}
        {/* admin/owner だけ店舗ダッシュボード */}
        {isAdmin && (
          <AdminHomeDashboard
            onCustomerClick={(id) => router.push(`/customer/${id}`)}
          />
        )}
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
