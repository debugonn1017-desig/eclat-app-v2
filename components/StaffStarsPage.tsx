'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { Customer } from '@/types'
import { fetchMe } from '@/lib/authCache'
import { C } from '@/lib/colors'
import { classifyCustomersTab } from '@/lib/customerCategory'
import { CUSTOMER_SEARCH_SORT_OPTIONS, getWeekdaySortCode, type CustomerSortKey, type CustomerVisitPattern } from '@/lib/customerVisitPattern'
import { createClient } from '@/lib/supabase/client'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { useViewMode } from '@/hooks/useViewMode'
import { useJstToday } from '@/hooks/useJstToday'
import { STARRED_BANAI_VISIT_DAYS, type StarCounts, type StarNominationCount } from '@/lib/starredCustomers'
import { useCustomerListActions } from '@/hooks/useCustomerListActions'
import PageHeader from '@/components/PageHeader'
import BottomNav from '@/components/BottomNav'
import CustomerActionCardShell from '@/components/CustomerActionCardShell'
import { CustomerRecencyBadge } from '@/components/CustomerCardIndicators'
import CustomerVisitPatternSummary from '@/components/CustomerVisitPatternSummary'
import card from '@/app/casts/[id]/customer-cards.module.css'
import styles from './StaffStarsPage.module.css'

