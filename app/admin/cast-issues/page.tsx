'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import BottomNav from '@/components/BottomNav'
import CustomerActionCardShell from '@/components/CustomerActionCardShell'
import CustomerVisitPatternSummary from '@/components/CustomerVisitPatternSummary'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/ui/Spinner'
import { useViewMode } from '@/hooks/useViewMode'
import { useCustomerListActions } from '@/hooks/useCustomerListActions'
import { CAST_TIERS, type CustomerRank } from '@/types'
import type {
  CastIssueRegionGroup,
  OverdueHonshimeiCustomer,
  RecentBanaiCustomer,
  RecentHonshimeiCustomer,
} from '@/lib/castIssueVisibility'
import {
  buildCastIssuePriority,
  sortCastIssueCustomers,
  type CastIssuePriorityResult,
  type CastIssueSortKey,
} from '@/lib/castIssueVisibility'
import styles from './page.module.css'

const CustomerDetailPanel = dynamic(
  () => import('@/components/CustomerDetailPanel'),
  { ssr: false, loading: () => <div className={styles.panelLoading}><Spinner size="md" label="お客様情報を読み込み中…" /></div> },
)

type CastOption = {
  id: string
  cast_name: string | null
  display_name: string | null
  cast_tier: string | null
  created_at: string
  kpi_customer_count: number
}

type PageData = {
  period: { mode: 'rolling' | 'month'; month: string; start: string; end: string }
  casts: CastOption[]
  selected_cast: CastOption | null
  summary: {
    period_honshimei_customer_count: number
    period_honshimei_visit_count: number
    period_honshimei_sales: number
    month_sales: number
    sales_difference: number
    sales_achievement_rate: number
    overdue_customer_count: number
    banai_acquired_count: number
    target_sales: number
    target_work_days: number
    current_work_days: number
    period_work_days: number
    period_bowzu_days: number
    current_bowzu_streak: number
  }
  sections: {
    recent_honshimei: RecentHonshimeiCustomer[]
    overdue_honshimei: OverdueHonshimeiCustomer[]
    recent_banai: RecentBanaiCustomer[]
  }
}

type SectionKey = keyof PageData['sections']
type IssueCustomer = RecentHonshimeiCustomer | OverdueHonshimeiCustomer | RecentBanaiCustomer
type PriorityKey = 'quantity' | 'quality' | 'frequency' | 'banai'
type CastDetailTab = 'KPI' | 'CUSTOMERS'

const REGION_ORDER: ReadonlyArray<{ key: CastIssueRegionGroup; label: string }> = [
  { key: 'fukuoka', label: '福岡県' },
  { key: 'outside', label: '県外' },
  { key: 'unset', label: '地域未設定' },
]

const SECTION_META: Record<SectionKey, { title: string; description: string; tone: string }> = {
  recent_honshimei: {
    title: '本指名・直近4週間',
    description: '過去28日間に来店された本指名のお客様',
    tone: 'recent',
  },
  overdue_honshimei: {
    title: '本指名・周期遅れ',
    description: '通常の来店周期より7日以上遅れているお客様',
    tone: 'overdue',
  },
  recent_banai: {
    title: '場内・直近4週間',
    description: '過去28日間に場内を獲得したお客様',
    tone: 'banai',
  },
}

const SECTION_SORTS: Record<SectionKey, ReadonlyArray<{ value: CastIssueSortKey; label: string }>> = {
  recent_honshimei: [
    { value: 'period_sales_desc', label: '期間売上が高い順' },
    { value: 'period_visits_desc', label: '期間来店回数が多い順' },
    { value: 'period_average_desc', label: '期間客単価が高い順' },
    { value: 'lifetime_sales_desc', label: '累計売上が高い順' },
    { value: 'lifetime_visits_desc', label: '累計来店回数が多い順' },
    { value: 'last_visit_desc', label: '最終来店が新しい順' },
    { value: 'last_visit_asc', label: '最終来店が古い順' },
  ],
  overdue_honshimei: [
    { value: 'overdue_desc', label: '周期超過が長い順' },
    { value: 'last_visit_asc', label: '最終来店が古い順' },
    { value: 'lifetime_sales_desc', label: '累計売上が高い順' },
    { value: 'lifetime_visits_desc', label: '累計来店回数が多い順' },
  ],
  recent_banai: [
    { value: 'acquired_desc', label: '獲得日が新しい順' },
    { value: 'acquired_asc', label: '獲得日が古い順' },
    { value: 'follow_up_first', label: '追いかけ中を優先' },
    { value: 'lifetime_sales_desc', label: '累計売上が高い順' },
    { value: 'lifetime_visits_desc', label: '累計来店回数が多い順' },
  ],
}

function displayName(cast: CastOption) {
  return cast.cast_name?.trim() || cast.display_name?.trim() || '名前未設定'
}

