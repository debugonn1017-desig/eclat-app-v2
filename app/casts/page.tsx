'use client'

// ─────────────────────────────────────────────────────────────────
//  キャスト一覧（軽量版）
//   v0.3.48-A: 一覧での全キャスト KPI 計算 (getCastKPI ループ)・ノルマ階層解決・
//   月切替・売上/達成率/層サマリー表示をすべて撤去。
//   一覧はプロフィール (名前・層・アバター) のみを即表示し、
//   KPI はキャストをタップした先の /casts/[id] でその子の分だけ取得する。
// ─────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from 'react'
import { useCasts } from '@/hooks/useCasts'
import Image from 'next/image'
import Link from 'next/link'
// v0.3.50-D: 「成績ランキングを見る」導線の権限判定。/admin/performance と同じ条件で判定。
import { fetchMe } from '@/lib/authCache'
import BottomNav from '@/components/BottomNav'
import NotificationBell from '@/components/NotificationBell'
import Avatar from '@/components/ui/Avatar'
import Spinner from '@/components/ui/Spinner'
import { C } from '@/lib/colors'
import { useViewMode } from '@/hooks/useViewMode'
import { CastProfile, CAST_TIERS, CastTier } from '@/types'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'
import {
  getNewCastTrainingProgress,
  NEW_CAST_TRAINING_TIER,
} from '@/lib/newCastTraining'
import type { CustomerStaffOption } from '@/lib/customerStaff'

type TierTab = '全体' | CastTier
type CastListMode = 'active' | 'retired' | 'customerStaff'

// v0.3.50-E: 導線ボタン共通スタイル。cast/owner/admin の3種類のボタンで使い回す。
//   コンポーネント外で 1回定義することで毎レンダーのオブジェクト再生成を回避。
const LINK_PILL_STYLE = {
  background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
  color: C.white,
  padding: '8px 16px',
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textDecoration: 'none',
  fontFamily: 'inherit',
  boxShadow: '0 3px 10px rgba(232,135,154,0.28)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
} as const

