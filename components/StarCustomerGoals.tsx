'use client'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import dynamic from 'next/dynamic'
import type { CastTarget, Customer } from '@/types'
import { C } from '@/lib/colors'
import { useCustomerGoals } from '@/hooks/useCustomerGoals'
import type { useStarLog } from '@/hooks/useStarLog'
import { useCustomerCardGesture } from '@/hooks/useCustomerCardGesture'
import { customerGoalCategory, GOAL_CATEGORIES, sumCustomerGoals, validGoalMonth, type CustomerMonthlyGoal, type GoalCategory, type GoalReport, type CustomerGoalActual } from '@/lib/starCustomerGoals'
import { goalGapLabel, goalYen } from '@/lib/customerGoalsPdf'
import { matchesStarCheck, type StarCycle } from '@/lib/starLog'
import { isStarredContactDue, starredElapsedDays } from '@/lib/starredCustomers'
import { CUSTOMER_SORT_OPTIONS, type CustomerSortKey, type CustomerVisitPattern } from '@/lib/customerVisitPattern'
import type { CustomerRankTarget } from '@/lib/customerRankChange'
import CustomerVisitPatternSummary from './CustomerVisitPatternSummary'
import CustomerCardPreview from './CustomerCardPreview'
import CustomerGoalsOverlay from './CustomerGoalsOverlay'
import CustomerGoalsExport from './CustomerGoalsExport'
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
}
const nameOf = (c: Customer) => c.customer_name || c.nickname || 'お名前未登録'
const shortDate = (date?: string | null) => date?.slice(5).replace('-', '/') || '未記録'
const categoryColor = (category: GoalCategory) => [C.pinkDeep, C.chartBlue, C.goldText, C.chartPurple, C.pinkMuted, C.dark2][GOAL_CATEGORIES.indexOf(category)]
export const customerGoalsColors = { '--goal-text': C.dark, '--goal-muted': C.dark2, '--goal-border': C.border, '--goal-bg': C.bgLight, '--goal-white': C.white, '--goal-tint': C.tagBg, '--goal-pink': C.pinkDeep, '--goal-success': C.successDeep, '--goal-success-bg': C.successBg } as CSSProperties

