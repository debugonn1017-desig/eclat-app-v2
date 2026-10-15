'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { Customer } from '@/types'
import { groupCustomerCastOptions, type CustomerCastOption } from '@/lib/customerCastOptions'
import { fetchMe } from '@/lib/authCache'
import { C } from '@/lib/colors'
import { CUSTOMER_SEARCH_SORT_OPTIONS, getWeekdaySortCode, type CustomerSortKey, type CustomerVisitPattern } from '@/lib/customerVisitPattern'
import { createClient } from '@/lib/supabase/client'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { useViewMode } from '@/hooks/useViewMode'
import { useJstToday } from '@/hooks/useJstToday'
import { STAFF_STAR_VIEWS, STARRED_BANAI_VISIT_DAYS, type StaffStarView, type StarCounts, type StarNominationCount } from '@/lib/starredCustomers'
import { useCustomerListActions } from '@/hooks/useCustomerListActions'
import { useCustomerListScroll } from '@/hooks/useCustomerListScroll'
import PageHeader from '@/components/PageHeader'
import BottomNav from '@/components/BottomNav'
import CustomerActionCardShell from '@/components/CustomerActionCardShell'
import CompactCustomerCard from '@/components/CompactCustomerCard'
import CompactListField from '@/components/CompactListField'
import StaffStarsMenu from '@/components/StaffStarsMenu'
import { CustomerRecencyBadge } from '@/components/CustomerCardIndicators'
import CustomerVisitPatternSummary from '@/components/CustomerVisitPatternSummary'
import card from '@/app/casts/[id]/customer-cards.module.css'
import styles from './StaffStarsPage.module.css'

const CustomerDetailPanel = dynamic(() => import('@/components/CustomerDetailPanel'), { ssr: false })
const CastStarsWorkspace = dynamic(() => import('@/components/CastWorkspace'), { ssr: false, loading: () => <p role="status">キャストの⭐️を読み込み中…</p> })
type Profile = NonNullable<Awaited<ReturnType<typeof fetchMe>>>
type CastOption = CustomerCastOption
type StarCustomer = Customer & {
  metrics: {
    totalSpent: number; visitCount: number; avgPerVisit: number
    lastVisitDate: string | null; daysSinceLastVisit: number | null
    visitPattern: CustomerVisitPattern
  }
}
type Result = { customers: StarCustomer[]; total: number; pageCount: number; page: number }
const EMPTY: Result = { customers: [], total: 0, pageCount: 1, page: 1 }

