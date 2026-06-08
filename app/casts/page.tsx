'use client'

import { useState, useMemo, useEffect } from 'react'
import { useCasts } from '@/hooks/useCasts'
import Image from 'next/image'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import NotificationBell from '@/components/NotificationBell'
import Avatar from '@/components/ui/Avatar'
import Spinner from '@/components/ui/Spinner'
import { C } from '@/lib/colors'
import { useViewMode } from '@/hooks/useViewMode'
import { CastProfile, CastTierTarget, CastKPI, CAST_TIERS, CastTier } from '@/types'
import { getCache, setCache } from '@/lib/cache'
import { resolveCastTargetFull } from '@/lib/targetResolver'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'

type TierTab = '全体' | CastTier

// ─── KPIキャッシュ型 ──────────────────────────────────────────
interface CastWithKPI extends CastProfile {
  kpi: CastKPI
  effectiveTarget: number // 実効ノルマ（個人 or 層ベース）
}

export default function CastsPage() {
  const { casts, isLoaded, getCastKPI, getTierTargets, getAllCastTargetsForMonth } = useCasts()
  const { isPC, toggle: toggleView } = useViewMode()
  useScrollTopOnMount()
  const [activeTab, setActiveTab] = useState<TierTab>('全体')
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [castsWithKPI, setCastsWithKPI] = useState<CastWithKPI[]>([])
  const [tierTargets, setTierTargets] = useState<CastTierTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [canViewKPI, setCanViewKPI] = useState(false)

  // 権限チェック
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) return
        const data = await res.json()
        if (data.role === 'cast') {
          setCanViewKPI(true)
        } else {
          // ⚠ KPI 表示用なので「KPI.閲覧」でゲート（旧: 誤って「レポート.閲覧」を使ってた）
          setCanViewKPI(data.is_owner === true || data.permissions?.['KPI.閲覧'] === true)
        }
      } catch (e) { console.error('[casts] auth/me fetch', e) }
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

      // v3 (2026-05-12): 階層検索でノルマを resolve する
      //   1) 全層のノルマ (月別 + 恒久) を一括取得
      //   2) 全キャストの個人目標 (月別 + 恒久) を一括取得
      //   3) cast 毎に resolveCastTargetFull で 4 階層検索
      const [allTierTargets, castTargetsMap] = await Promise.all([
        getTierTargets(month, true),       // includeNull=true で恒久デフォルト込み
        getAllCastTargetsForMonth(month),  // cast_id 別 Map
      ])
      // 「層別恒久デフォルト」を一覧ヘッダーに表示するため、
      // 表示用の tierTargets は「month=指定月 を優先、無ければ month=NULL」で 1 件ずつ確定
      const displayTier: CastTierTarget[] = []
      for (const tier of CAST_TIERS) {
        const monthRow = allTierTargets.find(t => t.tier === tier && t.month === month)
        const defaultRow = allTierTargets.find(t => t.tier === tier && t.month == null)
        const chosen = monthRow ?? defaultRow
        if (chosen) displayTier.push(chosen)
      }
      setTierTargets(displayTier)

      const results = await Promise.all(
        casts.map(async (cast) => {
          const kpi = await getCastKPI(cast.cast_name, month)
          const castTargetRows = castTargetsMap.get(cast.id) ?? []
          const resolved = resolveCastTargetFull(
            castTargetRows,
            allTierTargets,
            cast.id,
            cast.cast_tier ?? null,
            month,
          )
          const effectiveTarget = resolved.target_sales
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
  }, [isLoaded, casts, month, getCastKPI, getTierTargets, getAllCastTargetsForMonth])

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

  // 達成率の色：桜世界観で統一（緑を撤去）。
  // 高達成は濃ピンク、中達成は中ピンク、低達成は深紅で「お守り」階調に。
  const rateColor = (rate: number) => {
    if (rate >= 80) return '#8E4A5C'      // 達成OK：濃いダークピンク
    if (rate >= 50) return C.pink         // 中達成：エクラピンク
    return C.danger                       // 低達成：深紅
  }

  const rateFillClass = (rate: number) => {
    if (rate >= 80) return 'linear-gradient(90deg, #D45060 0%, #E8879B 100%)'  // 桜系で濃→淡
    if (rate >= 50) return `linear-gradient(90deg, ${C.pink}, ${C.pinkLight})`
    return `linear-gradient(90deg, ${C.danger}, ${C.dangerLight})`
  }

  if (!isLoaded || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <Spinner size="md" label="読み込み中..." />
      </div>
    )
  }

  // ─── セクションヘッダー ─────────────────────────────────────
  const TierSectionHeader = ({ tier, count }: { tier: string; count: number }) => {
    const target = tierTargets.find(t => t.tier === tier)
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 18px', marginBottom: 8,
      }}>
        <span style={{
          display: 'inline-block', width: 3, height: 13,
          background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
          borderRadius: 2,
        }} />
        <span style={{
          fontSize: 11, letterSpacing: '0.25em',
          color: C.pink, fontWeight: 700,
        }}>{tier}</span>
        <span style={{ fontSize: 9.5, color: C.pinkMuted }}>— {count}人</span>
        {target && (
          <span style={{
            fontSize: 9.5, color: C.pinkMuted,
            marginLeft: 'auto', paddingRight: 18,
          }}>
            ベースノルマ <span style={{ color: C.pink, fontWeight: 600 }}>{formatYenFull(target.target_sales)}</span>
          </span>
        )}
      </div>
    )
  }

  // ─── キャストリストアイテム ──────────────────────────────────
  const CastListItem = ({ cast }: { cast: CastWithKPI }) => (
    <Link
      href={`/casts/${cast.id}`}
      // ⚡ RSC プリフェッチ抑制: 全キャスト分が一斉にプリフェッチされて重くなるので無効化
      prefetch={false}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: C.white, padding: '14px 18px',
        borderBottom: `1px solid ${C.border}`,
        textDecoration: 'none', cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar
          name={cast.display_name || cast.cast_name}
          castTier={cast.cast_tier ?? undefined}
          size="md"
        />
        <div>
          <div style={{
            fontSize: 15.5, fontWeight: 700,
            background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '0.02em',
          }}>
            {cast.display_name || cast.cast_name}
          </div>
          {canViewKPI && (
            <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 3, letterSpacing: '0.04em' }}>
              顧客 {cast.kpi.kokyakuCount}人 · 県外 {cast.kpi.kengaiCount}人 · 場内 {cast.kpi.banaCount}人
            </div>
          )}
        </div>
      </div>
      {canViewKPI && (
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: 15.5, fontWeight: 700,
            color: rateColor(cast.kpi.achievementRate),
          }}>
            {formatYenFull(cast.kpi.monthlySales)}
          </div>
          <div style={{ fontSize: 9.5, color: C.pinkMuted, marginTop: 3 }}>
            達成率 {cast.kpi.achievementRate}%
            {cast.effectiveTarget > 0 && ` / ノルマ ${formatYen(cast.effectiveTarget)}`}
          </div>
          <div style={{
            marginTop: 5, height: 4, width: 110,
            background: '#FCE6EE', borderRadius: 3, position: 'relative',
            marginLeft: 'auto', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${Math.min(100, cast.kpi.achievementRate)}%`,
              background: rateFillClass(cast.kpi.achievementRate),
              borderRadius: 3,
              transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
            }} />
          </div>
        </div>
      )}
    </Link>
  )

  // ─── 層サマリーバー（リブランド版） ───────────────────────────
  //  4つの統計ミニカードをグリッドで均等表示。桜系白半透明＋金額グラデ文字。
  const TierSummaryBar = () => {
    if (!tierSummary) return null
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 8,
        padding: '12px 16px 16px',
        background: 'linear-gradient(160deg, #FFFAFC 0%, #FFFFFF 100%)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        {[
          { label: '層合計売上', value: formatYenFull(tierSummary.totalSales) },
          { label: 'ベースノルマ', value: tierSummary.tierTarget ? formatYenFull(tierSummary.tierTarget.target_sales) : '—', sub: '/ 1人あたり' },
          { label: '平均達成率', value: `${tierSummary.avgRate}%` },
          { label: '総顧客数', value: String(tierSummary.totalCustomers), sub: `場内 ${tierSummary.totalBana}人` },
        ].map((item, i) => (
          <div key={i} style={{
            minWidth: 0,
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255, 218, 228, 0.7)',
            borderRadius: 14,
            padding: '10px 12px', textAlign: 'center',
            boxShadow: '0 4px 10px rgba(232,135,154,0.08)',
          }}>
            <div style={{
              fontSize: 8.5, letterSpacing: '0.28em',
              color: C.pink, fontWeight: 700,
            }}>{item.label}</div>
            <div style={{
              fontSize: item.value.length > 8 ? 13 : 16, fontWeight: 700,
              background: 'linear-gradient(135deg, #D45060 0%, #E8879B 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginTop: 4, lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>{item.value}</div>
            {item.sub && <div style={{
              fontSize: 8.5, color: C.pinkMuted, marginTop: 2,
            }}>{item.sub}</div>}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>
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
            <Link href="/home" style={{ display: 'inline-block', cursor: 'pointer' }}>
              <Image
                src="/logo.png" alt="Éclat" width={100} height={30}
                className="object-contain"
                style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
              />
            </Link>
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
            <NotificationBell />
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
        {/* PageNav は BottomNav と機能重複のため 2026-05-15 撤去 */}
      </div>

      {/* ─── PC 専用：上部サマリー 4 カード（モックアップ準拠） ─── */}
      {isPC && castsWithKPI.length > 0 && (() => {
        const totalCasts = castsWithKPI.length
        const totalSalesAll = castsWithKPI.reduce((s, c) => s + (c.kpi.monthlySales ?? 0), 0)
        const avgRateAll = totalCasts > 0
          ? Math.round(castsWithKPI.reduce((s, c) => s + (c.kpi.achievementRate ?? 0), 0) / totalCasts)
          : 0
        const totalKokyakuAll = castsWithKPI.reduce((s, c) => s + (c.kpi.kokyakuCount ?? 0), 0)
        const items = [
          { label: '総キャスト数', value: `${totalCasts}人` },
          { label: '月間売上合計', value: formatYenFull(totalSalesAll) },
          { label: '平均達成率', value: `${avgRateAll}%` },
          { label: '合計顧客数', value: `${totalKokyakuAll}人` },
        ]
        return (
          <div style={{
            maxWidth: '1000px', margin: '0 auto',
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 10,
          }}>
            {items.map((it, i) => (
              <div key={i} style={{
                background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: '12px 14px',
                boxShadow: '0 4px 12px rgba(232,135,154,0.08)',
              }}>
                <div style={{
                  fontSize: 9, letterSpacing: '0.28em',
                  color: C.pink, fontWeight: 700,
                }}>{it.label}</div>
                <div style={{
                  fontSize: it.value.length > 8 ? 14 : 18, fontWeight: 700,
                  background: 'linear-gradient(135deg, #D45060 0%, #E8879B 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  marginTop: 5, lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>{it.value}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* ─── 層タブ（リブランド版：下線→pill） ─── */}
      <div style={{
        maxWidth: isPC ? '1000px' : '700px', margin: '0 auto',
        padding: '10px 16px 8px',
      }}>
        <div style={{
          display: 'flex', gap: 5,
          background: 'rgba(255,255,255,0.85)',
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 4,
          overflowX: 'auto',
          boxShadow: '0 4px 14px rgba(232,135,154,0.06)',
        }} className="no-scrollbar">
          {(['全体', ...CAST_TIERS] as TierTab[]).map((tab) => {
            const active = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: '0 0 auto',
                  padding: '7px 14px',
                  fontSize: 10.5, letterSpacing: '0.15em',
                  textAlign: 'center',
                  color: active ? C.white : C.pinkMuted,
                  fontWeight: 700,
                  background: active
                    ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                    : 'transparent',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontFamily: 'inherit',
                  transition: 'all 0.2s',
                  boxShadow: active ? '0 3px 10px rgba(232,135,154,0.28)' : 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                {tab}
                <span style={{
                  fontSize: 9,
                  color: active ? 'rgba(255,255,255,0.85)' : C.pinkMuted,
                }}>
                  {tabCounts[tab] ?? 0}
                </span>
              </button>
            )
          })}
        </div>
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