export default function StarCustomerGoals(p: Props) {
  const [category, setCategory] = useState<GoalCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [previewCustomer, setPreviewCustomer] = useState<Customer | null>(null)
  const [personalId, setPersonalId] = useState<string | null>(null)
  const [personalEditing, setPersonalEditing] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [actionsId, setActionsId] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [message, setMessage] = useState('')
  const previewId = previewCustomer ? String(previewCustomer.id) : null
  const editingId = editingCustomer ? String(editingCustomer.id) : null
  const overlayOpen = !!(previewId || personalId || editingId)
  const goals = useCustomerGoals(p.castId, p.month, p.revision, overlayOpen || p.busy || exportBusy)
  const busy = p.busy || goals.saving || exportBusy
  const ready = !!goals.data && p.metadataReady && !goals.error && !p.metadataError && p.customers.every(c => goals.data!.customerIds.includes(String(c.id)))
  const canEdit = p.canManage && !!goals.data?.canEdit
  const onBusyChange = p.onBusyChange
  useEffect(() => { onBusyChange(overlayOpen || goals.saving || exportBusy); return () => onBusyChange(false) }, [overlayOpen, goals.saving, exportBusy, onBusyChange])
  const goalMap = useMemo(() => new Map((goals.data?.goals || []).map(g => [String(g.customer_id), g])), [goals.data])
  const todayCustomers = p.metadataReady ? p.customers.filter(c => isStarredContactDue({ ...c, is_starred: true }, starredElapsedDays(p.today, p.lastVisits.get(String(c.id))))) : []
  const scopeCustomers = p.view === 'today' ? todayCustomers : p.customers
  const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ja').replace(/\s+/gu, '')
  const rows = scopeCustomers.filter(c => (category === 'all' || customerGoalCategory(c) === category)
    && (p.logs.filter === 'all' || (p.logs.ready && !p.logs.error && !!p.today && matchesStarCheck(p.logs.summaries.get(String(c.id)), p.logs.filter, p.today)))
    && (!query || normalized(`${nameOf(c)} ${c.nickname || ''} ${p.bottleSearch.get(String(c.id)) || ''}`).includes(normalized(query))))
  const salesSet = p.customers.some(c => goalMap.get(String(c.id))?.target_sales != null)
  const visitsSet = p.customers.some(c => goalMap.get(String(c.id))?.target_visits != null)
  const sums = sumCustomerGoals(p.customers.map(c => String(c.id)), goalMap, goals.data?.actuals || {})
  const report: GoalReport = { castName: p.castName, month: p.month, today: p.today || '', rows: GOAL_CATEGORIES.flatMap(cat => p.customers.filter(c => customerGoalCategory(c) === cat)).map(c => {
    const id = String(c.id), g = goalMap.get(id), a = goals.data?.actuals[id], cycle = p.logs.summaries.get(id)
    return { id, name: nameOf(c), region: c.region, occupation: c.occupation, category: customerGoalCategory(c), targetSales: g?.target_sales ?? null, targetVisits: g?.target_visits ?? null, sales: a?.sales ?? 0, visits: a?.visits ?? 0, note: g?.note || '', lastVisit: p.lastVisits.get(id) || null, checked: p.logs.ready && !p.logs.error ? cycle?.last_checked_on === p.today : null, checkedBy: cycle?.last_checked_on === p.today ? cycle?.last_checked_by || null : null }
  }) }
  // 他端末で星解除/担当移動されてもオーバーレイの入力を消さない。保存APIで再認可する。
  const preview = p.customers.find(c => String(c.id) === previewId) || previewCustomer
  const editing = p.customers.find(c => String(c.id) === editingId) || editingCustomer
  const openInfo = (id: string) => { setActionsId(null); setPreviewCustomer(p.customers.find(c => String(c.id) === id) || null); setMessage('') }
  const openEdit = (id: string) => { if (ready && canEdit && !busy) { setActionsId(null); setEditingCustomer(p.customers.find(c => String(c.id) === id) || null) } }
  const queue = rows.map(c => ({ id: String(c.id), name: nameOf(c), castName: c.cast_name }))
  const closePersonal = () => { setPersonalId(null); setPersonalEditing(false); p.onRefresh(); goals.reload() }
  return <section className={styles.root} style={customerGoalsColors} data-block-tab-swipe="true">
    <div className={styles.topline}><span>⭐️ {p.castName}</span><label>対象月 <CompactListField compact><input aria-label="目標の対象月" type="month" min="2000-01" max="2199-12" value={p.month} disabled={busy || overlayOpen} onChange={e => { if (validGoalMonth(e.target.value)) p.setMonth(e.target.value) }}/></CompactListField></label></div>
    <nav className={styles.tabs} aria-label="⭐️の表示"><button type="button" aria-pressed={p.view === 'today'} disabled={busy} onClick={() => p.onView('today')}>本日連絡 <b>{p.metadataReady ? todayCustomers.length : '…'}</b></button><button type="button" aria-pressed={p.view === 'all'} disabled={busy} onClick={() => p.onView('all')}>⭐️全員表示・目標 <b>{p.customers.length}</b></button></nav>
    <div className={styles.settings}>設定売上 <b>{p.target?.target_sales == null ? '未設定' : goalYen(p.target.target_sales)}</b><span>単価 <b>{p.target?.target_avg_spend == null ? '—' : goalYen(p.target.target_avg_spend)}</b></span><span>出勤 <b>{p.target?.target_work_days ?? '—'}日</b></span></div>
    <div className={styles.summary} aria-label="⭐️全員の月別合計"><div><small>⭐️全員の売上 実績 / 目標</small><strong>{ready ? goalYen(sums.sales) : '—'} <span>/ {ready ? salesSet ? goalYen(sums.targetSales) : '未設定' : '—'}</span></strong><small>{ready ? goalGapLabel(salesSet ? sums.targetSales : null, sums.sales, '円') + (sums.unset ? `・未設定 ${sums.unset}名` : '') : '集計を確認中'}</small></div><div><small>来店回数 実績 / 目標</small><strong>{ready ? sums.visits : '—'} <span>/ {ready ? visitsSet ? sums.targetVisits + '回' : '未設定' : '—'}</span></strong><small>{ready ? goalGapLabel(visitsSet ? sums.targetVisits : null, sums.visits, '回') : '集計を確認中'}</small></div></div>
    {(goals.error || p.metadataError) && <p role="alert" className={styles.error}>{goals.error || '来店情報を取得できませんでした。実績を0として表示していません。'} <button type="button" onClick={() => { goals.reload(); p.onRefresh() }}>再取得</button></p>}
    <div className={styles.categories} aria-label="指名と地域で絞り込み"><button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>全分類 {scopeCustomers.length}</button>{GOAL_CATEGORIES.map((cat, index) => <button type="button" key={cat} className={index >= 4 ? styles.secondaryCategory : undefined} aria-pressed={category === cat} style={{ '--category': categoryColor(cat) } as CSSProperties} onClick={() => setCategory(cat)}>{cat} <b>{scopeCustomers.filter(c => customerGoalCategory(c) === cat).length}</b></button>)}<label className={styles.otherCategory}><select aria-label="その他の分類" value={category === 'その他・地域未設定' || category === '切れたお客様' ? category : 'all'} onChange={e => setCategory(e.target.value as GoalCategory | 'all')}><option value="all">その他</option>{GOAL_CATEGORIES.slice(4).map(cat => <option key={cat} value={cat}>{cat} {scopeCustomers.filter(c => customerGoalCategory(c) === cat).length}名</option>)}</select></label></div>
    {searchOpen && <div className={styles.controls}><label className={styles.search}><span className={styles.srOnly}>お客様を検索</span><CompactListField compact><input aria-label="名前・ボトル名で検索" value={query} onChange={e => setQuery(e.target.value)} placeholder="名前・ボトル名で検索"/></CompactListField></label><label><span className={styles.srOnly}>並び順</span><CompactListField compact><select aria-label="並び順" value={p.sortKey} onChange={e => p.onSort(e.target.value as CustomerSortKey)}>{CUSTOMER_SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></CompactListField></label></div>}
    <div className={styles.controls}><label className={styles.checkFilter}><CompactListField compact><select aria-label="本日の確認状況" value={p.logs.filter} disabled={busy || !p.logs.ready || !!p.logs.error} onChange={e => p.logs.setFilter(e.target.value as 'all' | 'checked' | 'unchecked')}><option value="all">全員</option><option value="unchecked">今日未確認</option><option value="checked">今日確認済み</option></select></CompactListField></label>{p.logs.HistoryButton}<button type="button" aria-expanded={searchOpen} onClick={() => setSearchOpen(v => !v)}>検索{query ? '●' : ''}・並び</button><CustomerGoalsExport report={report} disabled={!ready || busy || p.refreshing === true || !p.today || !p.customers.length} onBusyChange={setExportBusy}/></div>
    {p.logs.error && <p role="alert" className={styles.error}>{p.logs.error}（確認状況は未取得）</p>}
    {message && <p role="status" className={styles.error}>{message}</p>}
    <p className={styles.hint}>{p.view === 'today' ? '本日の連絡対象' : '一覧は閲覧用'} · 長押しで情報 · スワイプ／⋯で編集 <span>{rows.length}名</span></p>
    <div className={styles.list} data-customer-scroll>
      <div className={styles.tableHead}><span>お客様</span><span>最終来店</span><span>目標売上 / 実績</span><span>目標来店 / 実績</span><span>備考</span><span>確認・記録</span></div>
      {GOAL_CATEGORIES.map(cat => {
        const members = rows.filter(c => customerGoalCategory(c) === cat)
        return members.length > 0 && <section key={cat} style={{ '--category': categoryColor(cat) } as CSSProperties} className={styles.group}><h3>{cat}<span>{members.length}名</span></h3>{members.map(c => {
          const id = String(c.id), cycle = p.logs.summaries.get(id)
          return <GoalRow key={id} customer={c} goal={goalMap.get(id)} actual={goals.data?.actuals[id]} ready={ready && !!goals.data?.customerIds.includes(id)} cycle={cycle} logsReady={p.logs.ready && !p.logs.error} today={p.today} lastVisit={p.metadataReady ? p.lastVisits.get(id) : undefined}
            busy={busy} canManage={p.canManage} canEdit={canEdit && ready} actionsOpen={actionsId === id} noReply={p.noReply.has(id)} confirming={p.logs.confirming === id}
            onInfo={() => openInfo(id)} onEdit={() => openEdit(id)} onActions={() => setActionsId(actionsId === id ? null : id)}
            onLog={() => p.logs.open({ id, name: nameOf(c), castName: c.cast_name }, queue)}
            onConfirm={() => { void p.logs.confirmToday({ id, name: nameOf(c), castName: c.cast_name }).catch(e => setMessage(e instanceof Error ? e.message : '確認を保存できませんでした')) }}
            onRemove={() => { if (window.confirm(`${nameOf(c)}の⭐️を解除しますか？\n目標・備考・記録は残り、一覧と合計から外れます。`)) { setActionsId(null); void p.onRemoveStar([id]) } }}
            onNoReply={() => { setActionsId(null); void p.onNoReply([id], !p.noReply.has(id)) }}
            onSever={() => { setActionsId(null); void p.onSever([{ id, name: nameOf(c), previousRank: c.customer_rank }]) }}
            onRank={() => { setActionsId(null); p.onRank({ id, name: nameOf(c), previousRank: c.customer_rank }) }}/>
        })}</section>
      })}
      {!rows.length && <p className={styles.empty}>{p.view === 'today' && !p.metadataReady ? '来店日を確認中…' : p.customers.length ? 'この条件のお客様はいません' : '⭐️を付けたお客様が自動で表示されます'}</p>}
    </div>
    <p className={styles.hint}>県内＝福岡県。本指名・場内を分けて集計。実績は対象月の実来店。⭐️解除後も目標・備考は保存されます。</p>
    {preview && <CustomerCardPreview name={nameOf(preview)} title="お客様情報" onClose={() => setPreviewCustomer(null)} footer={<><button type="button" onClick={() => setPreviewCustomer(null)}>一覧に戻る</button>{canEdit && <button type="button" disabled={!ready || !p.customers.some(c => String(c.id) === previewId)} onClick={() => openEdit(String(preview.id))}>目標・備考を編集</button>}<button type="button" onClick={() => setPersonalId(String(preview.id))}>個人ページを開く ›</button></>}>
      <h2 className={styles.infoName}>{nameOf(preview)}</h2><div className={styles.infoGrid}>{[
        ['お住まい', preview.region || '未設定'], ['職業・年代', `${preview.occupation || '未設定'}・${preview.age_group || '未設定'}`],
        ['担当キャスト', preview.cast_name], ['担当スタッフ', p.staffNames.get(String(preview.id))?.join('・') || '未設定'],
        ['最終来店日', p.lastVisits.get(String(preview.id)) || '未記録'], ['最終連絡日', preview.last_contact_date || '未記録'],
        ['指名・ランク', `${preview.nomination_status}・${preview.customer_rank}`], ['累計来店・売上', `${p.counts.get(String(preview.id)) ?? '—'}回・${p.totals.has(String(preview.id)) ? goalYen(p.totals.get(String(preview.id))!) : '—'}`],
        ['客単価', p.averages.has(String(preview.id)) ? goalYen(p.averages.get(String(preview.id))!) : '—'], ['お連れ様', [p.companions.get(String(preview.id))?.honshimei, p.companions.get(String(preview.id))?.banai].filter(Boolean).join('・') || '未記録'],
      ].map(([label, value]) => <div key={label}><small>{label}</small><div>{value}</div></div>)}</div>
      <CustomerVisitPatternSummary pattern={p.patterns.get(String(preview.id))}/>
      <h4>{p.month.replace('-', '年')}月の目標・実績</h4><div className={styles.infoGrid}><Metric target={goalMap.get(String(preview.id))?.target_sales} actual={goals.data?.actuals[String(preview.id)]?.sales ?? 0} unit="円" ready={ready}/><Metric target={goalMap.get(String(preview.id))?.target_visits} actual={goals.data?.actuals[String(preview.id)]?.visits ?? 0} unit="回" ready={ready}/></div>
      <p className={styles.fullNote}>備考：{goalMap.get(String(preview.id))?.note || '未入力'}</p>
    </CustomerCardPreview>}
    {personalId && <CustomerGoalsOverlay title="お客様の個人ページ" onClose={closePersonal} busy={personalEditing} large><p className={styles.personalHint}>月別目標は元の一覧の「目標・備考を編集」から保存できます。</p><CustomerDetailPanel customerId={personalId} isAdmin={p.isAdmin} responsiveContainer hideLegacyMonthlyTargets onEditingChange={setPersonalEditing}/></CustomerGoalsOverlay>}
    {editing && <GoalEditor key={`${editingId}:${p.month}`} customer={editing} month={p.month} castId={p.castId} initial={goalMap.get(String(editing.id))} save={goals.save} saving={goals.saving} onClose={() => setEditingCustomer(null)}/>}
  </section>
}

function Metric({ target, actual, unit, ready }: { target?: number | null; actual: number; unit: '円' | '回'; ready: boolean }) {
  const amount = (n: number) => unit === '円' ? goalYen(n) : `${n}回`
  return <div className={styles.metric}><div><small>{unit === '円' ? '目標売上' : '目標来店'}</small><span>{!ready ? '—' : target == null ? '未設定' : amount(target)}</span></div><div><small>実績</small><b>{ready ? amount(actual) : '—'}</b></div><small className={styles.gap}>{ready ? goalGapLabel(target, actual, unit) : '取得を確認中'}</small></div>
}
function GoalRow(p: { customer: Customer; goal?: CustomerMonthlyGoal; actual?: CustomerGoalActual; ready: boolean; cycle?: StarCycle; logsReady: boolean; today: string | null; lastVisit?: string; busy: boolean; canManage: boolean; canEdit: boolean; actionsOpen: boolean; noReply: boolean; confirming: boolean; onInfo: () => void; onEdit: () => void; onActions: () => void; onLog: () => void; onConfirm: () => void; onRemove: () => void; onNoReply: () => void; onSever: () => void; onRank: () => void }) {
  const gesture = useCustomerCardGesture({ disabled: p.busy, longPress: !p.actionsOpen, canSwipe: p.canManage, onLongPress: p.onInfo, onSwipe: direction => { if ((direction === 'left') !== p.actionsOpen) p.onActions() } })
  const checked = p.logsReady && !!p.today && p.cycle?.last_checked_on === p.today
  return <div className={styles.rowFrame} data-customer-swipe="true" data-customer-id={p.customer.id}>
    {p.canManage && <div className={styles.actions} inert={!p.actionsOpen || p.busy} aria-hidden={!p.actionsOpen}><button type="button" disabled={!p.canEdit || p.busy} onClick={p.onEdit}>目標・備考<br/>編集</button><button type="button" disabled={p.busy} onClick={p.onRank}>ランク変更</button><button type="button" disabled={p.busy} onClick={p.onRemove}>⭐️解除</button><button type="button" disabled={p.busy} onClick={p.onNoReply}>{p.noReply ? '返信なし解除' : '返信なし'}</button><button type="button" disabled={p.busy || p.customer.customer_rank === '切れた'} onClick={p.onSever}>切れたへ</button><button type="button" onClick={p.onActions}>戻る</button></div>}
    <div className={`${styles.row} ${p.actionsOpen ? styles.shifted : ''}`} onTouchStart={gesture.onTouchStart} onTouchMove={gesture.onTouchMove} onTouchEnd={gesture.onTouchEnd} onTouchCancel={gesture.onTouchCancel} onContextMenu={e => e.preventDefault()} onClick={() => { if (!gesture.consumeClick() && p.actionsOpen) p.onActions() }}>
      <div className={styles.identity}><span className={styles.name} role="button" tabIndex={0} onClick={e => { e.stopPropagation(); if (!gesture.consumeClick() && !p.busy) p.onInfo() }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onInfo() } }}>★ {nameOf(p.customer)}</span><small>{p.customer.customer_rank || '—'} · {p.customer.nomination_status} · {p.customer.region || '地域未設定'}{p.noReply ? ' · 返信なし' : ''}</small></div>
      <div className={styles.lastVisit}><small>最終来店 {shortDate(p.lastVisit)}</small><small>{p.lastVisit && p.today ? `${starredElapsedDays(p.today, p.lastVisit)}日前` : '—'}</small></div>
      <Metric target={p.goal?.target_sales} actual={p.actual?.sales ?? 0} unit="円" ready={p.ready}/><Metric target={p.goal?.target_visits} actual={p.actual?.visits ?? 0} unit="回" ready={p.ready}/>
      <div className={styles.note} title={p.goal?.note || '未入力'}><small>備考</small> {p.ready ? p.goal?.note || '未入力' : '取得を確認中'}</div>
      <div className={styles.activity}><button type="button" className={`${styles.confirm} ${checked ? styles.checked : ''}`} disabled={p.busy || !p.canManage || !p.logsReady || !p.today || checked} onClick={e => { e.stopPropagation(); p.onConfirm() }} title={checked ? `本日確認済み · ${p.cycle?.last_checked_by || ''}` : '連絡状況を確認した記録を保存'}>{p.confirming ? '保存中…' : checked ? `✓ 本日確認済み${p.cycle?.last_checked_by ? ' · ' + p.cycle.last_checked_by : ''}` : '本日確認'}</button><button type="button" disabled={p.busy} onClick={e => { e.stopPropagation(); p.onLog() }} title={`開始 ${p.cycle?.started_on || '未設定'}・確認 ${p.cycle?.last_checked_on || '未記録'}・${p.cycle?.last_status || '未記録'}`}>記録・ログ</button></div>
      {p.canManage && <button type="button" className={styles.more} aria-label={`${nameOf(p.customer)}の操作を表示`} disabled={p.busy} onClick={e => { e.stopPropagation(); p.onActions() }}>⋯</button>}
    </div>
  </div>
}

