'use client'

// ─────────────────────────────────────────────────────────────────
//  キャスト一覧（軽量版）
//   v0.3.48-A: 一覧での全キャスト KPI 計算 (getCastKPI ループ)・ノルマ階層解決・
//   月切替・売上/達成率/層サマリー表示をすべて撤去。
//   一覧はプロフィール (名前・層・アバター) のみを即表示し、
//   KPI はキャストをタップした先の /casts/[id] でその子の分だけ取得する。
// ─────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react'
import { useCasts } from '@/hooks/useCasts'
import Image from 'next/image'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import NotificationBell from '@/components/NotificationBell'
import Avatar from '@/components/ui/Avatar'
import Spinner from '@/components/ui/Spinner'
import { C } from '@/lib/colors'
import { useViewMode } from '@/hooks/useViewMode'
import { CastProfile, CAST_TIERS, CastTier } from '@/types'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'

type TierTab = '全体' | CastTier

export default function CastsPage() {
  const { casts, isLoaded } = useCasts()
  const { isPC, toggle: toggleView } = useViewMode()
  useScrollTopOnMount()
  const [activeTab, setActiveTab] = useState<TierTab>('全体')

  // 層別グループ
  const groupedByTier = useMemo(() => {
    const map = new Map<string, CastProfile[]>()
    for (const tier of CAST_TIERS) {
      map.set(tier, [])
    }
    map.set('未設定', [])

    for (const cast of casts) {
      const key = cast.cast_tier ?? '未設定'
      const arr = map.get(key)
      if (arr) arr.push(cast)
    }
    return map
  }, [casts])

  // フィルター
  const filteredCasts = useMemo(() => {
    if (activeTab === '全体') return casts
    return casts.filter(c => c.cast_tier === activeTab)
  }, [casts, activeTab])

  // タブの人数カウント（※ hooksは早期returnの前に呼ぶ必要がある）
  const tabCounts = useMemo(() => {
    const map: Record<string, number> = { '全体': casts.length }
    for (const tier of CAST_TIERS) {
      map[tier] = casts.filter(c => c.cast_tier === tier).length
    }
    return map
  }, [casts])

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: C.bg }}>
        <Spinner size="md" label="読み込み中..." />
      </div>
    )
  }

  // ─── セクションヘッダー ─────────────────────────────────────
  const TierSectionHeader = ({ tier, count }: { tier: string; count: number }) => (
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
    </div>
  )

  // ─── キャストリストアイテム（プロフィールのみ） ──────────────
  const CastListItem = ({ cast }: { cast: CastProfile }) => (
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
      </div>
      {/* 詳細ページ（KPI はそこで取得）への誘導 */}
      <span style={{ fontSize: 16, color: C.pinkMuted }}>›</span>
    </Link>
  )

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
          </div>
        </div>
        {/* PageNav は BottomNav と機能重複のため 2026-05-15 撤去 */}
      </div>

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

      {/* ─── リスト ─── */}
      <div style={{ maxWidth: isPC ? '1000px' : '700px', margin: '0 auto', padding: '16px 0' }}>
        {casts.length === 0 ? (
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
