'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import Spinner from '@/components/ui/Spinner'
import {
  CUSTOMER_STAFF_RANK_GROUPS,
  filterCustomerStaffCustomers,
  getCustomerStaffRankGroup,
  groupCustomerStaffCustomers,
  sortCustomerStaffCustomers,
  type CustomerStaffListRow,
  type CustomerStaffNominationFilter,
  type CustomerStaffRankFilter,
  type CustomerStaffRegionFilter,
  type CustomerStaffSortKey,
} from '@/lib/customerStaffList'
import styles from './page.module.css'

type PageTab = 'customers' | 'sales'

type CustomerRow = CustomerStaffListRow & {
  cast_name: string | null
  monthly_sales: number
  monthly_visits: number
}

type StaffPageData = {
  staff: { id: string; display_name: string }
  month: string
  summary: { customerCount: number; monthlySales: number; monthlyVisits: number }
  customers: CustomerRow[]
}

const RANK_LABELS: Record<(typeof CUSTOMER_STAFF_RANK_GROUPS)[number], string> = {
  S: 'Sランク', A: 'Aランク', B: 'Bランク', C: 'Cランク',
  切れた: '切れたお客様', 未設定: 'ランク未設定',
}

const SORT_OPTIONS: ReadonlyArray<{ value: CustomerStaffSortKey; label: string }> = [
  { value: 'standard', label: '標準（担当追加順）' },
  { value: 'totalSpent', label: '累計売上が高い順' },
  { value: 'visitCount', label: '来店回数が多い順' },
  { value: 'avgSpend', label: '客単価が高い順' },
  { value: 'lastVisitNewest', label: '最終来店が新しい順' },
  { value: 'lastVisitOldest', label: '最終来店が古い順' },
  { value: 'name', label: 'お客様名順' },
]

function currentJstMonth() {
  return new Date().toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit',
  }).slice(0, 7)
}

