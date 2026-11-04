'use client'
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import dynamic from 'next/dynamic'
import type { CastTarget, Customer } from '@/types'
import { C } from '@/lib/colors'
import { useCustomerGoalMembership, useCustomerGoals } from '@/hooks/useCustomerGoals'
import { useStaffCustomerGoals, useStaffGoalMembership } from '@/hooks/useStaffCustomerGoals'
import type { useStarLog } from '@/hooks/useStarLog'
import { customerGoalCategory, GOAL_CATEGORIES, sumCustomerGoals, validGoalMonth, type CustomerMonthlyGoal, type GoalCategory, type GoalReport, type CustomerGoalData } from '@/lib/starCustomerGoals'
import { goalGapLabel, goalYen } from '@/lib/customerGoalsPdf'
import { matchesStarCheck } from '@/lib/starLog'
import { isStarredContactDue, starredElapsedDays } from '@/lib/starredCustomers'
import { CUSTOMER_SORT_OPTIONS, type CustomerSortKey, type CustomerVisitPattern } from '@/lib/customerVisitPattern'
import type { CustomerRankTarget } from '@/lib/customerRankChange'
import CustomerVisitPatternSummary from './CustomerVisitPatternSummary'
import CustomerCardPreview from './CustomerCardPreview'
import CustomerGoalsOverlay from './CustomerGoalsOverlay'
import CustomerGoalsExport from './CustomerGoalsExport'
import CustomerGoalLedgerRow from './CustomerGoalLedgerRow'
import CustomerGoalHistory from './CustomerGoalHistory'
import CompactListField from './CompactListField'
import styles from './StarCustomerGoals.module.css'

const CustomerDetailPanel = dynamic(() => import('./CustomerDetailPanel'), { ssr: false })
type Props = {
  castId: string; castName: string; month: string; setMonth: (month: string) => void; target: CastTarget | null
  customers: Customer[]; today: string | null; metadataReady: boolean; metadataError: boolean; refreshing?: boolean
  lastVisits: Map<string, string>; totals: Map<string, number>; counts: Map<string, number>; averages: Map<string, number>
  patterns: Map<string, CustomerVisitPattern>; staffNames: Map<string, string[]>; bottleSearch: Map<string, string>
  companions: Map<string, { honshimei: string; banai: string }>
  logs: ReturnType<typeof useStarLog>; revision: number; busy: boolean; canManage: boolean; isAdmin: boolean
  sortKey: CustomerSortKey; onSort: (key: CustomerSortKey) => void
  view: 'today' | 'all'; onView: (view: 'today' | 'all') => void; noReply: Set<string>
  onRemoveStar: (ids: string[]) => Promise<boolean>; onNoReply: (ids: string[], value: boolean) => Promise<boolean>
  onSever: (targets: CustomerRankTarget[]) => Promise<boolean>; onRank: (target: CustomerRankTarget) => void
  onRefresh: () => void; onBusyChange: (busy: boolean) => void
  staff?: { castLabels: Map<string, string>; selectionMode: boolean; selectedIds: Set<string>; onToggleSelected: (id: string) => void; scopeLabel?: string }
}
const nameOf = (c: Customer) => c.customer_name || c.nickname || 'お名前未登録'
const categoryColor = (category: GoalCategory) => [C.pinkDeep, C.chartBlue, C.goldText, C.chartPurple, C.pinkMuted, C.dark2][GOAL_CATEGORIES.indexOf(category)]
const categoryDescription = (category: GoalCategory) => ({ '県内顧客': '本指名のお客様 · 福岡県', '県外顧客': '本指名のお客様 · 福岡県以外', '県内場内': '場内のお客様 · 福岡県', '県外場内': '場内のお客様 · 福岡県以外・地域未設定', 'その他・地域未設定': '指名または地域を確認', '切れたお客様': '⭐️を付けた切れたのお客様' })[category]
export const customerGoalsColors = { '--goal-text': C.goalText, '--goal-muted': C.goalMuted, '--goal-border': C.goalBorder, '--goal-bg': C.goalBg, '--goal-white': C.white, '--goal-tint': C.tagBg, '--goal-band': C.goalBand, '--goal-pink': C.goalAccent, '--goal-success': C.successDeep, '--goal-success-bg': C.successBg } as CSSProperties