function GoalEditor({ customer, month, castId, initial, save, saving, onClose }: { customer: Customer; month: string; castId: string; initial?: CustomerMonthlyGoal; save: ReturnType<typeof useCustomerGoals>['save']; saving: boolean; onClose: () => void }) {
  const [sales, setSales] = useState(initial?.target_sales?.toString() ?? ''), [visits, setVisits] = useState(initial?.target_visits?.toString() ?? ''), [note, setNote] = useState(initial?.note || '')
  const [error, setError] = useState(''), [discard, setDiscard] = useState(false)
  const dirty = sales !== (initial?.target_sales?.toString() ?? '') || visits !== (initial?.target_visits?.toString() ?? '') || note !== (initial?.note || '')
  const close = () => { if (saving) return; if (dirty) setDiscard(true); else onClose() }
  return <CustomerGoalsOverlay title={`${nameOf(customer)} · 目標・備考の編集`} onClose={close} busy={saving}><form className={styles.editor} onSubmit={e => { e.preventDefault(); setError(''); void save({ castId, customerId: String(customer.id), month, targetSales: sales.trim() === '' ? null : Number(sales), targetVisits: visits.trim() === '' ? null : Number(visits), note, expectedRevision: initial?.revision || 0 }).then(onClose).catch(e => setError(e instanceof Error ? e.message : '保存できませんでした')) }}>
    <p>{month.replace('-', '年')}月 / {customer.cast_name}<br/><small>空欄は未設定。0は0円・0回の目標として保存します。</small></p>
    <label>目標売上（円）<input aria-label="目標売上（円）" type="number" inputMode="numeric" min="0" max="99999999" step="1" value={sales} onChange={e => setSales(e.target.value)} disabled={saving}/></label>
    <label>目標来店回数（回）<input aria-label="目標来店回数（回）" type="number" inputMode="numeric" min="0" max="999" step="1" value={visits} onChange={e => setVisits(e.target.value)} disabled={saving}/></label>
    <label>備考<textarea aria-label="月別の備考" rows={5} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} disabled={saving}/><small>{note.length}/2000文字</small></label>
    {error && <p role="alert" className={styles.error}>{error}<br/>入力内容はこの画面に残しています。</p>}
    {discard ? <div key="discard" role="alert"><p>入力内容を破棄して閉じますか？</p><button type="button" onClick={e => { e.preventDefault(); setDiscard(false) }}>編集を続ける</button><button type="button" onClick={onClose}>破棄して閉じる</button></div> : <div key="save" className={styles.editorFooter}><button type="button" disabled={saving} onClick={close}>キャンセル</button><button type="submit" disabled={saving || !dirty}>{saving ? '保存中…' : '保存する'}</button></div>}
  </form></CustomerGoalsOverlay>
}
