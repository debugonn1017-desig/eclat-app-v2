'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import PageHeader from '@/components/PageHeader'
import Spinner from '@/components/ui/Spinner'
import { useToast } from '@/hooks/useToast'
import { fetchMe } from '@/lib/authCache'
import {
  CAST_TRAINING_CATEGORIES,
  CAST_TRAINING_CATEGORY_META,
  CAST_TRAINING_MEMO_MAX,
  type CastTrainingCategory,
  type CastTrainingSchedule,
} from '@/lib/castTrainingSchedule'
import { thisMonthJST, todayJST } from '@/lib/dateUtils'
import { CAST_TIERS, type CastTier } from '@/types'
import styles from './page.module.css'

type CastRow = {
  id: string
  cast_name: string | null
  display_name: string | null
  cast_tier: CastTier | null
  created_at: string
}

type StaffRow = {
  id: string
  cast_name: string | null
  display_name: string | null
  is_owner: boolean
  created_at: string
}

type ShiftRow = {
  cast_id: string
  shift_date: string
  status: string
}

type PageData = {
  month: string
  casts: CastRow[]
  staff: StaffRow[]
  shifts: ShiftRow[]
  schedules: CastTrainingSchedule[]
}

type TierGroup = CastTier | '層未設定'
type ViewMode = 'cast' | 'tier'

const TIER_GROUPS: TierGroup[] = [...CAST_TIERS, '層未設定']
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

const displayCastName = (cast?: CastRow) => cast?.cast_name?.trim() || cast?.display_name?.trim() || '名前未設定'
const displayStaffName = (staff?: StaffRow) => staff?.display_name?.trim() || staff?.cast_name?.trim() || '管理者'
const scheduleKey = (castId: string, date: string) => `${castId}:${date}`
const tierOf = (cast?: CastRow): TierGroup => cast?.cast_tier && CAST_TIERS.includes(cast.cast_tier) ? cast.cast_tier : '層未設定'

function changeMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) return thisMonthJST()
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${year}年${monthNumber}月`
}

export default function CastTrainingSchedulePage() {
  const router = useRouter()
  const { toast, ToastView } = useToast()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [month, setMonth] = useState(thisMonthJST)
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('cast')
  const [selectedCastId, setSelectedCastId] = useState<string>('')
  const [selectedTier, setSelectedTier] = useState<TierGroup>('新人層')
  const [editor, setEditor] = useState<{ date: string; castIds: string[] } | null>(null)
  const [category, setCategory] = useState<CastTrainingCategory>('phase1')
  const [topic, setTopic] = useState(CAST_TRAINING_CATEGORY_META.phase1.topics[0])
  const [memo, setMemo] = useState('')
  const [assignedStaffId, setAssignedStaffId] = useState('')
  const [isCompleted, setIsCompleted] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const me = await fetchMe().catch(() => null)
      if (!cancelled) setAuthorized(me?.role === 'admin')
    }
    check()
    return () => { cancelled = true }
  }, [])

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    setData(previous => previous?.month === month ? previous : null)
    try {
      const response = await fetch(`/api/admin/training-schedules?month=${encodeURIComponent(month)}`, {
        cache: 'no-store',
        signal,
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || 'スケジュールの取得に失敗しました')
      setData(json as PageData)
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setError(loadError instanceof Error ? loadError.message : 'スケジュールの取得に失敗しました')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [month])

  useEffect(() => {
    if (authorized !== true) return
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [authorized, load])

  useEffect(() => {
    setEditor(null)
  }, [month])

  useEffect(() => {
    if (!data || data.casts.length === 0) return
    if (!data.casts.some(cast => cast.id === selectedCastId)) setSelectedCastId(data.casts[0].id)
    if (!data.casts.some(cast => tierOf(cast) === selectedTier)) {
      setSelectedTier(tierOf(data.casts[0]))
    }
    if (!assignedStaffId || !data.staff.some(staff => staff.id === assignedStaffId)) {
      setAssignedStaffId(data.staff[0]?.id ?? '')
    }
  }, [data, selectedCastId, selectedTier, assignedStaffId])

  useEffect(() => {
    if (!editor) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setEditor(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [editor, saving])

  const castsByTier = useMemo(() => TIER_GROUPS.map(tier => ({
    tier,
    casts: (data?.casts ?? []).filter(cast => tierOf(cast) === tier),
  })).filter(group => group.casts.length > 0), [data])

  const castsById = useMemo(() => new Map((data?.casts ?? []).map(cast => [cast.id, cast])), [data])
  const staffById = useMemo(() => new Map((data?.staff ?? []).map(staff => [staff.id, staff])), [data])
  const shiftSet = useMemo(() => new Set((data?.shifts ?? []).map(shift => scheduleKey(shift.cast_id, shift.shift_date))), [data])
  const scheduleMap = useMemo(() => new Map((data?.schedules ?? []).map(schedule => [scheduleKey(schedule.cast_id, schedule.schedule_date), schedule])), [data])

  const calendarCells = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number)
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
    const cells: Array<number | null> = Array.from({ length: firstDay }, () => null)
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [month])

  const visibleCasts = useMemo(() => {
    if (!data) return []
    if (viewMode === 'cast') return data.casts.filter(cast => cast.id === selectedCastId)
    return data.casts.filter(cast => tierOf(cast) === selectedTier)
  }, [data, viewMode, selectedCastId, selectedTier])

  const selectedCast = castsById.get(selectedCastId) ?? null
  const visibleShiftCount = useMemo(() => {
    let count = 0
    for (const cast of visibleCasts) {
      for (const cell of calendarCells) {
        if (!cell) continue
        const date = `${month}-${String(cell).padStart(2, '0')}`
        if (shiftSet.has(scheduleKey(cast.id, date))) count += 1
      }
    }
    return count
  }, [visibleCasts, calendarCells, month, shiftSet])

  const visibleSchedules = useMemo(() => (data?.schedules ?? []).filter(schedule => (
    visibleCasts.some(cast => cast.id === schedule.cast_id)
    && shiftSet.has(scheduleKey(schedule.cast_id, schedule.schedule_date))
  )), [data, visibleCasts, shiftSet])
  const completedCount = visibleSchedules.filter(schedule => schedule.is_completed).length

  const openEditor = (date: string, castIds: string[]) => {
    if (!data || castIds.length === 0) return
    const existing = castIds.map(castId => scheduleMap.get(scheduleKey(castId, date))).filter(Boolean) as CastTrainingSchedule[]
    const sameSchedule = existing.length === castIds.length && existing.every(item => (
      item.category === existing[0].category
      && item.topic === existing[0].topic
      && item.memo === existing[0].memo
      && item.assigned_staff_id === existing[0].assigned_staff_id
      && item.is_completed === existing[0].is_completed
    ))
    const source = castIds.length === 1 ? existing[0] : sameSchedule ? existing[0] : undefined
    const nextCategory = source?.category ?? 'phase1'
    setCategory(nextCategory)
    setTopic(source?.topic ?? CAST_TRAINING_CATEGORY_META[nextCategory].topics[0])
    setMemo(source?.memo ?? '')
    setAssignedStaffId(
      source?.assigned_staff_id && data.staff.some(staff => staff.id === source.assigned_staff_id)
        ? source.assigned_staff_id
        : data.staff[0]?.id ?? '',
    )
    setIsCompleted(source?.is_completed ?? false)
    setEditor({ date, castIds })
  }

  const getWorkingCasts = (date: string) => visibleCasts.filter(cast => shiftSet.has(scheduleKey(cast.id, date)))

  const updateEditorCast = (castId: string, checked: boolean) => {
    setEditor(previous => {
      if (!previous) return previous
      const next = checked
        ? [...new Set([...previous.castIds, castId])]
        : previous.castIds.filter(id => id !== castId)
      return { ...previous, castIds: next }
    })
  }

  const editorWorkingCasts = editor ? getWorkingCasts(editor.date) : []
  const editorUnscheduledCastIds = editorWorkingCasts
    .filter(cast => !scheduleMap.has(scheduleKey(cast.id, editor?.date ?? '')))
    .map(cast => cast.id)
  const editorSelectedExistingCount = editor?.castIds.filter(castId => (
    scheduleMap.has(scheduleKey(castId, editor.date))
  )).length ?? 0

  const saveSchedule = async () => {
    if (!editor || editor.castIds.length === 0) {
      toast('対象キャストを選択してください', 'error')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/admin/training-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          castIds: editor.castIds,
          scheduleDate: editor.date,
          category,
          topic,
          memo,
          assignedStaffId,
          isCompleted,
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || '保存に失敗しました')
      const items = (json.items ?? []) as CastTrainingSchedule[]
      setData(previous => previous ? {
        ...previous,
        schedules: [
          ...previous.schedules.filter(item => !items.some(saved => saved.id === item.id)),
          ...items,
        ],
      } : previous)
      setEditor(null)
      toast(`${items.length}人分の予定を保存しました`, 'success')
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : '保存に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteSchedules = async () => {
    if (!editor) return
    const existingIds = editor.castIds.filter(castId => scheduleMap.has(scheduleKey(castId, editor.date)))
    if (existingIds.length === 0) return
    if (!window.confirm(`${existingIds.length}人分の予定を削除しますか？`)) return
    setSaving(true)
    try {
      const response = await fetch('/api/admin/training-schedules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ castIds: existingIds, scheduleDate: editor.date }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || '削除に失敗しました')
      setData(previous => previous ? {
        ...previous,
        schedules: previous.schedules.filter(item => !(
          item.schedule_date === editor.date && existingIds.includes(item.cast_id)
        )),
      } : previous)
      setEditor(null)
      toast('予定を削除しました', 'success')
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : '削除に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (authorized === null) {
    return <div className={styles.fullCenter}><Spinner size="md" label="権限を確認中…" /></div>
  }

  if (!authorized) {
    return (
      <div className={styles.fullCenter}>
        <div className={styles.forbidden}>
          <strong>このページは黒服・オーナー専用です</strong>
          <button type="button" onClick={() => router.replace('/home')}>ホームへ戻る</button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {ToastView}
      <PageHeader
        title="新人教育スケジュール表"
        subtitle="層別・キャスト別の教育予定"
        backFallback="/admin/casts"
        actions={(
          <div className={styles.headerActions}>
            <button type="button" onClick={() => setMonth(value => changeMonth(value, -1))} aria-label="前月">‹</button>
            <strong>{monthLabel(month)}</strong>
            <button type="button" onClick={() => setMonth(value => changeMonth(value, 1))} aria-label="翌月">›</button>
            <input aria-label="対象月" type="month" value={month} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value) }} />
          </div>
        )}
      />

      <main className={styles.main}>
        <section className={styles.toolbar}>
          <div>
            <span>表示単位</span>
            <div className={styles.modeSwitch}>
              <button type="button" data-active={viewMode === 'cast' || undefined} onClick={() => setViewMode('cast')}>キャスト別</button>
              <button type="button" data-active={viewMode === 'tier' || undefined} onClick={() => setViewMode('tier')}>層別まとめ</button>
            </div>
          </div>
          <div className={styles.legend}>
            {CAST_TRAINING_CATEGORIES.map(key => <span key={key} data-category={key}>{CAST_TRAINING_CATEGORY_META[key].label}</span>)}
            <span data-completed="true">✓ 実施済み</span>
          </div>
        </section>

        {error && <div className={styles.errorCard}>{error}<button type="button" onClick={() => load()}>再読み込み</button></div>}
        {loading && !data ? (
          <div className={styles.loading}><Spinner size="md" label="教育予定を読み込み中…" /></div>
        ) : data ? (
          <div className={styles.layout}>
            <aside className={styles.sidebar}>
              <div className={styles.sidebarHeader}>
                <strong>{viewMode === 'cast' ? 'キャスト一覧' : 'キャスト層'}</strong>
                <span>{data.casts.length}人</span>
              </div>
              {viewMode === 'cast' ? castsByTier.map(group => (
                <section key={group.tier} className={styles.sidebarGroup}>
                  <h2>{group.tier}<span>{group.casts.length}人</span></h2>
                  {group.casts.map(cast => (
                    <button
                      key={cast.id}
                      type="button"
                      data-active={selectedCastId === cast.id || undefined}
                      onClick={() => setSelectedCastId(cast.id)}
                    >
                      <i>{displayCastName(cast).slice(0, 1)}</i>
                      <strong>{displayCastName(cast)}</strong>
                      <span>›</span>
                    </button>
                  ))}
                </section>
              )) : castsByTier.map(group => (
                <button
                  key={group.tier}
                  type="button"
                  className={styles.tierButton}
                  data-active={selectedTier === group.tier || undefined}
                  onClick={() => setSelectedTier(group.tier)}
                >
                  <span>{group.tier}</span>
                  <strong>{group.casts.length}人</strong>
                  <b>›</b>
                </button>
              ))}
            </aside>

            <section className={styles.content}>
              <div className={styles.selectionHeader}>
                <div>
                  <span>{viewMode === 'cast' ? tierOf(selectedCast ?? data.casts[0]) : selectedTier}</span>
                  <h1>{viewMode === 'cast' ? (selectedCast ? displayCastName(selectedCast) : 'キャスト未選択') : `${selectedTier} まとめ編集`}</h1>
                  <p>{viewMode === 'cast' ? '出勤日に教育・面談予定を設定します' : '同じ日の出勤キャストへまとめて設定できます'}</p>
                </div>
                <div className={styles.summaryCards}>
                  <article><span>確定出勤</span><strong>{visibleShiftCount}<small>日</small></strong></article>
                  <article><span>予定設定</span><strong>{visibleSchedules.length}<small>件</small></strong></article>
                  <article><span>実施済み</span><strong>{completedCount}<small>件</small></strong></article>
                  <article data-alert={visibleShiftCount - visibleSchedules.length > 0 || undefined}><span>未設定</span><strong>{Math.max(0, visibleShiftCount - visibleSchedules.length)}<small>件</small></strong></article>
                </div>
              </div>

              <div className={styles.calendarPanel}>
                <div className={styles.calendarTitle}>
                  <div><button type="button" onClick={() => setMonth(value => changeMonth(value, -1))}>‹</button><h2>{monthLabel(month)}</h2><button type="button" onClick={() => setMonth(value => changeMonth(value, 1))}>›</button></div>
                  <span>出勤日を選択して予定を登録</span>
                </div>
                <div className={styles.calendar}>
                  {WEEKDAYS.map((weekday, index) => <div key={weekday} className={styles.weekday} data-weekend={index === 0 ? 'sun' : index === 6 ? 'sat' : undefined}>{weekday}</div>)}
                  {calendarCells.map((day, index) => {
                    if (!day) return <div key={`blank-${index}`} className={styles.blankDay} />
                    const date = `${month}-${String(day).padStart(2, '0')}`
                    const workingCasts = getWorkingCasts(date)
                    const schedules = workingCasts.map(cast => scheduleMap.get(scheduleKey(cast.id, date))).filter(Boolean) as CastTrainingSchedule[]
                    const isToday = date === todayJST()
                    const individualSchedule = viewMode === 'cast' ? schedules[0] : undefined
                    const canOpen = workingCasts.length > 0
                    const categoryCounts = CAST_TRAINING_CATEGORIES.map(key => ({ key, count: schedules.filter(item => item.category === key).length })).filter(item => item.count > 0)
                    return (
                      <button
                        key={date}
                        type="button"
                        className={styles.dayCell}
                        data-today={isToday || undefined}
                        data-working={canOpen || undefined}
                        disabled={!canOpen}
                        onClick={() => openEditor(date, workingCasts.map(cast => cast.id))}
                      >
                        <div className={styles.dayNumber}><strong>{day}</strong>{isToday && <span>今日</span>}</div>
                        {!canOpen ? <span className={styles.offLabel}>—</span> : viewMode === 'cast' ? (
                          individualSchedule ? (
                            <div className={styles.scheduleCard} data-category={individualSchedule.category} data-completed={individualSchedule.is_completed || undefined}>
                              <div><b>{CAST_TRAINING_CATEGORY_META[individualSchedule.category].label}</b>{individualSchedule.is_completed && <span>✓ 実施済</span>}</div>
                              <strong>{individualSchedule.topic}</strong>
                              <small>担当　{staffById.has(individualSchedule.assigned_staff_id) ? displayStaffName(staffById.get(individualSchedule.assigned_staff_id)) : '退職・無効な担当者'}</small>
                            </div>
                          ) : <span className={styles.addLabel}>＋ 予定を設定</span>
                        ) : (
                          <div className={styles.tierDaySummary}>
                            <strong>出勤 {workingCasts.length}人</strong>
                            <span>設定 {schedules.length}人</span>
                            <div>{categoryCounts.map(item => <i key={item.key} data-category={item.key}>{CAST_TRAINING_CATEGORY_META[item.key].shortLabel} {item.count}</i>)}</div>
                            {schedules.length < workingCasts.length && <b>未設定 {workingCasts.length - schedules.length}人</b>}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </main>

      {editor && data && (
        <div className={styles.overlay} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setEditor(null) }}>
          <section className={styles.drawer} role="dialog" aria-modal="true" aria-label="教育予定の編集">
            <header>
              <div><span>教育・面談予定</span><h2>{editor.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日')}</h2></div>
              <button type="button" onClick={() => setEditor(null)} disabled={saving} aria-label="閉じる">×</button>
            </header>
            <div className={styles.drawerBody}>
              <section className={styles.formSection}>
                <div className={styles.formSectionTitle}><strong>対象キャスト</strong><span>{editor.castIds.length}人選択</span></div>
                {editorWorkingCasts.length > 1 && (
                  <div className={styles.bulkSelectionActions}>
                    <button type="button" onClick={() => setEditor(previous => previous ? { ...previous, castIds: editorWorkingCasts.map(cast => cast.id) } : previous)}>出勤者を全選択</button>
                    <button type="button" disabled={editorUnscheduledCastIds.length === 0} onClick={() => setEditor(previous => previous ? { ...previous, castIds: editorUnscheduledCastIds } : previous)}>未設定だけ選択</button>
                  </div>
                )}
                {editorSelectedExistingCount > 0 && (
                  <p className={styles.overwriteNotice}>選択中のうち{editorSelectedExistingCount}人は登録済みです。保存すると、選択中の内容で上書きされます。</p>
                )}
                <div className={styles.castChecks}>
                  {editorWorkingCasts.map(cast => {
                    const existing = scheduleMap.get(scheduleKey(cast.id, editor.date))
                    return (
                      <div key={cast.id}>
                        <label>
                          <input type="checkbox" checked={editor.castIds.includes(cast.id)} onChange={event => updateEditorCast(cast.id, event.target.checked)} />
                          <span><strong>{displayCastName(cast)}</strong><small>{tierOf(cast)}{existing ? `・${CAST_TRAINING_CATEGORY_META[existing.category].label}` : '・未設定'}</small></span>
                        </label>
                        {existing && <button type="button" onClick={() => openEditor(editor.date, [cast.id])}>個別編集</button>}
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className={styles.formSection}>
                <div className={styles.formSectionTitle}><strong>担当者</strong><span>実際に話す黒服・オーナー</span></div>
                <select value={assignedStaffId} onChange={event => setAssignedStaffId(event.target.value)}>
                  <option value="">担当者を選択</option>
                  {data.staff.map(staff => <option key={staff.id} value={staff.id}>{displayStaffName(staff)}{staff.is_owner ? '（オーナー）' : ''}</option>)}
                </select>
              </section>

              <section className={styles.formSection}>
                <div className={styles.formSectionTitle}><strong>区分</strong><span>4つから選択</span></div>
                <div className={styles.categoryButtons}>
                  {CAST_TRAINING_CATEGORIES.map(key => <button key={key} type="button" data-category={key} data-active={category === key || undefined} onClick={() => { setCategory(key); setTopic(CAST_TRAINING_CATEGORY_META[key].topics[0]) }}>{CAST_TRAINING_CATEGORY_META[key].label}</button>)}
                </div>
              </section>

              <section className={styles.formSection}>
                <div className={styles.formSectionTitle}><strong>話す項目</strong><span>区分別の定型項目</span></div>
                <select value={topic} onChange={event => setTopic(event.target.value)}>
                  {CAST_TRAINING_CATEGORY_META[category].topics.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </section>

              <section className={styles.formSection}>
                <div className={styles.formSectionTitle}><strong>自由メモ</strong><span>{memo.length.toLocaleString()} / {CAST_TRAINING_MEMO_MAX.toLocaleString()}文字</span></div>
                <textarea value={memo} maxLength={CAST_TRAINING_MEMO_MAX} onChange={event => setMemo(event.target.value)} placeholder="話す内容・確認したいこと・次回への申し送りなど" />
              </section>

              <label className={styles.completeCheck}>
                <input type="checkbox" checked={isCompleted} onChange={event => setIsCompleted(event.target.checked)} />
                <span><strong>実際に実施できた</strong><small>チェックすると実施済みとして記録されます</small></span>
              </label>
            </div>
            <footer>
              <button type="button" className={styles.deleteButton} onClick={deleteSchedules} disabled={saving || !editor.castIds.some(castId => scheduleMap.has(scheduleKey(castId, editor.date)))}>予定を削除</button>
              <button type="button" className={styles.cancelButton} onClick={() => setEditor(null)} disabled={saving}>キャンセル</button>
              <button type="button" className={styles.saveButton} onClick={saveSchedule} disabled={saving || editor.castIds.length === 0 || !assignedStaffId}>{saving ? '保存中…' : `${editor.castIds.length}人分を保存`}</button>
            </footer>
          </section>
        </div>
      )}
      <BottomNav />
    </div>
  )
}