function currentJstDate() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${year}年${monthNumber}月`
}

function yen(value: number) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency', currency: 'JPY', maximumFractionDigits: 0,
  }).format(value)
}

function compactYen(value: number) {
  if (value < 10_000) return yen(value)
  const man = value / 10_000
  const rounded = man < 100 && !Number.isInteger(man)
    ? Math.round(man * 10) / 10
    : Math.round(man)
  return `${rounded.toLocaleString('ja-JP')}万円`
}

function shortDate(value: string | null) {
  if (!value) return '未記録'
  const [, month, day] = value.split('-')
  return `${Number(month)}/${Number(day)}`
}

function elapsedDays(value: string | null): number | null {
  if (!value) return null
  const today = Date.parse(`${currentJstDate()}T00:00:00+09:00`)
  const target = Date.parse(`${value}T00:00:00+09:00`)
  if (!Number.isFinite(target)) return null
  return Math.max(0, Math.floor((today - target) / 86_400_000))
}

export default function CustomerStaffPage() {
  const params = useParams<{ staffId: string }>()
  const staffId = params.staffId
  const [month, setMonth] = useState(currentJstMonth)
  const [activeTab, setActiveTab] = useState<PageTab>('customers')
  const [data, setData] = useState<StaffPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [rankFilter, setRankFilter] = useState<CustomerStaffRankFilter>('all')
  const [nominationFilter, setNominationFilter] = useState<CustomerStaffNominationFilter>('all')
  const [regionFilter, setRegionFilter] = useState<CustomerStaffRegionFilter>('all')
  const [sortKey, setSortKey] = useState<CustomerStaffSortKey>('standard')
  const [openRankGroups, setOpenRankGroups] = useState<Set<string>>(
    () => new Set(CUSTOMER_STAFF_RANK_GROUPS),
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/customer-staff/${encodeURIComponent(staffId)}?month=${month}`, {
        cache: 'no-store',
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json?.error || '読み込みに失敗しました')
      setData(json as StaffPageData)
    } catch (loadError) {
      setData(null)
      setError(loadError instanceof Error ? loadError.message : '読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [month, staffId])

  useEffect(() => { void load() }, [load])

  const filters = useMemo(() => ({
    query, rank: rankFilter, nomination: nominationFilter, region: regionFilter,
  }), [nominationFilter, query, rankFilter, regionFilter])

  const filteredCustomers = useMemo(() => (
    filterCustomerStaffCustomers(data?.customers ?? [], filters)
  ), [data?.customers, filters])

  const rankGroups = useMemo(() => (
    groupCustomerStaffCustomers(filteredCustomers)
      .map(group => ({ ...group, items: sortCustomerStaffCustomers(group.items, sortKey) }))
      .filter(group => group.items.length > 0)
  ), [filteredCustomers, sortKey])

  const rankCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const group of groupCustomerStaffCustomers(data?.customers ?? [])) {
      counts.set(group.rank, group.items.length)
    }
    return counts
  }, [data?.customers])

  const salesRows = useMemo(() => (
    [...(data?.customers ?? [])].sort((a, b) => (
      b.monthly_sales - a.monthly_sales || b.monthly_visits - a.monthly_visits
    ))
  ), [data?.customers])

  const filtersActive = Boolean(
    query.trim() || rankFilter !== 'all' || nominationFilter !== 'all'
    || regionFilter !== 'all' || sortKey !== 'standard',
  )
  const groupsForcedOpen = Boolean(
    query.trim() || rankFilter !== 'all' || nominationFilter !== 'all' || regionFilter !== 'all',
  )

  const resetFilters = () => {
    setQuery('')
    setRankFilter('all')
    setNominationFilter('all')
    setRegionFilter('all')
    setSortKey('standard')
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/casts" className={styles.backLink}>← キャスト一覧へ戻る</Link>
          <div className={styles.titleRow}>
            <div className={styles.titleBlock}>
              <p>お客様担当</p>
              <h1>{data?.staff.display_name ?? '読み込み中…'}</h1>
            </div>
            <span className={styles.staffOnlyBadge}>黒服専用</span>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.summaryGrid}>
          {[
            ['担当顧客', `${data?.summary.customerCount ?? 0}人`],
            ['今月の売上', yen(data?.summary.monthlySales ?? 0)],
            ['今月の来店', `${data?.summary.monthlyVisits ?? 0}回`],
          ].map(([label, value]) => (
            <div key={label} className={styles.summaryCard}>
              <p>{label}</p>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className={styles.pageTabs}>
          {([
            ['customers', '担当顧客'],
            ['sales', '売上・来店'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={activeTab === key ? styles.activePageTab : ''}
            >{label}</button>
          ))}
        </div>

        {activeTab === 'sales' && (
          <div className={styles.monthPicker}>
            <button type="button" onClick={() => setMonth(value => shiftMonth(value, -1))}>‹</button>
            <strong>{monthLabel(month)}</strong>
            <button type="button" onClick={() => setMonth(value => shiftMonth(value, 1))}>›</button>
          </div>
        )}

        {activeTab === 'customers' && !loading && !error && (
          <section className={styles.filterPanel} aria-label="担当顧客の絞り込みと並び替え">
            <div className={styles.filterHeading}>
              <div>
                <strong>担当顧客を探す</strong>
                <span>{filteredCustomers.length} / {data?.customers.length ?? 0}人を表示</span>
              </div>
              {filtersActive && <button type="button" onClick={resetFilters}>条件をリセット</button>}
            </div>
            <div className={styles.filterGrid}>
              <label className={styles.searchField}>
                <span>名前・ニックネーム・ボトル名</span>
                <div>
                  <span aria-hidden>🔍</span>
                  <input
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="お客様を検索"
                    autoComplete="off"
                  />
                  {query && <button type="button" onClick={() => setQuery('')} aria-label="検索を消す">×</button>}
                </div>
              </label>
              <FilterSelect
                label="お客様ランク"
                value={rankFilter}
                onChange={value => setRankFilter(value as CustomerStaffRankFilter)}
                options={[
                  ['all', 'すべてのランク'],
                  ...CUSTOMER_STAFF_RANK_GROUPS.map(rank => [
                    rank, `${RANK_LABELS[rank]}（${rankCounts.get(rank) ?? 0}人）`,
                  ] as const),
                ]}
              />
              <FilterSelect
                label="指名状況"
                value={nominationFilter}
                onChange={value => setNominationFilter(value as CustomerStaffNominationFilter)}
                options={[
                  ['all', 'すべての指名状況'], ['本指名', '本指名'], ['場内', '場内'],
                  ['フリー', 'フリー'], ['other', '未設定・その他'],
                ]}
              />
              <FilterSelect
                label="地域"
                value={regionFilter}
                onChange={value => setRegionFilter(value as CustomerStaffRegionFilter)}
                options={[
                  ['all', 'すべての地域'], ['fukuoka', '福岡県'],
                  ['outside', '県外'], ['unset', '地域未設定'],
                ]}
              />
              <FilterSelect
                label="カテゴリ内の並び替え"
                value={sortKey}
                onChange={value => setSortKey(value as CustomerStaffSortKey)}
                options={SORT_OPTIONS.map(option => [option.value, option.label])}
              />
            </div>
          </section>
        )}

        {loading ? (
          <div className={styles.loading}><Spinner size="sm" label="読み込み中…" /></div>
        ) : error ? (
          <div className={styles.errorCard}>
            <p>{error}</p>
            <button type="button" onClick={() => void load()}>再読み込み</button>
          </div>
        ) : activeTab === 'customers' ? (
          <section className={styles.customerGroups}>
            {(data?.customers ?? []).length === 0 ? (
              <Empty message="担当顧客はまだいません" />
            ) : rankGroups.length === 0 ? (
              <Empty message="条件に合う担当顧客はいません" />
            ) : rankGroups.map(group => {
              const forcedOpen = groupsForcedOpen
              const isOpen = forcedOpen || openRankGroups.has(group.rank)
              return (
                <section key={group.rank} className={styles.rankSection} data-rank={group.rank}>
                  <button
                    type="button"
                    className={styles.rankHeading}
                    onClick={() => {
                      if (forcedOpen) return
                      setOpenRankGroups(previous => {
                        const next = new Set(previous)
                        if (next.has(group.rank)) next.delete(group.rank)
                        else next.add(group.rank)
                        return next
                      })
                    }}
                    aria-expanded={isOpen}
                  >
                    <span className={styles.rankChevron}>{isOpen ? '▼' : '▶'}</span>
                    <span>{RANK_LABELS[group.rank]}</span>
                    <small>— {group.items.length}人</small>
                  </button>
                  {isOpen && (
                    <div className={styles.customerList}>
                      {group.items.map(customer => (
                        <CustomerCard key={customer.id} customer={customer} mode="customers" />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </section>
        ) : (
          <section className={styles.salesList}>
            {salesRows.length === 0 ? (
              <Empty message="対象の顧客はまだいません" />
            ) : salesRows.map(customer => (
              <CustomerCard key={customer.id} customer={customer} mode="sales" />
            ))}
          </section>
        )}
      </main>
      <BottomNav />
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: ReadonlyArray<readonly [string, string]>
  onChange: (value: string) => void
}) {
  return (
    <label className={styles.selectField}>
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  )
}

function CustomerCard({ customer, mode }: { customer: CustomerRow; mode: PageTab }) {
  const days = elapsedDays(customer.last_visit_date)
  const rank = getCustomerStaffRankGroup(customer.customer_rank)
  const rankLabel = rank === '切れた'
    ? '切れた'
    : rank === '未設定' ? 'ランク未設定' : `${rank}ランク`
  const recency = days === null
    ? 'none'
    : days <= 30 ? 'good' : days <= 60 ? 'watch' : days <= 90 ? 'caution' : 'overdue'

  return (
    <Link href={`/customer/${customer.id}`} prefetch={false} className={styles.customerCard} data-rank={rank}>
      <section className={styles.customerIdentity}>
        <div className={styles.customerNameRow}>
          <strong>{customer.customer_name || 'お名前未登録'}</strong>
          {customer.nickname && <span>（{customer.nickname}）</span>}
        </div>
        <div className={styles.customerBadges}>
          <span className={styles.rankBadge} data-rank={rank}>{rankLabel}</span>
          <span>{customer.nomination_status || '指名未設定'}</span>
          <span>{customer.region?.trim() || '地域未設定'}</span>
        </div>
        <p className={styles.castLine}>担当キャスト：{customer.cast_name || '未設定'}</p>
      </section>

      <section className={styles.moneyPanel} aria-label="売上情報">
        <span>{mode === 'sales' ? '今月売上' : '累計売上'}</span>
        <strong>{compactYen(mode === 'sales' ? customer.monthly_sales : customer.total_spent)}</strong>
        <small>
          {mode === 'sales'
            ? `今月 ${customer.monthly_visits}回来店`
            : `客単価 ${compactYen(customer.avg_per_visit)}`}
        </small>
      </section>

      <section className={styles.visitPanel} aria-label="来店情報">
        <span>最終来店</span>
        <div>
          <strong>{shortDate(customer.last_visit_date)}</strong>
          <b data-recency={recency}>{days === null ? '未記録' : `${days}日前`}</b>
        </div>
        <small>累計 {customer.visit_count}回来店</small>
      </section>

      <span className={styles.cardArrow} aria-hidden>›</span>
    </Link>
  )
}

function Empty({ message }: { message: string }) {
  return <div className={styles.empty}>{message}</div>
}