export default function StarCustomerGoals(p: Props) {
  const [closedCategories, setClosedCategories] = useState<Set<GoalCategory>>(() => new Set(GOAL_CATEGORIES))
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [previewCustomer, setPreviewCustomer] = useState<Customer | null>(null)
  const [personalId, setPersonalId] = useState<string | null>(null)
  const [personalEditing, setPersonalEditing] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [editingCastId, setEditingCastId] = useState('')
  const [editingMonth, setEditingMonth] = useState('')
  const [editingGoal, setEditingGoal] = useState<CustomerMonthlyGoal | undefined>(undefined)
  const [actionsId, setActionsId] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [message, setMessage] = useState('')
  const previewId = previewCustomer ? String(previewCustomer.id) : null
  const editingId = editingCustomer ? String(editingCustomer.id) : null
  const overlayOpen = !!(previewId || personalId || editingId)
  const pauseGoals = !!(personalId || editingId) || p.busy || exportBusy
  const personalGoals = useCustomerGoals(p.castId, p.month, p.revision, !!p.staff || pauseGoals)
  const staffGoals = useStaffCustomerGoals(p.staff ? p.customers.map(c => String(c.id)) : [], p.month, p.revision, !p.staff || pauseGoals)
  const staffData = useMemo<CustomerGoalData | null>(() => staffGoals.data ? {
    castId: '', month: p.month, canEdit: staffGoals.data.canEdit, customerIds: staffGoals.data.customerIds,
    goals: Object.values(staffGoals.data.items).flatMap(item => item.goal ? [item.goal] : []),
    actuals: Object.fromEntries(Object.entries(staffGoals.data.items).flatMap(([id, item]) => item.actual ? [[id, item.actual]] : [])),
  } : null, [staffGoals.data, p.month])
  const goals = p.staff ? { ...staffGoals, data: staffData } : personalGoals
  const busy = p.busy || goals.saving || exportBusy
  const membershipMismatch = useCustomerGoalMembership({ castId: p.castId, month: p.month, customerIds: p.customers.map(c => String(c.id)), data: p.staff ? null : personalGoals.data,
    enabled: !p.staff && !pauseGoals && p.metadataReady && !p.metadataError && !personalGoals.error && !p.refreshing,
    onRefresh: () => { p.onRefresh(); personalGoals.reload() } })
  const goalCustomerIds = useMemo(() => new Set(goals.data?.customerIds || []), [goals.data])
  const currentCustomers = p.staff || !goals.data ? p.customers : p.customers.filter(c => goalCustomerIds.has(String(c.id)))
  const ready = !!goals.data && goals.ready && p.metadataReady && !goals.error && !p.metadataError
  const canEdit = p.canManage && !!goals.data?.canEdit
  const customerCasts = useMemo(() => new Map(p.customers.map(c => [String(c.id), c.cast_name])), [p.customers])
  useStaffGoalMembership({ month: p.month, customerCasts, data: p.staff ? staffGoals.data : null,
    enabled: !!p.staff && !pauseGoals && staffGoals.ready && p.metadataReady && !p.metadataError && !staffGoals.error && !p.refreshing,
    onRefresh: p.onRefresh })
  const rowReady = (id: string) => ready && goalCustomerIds.has(id) && (!p.staff || (staffGoals.data?.items[id]?.status === 'ready' && staffGoals.data.items[id].castName === customerCasts.get(id)))
  const reportReady = ready && !membershipMismatch && currentCustomers.every(c => rowReady(String(c.id)))
  const onBusyChange = p.onBusyChange
  useEffect(() => { onBusyChange(overlayOpen || goals.saving || exportBusy); return () => onBusyChange(false) }, [overlayOpen, goals.saving, exportBusy, onBusyChange])
  const goalMap = useMemo(() => new Map((goals.data?.goals || []).map(g => [String(g.customer_id), g])), [goals.data])
  const todayCustomers = p.metadataReady ? currentCustomers.filter(c => isStarredContactDue({ ...c, is_starred: true }, starredElapsedDays(p.today, p.lastVisits.get(String(c.id))))) : []
  const scopeCustomers = p.view === 'today' ? todayCustomers : currentCustomers
  const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ja').replace(/\s+/gu, '')
  const rows = scopeCustomers.filter(c => (p.logs.filter === 'all' || (p.logs.ready && !p.logs.error && !!p.today && matchesStarCheck(p.logs.summaries.get(String(c.id)), p.logs.filter, p.today)))
    && (!query || normalized(`${nameOf(c)} ${c.nickname || ''} ${p.bottleSearch.get(String(c.id)) || ''}`).includes(normalized(query))))
  const salesSet = currentCustomers.some(c => goalMap.get(String(c.id))?.target_sales != null)
  const visitsSet = currentCustomers.some(c => goalMap.get(String(c.id))?.target_visits != null)
  const sums = sumCustomerGoals(currentCustomers.map(c => String(c.id)), goalMap, goals.data?.actuals || {})
  const report: GoalReport = { castName: p.castName, month: p.month, today: p.today || '', scopeLabel: p.staff ? p.staff.scopeLabel || '本日確認リスト（表示条件の全対象）' : undefined, rows: GOAL_CATEGORIES.flatMap(cat => currentCustomers.filter(c => customerGoalCategory(c) === cat)).map(c => {
    const id = String(c.id), g = goalMap.get(id), a = goals.data?.actuals[id], cycle = p.logs.summaries.get(id)
    return { id, name: nameOf(c), rank: c.customer_rank || undefined, castName: p.staff ? p.staff.castLabels.get(c.cast_name) || c.cast_name || '担当未設定' : undefined, region: c.region, occupation: c.occupation, category: customerGoalCategory(c), targetSales: g?.target_sales ?? null, targetVisits: g?.target_visits ?? null, sales: a?.sales ?? 0, visits: a?.visits ?? 0, note: g?.note || '', lastVisit: p.lastVisits.get(id) || null, checked: p.logs.ready && !p.logs.error ? cycle?.last_checked_on === p.today : null, checkedBy: cycle?.last_checked_on === p.today ? cycle?.last_checked_by || null : null }
  }) }
  // 他端末で星解除/担当移動されてもオーバーレイの入力を消さない。保存APIで再認可する。
  const preview = p.customers.find(c => String(c.id) === previewId) || previewCustomer
  const editing = editingCustomer
  const editingCurrent = p.customers.find(c => String(c.id) === editingId)
  const editingWarning = editing && (!editingCurrent || editingCurrent.cast_name !== editing.cast_name || editingMonth !== p.month || (!p.staff && editingCastId !== p.castId)
    || (goals.data && !goalCustomerIds.has(String(editing.id))) || (p.staff && staffGoals.data?.items[String(editing.id)]?.castId !== editingCastId))
    ? '⭐️・担当・表示対象が変更されています。入力内容は残しています。保存時にも現在の権限と担当を確認します。' : ''
  const openInfo = (id: string) => { setActionsId(null); setPreviewCustomer(p.customers.find(c => String(c.id) === id) || null); setMessage('') }
  const openEdit = (id: string) => {
    const castId = p.staff ? staffGoals.data?.items[id]?.castId : p.castId
    if (rowReady(id) && castId && canEdit && !busy) { setActionsId(null); setEditingCastId(castId); setEditingMonth(p.month); setEditingGoal(goalMap.get(id)); setEditingCustomer(p.customers.find(c => String(c.id) === id) || null) }
  }
  const groups = GOAL_CATEGORIES.map(category => ({ key: category, category, members: rows.filter(c => customerGoalCategory(c) === category) })).filter(group => group.members.length)
  const queue = groups.filter(group => !closedCategories.has(group.category)).flatMap(group => group.members).map(c => ({ id: String(c.id), name: nameOf(c), castName: c.cast_name }))
  const closePersonal = () => { setPersonalId(null); setPersonalEditing(false); p.onRefresh(); goals.reload() }
  const summary = <div className={styles.summary} aria-label={p.staff ? '表示対象の月別合計' : '⭐️全員の月別合計'}><div><small>{p.staff ? '対象者の売上' : '⭐️全員の売上'} 実績 / 目標</small><strong>{reportReady ? goalYen(sums.sales) : '—'} <span>/ {reportReady ? salesSet ? goalYen(sums.targetSales) : '未設定' : '—'}</span></strong><small>{reportReady ? goalGapLabel(salesSet ? sums.targetSales : null, sums.sales, '円') + (sums.unset ? `・未設定 ${sums.unset}名` : '') : '集計を確認中'}</small></div><div><small>来店回数 実績 / 目標</small><strong>{reportReady ? sums.visits : '—'} <span>/ {reportReady ? visitsSet ? sums.targetVisits + '回' : '未設定' : '—'}</span></strong><small>{reportReady ? goalGapLabel(visitsSet ? sums.targetVisits : null, sums.visits, '回') : '集計を確認中'}</small></div></div>
  return <section className={styles.root} style={customerGoalsColors} data-block-tab-swipe="true" data-goals-scope={p.staff ? 'staff' : 'cast'}>
    {!p.staff && <nav className={styles.tabs} aria-label="⭐️の表示"><button type="button" aria-pressed={p.view === 'today'} disabled={busy} onClick={() => p.onView('today')}>本日連絡 <b>{p.metadataReady ? todayCustomers.length : '…'}</b></button><button type="button" aria-pressed={p.view === 'all'} disabled={busy} onClick={() => p.onView('all')}>⭐️全員表示・目標 <b>{currentCustomers.length}</b></button></nav>}
    <div className={styles.topline}><h2>{p.staff ? '本日確認のお客様' : `${p.castName}の⭐️のお客様`}</h2><label><span className={styles.srOnly}>対象月</span><CompactListField compact><input aria-label="目標の対象月" type="month" min="2000-01" max="2199-12" value={p.month} disabled={busy || overlayOpen} onChange={e => { if (validGoalMonth(e.target.value)) p.setMonth(e.target.value) }}/></CompactListField></label></div>
    <div className={styles.compactSummary}><span>対象 <b>{scopeCustomers.length}名</b></span><span>{p.staff ? '月間売上' : '⭐️全員の月間売上'} <b>{reportReady ? goalYen(sums.sales) : '—'}</b></span></div>
    <details className={styles.staffTotals}><summary>{p.staff ? '対象者の月別合計' : '月別合計・設定売上'}</summary>{!p.staff && <div className={styles.settings}>設定売上 <b>{p.target?.target_sales == null ? '未設定' : goalYen(p.target.target_sales)}</b><span>単価 <b>{p.target?.target_avg_spend == null ? '—' : goalYen(p.target.target_avg_spend)}</b></span><span>出勤 <b>{p.target?.target_work_days ?? '—'}日</b></span></div>}{summary}</details>
    {(goals.error || p.metadataError) && <p role="alert" className={styles.error}>{goals.error || '来店情報を取得できませんでした。実績を0として表示していません。'} <button type="button" onClick={() => { goals.reload(); p.onRefresh() }}>再取得</button></p>}
    {membershipMismatch && <p role="status" className={styles.error}>⭐️または担当の変更を一覧に反映しています。対象が揃うまで合計・印刷を止めています。<button type="button" onClick={() => { p.onRefresh(); personalGoals.reload() }}>一覧を再取得</button></p>}

    {!p.staff && searchOpen && <div className={styles.controls}><label className={styles.search}><span className={styles.srOnly}>お客様を検索</span><CompactListField compact><input aria-label="名前・ボトル名で検索" value={query} onChange={e => setQuery(e.target.value)} placeholder="名前・ボトル名で検索"/></CompactListField></label><label><span className={styles.srOnly}>並び順</span><CompactListField compact><select aria-label="並び順" value={p.sortKey} onChange={e => p.onSort(e.target.value as CustomerSortKey)}>{CUSTOMER_SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></CompactListField></label></div>}
    <div className={styles.controls}><label className={styles.checkFilter}><CompactListField compact><select aria-label="本日の確認状況" value={p.logs.filter} disabled={busy || !p.logs.ready || !!p.logs.error} onChange={e => p.logs.setFilter(e.target.value as 'all' | 'checked' | 'unchecked')}><option value="all">全員</option><option value="unchecked">今日未確認</option><option value="checked">今日確認済み</option></select></CompactListField></label>{p.logs.HistoryButton}{!p.staff && <button type="button" aria-expanded={searchOpen} onClick={() => setSearchOpen(v => !v)}>検索{query ? '●' : ''}・並び</button>}<CustomerGoalsExport report={report} disabled={!reportReady || busy || p.refreshing === true || !p.today || !p.customers.length} onBusyChange={setExportBusy}/></div>
    {p.logs.error && <p role="alert" className={styles.error}>{p.logs.error}（確認状況は未取得）</p>}
    {message && <p role="status" className={styles.error}>{message}</p>}
    {p.staff && staffGoals.ready && p.customers.some(c => staffGoals.data?.items[String(c.id)]?.status !== 'ready' || staffGoals.data.items[String(c.id)]?.castName !== c.cast_name) && <p role="status" className={styles.error}>担当キャストを確認できないお客様の月別目標・実績は「—」で表示しています。担当を確認して再取得してください。</p>}
    <p className={styles.hint}>{p.view === 'today' ? '本日の連絡対象' : '一覧は閲覧用'} · 長押しで情報 · スワイプ／⋯で編集 <span>{rows.length}名</span></p>
    <div className={styles.list} data-customer-scroll>
      {groups.map(({ key, category: cat, members }) => {
        return <details key={key} data-goal-category={cat} style={{ '--category': categoryColor(cat) } as CSSProperties} className={styles.group} open={!closedCategories.has(cat)} onToggle={event => {
          const closed = !event.currentTarget.open
          setClosedCategories(previous => {
            if (previous.has(cat) === closed) return previous
            const next = new Set(previous)
            if (closed) next.add(cat); else next.delete(cat)
            return next
          })
        }}><summary className={styles.groupHeading} data-category-toggle={cat} aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault() }}><h3><b>{cat}</b><small>{categoryDescription(cat)}</small></h3><span className={styles.groupCount}>{members.length}名</span><span className={styles.groupChevron} aria-hidden="true">›</span></summary>{members.map((c, index) => {
          const id = String(c.id), cycle = p.logs.summaries.get(id)
          const showCast = !!p.staff && (index === 0 || c.cast_name !== members[index - 1].cast_name)
          return <Fragment key={id}>{showCast && <h4 className={styles.castSubheading}>担当 {p.staff!.castLabels.get(c.cast_name || '') || c.cast_name || '未設定'}</h4>}<CustomerGoalLedgerRow customer={c} goal={goalMap.get(id)} actual={goals.data?.actuals[id]} ready={rowReady(id)} cycle={cycle} logsReady={p.logs.ready && !p.logs.error} today={p.today} lastVisitReady={p.metadataReady} lastVisit={p.metadataReady ? p.lastVisits.get(id) : undefined}
            busy={busy} canManage={p.canManage} canEdit={canEdit && rowReady(id)} actionsOpen={actionsId === id} noReply={p.noReply.has(id)} confirming={p.logs.confirming === id}
            selectionMode={p.staff?.selectionMode} selected={p.staff?.selectedIds.has(id)} onToggleSelected={() => p.staff?.onToggleSelected(id)}
            onInfo={() => openInfo(id)} onEdit={() => openEdit(id)} onActions={() => setActionsId(actionsId === id ? null : id)}
            onLog={() => p.logs.open({ id, name: nameOf(c), castName: c.cast_name }, queue)}
            onConfirm={() => { void p.logs.confirmToday({ id, name: nameOf(c), castName: c.cast_name }).catch(e => setMessage(e instanceof Error ? e.message : '確認を保存できませんでした')) }}
            onRemove={() => { if (window.confirm(`${nameOf(c)}の⭐️を解除しますか？\n目標・備考・記録は残り、一覧と合計から外れます。`)) { setActionsId(null); void p.onRemoveStar([id]) } }}
            onNoReply={() => { setActionsId(null); void p.onNoReply([id], !p.noReply.has(id)) }}
            onSever={() => { setActionsId(null); void p.onSever([{ id, name: nameOf(c), previousRank: c.customer_rank }]) }}
            onRank={() => { setActionsId(null); p.onRank({ id, name: nameOf(c), previousRank: c.customer_rank }) }}/></Fragment>
        })}</details>
      })}
      {!rows.length && <p className={styles.empty}>{p.staff ? !p.metadataReady ? 'お客様を確認中…' : 'この条件のお客様はいません' : p.view === 'today' && !p.metadataReady ? '来店日を確認中…' : p.customers.length ? 'この条件のお客様はいません' : '⭐️を付けたお客様が自動で表示されます'}</p>}
    </div>
    <p className={styles.hint}>県内＝福岡県。本指名・場内を分けて集計。実績は対象月の実来店。⭐️解除後も目標・備考は保存されます。</p>
    {preview && <CustomerCardPreview name={nameOf(preview)} title="お客様情報" onClose={() => setPreviewCustomer(null)} footer={<><button type="button" onClick={() => setPreviewCustomer(null)}>一覧に戻る</button>{canEdit && <button type="button" disabled={!rowReady(String(preview.id)) || !p.customers.some(c => String(c.id) === previewId)} onClick={() => openEdit(String(preview.id))}>目標・備考を編集</button>}{p.canManage && <button type="button" disabled={busy} onClick={() => { setPreviewCustomer(null); p.onRank({ id: String(preview.id), name: nameOf(preview), previousRank: preview.customer_rank }) }}>ランク変更</button>}<button type="button" onClick={() => setPersonalId(String(preview.id))}>個人ページを開く ›</button></>}>
      <h2 className={styles.infoName}>{nameOf(preview)}</h2><div className={styles.infoGrid}>{[
        ['お住まい', preview.region || '未設定'], ['職業・年代', `${preview.occupation || '未設定'}・${preview.age_group || '未設定'}`],
        ['担当キャスト', preview.cast_name], ['担当スタッフ', p.staffNames.get(String(preview.id))?.join('・') || '未設定'],
        ['最終来店日', p.lastVisits.get(String(preview.id)) || '未記録'], ['最終連絡日', preview.last_contact_date || '未記録'],
        ['指名・ランク', `${preview.nomination_status}・${preview.customer_rank}`], ['累計来店・売上', `${p.counts.get(String(preview.id)) ?? '—'}回・${p.totals.has(String(preview.id)) ? goalYen(p.totals.get(String(preview.id))!) : '—'}`],
        ['客単価', p.averages.has(String(preview.id)) ? goalYen(p.averages.get(String(preview.id))!) : '—'], ['お連れ様', [p.companions.get(String(preview.id))?.honshimei, p.companions.get(String(preview.id))?.banai].filter(Boolean).join('・') || '未記録'],
      ].map(([label, value]) => <div key={label}><small>{label}</small><div>{value}</div></div>)}</div>
      <CustomerVisitPatternSummary pattern={p.patterns.get(String(preview.id))}/>
      <h4>{p.month.replace('-', '年')}月の目標・実績</h4><div className={styles.infoGrid}><Metric target={goalMap.get(String(preview.id))?.target_sales} actual={goals.data?.actuals[String(preview.id)]?.sales ?? 0} unit="円" ready={rowReady(String(preview.id))}/><Metric target={goalMap.get(String(preview.id))?.target_visits} actual={goals.data?.actuals[String(preview.id)]?.visits ?? 0} unit="回" ready={rowReady(String(preview.id))}/></div>
      <p className={styles.fullNote}>備考：{rowReady(String(preview.id)) ? goalMap.get(String(preview.id))?.note || '未入力' : '取得を確認中'}</p>
      <CustomerGoalHistory customerId={String(preview.id)} enabled={p.isAdmin} revision={`${p.revision}:${preview.cast_name}`}/>
    </CustomerCardPreview>}
    {personalId && <CustomerGoalsOverlay title="お客様の個人ページ" onClose={closePersonal} busy={personalEditing} large><p className={styles.personalHint}>月別目標は元の一覧の「目標・備考を編集」から保存できます。</p><CustomerDetailPanel customerId={personalId} isAdmin={p.isAdmin} responsiveContainer hideLegacyMonthlyTargets onEditingChange={setPersonalEditing}/></CustomerGoalsOverlay>}
    {editing && <GoalEditor key={`${editingCastId}:${editingMonth}:${editingId}`} customer={editing} month={editingMonth} castId={editingCastId} initial={editingGoal} warning={editingWarning} save={goals.save} saving={goals.saving} onClose={() => setEditingCustomer(null)}/>}
  </section>
}

