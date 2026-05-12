'use client'
// ─────────────────────────────────────────────────────────────────
//  /admin/customer-analysis — お客様分析ページ (C-1 / C案 4タブ)
//
//  権限: is_owner または 「顧客.全店分析」
//  タブ: 来店予測 / 離脱予兆 / 顧客分布 / LTV 分布
//  データソース: /api/admin/all-customers-analytics (1リクエスト集約)
// ─────────────────────────────────────────────────────────────────

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { C } from '@/lib/colors'
import { useViewMode } from '@/hooks/useViewMode'
import BottomNav from '@/components/BottomNav'
import PageNav from '@/components/PageNav'
import { predictNextVisit } from '@/lib/visitPrediction'
import type { Customer, CastProfile, CustomerVisit } from '@/types'
import type { CustomerWithDerived, AnalyticsData } from '@/components/CustomerAnalysis/types'

const PredictionTab   = dynamic(() => import('@/components/CustomerAnalysis/PredictionTab'),   { ssr: false })
const ChurnTab        = dynamic(() => import('@/components/CustomerAnalysis/ChurnTab'),        { ssr: false })
const DistributionTab = dynamic(() => import('@/components/CustomerAnalysis/DistributionTab'), { ssr: false })
const LtvTab          = dynamic(() => import('@/components/CustomerAnalysis/LtvTab'),          { ssr: false })
const CustomerDetailPanel = dynamic(() => import('@/components/CustomerDetailPanel'), { ssr: false })

type Tab = 'prediction' | 'churn' | 'distribution' | 'ltv'

const TABS: { k: Tab; label: string; icon: string }[] = [
  { k: 'prediction',   label: '来店予測', icon: '📅' },
  { k: 'churn',        label: '離脱予兆', icon: '⚠️' },
  { k: 'distribution', label: '顧客分布', icon: '📊' },
  { k: 'ltv',          label: 'LTV 分布', icon: '💰' },
]