const CustomerDetailPanel = dynamic(() => import('@/components/CustomerDetailPanel'), { ssr: false })
type Profile = NonNullable<Awaited<ReturnType<typeof fetchMe>>>
type CastOption = { id: string; cast_name: string; display_name: string | null; is_active: boolean }
type StarCustomer = Customer & {
  metrics: {
    totalSpent: number; visitCount: number; avgPerVisit: number
    lastVisitDate: string | null; daysSinceLastVisit: number | null
    visitPattern: CustomerVisitPattern
  }
}
type Result = { customers: StarCustomer[]; total: number; pageCount: number; page: number }
const EMPTY: Result = { customers: [], total: 0, pageCount: 1, page: 1 }
const CATEGORIES = ['県内顧客', '県外顧客', 'ランクC', 'その他', '場内', 'フリー', '切れた']
const WEEKDAY_NAMES: Record<number, string> = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土', 7: '日' }
const compactYen = (value: number) => value < 10000
  ? `¥${value.toLocaleString()}`
  : `${(value / 10000).toLocaleString('ja-JP', { maximumFractionDigits: value >= 1000000 ? 0 : 1 })}万円`

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
  const [sort, setSort] = useState<CustomerSortKey>('starred')
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
  const [banaiVisitDaysOnly, setBanaiVisitDaysOnly] = useState(true)
  const today = useJstToday()
  const refresh = useCallback(() => { setRevision(value => value + 1) }, [])
  const actions = useCustomerListActions({ onRanksChanged: refresh })
  const castLabels = useMemo(() => new Map(casts.map(c => [c.cast_name, c.display_name || c.cast_name])), [casts])
  const countText = (count: StarNominationCount | undefined) => count
    ? `本${count.honshimei}名・場${count.banai}名`
    : '本—名・場—名'
  const castCount = (name: string) => counts && Object.hasOwn(counts.byCast, name) ? counts.byCast[name] : counts ? { total: 0, honshimei: 0, banai: 0 } : undefined

  useEffect(() => {
    if (!canRead) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/customers/star-counts', { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('取得失敗')
        const json = await response.json() as StarCounts
        if (!controller.signal.aborted) { setCounts(json); setCountError(false) }
      } catch {
        if (!controller.signal.aborted) { setCounts(null); setCountError(true) }
      }
    })()
    return () => controller.abort()
  }, [canRead, revision, countRevision])

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
    if (!canRead) return
    const controller = new AbortController()
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ starred: 'true', page: String(page), pageSize: '50', sort })
        if (castName) params.set('castName', castName)
        if (keyword) params.set('keyword', keyword)
        if (banaiVisitDaysOnly) params.set('starredBanaiVisitDays', 'true')
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
  }, [canRead, castName, keyword, page, sort, revision, banaiVisitDaysOnly, today])

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
  const selectCast = (value: string) => { if (value !== castName) { resetList(); setCastName(value) } }
  const toggleSelected = (id: string) => setSelectedIds(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const filterOptions = <>
    <option value="">全キャスト（{countText(counts?.total)}）</option>
    <optgroup label="在籍キャスト">{casts.filter(c => c.is_active).map(c => <option key={c.id} value={c.cast_name}>{c.display_name || c.cast_name}（{countText(castCount(c.cast_name))}）</option>)}</optgroup>
  </>

  return <div className={isPC ? undefined : styles.mobile} style={{ background: C.bg, minHeight: '100dvh' }}>
    <PageHeader title="⭐️のお客様" showBack={false} showBell={false}/>
    {!canRead ? <p className={styles.message}>⭐️のお客様を見るには「顧客.閲覧」の権限が必要です。</p> : <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="キャストで絞り込み">
        <h2>表示するキャスト</h2>
        <button className={styles.castButton} aria-pressed={!castName} disabled={actions.busy} onClick={() => selectCast('')}><span>⭐️ 全キャスト</span><span className={styles.castCount}>{countText(counts?.total)}</span></button>
        <section>
          <h2 style={{ marginTop: 20 }}>在籍キャスト</h2>
          {casts.filter(c => c.is_active).map(c => <button key={c.id} className={styles.castButton} aria-pressed={castName === c.cast_name} disabled={actions.busy} onClick={() => selectCast(c.cast_name)}><span>{c.display_name || c.cast_name}</span><span className={styles.castCount}>{countText(castCount(c.cast_name))}</span></button>)}
        </section>
        <p className={styles.countHint}>人数は日数・検索で絞る前の⭐️全員分です。</p>
      </aside>
      <main className={styles.main}>
        <div className={styles.mobileFilter}><label>⭐️を表示するキャスト<select aria-label="⭐️を表示するキャスト" value={castName} disabled={actions.busy} onChange={e => selectCast(e.target.value)}>{filterOptions}</select></label></div>
        {castError && <p role="alert">キャスト一覧を取得できませんでした。<button onClick={() => setCastRevision(v => v + 1)}>再取得</button></p>}
        {countError && <p role="alert">⭐️の人数を取得できませんでした。<button onClick={() => setCountRevision(v => v + 1)}>再取得</button></p>}
        <h1>{castName ? castLabels.get(castName) || castName : '全キャスト'}の⭐️のお客様</h1>
        <div className={styles.visitFilter}>
          <span className={styles.filterTitle}>場内の来店日数</span>
          <div className={styles.filterButtons}>{[{ value: true, label: '日数対象のみ' }, { value: false, label: '全て' }].map(option => <button key={option.label} type="button" aria-pressed={banaiVisitDaysOnly === option.value} disabled={actions.busy} onClick={() => { if (banaiVisitDaysOnly !== option.value) { resetList(); setBanaiVisitDaysOnly(option.value) } }}>{option.label}</button>)}</div>
          <p>{banaiVisitDaysOnly ? `最終来店から${STARRED_BANAI_VISIT_DAYS.join('・')}日前の場内のみ。` : '場内を日数に関係なく表示します。'}本指名は全員表示します。</p>
          <span className={styles.countHint}>⭐️全員分：{countText(castName ? castCount(castName) : counts?.total)}</span>
        </div>
        <form className={styles.controls} onSubmit={e => { e.preventDefault(); resetList(); setKeyword(keywordInput.trim()); refresh() }}>
          <label className={styles.search}>お客様を検索<input placeholder="名前・ニックネーム・ボトル名" value={keywordInput} disabled={actions.busy} onChange={e => setKeywordInput(e.target.value)}/></label>
          <button disabled={actions.busy}>検索</button>
          <label>並び替え<select value={sort} disabled={actions.busy} onChange={e => { resetList(); setSort(e.target.value as CustomerSortKey) }}>
            {CUSTOMER_SEARCH_SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.key === 'starred' ? '標準' : o.label}</option>)}
          </select></label>
          {canManage && <button type="button" disabled={loading || actions.busy} onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); setOpenActions(null) }}>{selectionMode ? '選択を終了' : '複数選択'}</button>}
        </form>
        <div aria-live="polite">{loading ? '読み込み中…' : error ? '' : `${data.total}人${data.pageCount > 1 ? `（${(page - 1) * 50 + 1}〜${Math.min(page * 50, data.total)}人目を表示）` : ''}`}</div>
        {error ? <p role="alert" className={styles.message}>{error} <button onClick={refresh}>再読み込み</button></p> : <div aria-busy={loading}>
          {!loading && !data.customers.length && <p className={styles.message}>{keyword ? 'この条件に合う⭐️のお客様はいません。' : '⭐️を付けたお客様はまだいません。'}</p>}
          {CATEGORIES.map(category => {
            const rows = data.customers.filter(c => (classifyCustomersTab(c) ?? 'その他') === category)
            if (!rows.length) return null
            return <section key={category}><h2 className={styles.category}>{category === '切れた' ? '💔 切れたお客様' : category} · {rows.length}人{data.pageCount > 1 ? '（このページ）' : ''}</h2>
              <div className={card.customerList}>{rows.map(customer => {
                const id = String(customer.id)
                const name = customer.customer_name || 'お名前未登録'
                const m = customer.metrics
                const assigned = castLabels.get(customer.cast_name || '') || customer.cast_name || '担当未設定'
                const weekday = getWeekdaySortCode(sort)
                const weekdays = m.visitPattern.weekdayCodes.slice(0, 2).map(code => WEEKDAY_NAMES[code]).filter(Boolean).join('・')
                const visitLabel = weekday !== null
                  ? `${WEEKDAY_NAMES[weekday]}曜 ${m.visitPattern.weekdayStats?.[weekday]?.count ?? 0}回`
                  : weekdays ? `${weekdays}曜` : '曜日未登録'
                const timeLabel = m.visitPattern.earlyHour === null ? '時間未登録' : `${m.visitPattern.earlyHour}時台`
                return <CustomerActionCardShell key={id} customerId={id} customerName={name} customerRank={customer.customer_rank}
                  isFollowUp={customer.is_starred === true} noReply={customer.no_reply === true} canManage={canManage} busy={actions.busy || loading}
                  selectionMode={selectionMode} selected={selectedIds.has(id)} actionsOpen={openActions === id}
                  onOpen={() => setSelectedId(id)} onToggleSelected={() => toggleSelected(id)} onToggleActions={() => setOpenActions(openActions === id ? null : id)}
                  onAddFollowUp={() => { void actions.addToFollowUp([id]) }} onRemoveFollowUp={() => { void actions.removeFromFollowUp([id]) }}
                  onToggleNoReply={() => { void actions.setNoReply([id], !customer.no_reply) }}
                  onMoveToSevered={() => { void actions.moveToSevered([{ id, name, previousRank: customer.customer_rank }]) }}>
                  <div className={`${styles.cardContent} ${card.cardButton} ${isPC ? card.pcCard : card.mobileCard}`}>
                    <div className={`${card.cardMain} ${isPC ? styles.pcMain : ''}`}>
                      <section className={isPC ? card.identity : card.mobileIdentity}>
                        <div className={card.nameRow}><button type="button" className={card.name} style={{ padding: 0, border: 0, background: 'none', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); if (selectionMode) toggleSelected(id); else setSelectedId(id) }}>{name}</button>{customer.nickname && <span className={card.nickname}>({customer.nickname})</span>}</div>
                        <div className={isPC ? card.badges : card.mobileBadges}>
                          <span className={`${card.badge} ${card.rankBadge}`} data-rank={customer.customer_rank || '未設定'}>{customer.customer_rank === '切れた' ? '💔 切れた' : `${customer.customer_rank || '未設定'}ランク`}</span>
                          <span className={`${card.badge} ${card.nominationBadge}`}>{customer.nomination_status || '指名未設定'}</span>
                          <span className={card.badge}>{customer.age_group || '年代未設定'}</span><span className={card.badge}>{customer.region || '地域未設定'}</span>
                        </div>
                        {customer.no_reply && <span className={card.miniStatus}>返信なし</span>}
                        <span className={styles.castLabel}>担当：{assigned}</span>
                        {!isPC && <div className={card.companionLine}>お連れ様：{companionError ? '取得できませんでした' : companions[id] || '未登録'}</div>}
                      </section>
                      {isPC ? <>
                        <section className={card.metrics} aria-label="売上情報">{[['客単価', `¥${m.avgPerVisit.toLocaleString()}`], ['累計売上', `¥${m.totalSpent.toLocaleString()}`], ['累計回数', `${m.visitCount}回`]].map(([label, value]) => <span key={label} className={card.metric}><span className={card.metricLabel}>{label}</span><strong className={card.metricValue}>{value}</strong></span>)}</section>
                        <section className={`${card.pattern} ${styles.patternPanel}`}><CustomerVisitPatternSummary compact pattern={m.visitPattern} highlightWeekday={getWeekdaySortCode(sort)}/></section>
                        <section className={card.relationships}><CustomerRecencyBadge days={m.daysSinceLastVisit}/><span className={card.relationItem}><span className={card.relationLabel}>最終来店</span>{m.lastVisitDate || '未記録'}</span><span className={card.relationItem}><span className={card.relationLabel}>お連れ様</span>{companionError ? '取得失敗' : companions[id] || '未登録'}</span></section>
                      </> : <div className={card.mobileMetricGrid}>
                        <section className={card.mobileSalesPanel}><div className={card.mobilePanelLabel}>売上</div><div className={card.mobileSalesMain}><span>客単価</span><strong>{compactYen(m.avgPerVisit)}</strong></div><div className={card.mobilePanelSub}>累計売上<strong>{compactYen(m.totalSpent)}</strong></div><div className={card.mobilePanelSub}>累計回数<strong>{m.visitCount}回</strong></div></section>
                        <section className={card.mobileVisitPanel}><div className={card.mobilePanelLabel}>最終来店</div><div className={card.mobileLastVisitLine}><strong className={card.mobileLastVisitDate}>{m.lastVisitDate?.slice(5).replace('-', '/') || '未記録'}</strong><CustomerRecencyBadge days={m.daysSinceLastVisit}/></div><div className={card.mobilePanelSub}>{visitLabel} ｜ {timeLabel}</div></section>
                      </div>}
                    </div>
                  </div>
                </CustomerActionCardShell>
              })}</div>
            </section>
          })}
        </div>}
        {data.pageCount > 1 && <nav aria-label="ページ切替" className={styles.pagination}><button disabled={loading || actions.busy || page === 1} onClick={() => setPage(v => v - 1)}>前へ</button>{page} / {data.pageCount}<button disabled={loading || actions.busy || page >= data.pageCount} onClick={() => setPage(v => v + 1)}>次へ</button></nav>}
      </main>
    </div>}
    {canManage && selectionMode && <div className={styles.bulkBar}><span>{selectedIds.size}人選択</span><button disabled={actions.busy || loading} onClick={() => setSelectedIds(new Set(data.customers.map(c => String(c.id))))}>このページを全選択</button><button disabled={!selectedIds.size || actions.busy || loading} onClick={() => { void actions.removeFromFollowUp([...selectedIds]) }}>⭐️解除</button><button disabled={!selectedIds.size || actions.busy || loading} onClick={() => { void actions.setNoReply([...selectedIds], true) }}>返信なし</button><button disabled={!selectedIds.size || actions.busy || loading} onClick={() => { void actions.moveToSevered(data.customers.filter(c => selectedIds.has(String(c.id))).map(c => ({ id: String(c.id), name: c.customer_name || '', previousRank: c.customer_rank }))) }}>切れたにする</button></div>}
    {selectedId && <><div className={styles.backdrop}/><section role="dialog" aria-modal="true" aria-label="お客様詳細" className={styles.dialog}><div className={styles.dialogHeader}><button onClick={() => setSelectedId(null)}>← ⭐️一覧に戻る</button></div><CustomerDetailPanel key={selectedId} customerId={selectedId} isPC={isPC} isAdmin onCustomerUpdated={() => { setSelectedId(null); refresh() }}/></section></>}
    {actions.ToastView}
    <BottomNav/>
  </div>
}
