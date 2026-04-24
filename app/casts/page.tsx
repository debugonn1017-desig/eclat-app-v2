'use client'

import { useState, useMemo, useEffect } from 'react'
import { useCasts } from '@/hooks/useCasts'
import Image from 'next/image'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import PageNav from '@/components/PageNav'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import { C } from '@/lib/colors'
import { useViewMode } from '@/hooks/useViewMode'
import { CastProfile, CastTierTarget, CastKPI, CAST_TIERS, CastTier } from '@/types'
import { getCache, setCache } from '@/lib/cache'

type TierTab = '全体' | CastTier

// ─── KPIキャッシュ型 ──────────────────────────────────────────
interface CastWithKPI extends CastProfile {
  kpi: CastKPI
  effectiveTarget: number // 実効ノルマ（個人 or 層ベース）
}

export default function CastsPage() {
  const { casts, isLoaded, getCastKPI, getTierTargets } = useCasts()
  const { isPC, toggle: toggleView } = useViewMode()
  const [activeTab, setActiveTab] = useState<TierTab>('全体')
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [castsWithKPI, setCastsWithKPI] = useState<CastWithKPI[]>([])
  const [tierTargets, setTierTargets] = useState<CastTierTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [canViewReport, setCanViewReport] = useState(false)

  // 権限チェック
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) return
        const data = await res.json()
        if (data.role === 'cast') {
          setCanViewReport(true)
        } else {
          setCanViewReport(data.is_owner === true || data.permissions?.['レポート閲覧'] === true)
        }
      } catch { /* ignore */ }
    }
    check()
  }, [])

  // 月表示
  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-')
    return `${y}年${Number(m)}月`
  }, [month])

  const changeMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // KPIと目標データ取得
  useEffect(() => {
    if (!isLoaded || casts.length === 0) {
      setLoading(false)
      return
    }

    const cacheKey = `castsKPI:${month}`
    const fetchAll = async () => {
      // キャッシュから即表示
      const cached = getCache<CastWithKPI[]>(cacheKey)
      if (cached) {
        setCastsWithKPI(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }

      const [targets] = await Promise.all([
        getTierTargets(month),
      ])
      setTierTargets(targets)

      const tierMap = new Map(targets.map(t => [t.tier, t]))

      const results = await Promise.all(
        casts.map(async (cast) => {
          const kpi = await getCastKPI(cast.cast_name, month)
          const tierTarget = cast.cast_tier ? tierMap.get(cast.cast_tier) : null
          const effectiveTarget = tierTarget?.target_sales ?? 0
          const achievementRate = effectiveTarget > 0
            ? Math.round((kpi.monthlySales / effectiveTarget) * 100)
            : 0

          return {
            ...cast,
            kpi: { ...kpi, targetSales: effectiveTarget, achievementRate },
            effectiveTarget,
          }
        })
      )
      setCache(cacheKey, results)
      setCastsWithKPI(results)
      setLoading(false)
    }
    fetchAll()
  }, [isLoaded, casts, month, getCastKPI, getTierTargets])

  // 層別グループ
  const groupedByTier = useMemo(() => {
    const map = new Map<string, CastWithKPI[]>()
    for (const tier of CAST_TIERS) {
      map.set(tier, [])
    }
    map.set('未設定', [])

    for (const cast of castsWithKPI) {
      const key = cast.cast_tier ?? '未設定'
      const arr = map.get(key)
      if (arr) arr.push(cast)
    }
    return map
  }, [castsWithKPI])

  // フィルター
  const filteredCasts = useMemo(() => {
    if (activeTab === '全体') return castsWithKPI
    return castsWithKPI.filter(c => c.cast_tier === activeTab)
  }, [castsWithKPI, activeTab])

  // 層サマリー（各層タブ用）
  const tierSummary = useMemo(() => {
    if (activeTab === '全体') return null
    const list = filteredCasts
    const totalSales = list.reduce((s, c) => s + c.kpi.monthlySales, 0)
    const totalCustomers = list.reduce((s, c) => s + c.kpi.customerCount, 0)
    const totalBana = list.reduce((s, c) => s + c.kpi.banaCount, 0)
    const tierTarget = tierTargets.find(t => t.tier === activeTab)
    const avgRate = list.length > 0
      ? Math.round(list.reduce((s, c) => s + c.kpi.achievementRate, 0) / list.length)
      : 0

    return { totalSales, totalCustomers, totalBana, avgRate, tierTarget }
  }, [activeTab, filteredCasts, tierTargets])

  // タブの人数カウント（※ hooksは早期returnの前に呼ぶ必要がある）
  const tabCounts = useMemo(() => {
    const map: Record<string, number> = { '全体': castsWithKPI.length }
    for (const tier of CAST_TIERS) {
      map[tier] = castsWithKPI.filter(c => c.cast_tier === tier).length
    }
    return map
  }, [castsWithKPI])

  const formatYen = (n: number) => {
    if (n >= 1000000) return `¥${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `¥${(n / 1000).toFixed(0)}K`
    return `¥${n.toLocaleString()}`
  }

  const formatYenFull = (n: number) =>
    n.toLocaleString('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })

  const rateColor = (rate: number) => {
    if (rate >= 80) return '#4CAF50'
    if (rate >= 50) return C.pink
    return C.danger
  }

  const rateFillClass = (rate: number) => {
    if (rate >= 80) return 'linear-gradient(90deg, #4CAF50, #81C784)'
    if (rate >= 50) return `linear-gradient(90deg, ${C.pink}, ${C.pinkLight})`
    return `linear-gradient(90deg, ${C.danger}, ${C.dangerLight})`
  }

  if (!isLoaded || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{
          width: '32px', height: '32px',
          border: `1px solid ${C.pink}`, borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ─── セクションヘッダー ─────────────────────────────────────
  const TierSectionHeader = ({ tier, count }: { tier: string; count: number }) => {
    const target = tierTargets.find(t => t.tier === tier)
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '0 18px', marginBottom: '6px',
      }}>
        <div style={{ height: '1px', width: '20px', background: `linear-gradient(90deg, ${C.pink}, transparent)` }} />
        <span style={{ fontSize: '10px', letterSpacing: '0.3em', color: C.pink, fontWeight: 600 }}>{tier}</span>
        <span style={{ fontSize: '9px', color: C.pinkMuted }}>— {count}人</span>
        {target && (
          <span style={{ fontSize: '9px', color: C.pinkMuted, marginLeft: 'auto', paddingRight: '18px' }}>
            ベースノルマ <span style={{ color: C.pink }}>{formatYenFull(target.target_sales)}</span>
          </span>
        )}
      </div>
    )
  }

  // ─── キャストリストアイテム ──────────────────────────────────
  const CastListItem = ({ cast }: { cast: CastWithKPI }) => (
    <Link
      href={`/casts/${cast.id}`}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: C.white, padding: '14px 18px',
        borderBottom: `1px solid #F0ECEE`,
        textDecoration: 'none', cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '36px', height: '36px',
          background: 'linear-gradient(135deg, #FFE8EE, #FFF2F5)',
          border: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', color: C.pink, borderRadius: '50%', flexShrink: 0,
        }}>
          {(cast.display_name || cast.cast_name).charAt(0)}
        </div>
        <div>
          <div style={{ fontSize: '15px', color: C.dark, fontWeight: 500 }}>
            {cast.display_name || cast.cast_name}
          </div>
          {canViewReport && (
            <div style={{ fontSize: '10px', color: C.pinkMuted, marginTop: '2px' }}>
              顧客 {cast.kpi.kokyakuCount}人 · 県外 {cast.kpi.kengaiCount}人 · 場内 {cast.kpi.banaCount}人
            </div>
          )}
        </div>
      </div>
      {canViewReport && (
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: '15px', fontWeight: 500,
            color: rateColor(cast.kpi.achievementRate),
          }}>
            {formatYenFull(cast.kpi.monthlySales)}
          </div>
          <div style={{ fontSize: '9px', color: C.pinkMuted, marginTop: '2px' }}>
            達成率 {cast.kpi.achievementRate}%
            {cast.effectiveTarget > 0 && ` / ノルマ ${formatYen(cast.effectiveTarget)}`}
          </div>
          <div style={{
            marginTop: '4px', height: '3px', width: '110px',
            background: 'rgba(232,120,154,0.12)', position: 'relative',
            marginLeft: 'auto',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${Math.min(100, cast.kpi.achievementRate)}%`,
              background: rateFillClass(cast.kpi.achievementRate),
            }} />
          </div>
        </div>
      )}
    </Link>
  )

  // ─── 層サマリーバー ─────────────────────────────────────────
  const TierSummaryBar = () => {
    if (!tierSummary) return null
    return (
      <div style={{
        display: 'flex', gap: '1px', background: C.border,
        borderBottom: `1px solid ${C.border}`,
      }}>
        {[
          { label: '層合計売上', value: formatYenFull(tierSummary.totalSales) },
          { label: 'ベースノルマ', value: tierSummary.tierTarget ? formatYenFull(tierSummary.tierTarget.target_sales) : '—', sub: '/ 1人あたり' },
          { label: '平均達成率', value: `${tierSummary.avgRate}%` },
          { label: '総顧客数', value: String(tierSummary.totalCustomers), sub: `場内 ${tierSummary.totalBana}人` },
        ].map((item, i) => (
          <div key={i} style={{
            flex: 1, background: C.white, padding: '10px 12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '7px', letterSpacing: '0.2em', color: C.pinkMuted }}>{item.label}</div>
            <div style={{ fontSize: '16px', color: C.pink, fontWeight: 400, marginTop: '2px' }}>{item.value}</div>
            {item.sub && <div style={{ fontSize: '8px', color: C.pinkMuted, marginTop: '1px' }}>{item.sub}</div>}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: '60px' }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: C.headerBg,
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{
          maxWidth: isPC ? '1000px' : '700px', margin: '0 auto',
          padding: '14px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <Image
              src="/logo.png" alt="Éclat" width={100} height={30}
              className="object-contain"
              style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
            />
            <p style={{ fontSize: '7px', letterSpacing: '0.35em', color: C.pinkMuted, margin: '2px 0 0 0' }}>
              CAST MANAGEMENT
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={toggleView}
              style={{
                background: isPC
                  ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                  : C.white,
                border: `1px solid ${C.pink}`,
                color: isPC ? C.white : C.pink,
                fontSize: '9px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                padding: '5px 8px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              {isPC ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  MOBILE
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  PC
                </>
              )}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => changeMonth(-1)}
                style={{ background: 'transparent', border: 'none', fontSize: '16px', color: C.pink, cursor: 'pointer', padding: '4px' }}
              >‹</button>
              <span style={{ fontSize: '12px', color: C.dark, letterSpacing: '0.05em', fontWeight: 500, minWidth: '90px', textAlign: 'center' }}>
                {monthLabel}
              </span>
              <button
                onClick={() => changeMonth(1)}
                style={{ background: 'transparent', border: 'none', fontSize: '16px', color: C.pink, cursor: 'pointer', padding: '4px' }}
              >›</button>
            </div>
          </div>
        </div>
        {/* ページナビ */}
        <div style={{ maxWidth: isPC ? '1000px' : '700px', margin: '0 auto', padding: '0 18px 12px' }}>
          <PageNav />
        </div>
        <div style={{ maxWidth: isPC ? '1000px' : '700px', margin: '0 auto', padding: '0 18px' }}>
          <AnnouncementBanner />
        </div>
      </div>

      {/* ─── 層タブ ─── */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${C.border}`,
        background: C.white, overflowX: 'auto',
        maxWidth: isPC ? '1000px' : '700px', margin: '0 auto',
      }}>
        {(['全体', ...CAST_TIERS] as TierTab[]).map((tab) => {
          const active = activeTab === tab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '11px 0',
                fontSize: '10px', letterSpacing: '0.18em',
                textAlign: 'center',
                color: active ? C.pink : C.pinkMuted,
                fontWeight: active ? 600 : 400,
                background: 'transparent', border: 'none', cursor: 'pointer',
                position: 'relative', whiteSpace: 'nowrap',
                fontFamily: 'inherit',
              }}
            >
              {tab}
              <span style={{ fontSize: '8px', color: active ? C.pinkLight : C.pinkMuted, marginLeft: '3px' }}>
                {tabCounts[tab] ?? 0}
              </span>
              {active && (
                <div style={{
                  position: 'absolute', bottom: 0, left: '20%', right: '20%',
                  height: '2px',
                  background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight})`,
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* ─── 層サマリー（個別層タブ時のみ） ─── */}
      {activeTab !== '全体' && (
        <div style={{ maxWidth: isPC ? '1000px' : '700px', margin: '0 auto' }}>
          <TierSummaryBar />
        </div>
      )}

      {/* ─── リスト ─── */}
      <div style={{ maxWidth: isPC ? '1000px' : '700px', margin: '0 auto', padding: '16px 0' }}>
        {castsWithKPI.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', letterSpacing: '0.3em', color: C.pinkMuted }}>
              キャストが登録されていません
            </p>
            <Link
              href="/admin/casts"
              style={{
                display: 'inline-block', marginTop: '16px',
                fontSize: '10px', letterSpacing: '0.15em',
                color: C.pink, border: `1px solid ${C.pink}`,
                padding: '8px 20px', textDecoration: 'none',
              }}
            >
              管理画面でキャストを追加
            </Link>
          </div>
        ) : activeTab === '全体' ? (
          // ── 全体: 層ごとのセクション ──
          <>
            {CAST_TIERS.map((tier) => {
              const list = groupedByTier.get(tier) ?? []
              if (list.length === 0) return null
              return (
                <div key={tier} style={{ marginBottom: '20px' }}>
                  <TierSectionHeader tier={tier} count={list.length} />
                  <div style={{ margin: '0 18px', border: `1px solid ${C.border}`, borderBottom: 'none' }}>
                    {list.map((cast) => (
                      <CastListItem key={cast.id} cast={cast} />
                    ))}
                  </div>
                </div>
              )
            })}
            {/* 未設定グループ */}
            {(() => {
              const unset = groupedByTier.get('未設定') ?? []
              if (unset.length === 0) return null
              return (
                <div style={{ marginBottom: '20px' }}>
                  <TierSectionHeader tier="未設定" count={unset.length} />
                  <div style={{ margin: '0 18px', border: `1px solid ${C.border}`, borderBottom: 'none' }}>
                    {unset.map((cast) => (
                      <CastListItem key={cast.id} cast={cast} />
                    ))}
                  </div>
                </div>
              )
            })()}
          </>
        ) : (
          // ── 個別層: フィルター表示 ──
          <div style={{ margin: '0 18px', border: `1px solid ${C.border}`, borderBottom: 'none' }}>
            {filteredCasts.length > 0 ? (
              filteredCasts.map((cast) => (
                <CastListItem key={cast.id} cast={cast} />
              ))
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', background: C.white, borderBottom: `1px solid ${C.border}` }}>
                <p style={{ fontSize: '10px', color: C.pinkMuted, letterSpacing: '0.2em' }}>
                  この層にキャストはいません
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        a:hover { opacity: 0.9; }
      `}</style>
    </div>
  )
}