function customerName(customer: IssueCustomer) {
  return customer.customer_name?.trim() || customer.nickname?.trim() || 'お名前未登録'
}

function shortDate(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}/${Number(day)}`
}

function yen(value: number) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency', currency: 'JPY', maximumFractionDigits: 0,
  }).format(value)
}

function compactYen(value: number) {
  if (value < 10_000) return yen(value)
  const man = value / 10_000
  const rounded = man < 100 && !Number.isInteger(man) ? Math.round(man * 10) / 10 : Math.round(man)
  return `${rounded.toLocaleString('ja-JP')}万円`
}

export default function CastIssuesPage() {
  const { isPC } = useViewMode()
  const [data, setData] = useState<PageData | null>(null)
  const [selectedCastId, setSelectedCastId] = useState<string | null>(null)
  const [periodMode, setPeriodMode] = useState<'rolling' | 'month'>('rolling')
  const [selectedMonth, setSelectedMonth] = useState(() => (
    new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
  ))
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [meetingMode, setMeetingMode] = useState(false)
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(
    () => new Set(['recent_honshimei', 'overdue_honshimei', 'recent_banai']),
  )
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [castDetailId, setCastDetailId] = useState<string | null>(null)
  const [castDetailTab, setCastDetailTab] = useState<CastDetailTab>('KPI')
  const [castOverlayLoading, setCastOverlayLoading] = useState(false)
  const [openCustomerActionsId, setOpenCustomerActionsId] = useState<string | null>(null)
  const [followUpsReady, setFollowUpsReady] = useState(false)
  const [sortKeys, setSortKeys] = useState<Record<SectionKey, CastIssueSortKey>>({
    recent_honshimei: 'period_sales_desc',
    overdue_honshimei: 'overdue_desc',
    recent_banai: 'acquired_desc',
  })
  const requestIdRef = useRef(0)
  const hasLoadedRef = useRef(false)
  const {
    activeFollowUpIds,
    busy: customerActionBusy,
    loadActiveFollowUpIds,
    addToFollowUp,
    removeFromFollowUp,
    moveToSevered,
    ToastView,
  } = useCustomerListActions({ onRanksChanged: () => setRefreshKey(value => value + 1) })

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++requestIdRef.current
    const load = async () => {
      if (hasLoadedRef.current) setRefreshing(true)
      else setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams()
        if (selectedCastId) params.set('castId', selectedCastId)
        params.set('periodMode', periodMode)
        if (periodMode === 'month') params.set('month', selectedMonth)
        const response = await fetch(`/api/admin/cast-issues?${params}`, {
          cache: 'no-store', signal: controller.signal,
        })
        const json = await response.json().catch(() => ({})) as PageData & { error?: string }
        if (!response.ok) throw new Error(json.error || '課題見える化シートの取得に失敗しました')
        if (requestId !== requestIdRef.current) return
        setData(json)
        hasLoadedRef.current = true
      } catch (loadError) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        setError(loadError instanceof Error ? loadError.message : '課題見える化シートの取得に失敗しました')
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [periodMode, refreshKey, selectedCastId, selectedMonth])

  useEffect(() => {
    if (!data?.selected_cast) return
    let cancelled = false
    setFollowUpsReady(false)
    void loadActiveFollowUpIds().then(ids => {
      if (!cancelled && ids !== null) setFollowUpsReady(true)
    })
    return () => { cancelled = true }
  }, [data?.selected_cast, loadActiveFollowUpIds])

  useEffect(() => {
    if (!customerId && !castDetailId) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCustomerId(null)
        setCastDetailId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [castDetailId, customerId])

  useEffect(() => {
    if (!meetingMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !customerId && !castDetailId) setMeetingMode(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [castDetailId, customerId, meetingMode])

  const castsByTier = useMemo(() => {
    const casts = data?.casts ?? []
    const tiers = [...CAST_TIERS, '層未設定']
    return tiers.map(tier => ({
      tier,
      casts: casts.filter(cast => (cast.cast_tier || '層未設定') === tier),
    })).filter(group => group.casts.length > 0)
  }, [data?.casts])

  const effectiveSelectedId = selectedCastId ?? data?.selected_cast?.id ?? null
  const periodLabel = data ? `${shortDate(data.period.start)}〜${shortDate(data.period.end)}` : ''
  const priority = useMemo(() => {
    if (!data) return null
    const recentBanai = data.sections.recent_banai.map(customer => ({
      ...customer,
      follow_up_active: followUpsReady
        ? activeFollowUpIds.has(customer.id)
        : customer.follow_up_active,
    }))
    return buildCastIssuePriority({
      recentHonshimei: data.sections.recent_honshimei,
      recentBanai,
      targetSales: data.summary.target_sales,
    })
  }, [activeFollowUpIds, data, followUpsReady])

  const openCastDetail = (castId: string, tab: CastDetailTab) => {
    setCastDetailTab(tab)
    setCastOverlayLoading(true)
    setCastDetailId(castId)
  }

  const updateSort = (key: SectionKey, value: CastIssueSortKey) => {
    setSortKeys(previous => ({ ...previous, [key]: value }))
  }

  const toggleSection = (key: SectionKey) => {
    setOpenSections(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className={styles.page} data-meeting={meetingMode ? 'true' : undefined}>
      {!meetingMode && (
        <PageHeader
          title="課題見える化シート"
          subtitle="キャストの現状確認"
          backFallback="/admin/casts"
          actions={(
            <div className={styles.headerActions}>
              {periodLabel && <span className={styles.periodBadge}>対象期間 {periodLabel}</span>}
              <button type="button" className={styles.meetingModeButton} onClick={() => setMeetingMode(true)}>
                会議モード
              </button>
            </div>
          )}
        />
      )}
      {meetingMode && (
        <header className={styles.meetingHeader}>
          <div>
            <strong>課題見える化シート</strong>
            <span>キャストの現状確認</span>
          </div>
          <div>
            {periodLabel && <span>対象期間　{periodLabel}</span>}
            <button type="button" onClick={() => setMeetingMode(false)}>通常表示に戻る</button>
          </div>
        </header>
      )}

      <main className={`${styles.main} ${meetingMode ? styles.meetingMain : ''}`}>
        {loading ? (
          <div className={styles.center}><Spinner size="md" label="キャストの状況を集計中…" /></div>
        ) : error && !data ? (
          <div className={styles.errorCard}>{error}</div>
        ) : data ? (
          <div className={styles.layout}>
            <aside className={styles.sidebar} aria-label="キャスト一覧">
              <div className={styles.sidebarTitle}>
                <div>
                  <strong>キャスト一覧</strong>
                  <span>{data.casts.length}人</span>
                </div>
                {refreshing && <Spinner size="sm" label="更新中" />}
              </div>
              <div className={styles.castGroups}>
                {castsByTier.map(group => (
                  <section key={group.tier} className={styles.castTierGroup}>
                    <h2>{group.tier}<span>{group.casts.length}人</span></h2>
                    <div>
                      {group.casts.map(cast => (
                        <div
                          key={cast.id}
                          className={styles.castListItem}
                          data-active={effectiveSelectedId === cast.id ? 'true' : undefined}
                        >
                          <button
                            type="button"
                            className={styles.castSelectButton}
                            onClick={() => setSelectedCastId(cast.id)}
                          >
                            <span>{displayName(cast).slice(0, 1)}</span>
                            <strong>{displayName(cast)}</strong>
                            <b aria-hidden>›</b>
                          </button>
                          <button
                            type="button"
                            className={styles.customerCountButton}
                            aria-label={`${displayName(cast)}の顧客${cast.kpi_customer_count}人を開く`}
                            onClick={() => {
                              setSelectedCastId(cast.id)
                              openCastDetail(cast.id, 'CUSTOMERS')
                            }}
                          >
                            <span>顧客</span><strong>{cast.kpi_customer_count}人</strong>
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </aside>

            <section className={styles.content}>
              {error && <div className={styles.errorCard}>{error}</div>}
              {data.selected_cast ? (
                <>
                  <PeriodControls
                    mode={periodMode}
                    month={selectedMonth}
                    currentMonth={new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)}
                    onModeChange={setPeriodMode}
                    onMonthChange={setSelectedMonth}
                  />
                  <CastSummaryHeader
                    data={data}
                    onOpenCast={() => openCastDetail(data.selected_cast!.id, 'KPI')}
                  />
                  {priority && (
                    <PriorityIssues
                      key={data.selected_cast.id}
                      priority={priority}
                      period={data.period}
                      onOpenCustomer={setCustomerId}
                    />
                  )}
                  {(['recent_honshimei', 'overdue_honshimei', 'recent_banai'] as const).map(key => (
                    <IssueSection
                      key={key}
                      sectionKey={key}
                      items={data.sections[key]}
                      open={openSections.has(key)}
                      period={data.period}
                      sortKey={sortKeys[key]}
                      onSortChange={value => updateSort(key, value)}
                      onToggle={() => toggleSection(key)}
                      onOpenCustomer={setCustomerId}
                      activeFollowUpIds={activeFollowUpIds}
                      followUpsReady={followUpsReady}
                      openCustomerActionsId={openCustomerActionsId}
                      customerActionBusy={customerActionBusy}
                      onToggleActions={setOpenCustomerActionsId}
                      onAddFollowUp={customerId => {
                        void addToFollowUp([customerId]).then(changed => {
                          if (changed) setOpenCustomerActionsId(null)
                        })
                      }}
                      onRemoveFollowUp={customerId => {
                        void removeFromFollowUp([customerId]).then(changed => {
                          if (changed) setOpenCustomerActionsId(null)
                        })
                      }}
                      onMoveToSevered={item => {
                        void moveToSevered([{
                          id: item.id,
                          name: customerName(item),
                          previousRank: (item.customer_rank ?? null) as CustomerRank | null,
                        }]).then(changed => {
                          if (changed) setOpenCustomerActionsId(null)
                        })
                      }}
                    />
                  ))}
                </>
              ) : (
                <div className={styles.empty}>在籍キャストがいません</div>
              )}
            </section>
          </div>
        ) : null}
      </main>

      {customerId && (
        <>
          <button className={styles.overlayBg} type="button" onClick={() => setCustomerId(null)} aria-label="お客様詳細を閉じる" />
          <section className={styles.overlayPanel} role="dialog" aria-modal="true" aria-label="お客様詳細">
            <header className={styles.overlayHeader}>
              <button type="button" onClick={() => setCustomerId(null)}>× シートに戻る</button>
              <span>お客様詳細</span>
            </header>
            <CustomerDetailPanel
              key={customerId}
              customerId={customerId}
              isPC={isPC}
              isAdmin
              responsiveContainer
            />
          </section>
        </>
      )}
      {castDetailId && (
        <>
          <button
            className={styles.overlayBg}
            type="button"
            onClick={() => setCastDetailId(null)}
            aria-label="キャスト詳細を閉じる"
          />
          <section className={`${styles.overlayPanel} ${styles.castOverlayPanel}`} role="dialog" aria-modal="true" aria-label="キャスト詳細">
            <header className={styles.overlayHeader}>
              <button type="button" onClick={() => setCastDetailId(null)}>× シートに戻る</button>
              <span>{castDetailTab === 'CUSTOMERS' ? 'キャストの顧客一覧' : 'キャストページ'}</span>
            </header>
            <div className={styles.castFrameWrap}>
              {castOverlayLoading && (
                <div className={styles.castFrameLoading}>
                  <Spinner size="md" label="キャストページを読み込み中…" />
                </div>
              )}
              <iframe
                key={`${castDetailId}-${castDetailTab}`}
                className={styles.castFrame}
                src={`/casts/${castDetailId}?embed=1&tab=${castDetailTab}`}
                title={`${data?.selected_cast ? displayName(data.selected_cast) : 'キャスト'}の${castDetailTab === 'CUSTOMERS' ? '顧客一覧' : '詳細ページ'}`}
                onLoad={() => setCastOverlayLoading(false)}
              />
            </div>
          </section>
        </>
      )}
      {ToastView}
      {!meetingMode && <BottomNav />}
    </div>
  )
}

function PeriodControls({ mode, month, currentMonth, onModeChange, onMonthChange }: {
  mode: 'rolling' | 'month'
  month: string
  currentMonth: string
  onModeChange: (mode: 'rolling' | 'month') => void
  onMonthChange: (month: string) => void
}) {
  return (
    <section className={styles.periodControls} aria-label="対象期間の設定">
      <div>
        <span>対象期間</span>
        <strong>{mode === 'rolling' ? '現在から過去4週間' : `${month.slice(0, 4)}年${Number(month.slice(5))}月`}</strong>
      </div>
      <div className={styles.periodModeButtons}>
        <button
          type="button"
          data-active={mode === 'rolling'}
          onClick={() => onModeChange('rolling')}
        >現在から4週間</button>
        <button
          type="button"
          data-active={mode === 'month'}
          onClick={() => onModeChange('month')}
        >月ごとに確認</button>
      </div>
      {mode === 'month' && (
        <label>
          <span>確認する月</span>
          <input
            type="month"
            value={month}
            max={currentMonth}
            onChange={event => onMonthChange(event.target.value || currentMonth)}
          />
        </label>
      )}
    </section>
  )
}

function CastSummaryHeader({ data, onOpenCast }: { data: PageData; onOpenCast: () => void }) {
  const cast = data.selected_cast
  if (!cast) return null
  const periodPrefix = data.period.mode === 'rolling' ? '4週' : '期間'
  const targetMonthLabel = `${Number(data.period.month.slice(5))}月`
  const salesDifference = data.summary.sales_difference
  const hasTargetSales = data.summary.target_sales > 0
  const summaryItems = [
    [`${periodPrefix}本指名人数`, `${data.summary.period_honshimei_customer_count}人`],
    [`${periodPrefix}本指名本数`, `${data.summary.period_honshimei_visit_count}本`],
    [`${periodPrefix}本指名売上`, compactYen(data.summary.period_honshimei_sales)],
    ['周期遅れ', `${data.summary.overdue_customer_count}人`],
    ['場内獲得', `${data.summary.banai_acquired_count}人`],
    [`${periodPrefix}ボウズ`, `${data.summary.period_bowzu_days}日`],
    ['連続ボウズ', `${data.summary.current_bowzu_streak}出勤`],
  ]
  return (
    <section className={styles.castSummary}>
      <button type="button" className={styles.castIdentity} onClick={onOpenCast}>
        <span>{displayName(cast).slice(0, 1)}</span>
        <div>
          <small>{cast.cast_tier || '層未設定'}</small>
          <h1>{displayName(cast)}</h1>
          <em>キャストページを開く ›</em>
        </div>
      </button>
      <div className={styles.summaryMetrics}>
        {summaryItems.map(([label, value]) => (
          <div key={label} data-alert={label.includes('ボウズ') ? 'true' : undefined}>
            <span>{label}</span><strong>{value}</strong>
            {label.endsWith('ボウズ') && label !== '連続ボウズ' && <small>出勤{data.summary.period_work_days}日のうち</small>}
            {label === '連続ボウズ' && <small>{shortDate(data.period.end)}時点・休みを除く</small>}
          </div>
        ))}
      </div>
      <div className={styles.targetMetrics}>
        <div>
          <span>{targetMonthLabel}実売上</span>
          <strong>{compactYen(data.summary.month_sales)}</strong>
          {hasTargetSales && <small>達成率 {data.summary.sales_achievement_rate}%</small>}
        </div>
        <div>
          <span>{targetMonthLabel}設定売上</span>
          <strong>{data.summary.target_sales > 0 ? compactYen(data.summary.target_sales) : '未設定'}</strong>
        </div>
        <div>
          <span>設定売上との差</span>
          <strong>{hasTargetSales
            ? salesDifference >= 0
              ? `あと ${compactYen(salesDifference)}`
              : `${compactYen(Math.abs(salesDifference))} 超過`
            : '未設定'}</strong>
        </div>
        <div>
          <span>{targetMonthLabel}設定出勤</span>
          <strong>{data.summary.target_work_days > 0 ? `${data.summary.target_work_days}日` : '未設定'}</strong>
          <small>実出勤 {data.summary.current_work_days}日</small>
        </div>
      </div>
    </section>
  )
}

function PriorityIssues({ priority, period, onOpenCustomer }: {
  priority: CastIssuePriorityResult
  period: PageData['period']
  onOpenCustomer: (id: string) => void
}) {
  const [activeKey, setActiveKey] = useState<PriorityKey | null>(null)
  const summary = priority.summary
  const periodName = period.mode === 'rolling'
    ? '直近4週間'
    : `${Number(period.month.slice(5))}月`
  const cards: Array<{
    key: PriorityKey
    number: string
    title: string
    value: string
    note: string
    result: string
    status: 'attention' | 'complete' | 'neutral'
  }> = [
    {
      key: 'quantity',
      number: '1',
      title: '数の追求',
      value: `${summary.local_customer_count} / ${summary.local_customer_goal}人`,
      note: `${periodName}に来店した県内本指名`,
      result: summary.local_customer_shortfall > 0
        ? `あと${summary.local_customer_shortfall}人`
        : '15人達成',
      status: summary.local_customer_shortfall > 0 ? 'attention' : 'complete',
    },
    {
      key: 'quality',
      number: '2',
      title: '質の追求',
      value: summary.local_customer_count === 0
        ? '対象者なし'
        : summary.target_average_spend > 0
        ? `達成 ${summary.quality_met_customer_count} / ${summary.local_customer_count}人`
        : '判定待ち',
      note: summary.target_average_spend > 0
        ? `設定単価 ${compactYen(summary.target_average_spend)}`
        : '設定売上が未設定です',
      result: summary.local_customer_count === 0
        ? '来店者なし'
        : summary.target_average_spend > 0
        ? `未達${summary.quality_unmet_customer_count}人`
        : '設定売上を入力',
      status: summary.local_customer_count === 0 || summary.target_average_spend === 0
        ? 'neutral'
        : summary.quality_unmet_customer_count > 0 ? 'attention' : 'complete',
    },
    {
      key: 'frequency',
      number: '3',
      title: '月3回来店',
      value: `${summary.three_visit_customer_count} / ${summary.local_customer_goal}人`,
      note: '県内本指名をお客様ごとに判定',
      result: summary.three_visit_customer_shortfall > 0
        ? `あと${summary.three_visit_customer_shortfall}人`
        : '15人達成',
      status: summary.three_visit_customer_shortfall > 0 ? 'attention' : 'complete',
    },
    {
      key: 'banai',
      number: '4',
      title: '場内からの追いかけ',
      value: `${summary.banai_follow_up_customer_count} / ${summary.banai_customer_count}人`,
      note: `${periodName}に獲得した場内`,
      result: summary.banai_follow_up_missing_count > 0
        ? `未登録${summary.banai_follow_up_missing_count}人`
        : summary.banai_customer_count > 0 ? '全員登録済み' : '対象者なし',
      status: summary.banai_customer_count === 0
        ? 'neutral'
        : summary.banai_follow_up_missing_count > 0 ? 'attention' : 'complete',
    },
  ]

  let detailTitle = ''
  let detailDescription = ''
  let detailItems: Array<{ id: string; name: string; meta: string }> = []
  if (activeKey === 'quantity') {
    detailTitle = '県内本指名の実来店者'
    detailDescription = summary.local_customer_shortfall > 0
      ? `15人達成まであと${summary.local_customer_shortfall}人です。現在数に含まれるお客様を表示しています。`
      : '県内本指名15人の目標を達成しています。'
    detailItems = priority.localCustomers.map(customer => ({
      id: customer.id,
      name: customerName(customer),
      meta: `${customer.period_visits}回・${compactYen(customer.period_sales)}`,
    }))
  } else if (activeKey === 'quality') {
    detailTitle = '設定単価に届いていないお客様'
    detailDescription = summary.target_average_spend > 0
      ? `設定売上÷45＝${compactYen(summary.target_average_spend)}を基準にしています。`
      : '設定売上を入力すると、お客様ごとの対象期間客単価を判定できます。'
    detailItems = priority.qualityUnmetCustomers.map(customer => ({
      id: customer.id,
      name: customerName(customer),
      meta: `客単価 ${compactYen(customer.period_average_spend)}`,
    }))
  } else if (activeKey === 'frequency') {
    detailTitle = '3回来店に届いていないお客様'
    detailDescription = `県内本指名のお客様を、${periodName}の実来店回数で判定しています。`
    detailItems = priority.frequencyUnmetCustomers.map(customer => ({
      id: customer.id,
      name: customerName(customer),
      meta: `${customer.period_visits} / 3回`,
    }))
  } else if (activeKey === 'banai') {
    detailTitle = '追いかけ未登録の場内客'
    detailDescription = `${periodName}に場内を獲得し、現在追いかけへ入っていないお客様です。`
    detailItems = priority.banaiMissingFollowUpCustomers.map(customer => ({
      id: customer.id,
      name: customerName(customer),
      meta: `獲得 ${shortDate(customer.acquired_date)}`,
    }))
  }

  return (
    <section className={styles.prioritySection}>
      <header className={styles.priorityHeader}>
        <div><strong>優先する課題</strong><span>会議で最初に確認する4項目</span></div>
        <small>カードを押すと対象のお客様を確認できます</small>
      </header>
      <div className={styles.priorityGrid}>
        {cards.map(card => (
          <button
            key={card.key}
            type="button"
            className={styles.priorityCard}
            data-status={card.status}
            data-active={activeKey === card.key ? 'true' : undefined}
            aria-expanded={activeKey === card.key}
            onClick={() => setActiveKey(current => current === card.key ? null : card.key)}
          >
            <span className={styles.priorityNumber}>{card.number}</span>
            <span className={styles.priorityCardBody}>
              <small>{card.title}</small>
              <strong>{card.value}</strong>
              <em>{card.note}</em>
            </span>
            <b>{card.result}</b>
          </button>
        ))}
      </div>
      {activeKey && (
        <div className={styles.priorityDetail}>
          <div>
            <strong>{detailTitle}</strong>
            <p>{detailDescription}</p>
          </div>
          {detailItems.length > 0 ? (
            <div className={styles.priorityCustomers}>
              {detailItems.map(item => (
                <button key={item.id} type="button" onClick={() => onOpenCustomer(item.id)}>
                  <strong>{item.name}</strong><span>{item.meta}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.priorityEmpty}>
              {activeKey === 'quality' && summary.target_average_spend === 0
                ? '設定売上の入力待ちです'
                : '該当するお客様はいません'}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function IssueSection({
  sectionKey,
  items,
  open,
  period,
  sortKey,
  onSortChange,
  onToggle,
  onOpenCustomer,
  activeFollowUpIds,
  followUpsReady,
  openCustomerActionsId,
  customerActionBusy,
  onToggleActions,
  onAddFollowUp,
  onRemoveFollowUp,
  onMoveToSevered,
}: {
  sectionKey: SectionKey
  items: IssueCustomer[]
  open: boolean
  period: PageData['period']
  sortKey: CastIssueSortKey
  onSortChange: (value: CastIssueSortKey) => void
  onToggle: () => void
  onOpenCustomer: (id: string) => void
  activeFollowUpIds: ReadonlySet<string>
  followUpsReady: boolean
  openCustomerActionsId: string | null
  customerActionBusy: boolean
  onToggleActions: (id: string | null) => void
  onAddFollowUp: (id: string) => void
  onRemoveFollowUp: (id: string) => void
  onMoveToSevered: (item: IssueCustomer) => void
}) {
  const meta = SECTION_META[sectionKey]
  const periodName = period.mode === 'rolling' ? '直近4週間' : `${Number(period.month.slice(5))}月`
  const title = sectionKey === 'recent_honshimei'
    ? `本指名・${periodName}`
    : sectionKey === 'recent_banai'
      ? `場内・${periodName}`
      : meta.title
  const description = sectionKey === 'recent_honshimei'
    ? `${shortDate(period.start)}〜${shortDate(period.end)}に来店された本指名のお客様`
    : sectionKey === 'recent_banai'
      ? `${shortDate(period.start)}〜${shortDate(period.end)}に場内を獲得したお客様`
      : meta.description
  const sortedItems = useMemo(
    () => sortCastIssueCustomers(items, sortKey),
    [items, sortKey],
  )
  const displayNumberById = useMemo(() => {
    const numbers = new Map<string, number>()
    let nextNumber = 1
    REGION_ORDER.forEach(region => {
      sortedItems.forEach(item => {
        if (item.region_group === region.key) {
          numbers.set(item.id, nextNumber)
          nextNumber += 1
        }
      })
    })
    return numbers
  }, [sortedItems])
  return (
    <section className={styles.issueSection} data-tone={meta.tone}>
      <button type="button" className={styles.sectionHeader} onClick={onToggle} aria-expanded={open}>
        <span className={styles.sectionChevron}>{open ? '▼' : '▶'}</span>
        <span><strong>{title}</strong><small>{description}</small></span>
        <b>{items.length}人</b>
      </button>
      {open && (
        <div className={styles.regionGroups}>
          <label className={styles.sectionSort}>
            <span>並び替え</span>
            <select
              value={sortKey}
              onChange={event => onSortChange(event.target.value as CastIssueSortKey)}
            >
              {SECTION_SORTS[sectionKey].map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {REGION_ORDER.map(region => {
            const regionItems = sortedItems.filter(item => item.region_group === region.key)
            return (
              <section key={region.key} className={styles.regionGroup}>
                <header><strong>{region.label}</strong><span>{regionItems.length}人</span></header>
                {regionItems.length === 0 ? (
                  <div className={styles.regionEmpty}>該当するお客様はいません</div>
                ) : (
                  <div className={styles.customerTable}>
                    <div className={styles.customerTableHeader} aria-hidden="true">
                      <span>お客様情報</span>
                      <span>対象期間の実績</span>
                      <span>来店傾向</span>
                      <span>累計実績</span>
                      <span>担当・追いかけ</span>
                    </div>
                    <div className={styles.customerRows}>
                      {regionItems.map(item => (
                        <CustomerIssueRow
                          key={item.id}
                          item={item}
                          displayNumber={displayNumberById.get(item.id) ?? 0}
                          sectionKey={sectionKey}
                          onOpen={() => onOpenCustomer(item.id)}
                          period={period}
                          isFollowUp={followUpsReady ? activeFollowUpIds.has(item.id) : item.follow_up_active}
                          actionsOpen={openCustomerActionsId === item.id}
                          busy={customerActionBusy}
                          onToggleActions={() => onToggleActions(openCustomerActionsId === item.id ? null : item.id)}
                          onAddFollowUp={() => onAddFollowUp(item.id)}
                          onRemoveFollowUp={() => onRemoveFollowUp(item.id)}
                          onMoveToSevered={() => onMoveToSevered(item)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}

function CustomerIssueRow({
  item,
  displayNumber,
  sectionKey,
  period,
  isFollowUp,
  actionsOpen,
  busy,
  onOpen,
  onToggleActions,
  onAddFollowUp,
  onRemoveFollowUp,
  onMoveToSevered,
}: {
  item: IssueCustomer
  displayNumber: number
  sectionKey: SectionKey
  period: PageData['period']
  isFollowUp: boolean
  actionsOpen: boolean
  busy: boolean
  onOpen: () => void
  onToggleActions: () => void
  onAddFollowUp: () => void
  onRemoveFollowUp: () => void
  onMoveToSevered: () => void
}) {
  const companion = [
    item.latest_companion_honshimei ? `本:${item.latest_companion_honshimei}` : '',
    item.latest_companion_banai ? `場:${item.latest_companion_banai}` : '',
  ].filter(Boolean).join('・') || '未登録'
  const customerStaff = item.customer_staff_names.length > 0
    ? item.customer_staff_names.join('・')
    : item.has_customer_staff ? '担当者名未設定' : 'なし'
  const followUp = isFollowUp
    ? item.follow_up_next_actions.length > 0
      ? item.follow_up_next_actions.join('・')
      : '行動未設定'
    : '未登録'
  const periodLabel = period.mode === 'rolling' ? '4週' : `${Number(period.month.slice(5))}月`

  return (
    <CustomerActionCardShell
      customerId={item.id}
      customerName={customerName(item)}
      customerRank={(item.customer_rank ?? null) as CustomerRank | null}
      busy={busy}
      isFollowUp={isFollowUp}
      canManage
      selectionMode={false}
      selected={false}
      actionsOpen={actionsOpen}
      borderRadius={0}
      onOpen={onOpen}
      onToggleSelected={() => undefined}
      onToggleActions={onToggleActions}
      onAddFollowUp={onAddFollowUp}
      onRemoveFollowUp={onRemoveFollowUp}
      onMoveToSevered={onMoveToSevered}
    >
      <div className={styles.customerRow}>
        <div className={styles.customerIdentity}>
          <div className={styles.customerNameRow}>
            <span className={styles.customerNumber} aria-label={`一覧番号 ${displayNumber}`}>{displayNumber}</span>
            <strong>{customerName(item)}</strong>
            {item.nickname && item.customer_name && <small>（{item.nickname}）</small>}
          </div>
          <div className={styles.customerBadges}>
            <span data-rank={item.customer_rank || '未設定'}>{item.customer_rank ? `${item.customer_rank}ランク` : 'ランク未設定'}</span>
            <span>{item.nomination_status || '指名未設定'}</span>
            <span>{item.age_group || '年代未設定'}</span>
            <span>{item.region?.trim() || '地域未設定'}</span>
            {isFollowUp && <span className={styles.followBadge}>追いかけ中</span>}
          </div>
          <div className={styles.recencyRow}>
            <strong>
              最終来店 {item.lifetime_days_since_last_visit === null
                ? '未記録'
                : `${item.lifetime_days_since_last_visit}日前`}
            </strong>
            <span>最終連絡 {item.last_contact_date ? shortDate(item.last_contact_date) : '未記録'}</span>
          </div>
        </div>

        <div className={styles.issueMetrics} data-section={sectionKey} aria-label="対象期間の情報">
          {sectionKey === 'recent_honshimei' && (
            <>
              <Metric label={`${periodLabel}来店`} value={`${(item as RecentHonshimeiCustomer).period_visits}回`} />
              <Metric label={`${periodLabel}売上`} value={compactYen((item as RecentHonshimeiCustomer).period_sales)} />
              <Metric label={`${periodLabel}客単価`} value={compactYen((item as RecentHonshimeiCustomer).period_average_spend)} />
              <Metric label="期間内最終" value={shortDate((item as RecentHonshimeiCustomer).last_visit_date)} />
            </>
          )}
          {sectionKey === 'overdue_honshimei' && (
            <>
              <Metric label="通常周期" value={`${(item as OverdueHonshimeiCustomer).average_cycle_days}日`} />
              <Metric label="最終来店" value={shortDate((item as OverdueHonshimeiCustomer).last_visit_date)} sub={`${(item as OverdueHonshimeiCustomer).days_since_last_visit}日前`} />
              <Metric label="周期超過" value={`${(item as OverdueHonshimeiCustomer).overdue_days}日`} danger />
              <Metric label="累計来店" value={`${(item as OverdueHonshimeiCustomer).total_visit_count}回`} />
            </>
          )}
          {sectionKey === 'recent_banai' && (
            <>
              <Metric label="獲得日" value={shortDate((item as RecentBanaiCustomer).acquired_date)} />
              <Metric label="獲得から" value={`${(item as RecentBanaiCustomer).days_since_acquisition}日`} />
              <Metric label="現在の指名" value={item.nomination_status || '未設定'} />
              <Metric label="追いかけ" value={isFollowUp ? '追加済み' : '未追加'} danger={!isFollowUp} />
            </>
          )}
        </div>

        <div className={styles.visitPattern}>
          <CustomerVisitPatternSummary pattern={item.visit_pattern} compact />
        </div>

        <div className={styles.lifetimeMetrics} aria-label="累計の来店・売上情報">
          <Metric label="累計来店" value={`${item.lifetime_visit_count}回`} />
          <Metric label="累計売上" value={compactYen(item.lifetime_sales)} />
          <Metric label="累計客単価" value={compactYen(item.lifetime_average_spend)} />
        </div>

        <div className={styles.relationships}>
          <Relation label="お連れ様" value={companion} />
          <Relation label="お客様担当" value={customerStaff} />
          <Relation
            label="追いかけ"
            value={followUp}
            accent={isFollowUp}
            sub={item.follow_up_return_visit_deadline
              ? `再来店期限 ${shortDate(item.follow_up_return_visit_deadline)}`
              : undefined}
          />
        </div>
      </div>
    </CustomerActionCardShell>
  )
}

function Relation({ label, value, sub, accent = false }: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <span className={styles.relation} data-accent={accent} title={value}>
      <small>{label}</small>
      <strong>{value}</strong>
      {sub && <em>{sub}</em>}
    </span>
  )
}

function Metric({ label, value, sub, danger = false }: {
  label: string
  value: string
  sub?: string
  danger?: boolean
}) {
  return <div className={styles.metric} data-danger={danger}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>
}