function CastTrainingListStatus({ cast }: { cast: CastProfile }) {
  if (cast.cast_tier !== NEW_CAST_TRAINING_TIER) return null

  const progress = getNewCastTrainingProgress(cast.training_start_date)
  if (!progress) {
    return (
      <span style={{
        padding: '4px 8px', borderRadius: 999,
        background: '#F8F4F5', color: C.pinkMuted,
        border: `1px solid ${C.border}`,
        fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        入店日未設定
      </span>
    )
  }

  const dayLabel = progress.phase === 'before_start'
    ? `入店まであと${progress.daysUntilStart}日`
    : `入店${progress.dayNumber}日目`
  const stepLabel = progress.currentStep
    ? `STEP${progress.currentStep.step} ${progress.currentStep.shortTitle}`
    : progress.phase === 'completed'
      ? '90日育成完了'
      : '開始前'

  return (
    <div className="cast-list-training-status" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      gap: 6, minWidth: 0,
    }}>
      <span style={{
        padding: '4px 8px', borderRadius: 999,
        background: '#FFF5F7', color: '#9B5364',
        border: '1px solid #F3D6DD',
        fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        {dayLabel}
      </span>
      <span className="cast-list-training-step" style={{
        padding: '4px 8px', borderRadius: 999,
        background: '#E1F5EE', color: '#0F6E56',
        border: '1px solid #B7DFCF',
        fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 145,
      }}>
        {stepLabel}
      </span>
    </div>
  )
}

export default function CastsPage() {
  const { casts, isLoaded } = useCasts()
  const { isPC, toggle: toggleView } = useViewMode()
  useScrollTopOnMount()
  const [activeTab, setActiveTab] = useState<TierTab>('全体')
  const [listMode, setListMode] = useState<CastListMode>('active')
  const [retiredCasts, setRetiredCasts] = useState<CastProfile[]>([])
  const [retiredLoaded, setRetiredLoaded] = useState(false)
  const [retiredLoading, setRetiredLoading] = useState(false)
  const [retiredError, setRetiredError] = useState<string | null>(null)
  const [retiredReloadKey, setRetiredReloadKey] = useState(0)
  const [customerStaff, setCustomerStaff] = useState<CustomerStaffOption[]>([])
  const [customerStaffLoaded, setCustomerStaffLoaded] = useState(false)
  const [customerStaffLoading, setCustomerStaffLoading] = useState(false)
  const [customerStaffError, setCustomerStaffError] = useState<string | null>(null)

  // v0.3.50-E: ログインユーザーごとに導線を分岐。
  //   - cast: 「ランキングを見る」→ /casts/[本人id]?tab=RANKING
  //   - owner / KPI.閲覧 持ち admin: 「成績一覧を見る」→ /admin/performance
  //   - owner / KPI.詳細分析 持ち admin: 「キャスト評価を見る」→ /admin/cast-evaluation
  //   owner は両方表示 (役割上は妥当)。
  //   fetchMe は sessionStorage キャッシュ済 (lib/authCache) なので追加 fetch コストは体感ゼロ。
  type MeLink = {
    castSelfId: string | null      // cast 本人なら自分の id (= profile.id)、それ以外は null
    isAdmin: boolean               // 退店キャスト一覧は黒服・オーナーだけ
    canSeePerformance: boolean     // /admin/performance 入場可能 = owner OR KPI.閲覧
    canSeeEvaluation: boolean      // /admin/cast-evaluation 入場可能 = owner OR KPI.詳細分析
  }
  const [meLink, setMeLink] = useState<MeLink>({
    castSelfId: null,
    isAdmin: false,
    canSeePerformance: false,
    canSeeEvaluation: false,
  })
  useEffect(() => {
    const check = async () => {
      const me = await fetchMe()
      if (!me) return
      if (me.role === 'cast') {
        setMeLink({
          castSelfId: me.id,
          isAdmin: false,
          canSeePerformance: false,
          canSeeEvaluation: false,
        })
      } else {
        setMeLink({
          castSelfId: null,
          isAdmin: true,
          canSeePerformance:
            me.is_owner === true || me.permissions?.['KPI.閲覧'] === true,
          canSeeEvaluation:
            me.is_owner === true || me.permissions?.['KPI.詳細分析'] === true,
        })
      }
    }
    check()
  }, [])

  // v0.3.86: 退店一覧は黒服がタブを開いたときだけ遅延取得する。
  // 初期の在籍一覧を重くせず、キャスト本人からのAPI直呼びはサーバー側でも拒否する。
  useEffect(() => {
    if (!meLink.isAdmin || listMode !== 'retired' || retiredLoaded) return
    let cancelled = false
    const loadRetiredCasts = async () => {
      setRetiredLoading(true)
      setRetiredError(null)
      try {
        const response = await fetch('/api/casts/retired', { cache: 'no-store' })
        const json = await response.json().catch(() => ({})) as {
          casts?: CastProfile[]
          error?: string
        }
        if (!response.ok) {
          throw new Error(json.error || '退店キャスト一覧の取得に失敗しました')
        }
        if (!cancelled) {
          setRetiredCasts(Array.isArray(json.casts) ? json.casts : [])
          setRetiredLoaded(true)
        }
      } catch (error) {
        if (!cancelled) {
          setRetiredError(error instanceof Error ? error.message : '退店キャスト一覧の取得に失敗しました')
        }
      } finally {
        if (!cancelled) setRetiredLoading(false)
      }
    }
    void loadRetiredCasts()
    return () => { cancelled = true }
  }, [listMode, meLink.isAdmin, retiredLoaded, retiredReloadKey])

  // v0.3.87: お客様担当一覧もタブを開いた時だけ取得する。
  useEffect(() => {
    if (!meLink.isAdmin || listMode !== 'customerStaff' || customerStaffLoaded) return
    let cancelled = false
    const loadCustomerStaff = async () => {
      setCustomerStaffLoading(true)
      setCustomerStaffError(null)
      try {
        const response = await fetch('/api/customer-staff/options', { cache: 'no-store' })
        const json = await response.json().catch(() => ({})) as { staff?: CustomerStaffOption[]; error?: string }
        if (!response.ok) throw new Error(json.error || 'お客様担当一覧の取得に失敗しました')
        if (!cancelled) {
          setCustomerStaff(Array.isArray(json.staff) ? json.staff : [])
          setCustomerStaffLoaded(true)
        }
      } catch (error) {
        if (!cancelled) setCustomerStaffError(error instanceof Error ? error.message : '取得に失敗しました')
      } finally {
        if (!cancelled) setCustomerStaffLoading(false)
      }
    }
    void loadCustomerStaff()
    return () => { cancelled = true }
  }, [customerStaffLoaded, listMode, meLink.isAdmin])

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
  const CastListItem = ({ cast, retired = false }: { cast: CastProfile; retired?: boolean }) => (
    <Link
      href={`/casts/${cast.id}`}
      // ⚡ RSC プリフェッチ抑制: 全キャスト分が一斉にプリフェッチされて重くなるので無効化
      prefetch={false}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: retired ? '#FCF9FA' : C.white, padding: '14px 18px',
        borderBottom: `1px solid ${C.border}`,
        textDecoration: 'none', cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
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
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {cast.display_name || cast.cast_name}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 12, minWidth: 0 }}>
        {retired ? (
          <>
            {cast.cast_tier && (
              <span style={{
                padding: '4px 8px', borderRadius: 999,
                background: '#FFF5F7', color: C.pinkMuted,
                border: `1px solid ${C.border}`,
                fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
                {cast.cast_tier}
              </span>
            )}
            <span style={{
              padding: '4px 9px', borderRadius: 999,
              background: '#F1EDEF', color: '#806F75',
              border: '1px solid #DED4D8',
              fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap',
            }}>
              退店
            </span>
          </>
        ) : (
          <CastTrainingListStatus cast={cast} />
        )}
        {/* 詳細ページ（KPI はそこで取得）への誘導 */}
        <span style={{ fontSize: 16, color: C.pinkMuted, flexShrink: 0 }}>›</span>
      </div>
    </Link>
  )

  const CustomerStaffListItem = ({ staff }: { staff: CustomerStaffOption }) => (
    <Link
      href={`/casts/customer-staff/${staff.id}`}
      prefetch={false}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: C.white, padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
        textDecoration: 'none', cursor: 'pointer', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <Avatar name={staff.display_name} size="md" />
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', color: C.dark, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {staff.display_name}
          </strong>
          <span style={{ display: 'block', marginTop: 3, color: C.pinkMuted, fontSize: 9 }}>
            お客様担当・黒服
          </span>
        </div>
      </div>
      <span style={{ fontSize: 16, color: C.pinkMuted, flexShrink: 0 }}>›</span>
    </Link>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        background: C.headerBg,
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
        paddingTop: 'env(safe-area-inset-top, 0px)',
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
              キャスト一覧
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
                  スマホ表示
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  パソコン表示
                </>
              )}
            </button>
            <NotificationBell />
          </div>
        </div>
        {/* PageNav は BottomNav と機能重複のため 2026-05-15 撤去 */}
      </div>

      {/* v0.3.50-E: ログインユーザーごとに権限別の導線を表示。
          - cast: 「ランキングを見る」→ /casts/[本人id]?tab=RANKING
          - owner / KPI.閲覧: 「成績一覧を見る」→ /admin/performance
          - owner / KPI.詳細分析: 「キャスト評価を見る」→ /admin/cast-evaluation
          いずれも遷移先の入場条件と完全一致 (「押したら弾かれる」UX を防止)。 */}
      {(meLink.castSelfId || meLink.canSeePerformance || meLink.canSeeEvaluation) && (
        <div style={{
          maxWidth: isPC ? '1000px' : '700px', margin: '0 auto',
          padding: '6px 16px 0', display: 'flex', justifyContent: 'flex-end',
          gap: 8, flexWrap: 'wrap',
        }}>
          {meLink.castSelfId && (
            <Link href={`/casts/${meLink.castSelfId}?tab=RANKING`} style={LINK_PILL_STYLE}>
              <span>📊</span>
              <span>ランキングを見る</span>
            </Link>
          )}
          {meLink.canSeePerformance && (
            <Link href="/admin/performance" style={LINK_PILL_STYLE}>
              <span>📊</span>
              <span>成績一覧を見る</span>
            </Link>
          )}
          {meLink.canSeeEvaluation && (
            <Link href="/admin/cast-evaluation" style={LINK_PILL_STYLE}>
              <span>📈</span>
              <span>キャスト評価を見る</span>
            </Link>
          )}
        </div>
      )}

      {/* 黒服・オーナー限定: 在籍一覧と退店一覧を明確に分離する。 */}
      {meLink.isAdmin && (
        <div style={{
          maxWidth: isPC ? '1000px' : '700px', margin: '0 auto',
          padding: '10px 16px 0',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4,
            padding: 4, borderRadius: 14,
            background: 'rgba(255,255,255,0.88)',
            border: `1px solid ${C.border}`,
            boxShadow: '0 4px 14px rgba(232,135,154,0.06)',
          }}>
            {([
              { key: 'active' as const, label: '在籍キャスト', count: casts.length },
              { key: 'retired' as const, label: '退店キャスト', count: retiredLoaded ? retiredCasts.length : null },
              { key: 'customerStaff' as const, label: 'お客様担当', count: customerStaffLoaded ? customerStaff.length : null },
            ]).map(item => {
              const selected = listMode === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setListMode(item.key)}
                  style={{
                    minHeight: 38, padding: '8px 12px', borderRadius: 10,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: selected
                      ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`
                      : 'transparent',
                    color: selected ? C.white : C.pinkMuted,
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
                    boxShadow: selected ? '0 3px 10px rgba(232,135,154,0.25)' : 'none',
                  }}
                >
                  {item.label}
                  {item.count !== null && (
                    <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.82 }}>
                      {item.count}人
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── 層タブ（リブランド版：下線→pill） ─── */}
      {listMode === 'active' && (
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
      )}

      {/* ─── リスト ─── */}
      <div style={{ maxWidth: isPC ? '1000px' : '700px', margin: '0 auto', padding: '16px 0' }}>
        {listMode === 'retired' ? (
          (retiredLoading || (!retiredLoaded && !retiredError)) ? (
            <div style={{ padding: '70px 0', display: 'flex', justifyContent: 'center' }}>
              <Spinner size="sm" label="退店キャストを読み込み中..." />
            </div>
          ) : retiredError ? (
            <div style={{ margin: '0 18px', padding: '28px 18px', textAlign: 'center', background: C.white, border: `1px solid ${C.border}` }}>
              <p style={{ margin: 0, fontSize: 11, color: C.danger }}>{retiredError}</p>
              <button
                type="button"
                onClick={() => {
                  setRetiredError(null)
                  setRetiredLoaded(false)
                  setRetiredReloadKey(key => key + 1)
                }}
                style={{ marginTop: 12, padding: '7px 16px', border: `1px solid ${C.pink}`, background: 'transparent', color: C.pink, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                再読み込み
              </button>
            </div>
          ) : retiredCasts.length === 0 ? (
            <div style={{ padding: '80px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', letterSpacing: '0.2em', color: C.pinkMuted }}>
                退店キャストはいません
              </p>
            </div>
          ) : (
            <div style={{ marginBottom: '20px' }}>
              <TierSectionHeader tier="退店キャスト" count={retiredCasts.length} />
              <div style={{ margin: '0 18px', border: `1px solid ${C.border}`, borderBottom: 'none' }}>
                {retiredCasts.map(cast => (
                  <CastListItem key={cast.id} cast={cast} retired />
                ))}
              </div>
              <p style={{ margin: '10px 20px 0', fontSize: 9, lineHeight: 1.7, color: C.pinkMuted }}>
                退店キャストの情報は黒服・オーナーだけが確認できます。
              </p>
            </div>
          )
        ) : listMode === 'customerStaff' ? (
          (customerStaffLoading || (!customerStaffLoaded && !customerStaffError)) ? (
            <div style={{ padding: '70px 0', display: 'flex', justifyContent: 'center' }}>
              <Spinner size="sm" label="お客様担当を読み込み中..." />
            </div>
          ) : customerStaffError ? (
            <div style={{ margin: '0 18px', padding: '28px 18px', textAlign: 'center', background: C.white, border: `1px solid ${C.border}` }}>
              <p style={{ margin: 0, fontSize: 11, color: C.danger }}>{customerStaffError}</p>
              <button
                type="button"
                onClick={() => {
                  setCustomerStaffError(null)
                  setCustomerStaffLoaded(false)
                }}
                style={{ marginTop: 12, padding: '7px 16px', border: `1px solid ${C.pink}`, background: 'transparent', color: C.pink, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                再読み込み
              </button>
            </div>
          ) : customerStaff.length === 0 ? (
            <div style={{ padding: '80px 18px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 10, color: C.pinkMuted, lineHeight: 1.8 }}>
                「顧客.担当」権限が付いた黒服アカウントはまだありません
              </p>
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              <TierSectionHeader tier="お客様担当" count={customerStaff.length} />
              <div style={{ margin: '0 18px', border: `1px solid ${C.border}`, borderBottom: 'none' }}>
                {customerStaff.map(staff => <CustomerStaffListItem key={staff.id} staff={staff} />)}
              </div>
              <p style={{ margin: '10px 20px 0', fontSize: 9, lineHeight: 1.7, color: C.pinkMuted }}>
                担当顧客と売上・来店は黒服・オーナーだけが確認できます。
              </p>
            </div>
          )
        ) : casts.length === 0 ? (
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
        @media (max-width: 480px) {
          .cast-list-training-status { gap: 4px !important; }
          .cast-list-training-step { max-width: 105px !important; }
        }
      `}</style>
    </div>
  )
}