export default function StaffStarsPage({ profile }: { profile: Profile }) {
  const canRead = profile.role === 'admin' && (profile.is_owner || profile.permissions?.['顧客.閲覧'] === true)
  const canManage = canRead && (profile.is_owner || profile.permissions?.['顧客.編集'] === true)
  const { isPC } = useViewMode()
  const [casts, setCasts] = useState<CastOption[]>([])
  const [castError, setCastError] = useState(false)
  const [castRevision, setCastRevision] = useState(0)
  const [castName, setCastName] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<CustomerSortKey>('lastVisitNewest')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<Result>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companions, setCompanions] = useState<Record<string, string>>({})
  const [companionError, setCompanionError] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openActions, setOpenActions] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [counts, setCounts] = useState<StarCounts | null>(null)
  const [countError, setCountError] = useState(false)
  const [countRevision, setCountRevision] = useState(0)
  const [view, setView] = useState<StaffStarView>('banai')
  const [visitDay, setVisitDay] = useState('')
  const [screen, setScreen] = useState<'menu' | 'today' | 'cast'>('menu')
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const today = useJstToday()
  const preserveCustomerScroll = useCustomerListScroll(data, loading, JSON.stringify([castName, keyword, sort, page, view, visitDay, screen]))
  const refresh = useCallback(() => { preserveCustomerScroll(); setRevision(value => value + 1) }, [preserveCustomerScroll])
  const actions = useCustomerListActions({ onRanksChanged: refresh })
  const navigationBusy = actions.busy || workspaceBusy
  const refreshStaffCounts = useCallback(() => setCountRevision(value => value + 1), [])
  const selectedCast = casts.find(c => c.is_active && c.cast_name === castName)
  const castLabels = useMemo(() => new Map(casts.map(c => [c.cast_name, c.display_name || c.cast_name])), [casts])
  const castGroups = useMemo(() => groupCustomerCastOptions(casts.filter(c => c.is_active)), [casts])
  const countText = (count: StarNominationCount | undefined) => count
    ? `本${count.honshimei}名・場${count.banai}名`
    : '本—名・場—名'
  const castCount = (name: string) => counts && Object.hasOwn(counts.byCast, name) ? counts.byCast[name] : counts ? { total: 0, honshimei: 0, banai: 0 } : undefined
  const targetCount = (name: string) => {
    if (screen === 'cast' && name) return `⭐️${castCount(name)?.total ?? '—'}名`
    const matched = counts?.matched
    if (!matched) return '対象—名'
    const count = name ? Object.hasOwn(matched.byCast, name) ? matched.byCast[name].total : 0 : matched.total.total
    return `対象${count}名`
  }
  const viewLabel = STAFF_STAR_VIEWS.find(option => option.value === view)!.label

  useEffect(() => {
    if (!canRead) return
    const controller = new AbortController()
    void (async () => {
      try {
        setCounts(null)
        const params = new URLSearchParams({ starredView: screen === 'menu' ? 'banai' : screen === 'cast' ? 'all' : view })
        if (screen === 'today' && view === 'banai' && visitDay) params.set('starredVisitDay', visitDay)
        if (screen === 'today' && keyword) params.set('keyword', keyword)
        const response = await fetch('/api/customers/star-counts?' + params, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('取得失敗')
        const json = await response.json() as StarCounts
        if (!controller.signal.aborted) { setCounts(json); setCountError(false) }
      } catch {
        if (!controller.signal.aborted) { setCounts(null); setCountError(true) }
      }
    })()
    return () => controller.abort()
  }, [canRead, revision, countRevision, view, visitDay, keyword, today, screen])

  useEffect(() => {
    if (!canRead) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/customers/cast-options', { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('取得失敗')
        const json = await response.json() as { casts: CastOption[] }
        if (!controller.signal.aborted) { setCasts(json.casts); setCastError(false) }
      } catch { if (!controller.signal.aborted) setCastError(true) }
    })()
    return () => controller.abort()
  }, [canRead, castRevision])

  useEffect(() => {
    if (!canRead || screen !== 'today') return
    const controller = new AbortController()
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ starred: 'true', starredView: view, page: String(page), pageSize: '50', sort })
        if (castName) params.set('castName', castName)
        else params.set('starredCastOrder', 'true')
        if (keyword) params.set('keyword', keyword)
        if (view === 'banai' && visitDay) params.set('starredVisitDay', visitDay)
        const response = await fetch('/api/customers/search?' + params, { signal: controller.signal, cache: 'no-store' })
        const json = await response.json() as Result & { error?: string }
        if (!response.ok) throw new Error(json.error || '⭐️のお客様を取得できませんでした')
        if (cancelled) return
        if (json.page > json.pageCount) { setPage(json.pageCount); return }
        // 最新の「お連れ様情報が入力された来店」を一括取得。顧客ごとのN+1を避ける。
        const nextCompanions: Record<string, string> = {}
        let failedCompanions = false
        if (json.customers.length) {
          try {
            const client = createClient()
            const visits = await fetchAllPaginated<{ customer_id: string | number; companion_honshimei: string | null; companion_banai: string | null }>((from, to) => {
              if (cancelled) throw new Error('取得を中止しました')
              return client.from('customer_visits')
                .select('customer_id,companion_honshimei,companion_banai')
                .in('customer_id', json.customers.map(c => c.id))
                .or('companion_honshimei.not.is.null,companion_banai.not.is.null')
                .order('visit_date', { ascending: false }).order('id', { ascending: false }).range(from, to)
            })
            for (const visit of visits) {
              const id = String(visit.customer_id)
              const hon = visit.companion_honshimei?.trim()
              const ban = visit.companion_banai?.trim()
              if (!nextCompanions[id] && (hon || ban)) nextCompanions[id] = [hon ? `本:${hon}` : '', ban ? `場:${ban}` : ''].filter(Boolean).join('・')
            }
          } catch { failedCompanions = true }
        }
        if (cancelled) return
        setData(json)
        setCompanions(nextCompanions)
        setCompanionError(failedCompanions)
        setSelectedIds(new Set())
        setOpenActions(null)
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : '取得に失敗しました')
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [canRead, castName, keyword, page, sort, revision, view, visitDay, today, screen])

  useEffect(() => {
    if (!selectedId) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedId(null) }
    window.addEventListener('keydown', handleKey)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', handleKey) }
  }, [selectedId])

  const resetList = () => {
    setPage(1); setData(EMPTY); setSelectedIds(new Set()); setSelectionMode(false); setOpenActions(null); setSelectedId(null)
  }
  const openList = (name: string) => {
    if (navigationBusy) return
    resetList(); setLoading(true); setCastName(name); setScreen(name ? 'cast' : 'today')
    setView(name ? 'all' : 'banai'); setVisitDay(''); setSort('lastVisitNewest'); setKeyword(''); setKeywordInput(''); setCounts(null)
  }
  const showMenu = () => { if (navigationBusy) return; resetList(); setScreen('menu'); setCounts(null) }
  const selectCast = (value: string) => { if (value !== castName || screen === 'menu') openList(value) }
  const toggleSelected = (id: string) => setSelectedIds(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const filterOptions = <>
    <option value="">本日確認・全キャスト{screen === 'today' ? `（${targetCount('')}）` : ''}</option>
    {castGroups.map(group => <optgroup key={group.key} label={`${group.tier}（${group.rows.length}人）`}>{group.rows.map(c => <option key={c.id} value={c.cast_name}>{c.display_name || c.cast_name}（{targetCount(c.cast_name)}）</option>)}</optgroup>)}
  </>
  const displaySections = (() => {
    const groups = new Map<string, StarCustomer[]>()
    for (const customer of data.customers) {
      const name = screen === 'today' ? customer.cast_name || '' : ''
      const rows = groups.get(name) ?? []
      rows.push(customer)
      groups.set(name, rows)
    }
    // 分類別に組み直すと来店日/金額順が崩れるため、担当内はAPIの並びを維持。
    return Array.from(groups).map(([name, customers]) => ({
      key: name,
      castLabel: screen === 'today' ? castLabels.get(name) || name || '担当未設定' : '',
      rows: customers,
    }))
  })()

  const statusMessages = <>
    {castError && <p role="alert">キャスト一覧を取得できませんでした。<button onClick={() => setCastRevision(v => v + 1)}>再取得</button></p>}
    {countError && <p role="alert">⭐️の人数を取得できませんでした。<button onClick={() => setCountRevision(v => v + 1)}>再取得</button></p>}
  </>
  if (canRead && screen === 'menu') return <div style={{ background: C.bg, minHeight: '100dvh' }}>
    <PageHeader title="⭐️のお客様" showBack={false} showBell={false}/>
    <div className={styles.menuStatus}>{statusMessages}</div>
    <StaffStarsMenu casts={casts} counts={counts} disabled={navigationBusy} onToday={() => openList('')} onCast={openList}/>
    <BottomNav/>
  </div>

  return <div className={isPC ? undefined : styles.mobile} style={{ background: C.bg, minHeight: '100dvh' }}>
    <PageHeader title="⭐️のお客様" showBack={false} showBell={false}/>
    {!canRead ? <p className={styles.message}>⭐️のお客様を見るには「顧客.閲覧」の権限が必要です。</p> : <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="キャストで絞り込み">
        <button className={styles.backToMenu} disabled={navigationBusy} onClick={showMenu}>← リスト一覧</button>
        <h2>表示するキャスト</h2>
        <button className={styles.castButton} aria-pressed={!castName} disabled={navigationBusy} onClick={() => openList('')}><span>本日確認</span><span className={styles.castCount}>全キャスト</span></button>
        {castGroups.map(group => <section key={group.key} aria-label={`${group.tier}のキャスト`}>
          <h2 className={styles.tierHeading}>{group.tier}<span>{group.rows.length}人</span></h2>
          {group.rows.map(c => <button key={c.id} className={styles.castButton} aria-pressed={castName === c.cast_name} disabled={navigationBusy} onClick={() => selectCast(c.cast_name)}><span>{c.display_name || c.cast_name}</span><span className={styles.castCount}>{targetCount(c.cast_name)}<small>⭐️ {countText(castCount(c.cast_name))}</small></span></button>)}
        </section>)}
        <p className={styles.countHint}>{screen === 'cast' ? '人数は⭐️全員分。本日連絡の対象人数はリスト内に表示します。' : '対象人数は表示・日数・検索条件に連動。小さい人数は⭐️全員分です。'}</p>
      </aside>
      <main className={styles.main}>
        <button className={`${styles.backToMenu} ${styles.mobileMenuBack}`} disabled={navigationBusy} onClick={showMenu}>← リスト一覧</button>
        <div className={styles.mobileFilter}><label>表示するキャスト<CompactListField compact={!isPC}><select aria-label="⭐️を表示するキャスト" value={castName} disabled={navigationBusy} onChange={e => selectCast(e.target.value)}>{filterOptions}</select></CompactListField></label></div>
        {statusMessages}
        <h1>{screen === 'today' ? '本日確認（全キャスト）' : `${castLabels.get(castName) || castName}の⭐️のお客様`}</h1>
        {screen === 'cast' ? selectedCast ? <CastStarsWorkspace key={selectedCast.id} castIdOverride={selectedCast.id} starsOnly starsListOnly
          onCustomerListChanged={refreshStaffCounts} onBusyChange={setWorkspaceBusy}/> : <p role="alert" className={styles.message}>キャストを選び直してください。</p> : <>
        <div className={styles.visitFilter}>
          <div className={styles.filterButtons} role="group" aria-label="⭐️の表示対象">{STAFF_STAR_VIEWS.map(option => <button key={option.value} type="button" aria-pressed={view === option.value} disabled={actions.busy} onClick={() => { if (view !== option.value) { resetList(); setView(option.value); setVisitDay('') } }}>{option.label}</button>)}</div>
          {view === 'banai' && <label className={styles.dayFilter}>最終来店から<CompactListField compact={!isPC}><select aria-label="場内の経過日数" value={visitDay} disabled={actions.busy} onChange={e => { resetList(); setVisitDay(e.target.value) }}><option value="">対象日まとめて</option>{STARRED_BANAI_VISIT_DAYS.map(days => <option key={days} value={days}>{days}日前のみ</option>)}</select></CompactListField></label>}
          <p>{view === 'banai' ? visitDay ? `最終来店が${visitDay}日前の⭐️場内のみ` : '⭐️場内の1日前・3の倍数（30日前まで）' : view === 'honshimei' ? '⭐️本指名を日数に関係なく表示' : '指名・日数に関係なく⭐️全員を表示'}</p>
          <span className={styles.countHint}>絞る前の⭐️全員分：{countText(castName ? castCount(castName) : counts?.total)}</span>
        </div>
        <form className={styles.controls} onSubmit={e => { e.preventDefault(); resetList(); setKeyword(keywordInput.trim()); refresh() }}>
          <label className={styles.search}>お客様を検索<CompactListField compact={!isPC}><input placeholder="名前・ニックネーム・ボトル名" value={keywordInput} disabled={actions.busy} onChange={e => setKeywordInput(e.target.value)}/></CompactListField></label>
          <button disabled={actions.busy}>検索</button>
          <label>並び替え<CompactListField compact={!isPC}><select value={sort} disabled={actions.busy} onChange={e => { resetList(); setSort(e.target.value as CustomerSortKey) }}>
            {CUSTOMER_SEARCH_SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.key === 'starred' ? '標準（累計売上順）' : o.key === 'lastVisitNewest' ? '経過日数が少ない順' : o.key === 'lastVisitOldest' ? '経過日数が多い順' : o.label}</option>)}
          </select></CompactListField></label>
          {canManage && <button type="button" disabled={loading || actions.busy} onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); setOpenActions(null) }}>{selectionMode ? '選択を終了' : '複数選択'}</button>}
        </form>
        <details className={styles.help}>
          <summary>表示条件・使い方</summary>
          <p>場内・対象日：最終来店から{STARRED_BANAI_VISIT_DAYS.join('・')}日前の⭐️場内のみ。2・4・5日前などは表示しません。本指名・⭐️全員へ切り替えできます。</p>
          {screen === 'today' && <p>管理で保存したキャスト順に、キャスト別で表示します。並び替えは各キャストのお客様内に適用されます。</p>}
          {!isPC && <p>長押し・「情報」でカード情報を表示</p>}
          <p>初期は経過日数が少ない順。対象人数は表示条件に連動し、⭐️本・場の人数は絞る前の全員分です。</p>
        </details>
        <div className={styles.resultCount} aria-live="polite">{loading ? '読み込み中…' : error ? '' : `${data.total}人${data.pageCount > 1 ? `（${(page - 1) * 50 + 1}〜${Math.min(page * 50, data.total)}人目を表示）` : ''}`}</div>
        {error ? <p role="alert" className={styles.message}>{error} <button onClick={refresh}>再読み込み</button></p> : <div aria-busy={loading}>
          {!loading && !data.customers.length && <p className={styles.message}>この条件に合う⭐️のお客様はいません。表示対象や日数・検索条件を変更してください。</p>}
          {displaySections.map(({ key, castLabel, rows }) => {
            return <section key={key}><h2 className={styles.category}>{castLabel && `${castLabel} ／ `}{viewLabel} · {rows.length}人{data.pageCount > 1 ? '（このページ）' : ''}</h2>
              <div className={isPC ? card.customerList : undefined}>{rows.map(customer => {
                const id = String(customer.id)
                const name = customer.customer_name || 'お名前未登録'
                const m = customer.metrics
                if (!isPC) return <CompactCustomerCard key={id}
                  customerId={id} customerName={name} customerRank={customer.customer_rank}
                  nomination={customer.nomination_status} averageSpend={m.avgPerVisit}
                  totalSales={m.totalSpent} daysSinceLast={m.daysSinceLastVisit}
                  assignedCastLabel={screen === 'today' ? castLabels.get(customer.cast_name || '') || customer.cast_name || '担当未設定' : undefined}
                  preview={{ nickname: customer.nickname, ageGroup: customer.age_group, region: customer.region,
                    assignedCast: castLabels.get(customer.cast_name || '') || customer.cast_name,
                    lastVisitDate: m.lastVisitDate, lastContactDate: customer.last_contact_date,
                    visitCount: m.visitCount, visitPattern: m.visitPattern, highlightWeekday: getWeekdaySortCode(sort),
                    companion: companionError ? '取得失敗' : companions[id] || '未登録' }}
                  isFollowUp={customer.is_starred === true} noReply={customer.no_reply === true}
                  canManage={canManage} busy={actions.busy || loading}
                  selectionMode={selectionMode} selected={selectedIds.has(id)} actionsOpen={openActions === id}
                  onOpen={() => setSelectedId(id)} onToggleSelected={() => toggleSelected(id)}
                  onToggleActions={() => setOpenActions(openActions === id ? null : id)}
                  onSetRank={() => { setOpenActions(null); actions.openRankEditor({ id, name, previousRank: customer.customer_rank ?? null }) }}
                  onAddFollowUp={() => { void actions.addToFollowUp([id]) }}
                  onRemoveFollowUp={() => { void actions.removeFromFollowUp([id]) }}
                  onToggleNoReply={() => { void actions.setNoReply([id], !customer.no_reply) }}
                  onMoveToSevered={() => { void actions.moveToSevered([{ id, name, previousRank: customer.customer_rank }]) }}/>
                const assigned = castLabels.get(customer.cast_name || '') || customer.cast_name || '担当未設定'
                return <CustomerActionCardShell key={id} customerId={id} customerName={name} customerRank={customer.customer_rank}
                  isFollowUp={customer.is_starred === true} noReply={customer.no_reply === true} canManage={canManage} busy={actions.busy || loading}
                  selectionMode={selectionMode} selected={selectedIds.has(id)} actionsOpen={openActions === id}
                  onOpen={() => setSelectedId(id)} onToggleSelected={() => toggleSelected(id)} onToggleActions={() => setOpenActions(openActions === id ? null : id)}
                  onSetRank={() => { setOpenActions(null); actions.openRankEditor({ id, name, previousRank: customer.customer_rank ?? null }) }}
                  onAddFollowUp={() => { void actions.addToFollowUp([id]) }} onRemoveFollowUp={() => { void actions.removeFromFollowUp([id]) }}
                  onToggleNoReply={() => { void actions.setNoReply([id], !customer.no_reply) }}
                  onMoveToSevered={() => { void actions.moveToSevered([{ id, name, previousRank: customer.customer_rank }]) }}>
                  <div className={`${styles.cardContent} ${card.cardButton} ${card.pcCard}`}>
                    <div className={`${card.cardMain} ${styles.pcMain}`}>
                      <section className={card.identity}>
                        <div className={card.nameRow}><button type="button" className={card.name} style={{ padding: 0, border: 0, background: 'none', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); if (selectionMode) toggleSelected(id); else setSelectedId(id) }}>{name}</button>{customer.nickname && <span className={card.nickname}>({customer.nickname})</span>}</div>
                        <div className={card.badges}>
                          <span className={`${card.badge} ${card.rankBadge}`} data-rank={customer.customer_rank || '未設定'}>{customer.customer_rank === '切れた' ? '💔 切れた' : `${customer.customer_rank || '未設定'}ランク`}</span>
                          <span className={`${card.badge} ${card.nominationBadge}`}>{customer.nomination_status || '指名未設定'}</span>
                          <span className={card.badge}>{customer.age_group || '年代未設定'}</span><span className={card.badge}>{customer.region || '地域未設定'}</span>
                        </div>
                        {customer.no_reply && <span className={card.miniStatus}>返信なし</span>}
                        <span className={styles.castLabel}>担当：{assigned}</span>
                      </section>
                      <>
                        <section className={card.metrics} aria-label="売上情報">{[['客単価', `¥${m.avgPerVisit.toLocaleString()}`], ['累計売上', `¥${m.totalSpent.toLocaleString()}`], ['累計回数', `${m.visitCount}回`]].map(([label, value]) => <span key={label} className={card.metric}><span className={card.metricLabel}>{label}</span><strong className={card.metricValue}>{value}</strong></span>)}</section>
                        <section className={`${card.pattern} ${styles.patternPanel}`}><CustomerVisitPatternSummary compact pattern={m.visitPattern} highlightWeekday={getWeekdaySortCode(sort)}/></section>
                        <section className={card.relationships}><CustomerRecencyBadge days={m.daysSinceLastVisit}/><span className={card.relationItem}><span className={card.relationLabel}>最終来店</span>{m.lastVisitDate || '未記録'}</span><span className={card.relationItem}><span className={card.relationLabel}>お連れ様</span>{companionError ? '取得失敗' : companions[id] || '未登録'}</span></section>
                      </>

                    </div>
                  </div>
                </CustomerActionCardShell>
              })}</div>
            </section>
          })}
        </div>}
        {data.pageCount > 1 && <nav aria-label="ページ切替" className={styles.pagination}><button disabled={loading || actions.busy || page === 1} onClick={() => setPage(v => v - 1)}>前へ</button>{page} / {data.pageCount}<button disabled={loading || actions.busy || page >= data.pageCount} onClick={() => setPage(v => v + 1)}>次へ</button></nav>}
        </>}
      </main>
    </div>}
    {canManage && selectionMode && <div className={styles.bulkBar}><span>{selectedIds.size}人選択</span><button disabled={actions.busy || loading} onClick={() => setSelectedIds(new Set(data.customers.map(c => String(c.id))))}>このページを全選択</button><button disabled={!selectedIds.size || actions.busy || loading} onClick={() => { void actions.removeFromFollowUp([...selectedIds]) }}>⭐️解除</button><button disabled={!selectedIds.size || actions.busy || loading} onClick={() => { void actions.setNoReply([...selectedIds], true) }}>返信なし</button><button disabled={!selectedIds.size || actions.busy || loading} onClick={() => { void actions.moveToSevered(data.customers.filter(c => selectedIds.has(String(c.id))).map(c => ({ id: String(c.id), name: c.customer_name || '', previousRank: c.customer_rank }))) }}>切れたにする</button></div>}
    {selectedId && <><div className={styles.backdrop}/><section role="dialog" aria-modal="true" aria-label="お客様詳細" className={styles.dialog}><div className={styles.dialogHeader}><button onClick={() => setSelectedId(null)}>← ⭐️一覧に戻る</button></div><CustomerDetailPanel key={selectedId} customerId={selectedId} isPC={isPC} isAdmin onCustomerUpdated={() => { setSelectedId(null); refresh() }}/></section></>}
    {actions.ToastView}
    <BottomNav/>
  </div>
}