function Metric({ target, actual, unit, ready, framed = false }: { target?: number | null; actual: number; unit: '円' | '回'; ready: boolean; framed?: boolean }) {
  const amount = (n: number) => unit === '円' ? goalYen(n) : `${n}回`
  return <div className={styles.metric} aria-label={unit === '円' ? '目標売上と実績' : '目標来店と実績'}><div><small>{framed ? '目標' : unit === '円' ? '目標売上' : '目標来店'}</small><span>{!ready ? '—' : target == null ? '未設定' : amount(target)}</span></div><div><small>実績</small><b>{ready ? amount(actual) : '—'}</b></div><small className={styles.gap}>{ready ? goalGapLabel(target, actual, unit) : '取得を確認中'}</small></div>
}
function GoalEditor({ customer, month, castId, initial, warning, save, saving, onClose }: { customer: Customer; month: string; castId: string; initial?: CustomerMonthlyGoal; warning: string; save: ReturnType<typeof useCustomerGoals>['save']; saving: boolean; onClose: () => void }) {
  const [sales, setSales] = useState(initial?.target_sales?.toString() ?? ''), [visits, setVisits] = useState(initial?.target_visits?.toString() ?? ''), [note, setNote] = useState(initial?.note || '')
  const [error, setError] = useState(''), [discard, setDiscard] = useState(false)
  const dirty = sales !== (initial?.target_sales?.toString() ?? '') || visits !== (initial?.target_visits?.toString() ?? '') || note !== (initial?.note || '')
  const close = () => { if (saving) return; if (dirty) setDiscard(true); else onClose() }
  return <CustomerGoalsOverlay title={`${nameOf(customer)} · 目標・備考の編集`} onClose={close} busy={saving}><form className={styles.editor} onSubmit={e => { e.preventDefault(); setError(''); void save({ castId, customerId: String(customer.id), month, targetSales: sales.trim() === '' ? null : Number(sales), targetVisits: visits.trim() === '' ? null : Number(visits), note, expectedRevision: initial?.revision || 0 }).then(onClose).catch(e => setError(e instanceof Error ? e.message : '保存できませんでした')) }}>
    <p>{month.replace('-', '年')}月 / {customer.cast_name}<br/><small>空欄は未設定。0は0円・0回の目標として保存します。</small></p>
    {warning && <p role="alert" className={styles.error}>{warning}</p>}
    <label>目標売上（円）<input aria-label="目標売上（円）" type="number" inputMode="numeric" min="0" max="99999999" step="1" value={sales} onChange={e => setSales(e.target.value)} disabled={saving}/></label>
    <label>目標来店回数（回）<input aria-label="目標来店回数（回）" type="number" inputMode="numeric" min="0" max="999" step="1" value={visits} onChange={e => setVisits(e.target.value)} disabled={saving}/></label>
    <label>備考<textarea aria-label="月別の備考" rows={5} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} disabled={saving}/><small>{note.length}/2000文字</small></label>
    {error && <p role="alert" className={styles.error}>{error}<br/>入力内容はこの画面に残しています。</p>}
    {discard ? <div key="discard" role="alert"><p>入力内容を破棄して閉じますか？</p><button type="button" onClick={e => { e.preventDefault(); setDiscard(false) }}>編集を続ける</button><button type="button" onClick={onClose}>破棄して閉じる</button></div> : <div key="save" className={styles.editorFooter}><button type="button" disabled={saving} onClick={close}>キャンセル</button><button type="submit" disabled={saving || !dirty}>{saving ? '保存中…' : '保存する'}</button></div>}
  </form></CustomerGoalsOverlay>
}