export default function CustomerAnalysisPage() {
  return (
    <Suspense fallback={<Center>読み込み中...</Center>}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const router = useRouter()
  const { isPC } = useViewMode()

  // ─── 認証ガード ──────────────────────────────────────
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { setAuthorized(false); return }
        const me = await res.json()
        const ok = me.is_owner === true || me.permissions?.['顧客.全店分析'] === true
        setAuthorized(ok)
      } catch { setAuthorized(false) }
    }
    check()
  }, [])
  useEffect(() => {
    if (authorized === false) {
      const t = setTimeout(() => router.push('/'), 1500)
      return () => clearTimeout(t)
    }
  }, [authorized, router])

  // ─── データ取得 ──────────────────────────────────────
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('prediction')
  const [overlayCustomerId, setOverlayCustomerId] = useState<string | null>(null)
  // v6 (2026-05-12): C-3a 月切替 — basisMonth = 'YYYY-MM' or '' (=今日基準)
  const [basisMonth, setBasisMonth] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const load = async (month: string) => {
    setLoadError(null)
    setData(null)
    try {
      // 当月選択時は全期間扱い (visit_date 上限なし) で読み込む
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const url = month && month !== currentMonth
        ? `/api/admin/all-customers-analytics?month=${month}`
        : '/api/admin/all-customers-analytics'
      const res = await fetch(url)
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        setLoadError(`データ取得失敗: ${res.status} ${t}`)
        return
      }
      const json = await res.json() as AnalyticsData
      setData(json)
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }
  useEffect(() => {
    if (authorized) load(basisMonth)
  }, [authorized, basisMonth])

  // ─── 派生データ計算（タブ間で共有、useMemo で 1 度だけ）─
  //   basisMonth が「今月」と違う場合は、その月末を「today」として扱う (過去月の振り返り用)
  const basisDate = useMemo<Date>(() => {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    if (!basisMonth || basisMonth === currentMonth) return now
    const [y, m] = basisMonth.split('-').map(Number)
    return new Date(y, m, 0) // その月の月末 (00:00)
  }, [basisMonth])

  const rows = useMemo<CustomerWithDerived[]>(() => {
    if (!data) return []
    // cast_name → CastProfile マップ
    const castByName = new Map<string, CastProfile>()
    for (const c of data.casts) {
      if (c.cast_name) castByName.set(c.cast_name, c)
    }
    return data.customers.map((cust: Customer): CustomerWithDerived => {
      const visits: CustomerVisit[] = data.visitsByCustomer[cust.id] ?? []
      const prediction = predictNextVisit(visits, basisDate)
      const cast = cust.cast_name ? (castByName.get(cust.cast_name) ?? null) : null
      return { customer: cust, prediction, cast }
    })
  }, [data, basisDate])

  const changeMonth = (delta: number) => {
    const [y, m] = basisMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setBasisMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthLabel = useMemo(() => {
    const [y, m] = basisMonth.split('-')
    return `${y}年${Number(m)}月`
  }, [basisMonth])

  // ─── レンダリング ───────────────────────────────────
  if (authorized === null) return <Center>確認中...</Center>
  if (!authorized) return <Center>このページには「顧客.全店分析」権限が必要です。ホームへ戻ります...</Center>

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      paddingBottom: !isPC ? 'calc(60px + env(safe-area-inset-bottom, 0px))' : 0,
    }}>
      {/* ヘッダー */}
      <div style={{
        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{
          maxWidth: isPC ? '1200px' : '700px', margin: '0 auto',
          padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button onClick={() => router.push('/admin/casts')} style={{
            background: 'transparent', border: 'none', color: C.pink,
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
          }}>← 管理</button>
          <h1 style={{ fontSize: 15, fontWeight: 700, color: C.dark, margin: 0 }}>
            🔍 お客様分析
          </h1>
          <span style={{ fontSize: 9, color: C.pinkMuted, marginLeft: 8, letterSpacing: '0.1em' }}>
            CUSTOMER ANALYSIS
          </span>
          {/* v6 (2026-05-12): 月セレクター — 過去月にすると月末時点の評価 */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => changeMonth(-1)} style={{
              background: 'transparent', border: 'none', fontSize: 16, color: C.pink,
              cursor: 'pointer', padding: 4, fontFamily: 'inherit',
            }}>‹</button>
            <span style={{
              fontSize: 11, color: C.dark, letterSpacing: '0.05em',
              fontWeight: 600, minWidth: 78, textAlign: 'center',
            }}>{monthLabel}</span>
            <button onClick={() => changeMonth(1)} style={{
              background: 'transparent', border: 'none', fontSize: 16, color: C.pink,
              cursor: 'pointer', padding: 4, fontFamily: 'inherit',
            }}>›</button>
            <span style={{ fontSize: 10, color: C.pinkMuted, marginLeft: 6 }}>
              {data ? `${data.customers.length}名` : '...'}
            </span>
          </div>
        </div>
        <div style={{ maxWidth: isPC ? '1200px' : '700px', margin: '0 auto', padding: '0 18px 10px' }}>
          <PageNav />
        </div>
      </div>

      {/* タブバー */}
      <div style={{
        display: 'flex', background: C.white, borderBottom: `1px solid ${C.border}`,
        maxWidth: isPC ? '1200px' : '700px', margin: '0 auto', overflowX: 'auto',
      }}>
        {TABS.map(t => {
          const on = activeTab === t.k
          return (
            <button
              key={t.k}
              onClick={() => setActiveTab(t.k)}
              style={{
                flex: 1, minWidth: 90, padding: '12px 8px',
                fontSize: 11, letterSpacing: '0.1em',
                color: on ? C.pink : C.pinkMuted,
                fontWeight: on ? 700 : 400,
                background: 'transparent', border: 'none',
                borderBottom: on ? `2px solid ${C.pink}` : '2px solid transparent',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 16, marginBottom: 2 }}>{t.icon}</div>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* 本体 */}
      <div style={{
        maxWidth: isPC ? '1200px' : '700px', margin: '0 auto',
        padding: isPC ? '16px 18px' : '12px 12px',
      }}>
        {loadError ? (
          <div style={{
            background: '#FCEBEB', border: '1px solid #C53030', borderRadius: 12,
            padding: 16, textAlign: 'center', color: '#C53030', fontSize: 12,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{loadError}</div>
            <button onClick={() => load(basisMonth)} style={{
              padding: '8px 18px', background: C.pink, color: '#FFF', border: 'none',
              borderRadius: 18, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>再読み込み</button>
          </div>
        ) : !data ? (
          <Center>顧客データを読み込み中...（全件取得、大規模だと時間がかかります）</Center>
        ) : rows.length === 0 ? (
          <Center>顧客データがありません</Center>
        ) : (
          <>
            {activeTab === 'prediction'   && <PredictionTab   rows={rows} isPC={isPC} onCustomerClick={setOverlayCustomerId} />}
            {activeTab === 'churn'        && <ChurnTab        rows={rows} isPC={isPC} onCustomerClick={setOverlayCustomerId} />}
            {activeTab === 'distribution' && <DistributionTab rows={rows} isPC={isPC} onCustomerClick={setOverlayCustomerId} />}
            {activeTab === 'ltv'          && <LtvTab          rows={rows} isPC={isPC} onCustomerClick={setOverlayCustomerId} />}
          </>
        )}
      </div>

      {/* 顧客詳細オーバーレイ */}
      {overlayCustomerId && (
        <>
          {isPC && (
            <div
              onClick={() => setOverlayCustomerId(null)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.3)', zIndex: 99,
              }}
            />
          )}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: isPC ? '52%' : '100%',
            background: C.bg, zIndex: 100,
            overflowY: 'auto', borderLeft: isPC ? `1px solid ${C.border}` : 'none',
            boxShadow: isPC ? '-10px 0 30px rgba(0,0,0,0.1)' : 'none',
          }}>
            <div style={{ position: 'sticky', top: 0, padding: '8px 12px', background: C.bg, zIndex: 2 }}>
              <button onClick={() => setOverlayCustomerId(null)} style={{
                background: 'transparent', border: 'none', color: C.pink,
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>← 戻る</button>
            </div>
            <CustomerDetailPanel
              customerId={overlayCustomerId}
              isPC={isPC}
              isAdmin={true}
            />
          </div>
        </>
      )}

      {!isPC && <BottomNav />}
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, color: C.pinkMuted, padding: 20, textAlign: 'center',
    }}>{children}</div>
  )
}
