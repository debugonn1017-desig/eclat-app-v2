'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { Customer } from '@/types'
import { groupCustomerCastOptions, type CustomerCastOption } from '@/lib/customerCastOptions'
import { fetchMe } from '@/lib/authCache'
import { C } from '@/lib/colors'
import { CUSTOMER_SEARCH_SORT_OPTIONS, type CustomerSortKey, type CustomerVisitPattern } from '@/lib/customerVisitPattern'
import { createClient } from '@/lib/supabase/client'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { useViewMode } from '@/hooks/useViewMode'
import { useJstToday } from '@/hooks/useJstToday'
import { useStarLog } from '@/hooks/useStarLog'
import { STAFF_STAR_VIEWS, STARRED_BANAI_VISIT_DAYS, emptyStarNominationCount, validStaffStarVisitDate, type StaffStarView, type StarCounts, type StarNominationCount } from '@/lib/starredCustomers'
import { useCustomerListActions } from '@/hooks/useCustomerListActions'
import { useCustomerListScroll } from '@/hooks/useCustomerListScroll'
import PageHeader from '@/components/PageHeader'
import BottomNav from '@/components/BottomNav'
import CompactListField from '@/components/CompactListField'
import StaffStarsMenu from '@/components/StaffStarsMenu'
import StarCategoryCounts from '@/components/StarCategoryCounts'
import StarCastMonthlySales from '@/components/StarCastMonthlySales'
import StarCustomerGoals from '@/components/StarCustomerGoals'
import { todayJST } from '@/lib/dateUtils'
import styles from './StaffStarsPage.module.css'

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
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [counts, setCounts] = useState<StarCounts | null>(null)
  const [countError, setCountError] = useState(false)
  const [countRevision, setCountRevision] = useState(0)
  const [view, setView] = useState<StaffStarView>('banai')
  const [visitDay, setVisitDay] = useState('')
  const [screen, setScreen] = useState<'menu' | 'today' | 'cast'>('menu')
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [month, setMonth] = useState(() => todayJST().slice(0, 7))
  const [visitMode, setVisitMode] = useState<'days' | 'date'>('days')
  const [visitDate, setVisitDate] = useState(() => todayJST())
  const today = useJstToday()
  const dateModeActive = view === 'banai' && visitMode === 'date'
  const validVisitDate = validStaffStarVisitDate(visitDate) && (!today || visitDate <= today)
  const visitDateError = screen === 'today' && dateModeActive && !validVisitDate
    ? visitDate ? '本日以前の正しい来店日を選んでください。' : '来店日を選んでください。' : null
  const preserveCustomerScroll = useCustomerListScroll(data, loading, JSON.stringify([castName, keyword, sort, page, view, visitDay, visitMode, visitDate, screen]))
  const refresh = useCallback(() => { preserveCustomerScroll(); setRevision(value => value + 1) }, [preserveCustomerScroll])
  const actions = useCustomerListActions({ onRanksChanged: refresh })
  const starLogs = useStarLog({ enabled: canRead && screen !== 'cast', summaryEnabled: screen === 'today', disabled: actions.busy || selectionMode || workspaceBusy, scopeKey: `${profile.id}:${screen}`, castName: castName || undefined, revision, onChanged: refresh, onFilterChange: () => { setPage(1); setData(EMPTY); setSelectedIds(new Set()) }, casts })
  const navigationBusy = actions.busy || workspaceBusy || starLogs.busy
  const starCheck = starLogs.filter
  const refreshStaffCounts = useCallback(() => setCountRevision(value => value + 1), [])
  const selectedCast = casts.find(c => c.is_active && c.cast_name === castName)
  const castLabels = useMemo(() => new Map(casts.map(c => [c.cast_name, c.display_name || c.cast_name])), [casts])
  const castGroups = useMemo(() => groupCustomerCastOptions(casts.filter(c => c.is_active)), [casts])
  const countText = (count: StarNominationCount | undefined) => count
    ? `本${count.honshimei}名・場${count.banai}名`
    : '本—名・場—名'
  const castCount = (name: string) => counts && Object.hasOwn(counts.byCast, name) ? counts.byCast[name] : counts ? emptyStarNominationCount() : undefined
  const targetCount = (name: string) => {
    if (screen === 'cast' && name) return `⭐️${castCount(name)?.total ?? '—'}名`
    const matched = counts?.matched
    if (!matched) return '対象—名'
    const count = name ? Object.hasOwn(matched.byCast, name) ? matched.byCast[name].total : 0 : matched.total.total
    return `対象${count}名`
  }

  useEffect(() => {
    if (!canRead) return
    if (visitDateError) { setCounts(null); setCountError(false); return }
    const controller = new AbortController()
    void (async () => {
      try {
        setCounts(null)
        const params = new URLSearchParams({ starredView: screen === 'menu' ? 'banai' : screen === 'cast' ? 'all' : view })
        if (screen === 'today' && view === 'banai') {
          if (visitMode === 'date') params.set('starredVisitDate', visitDate)
          else if (visitDay) params.set('starredVisitDay', visitDay)
        }
        if (screen === 'today' && keyword) params.set('keyword', keyword)
        if (screen === 'today' && starCheck !== 'all') params.set('starCheck', starCheck)
        const response = await fetch('/api/customers/star-counts?' + params, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('取得失敗')
        const json = await response.json() as StarCounts
        if (!controller.signal.aborted) { setCounts(json); setCountError(false) }
      } catch {
        if (!controller.signal.aborted) { setCounts(null); setCountError(true) }
      }
    })()
    return () => controller.abort()
  }, [canRead, revision, countRevision, view, visitDay, visitMode, visitDate, visitDateError, keyword, today, screen, starCheck])

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
    if (visitDateError) { setData(EMPTY); setError(null); setLoading(false); return }
    const controller = new AbortController()
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ starred: 'true', starredView: view, page: '1', pageSize: '100', sort })
        if (castName) params.set('castName', castName)
        else params.set('starredCastOrder', 'true')
        if (keyword) params.set('keyword', keyword)
        if (view === 'banai') {
          if (visitMode === 'date') params.set('starredVisitDate', visitDate)
          else if (visitDay) params.set('starredVisitDay', visitDay)
        }
        if (starCheck !== 'all') params.set('starCheck', starCheck)
        const response = await fetch('/api/customers/search?' + params, { signal: controller.signal, cache: 'no-store' })
        const json = await response.json() as Result & { error?: string }
        if (!response.ok) throw new Error(json.error || '⭐️のお客様を取得できませんでした')
        if (cancelled) return
        const allCustomers = [...json.customers]
        // ページ送りを出さず、対象者を同じ一覧に接続する。途中失敗で部分成功にしない。
        if (json.pageCount > 100) throw new Error('対象者が多すぎます。条件を絞り込んでください')
        for (let next = 2; next <= json.pageCount; next++) {
          params.set('page', String(next))
          const moreResponse = await fetch('/api/customers/search?' + params, { signal: controller.signal, cache: 'no-store' })
          const more = await moreResponse.json() as Result & { error?: string }
          if (!moreResponse.ok) throw new Error(more.error || '一覧の続きを取得できませんでした')
          if (more.total !== json.total || more.pageCount !== json.pageCount || more.page !== next) throw new Error('対象者が変わりました。再取得してください')
          allCustomers.push(...more.customers)
        }
        if (new Set(allCustomers.map(c => String(c.id))).size !== json.total) throw new Error('対象者が変わりました。再取得してください')
        json.customers = allCustomers; json.page = 1; json.pageCount = 1
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
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : '取得に失敗しました')
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [canRead, castName, keyword, page, sort, revision, view, visitDay, visitMode, visitDate, visitDateError, today, screen, starCheck])

  const resetList = () => {
    setPage(1); setData(EMPTY); setSelectedIds(new Set()); setSelectionMode(false); setError(null)
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
  const metadata = useMemo(() => ({
    lastVisits: new Map(data.customers.flatMap(c => c.metrics.lastVisitDate ? [[String(c.id), c.metrics.lastVisitDate] as const] : [])),
    totals: new Map(data.customers.map(c => [String(c.id), c.metrics.totalSpent])),
    counts: new Map(data.customers.map(c => [String(c.id), c.metrics.visitCount])),
    averages: new Map(data.customers.map(c => [String(c.id), c.metrics.avgPerVisit])),
    patterns: new Map(data.customers.map(c => [String(c.id), c.metrics.visitPattern])),
    companions: new Map(data.customers.map(c => [String(c.id), { honshimei: companionError ? '取得失敗' : companions[String(c.id)] || '', banai: '' }])),
    noReply: new Set(data.customers.filter(c => c.no_reply).map(c => String(c.id))),
  }), [data, companions, companionError])

  const statusMessages = <>
    {castError && <p role="alert">キャスト一覧を取得できませんでした。<button onClick={() => setCastRevision(v => v + 1)}>再取得</button></p>}
    {countError && <p role="alert">⭐️の人数・当月売上を取得できませんでした。<button onClick={() => setCountRevision(v => v + 1)}>再取得</button></p>}
  </>
  if (canRead && screen === 'menu') return <div style={{ background: C.goalBg, minHeight: '100dvh', fontFamily: 'var(--font-app-sans)', letterSpacing: 'normal' }}>
    <PageHeader title="⭐️のお客様" showBack={false} showBell={false}/>
    <div className={styles.menuStatus}>{statusMessages}{starLogs.HistoryButton}</div>
    <StaffStarsMenu casts={casts} counts={counts} disabled={navigationBusy} onToday={() => openList('')} onCast={openList}/>
    {starLogs.Overlays}<BottomNav/>
  </div>

  return <div className={isPC ? undefined : styles.mobile} style={{ background: C.goalBg, minHeight: '100dvh', fontFamily: 'var(--font-app-sans)', letterSpacing: 'normal' }}>
    <PageHeader title="⭐️のお客様" showBack={false} showBell={false}/>
    {!canRead ? <p className={styles.message}>⭐️のお客様を見るには「顧客.閲覧」の権限が必要です。</p> : <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="キャストで絞り込み" data-star-list="sidebar">
        <button className={styles.backToMenu} disabled={navigationBusy} onClick={showMenu}>← リスト一覧</button>
        <h2>表示するキャスト</h2>
        <button className={styles.castButton} aria-pressed={!castName} disabled={navigationBusy} onClick={() => openList('')}><span>本日確認</span><span className={styles.castCount}>全キャスト</span></button>
        {castGroups.map(group => <section key={group.key} aria-label={`${group.tier}のキャスト`}>
          <h2 className={styles.tierHeading}>{group.tier}<span>{group.rows.length}人</span></h2>
          {group.rows.map(c => <button key={c.id} className={`${styles.castButton} ${styles.castWithBreakdown}`} data-star-cast={c.cast_name} aria-pressed={castName === c.cast_name} disabled={navigationBusy} onClick={() => selectCast(c.cast_name)}>
            <span className={styles.castIdentity}><span className={styles.menuCastName} data-star-name>{c.display_name || c.cast_name}</span>{screen === 'today' && <span className={styles.castTarget}>{targetCount(c.cast_name)}</span>}</span>
            <StarCastMonthlySales counts={counts} castName={c.cast_name}/>
            <span className={styles.castCountBlock} data-star-count-block>
              <span className={styles.castCountTotal}>⭐️{castCount(c.cast_name)?.total ?? '—'}名</span>
              <StarCategoryCounts count={castCount(c.cast_name)} castName={c.cast_name}/>
            </span>
          </button>)}
        </section>)}
        <p className={styles.countHint}>{screen === 'cast' ? '人数・分類別の内訳は⭐️全員分。本日連絡の対象人数はリスト内に表示します。' : '対象人数は表示・日数・検索条件に連動。⭐️合計と分類別の内訳は絞る前の全員分です。'}売上は⭐️のお客様の当月実績です。</p>
      </aside>
      <main className={styles.main}>
        <div className={styles.mobileToolbar}>
        <button className={`${styles.backToMenu} ${styles.mobileMenuBack}`} disabled={navigationBusy} onClick={showMenu}>← リスト一覧</button>
        <div className={styles.mobileFilter}><label><span className={styles.srOnly}>表示するキャスト</span><CompactListField compact={!isPC}><select aria-label="⭐️を表示するキャスト" value={castName} disabled={navigationBusy} onChange={e => selectCast(e.target.value)}>{filterOptions}</select></CompactListField></label></div>
        </div>
        {statusMessages}
        <h1 className={screen === 'today' ? styles.todayTitle : styles.srOnly}>{screen === 'today' ? '本日確認（全キャスト）' : `${castLabels.get(castName) || castName}の⭐️のお客様`}</h1>
        {screen === 'cast' ? selectedCast ? <CastStarsWorkspace key={selectedCast.id} castIdOverride={selectedCast.id} starsOnly starsListOnly
          onCustomerListChanged={refreshStaffCounts} onBusyChange={setWorkspaceBusy}/> : <p role="alert" className={styles.message}>キャストを選び直してください。</p> : <>
        <div className={styles.visitFilter}>
          <div className={styles.filterButtons} role="group" aria-label="⭐️の表示対象">{STAFF_STAR_VIEWS.map(option => <button key={option.value} type="button" aria-pressed={view === option.value} disabled={navigationBusy} onClick={() => { if (view !== option.value) { resetList(); setView(option.value); setVisitDay('') } }}>{option.label}</button>)}</div>
          {view === 'banai' && <div className={styles.visitDateOptions} style={{ color: C.goalMuted }}>
            <div className={styles.visitDateModes} role="group" aria-label="来店日の指定方法">
              <button type="button" aria-pressed={visitMode === 'days'} disabled={navigationBusy} style={{ borderColor: visitMode === 'days' ? C.goalAccent : C.goalBorder, background: visitMode === 'days' ? C.tagBg : C.white, color: visitMode === 'days' ? C.goalAccent : C.goalText }} onClick={() => { if (visitMode !== 'days') { resetList(); setVisitMode('days') } }}>対象日で表示</button>
              <button type="button" aria-pressed={visitMode === 'date'} disabled={navigationBusy} style={{ borderColor: visitMode === 'date' ? C.goalAccent : C.goalBorder, background: visitMode === 'date' ? C.tagBg : C.white, color: visitMode === 'date' ? C.goalAccent : C.goalText }} onClick={() => { if (visitMode !== 'date') { resetList(); setVisitMode('date') } }}>来店日を指定</button>
            </div>
            {visitMode === 'date'
              ? <label className={styles.dateFilter}>来店日<CompactListField compact={!isPC}><input aria-label="来店日" type="date" min="2000-01-01" max={today ?? undefined} value={visitDate} disabled={navigationBusy} aria-invalid={!!visitDateError} aria-describedby={visitDateError ? 'star-visit-date-error' : 'star-visit-date-hint'} style={{ borderColor: visitDateError ? C.danger : C.goalBorder, background: C.white, color: C.goalText }} onChange={event => { resetList(); setVisitDate(event.target.value) }}/></CompactListField></label>
              : <label className={styles.dayFilter}>最終来店から<CompactListField compact={!isPC}><select aria-label="場内の経過日数" value={visitDay} disabled={navigationBusy} onChange={e => { resetList(); setVisitDay(e.target.value) }}><option value="">対象日まとめて</option>{STARRED_BANAI_VISIT_DAYS.map(days => <option key={days} value={days}>{days}日前のみ</option>)}</select></CompactListField></label>}
            {visitMode === 'date' && <p id="star-visit-date-hint" className={styles.visitDateHint}>{validVisitDate ? `${visitDate.replaceAll('-', '/')}の実来店` : '指定日の実来店'} · ⭐️の県内場内・県外場内のみ。後日の再来店がある方も含み、予定は除きます。</p>}
            {visitDateError && <p id="star-visit-date-error" role="alert" className={styles.visitDateError} style={{ color: C.danger }}>{visitDateError}</p>}
          </div>}
        </div>
        <details className={styles.help}><summary>検索・並び・表示条件{keyword ? `（検索中：${keyword}）` : ''}</summary>
        <form className={styles.controls} onSubmit={e => { e.preventDefault(); resetList(); setKeyword(keywordInput.trim()); refresh() }}>
          <label className={styles.search}>お客様を検索<CompactListField compact={!isPC}><input placeholder="名前・ニックネーム・ボトル名" value={keywordInput} disabled={navigationBusy} onChange={e => setKeywordInput(e.target.value)}/></CompactListField></label>
          <button disabled={navigationBusy}>検索</button>
          <label>並び替え<CompactListField compact={!isPC}><select value={sort} disabled={navigationBusy} onChange={e => { resetList(); setSort(e.target.value as CustomerSortKey) }}>
            {CUSTOMER_SEARCH_SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.key === 'starred' ? '標準（累計売上順）' : o.key === 'lastVisitNewest' ? '経過日数が少ない順' : o.key === 'lastVisitOldest' ? '経過日数が多い順' : o.label}</option>)}
          </select></CompactListField></label>
          {canManage && <button type="button" disabled={loading || navigationBusy} onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()) }}>{selectionMode ? '選択を終了' : '複数選択'}</button>}
        </form>
          <p>対象日で表示：最終来店から{STARRED_BANAI_VISIT_DAYS.join('・')}日前の⭐️場内のみ。2・4・5日前などは表示しません。来店日を指定：指定日に実来店した⭐️の場内のみ。後日の再来店がある方も含み、予定は除きます。本指名・⭐️全員へ切り替えできます。</p>
          {screen === 'today' && <p>分類ごとに、管理で保存したキャスト順に表示します。並び替えは各分類・担当のお客様内に適用されます。</p>}
          {!isPC && <p>長押しでお客様情報、スワイプ／⋯で編集。確認・ログは明細の下部に表示</p>}
          <p>初期は経過日数が少ない順。対象人数は表示条件に連動し、⭐️本・場の人数は絞る前の全員分です。</p>
          <span className={styles.countHint}>絞る前の⭐️全員分：{countText(castName ? castCount(castName) : counts?.total)}</span>
        </details>
        <span className={styles.srOnly} aria-live="polite">{loading ? '読み込み中…' : error ? '' : `${data.total}人`}</span>
        {error && <p role="alert" className={styles.message}>{error} <button onClick={refresh}>再読み込み</button></p>}
        <div aria-busy={loading}>
          <StarCustomerGoals
            castId="" castName="全キャスト" month={month} setMonth={setMonth} target={null}
            customers={data.customers} today={today} metadataReady={!error && !visitDateError && (!loading || data.customers.length > 0)} metadataError={!!error || !!visitDateError} refreshing={loading}
            {...metadata} staffNames={new Map()} bottleSearch={new Map()}
            logs={starLogs} revision={revision} busy={actions.busy || loading} canManage={canManage} isAdmin
            sortKey={sort} onSort={setSort} view="all" onView={() => {}}
            onRemoveStar={actions.removeFromFollowUp} onNoReply={actions.setNoReply} onSever={actions.moveToSevered} onRank={actions.openRankEditor}
            onRefresh={refresh} onBusyChange={setWorkspaceBusy}
            staff={{ castLabels, selectionMode, selectedIds, onToggleSelected: toggleSelected, scopeLabel: dateModeActive && validVisitDate ? `来店日 ${visitDate.replaceAll('-', '/')}・⭐️場内（表示条件の全対象）` : undefined }}/>
        </div>

        </>}
      </main>
    </div>}
    {canManage && selectionMode && <div className={styles.bulkBar}><span>{selectedIds.size}人選択</span><button disabled={actions.busy || loading} onClick={() => setSelectedIds(new Set(data.customers.map(c => String(c.id))))}>全分類を全選択</button><button disabled={!selectedIds.size || actions.busy || loading} onClick={() => { void actions.removeFromFollowUp([...selectedIds]) }}>⭐️解除</button><button disabled={!selectedIds.size || actions.busy || loading} onClick={() => { void actions.setNoReply([...selectedIds], true) }}>返信なし</button><button disabled={!selectedIds.size || actions.busy || loading} onClick={() => { void actions.moveToSevered(data.customers.filter(c => selectedIds.has(String(c.id))).map(c => ({ id: String(c.id), name: c.customer_name || '', previousRank: c.customer_rank }))) }}>切れたにする</button></div>}

    {actions.ToastView}
    {starLogs.Overlays}
    <BottomNav/>
  </div>
}
