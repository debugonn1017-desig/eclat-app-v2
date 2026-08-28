'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import BottomNav from '@/components/BottomNav'
import CustomerVisitPatternSummary from '@/components/CustomerVisitPatternSummary'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/ui/Spinner'
import { useViewMode } from '@/hooks/useViewMode'
import { CAST_TIERS } from '@/types'
import type {
  CastIssueRegionGroup,
  OverdueHonshimeiCustomer,
  RecentBanaiCustomer,
  RecentHonshimeiCustomer,
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
}

type PageData = {
  period: { start: string; end: string }
  casts: CastOption[]
  selected_cast: CastOption | null
  summary: {
    four_week_customer_count: number
    four_week_sales: number
    overdue_customer_count: number
    banai_acquired_count: number
    target_sales: number
    target_work_days: number
    current_work_days: number
  }
  sections: {
    recent_honshimei: RecentHonshimeiCustomer[]
    overdue_honshimei: OverdueHonshimeiCustomer[]
    recent_banai: RecentBanaiCustomer[]
  }
}

type SectionKey = keyof PageData['sections']
type IssueCustomer = RecentHonshimeiCustomer | OverdueHonshimeiCustomer | RecentBanaiCustomer

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
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(
    () => new Set(['recent_honshimei', 'overdue_honshimei', 'recent_banai']),
  )
  const [customerId, setCustomerId] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const hasLoadedRef = useRef(false)

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
  }, [selectedCastId])

  useEffect(() => {
    if (!customerId) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCustomerId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [customerId])

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

  const toggleSection = (key: SectionKey) => {
    setOpenSections(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="課題見える化シート"
        subtitle="キャストの現状確認"
        backFallback="/admin/casts"
        actions={periodLabel ? <span className={styles.periodBadge}>対象期間 {periodLabel}</span> : null}
      />

      <main className={styles.main}>
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
                        <button
                          key={cast.id}
                          type="button"
                          onClick={() => setSelectedCastId(cast.id)}
                          className={effectiveSelectedId === cast.id ? styles.activeCast : ''}
                        >
                          <span>{displayName(cast).slice(0, 1)}</span>
                          <strong>{displayName(cast)}</strong>
                          <b aria-hidden>›</b>
                        </button>
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
                  <CastSummaryHeader data={data} />
                  {(['recent_honshimei', 'overdue_honshimei', 'recent_banai'] as const).map(key => (
                    <IssueSection
                      key={key}
                      sectionKey={key}
                      items={data.sections[key]}
                      open={openSections.has(key)}
                      onToggle={() => toggleSection(key)}
                      onOpenCustomer={setCustomerId}
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
      <BottomNav />
    </div>
  )
}

function CastSummaryHeader({ data }: { data: PageData }) {
  const cast = data.selected_cast
  if (!cast) return null
  const summaryItems = [
    ['4週来店人数', `${data.summary.four_week_customer_count}人`],
    ['周期遅れ', `${data.summary.overdue_customer_count}人`],
    ['4週売上', compactYen(data.summary.four_week_sales)],
    ['場内獲得', `${data.summary.banai_acquired_count}人`],
  ]
  return (
    <section className={styles.castSummary}>
      <div className={styles.castIdentity}>
        <span>{displayName(cast).slice(0, 1)}</span>
        <div><small>{cast.cast_tier || '層未設定'}</small><h1>{displayName(cast)}</h1></div>
      </div>
      <div className={styles.summaryMetrics}>
        {summaryItems.map(([label, value]) => (
          <div key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </div>
      <div className={styles.targetMetrics}>
        <div>
          <span>設定売上</span>
          <strong>{data.summary.target_sales > 0 ? compactYen(data.summary.target_sales) : '未設定'}</strong>
        </div>
        <div>
          <span>設定出勤</span>
          <strong>{data.summary.target_work_days > 0 ? `${data.summary.target_work_days}日` : '未設定'}</strong>
          <small>今月 {data.summary.current_work_days}日</small>
        </div>
      </div>
    </section>
  )
}

function IssueSection({ sectionKey, items, open, onToggle, onOpenCustomer }: {
  sectionKey: SectionKey
  items: IssueCustomer[]
  open: boolean
  onToggle: () => void
  onOpenCustomer: (id: string) => void
}) {
  const meta = SECTION_META[sectionKey]
  return (
    <section className={styles.issueSection} data-tone={meta.tone}>
      <button type="button" className={styles.sectionHeader} onClick={onToggle} aria-expanded={open}>
        <span className={styles.sectionChevron}>{open ? '▼' : '▶'}</span>
        <span><strong>{meta.title}</strong><small>{meta.description}</small></span>
        <b>{items.length}人</b>
      </button>
      {open && (
        <div className={styles.regionGroups}>
          {REGION_ORDER.map(region => {
            const regionItems = items.filter(item => item.region_group === region.key)
            return (
              <section key={region.key} className={styles.regionGroup}>
                <header><strong>{region.label}</strong><span>{regionItems.length}人</span></header>
                {regionItems.length === 0 ? (
                  <div className={styles.regionEmpty}>該当するお客様はいません</div>
                ) : (
                  <div className={styles.customerRows}>
                    {regionItems.map(item => (
                      <CustomerIssueRow
                        key={item.id}
                        item={item}
                        sectionKey={sectionKey}
                        onOpen={() => onOpenCustomer(item.id)}
                      />
                    ))}
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

function CustomerIssueRow({ item, sectionKey, onOpen }: {
  item: IssueCustomer
  sectionKey: SectionKey
  onOpen: () => void
}) {
  const companion = [
    item.latest_companion_honshimei ? `本:${item.latest_companion_honshimei}` : '',
    item.latest_companion_banai ? `場:${item.latest_companion_banai}` : '',
  ].filter(Boolean).join('・') || '未登録'
  const customerStaff = item.customer_staff_names.length > 0
    ? item.customer_staff_names.join('・')
    : item.has_customer_staff ? '担当者名未設定' : 'なし'
  const followUp = item.follow_up_active
    ? item.follow_up_next_actions.length > 0
      ? item.follow_up_next_actions.join('・')
      : '行動未設定'
    : '未登録'

  return (
    <button type="button" className={styles.customerRow} onClick={onOpen}>
      <div className={styles.customerIdentity}>
        <div className={styles.customerNameRow}>
          <strong>{customerName(item)}</strong>
          {item.nickname && item.customer_name && <small>（{item.nickname}）</small>}
        </div>
        <div className={styles.customerBadges}>
          <span data-rank={item.customer_rank || '未設定'}>{item.customer_rank ? `${item.customer_rank}ランク` : 'ランク未設定'}</span>
          <span>{item.nomination_status || '指名未設定'}</span>
          <span>{item.age_group || '年代未設定'}</span>
          <span>{item.region?.trim() || '地域未設定'}</span>
          {item.follow_up_active && <span className={styles.followBadge}>追いかけ中</span>}
        </div>
        <div className={styles.recencyRow}>
          <strong>
            最終来店 {item.lifetime_days_since_last_visit === null
              ? '未記録'
              : `${item.lifetime_days_since_last_visit}日前`}
          </strong>
          <span>
            最終連絡 {item.last_contact_date ? shortDate(item.last_contact_date) : '未記録'}
          </span>
        </div>
      </div>

      <div className={styles.lifetimeMetrics} aria-label="累計の来店・売上情報">
        <Metric label="来店" value={`${item.lifetime_visit_count}回`} />
        <Metric label="累計" value={compactYen(item.lifetime_sales)} />
        <Metric label="客単価" value={compactYen(item.lifetime_average_spend)} />
      </div>

      <div className={styles.visitPattern}>
        <CustomerVisitPatternSummary pattern={item.visit_pattern} compact />
      </div>

      <div className={styles.relationships}>
        <Relation label="お連れ様" value={companion} />
        <Relation label="お客様担当" value={customerStaff} />
        <Relation
          label="追いかけ"
          value={followUp}
          accent={item.follow_up_active}
          sub={item.follow_up_return_visit_deadline
            ? `再来店期限 ${shortDate(item.follow_up_return_visit_deadline)}`
            : undefined}
        />
      </div>

      <div className={styles.issueMetrics} data-section={sectionKey}>
        {sectionKey === 'recent_honshimei' && (
          <>
            <Metric label="4週来店" value={`${(item as RecentHonshimeiCustomer).four_week_visits}回`} />
            <Metric label="4週売上" value={compactYen((item as RecentHonshimeiCustomer).four_week_sales)} />
            <Metric label="4週客単価" value={compactYen((item as RecentHonshimeiCustomer).average_spend)} />
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
            <Metric label="追いかけ" value={item.follow_up_active ? '追加済み' : '未追加'} danger={!item.follow_up_active} />
          </>
        )}
      </div>
      <span className={styles.rowArrow} aria-hidden>›</span>
    </button>
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
