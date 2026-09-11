'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Spinner from '@/components/ui/Spinner'
import { fetchMe } from '@/lib/authCache'
import {
  CAST_TRAINING_CATEGORY_META,
  isRealDateOnly,
  type CastTrainingSchedule,
} from '@/lib/castTrainingSchedule'
import { todayJST } from '@/lib/dateUtils'
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

type ShiftRow = { cast_id: string; shift_date: string; status: string }
type PageData = {
  month: string
  casts: CastRow[]
  staff: StaffRow[]
  shifts: ShiftRow[]
  schedules: CastTrainingSchedule[]
}
type TierGroup = CastTier | '層未設定'

const TIER_GROUPS: TierGroup[] = [...CAST_TIERS, '層未設定']
const displayCastName = (cast?: CastRow) => cast?.cast_name?.trim() || cast?.display_name?.trim() || '名前未設定'
const displayStaffName = (staff?: StaffRow) => staff?.display_name?.trim() || staff?.cast_name?.trim() || '管理者'
const tierOf = (cast?: CastRow): TierGroup => cast?.cast_tier && CAST_TIERS.includes(cast.cast_tier) ? cast.cast_tier : '層未設定'

function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${year}年${month}月${day}日（${weekday}）`
}

export default function TrainingSchedulePrintPage() {
  const [date, setDate] = useState(todayJST)
  const [queryReady, setQueryReady] = useState(false)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const autoPrinted = useRef(false)

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('date') ?? ''
    if (isRealDateOnly(requested)) setDate(requested)
    setQueryReady(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchMe().then(me => {
      if (!cancelled) setAuthorized(me?.role === 'admin')
    }).catch(() => {
      if (!cancelled) setAuthorized(false)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!queryReady || authorized !== true) return
    const controller = new AbortController()
    const load = async () => {
      try {
        setError(null)
        setData(null)
        const response = await fetch(`/api/admin/training-schedules?month=${encodeURIComponent(date.slice(0, 7))}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const json = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(json.error || '当日予定の取得に失敗しました')
        setData(json as PageData)
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return
        setError(loadError instanceof Error ? loadError.message : '当日予定の取得に失敗しました')
      }
    }
    load()
    return () => controller.abort()
  }, [authorized, date, queryReady])

  const rowsByTier = useMemo(() => {
    if (!data) return []
    const castsById = new Map(data.casts.map(cast => [cast.id, cast]))
    const staffById = new Map(data.staff.map(staff => [staff.id, staff]))
    const shiftsByCastId = new Map(data.shifts.filter(shift => shift.shift_date === date).map(shift => [shift.cast_id, shift.status]))
    const rows = data.schedules
      .filter(schedule => schedule.schedule_date === date && castsById.has(schedule.cast_id))
      .map(schedule => ({
        schedule,
        cast: castsById.get(schedule.cast_id)!,
        staffName: staffById.has(schedule.assigned_staff_id)
          ? displayStaffName(staffById.get(schedule.assigned_staff_id))
          : '退職・無効な担当者',
        shiftStatus: shiftsByCastId.get(schedule.cast_id) ?? 'シフト変更済み',
      }))
    return TIER_GROUPS.map(tier => ({
      tier,
      rows: rows.filter(row => tierOf(row.cast) === tier),
    })).filter(group => group.rows.length > 0)
  }, [data, date])

  const rowCount = rowsByTier.reduce((sum, group) => sum + group.rows.length, 0)

  useEffect(() => {
    if (!data || error || autoPrinted.current) return
    autoPrinted.current = true
    const timer = window.setTimeout(() => window.print(), 350)
    return () => window.clearTimeout(timer)
  }, [data, error])

  if (authorized === null || !queryReady) {
    return <div className={styles.center}><Spinner size="md" label="権限を確認中…" /></div>
  }
  if (!authorized) {
    return <div className={styles.center}><strong>このページは黒服・オーナー専用です</strong></div>
  }

  return (
    <main className={styles.page}>
      <div className={styles.screenActions}>
        <label>出力日<input type="date" value={date} onChange={event => { autoPrinted.current = false; setDate(event.target.value) }} /></label>
        <button type="button" onClick={() => window.print()}>印刷・PDF保存</button>
        <button type="button" onClick={() => window.close()}>閉じる</button>
      </div>

      <header className={styles.header}>
        <div><span>新人教育・面談</span><h1>当日スケジュール</h1></div>
        <div><strong>{formatDate(date)}</strong><small>予定 {rowCount}件</small></div>
      </header>

      {error ? <div className={styles.message}>{error}</div> : !data ? (
        <div className={styles.center}><Spinner size="md" label="当日予定を読み込み中…" /></div>
      ) : rowCount === 0 ? (
        <div className={styles.message}>この日の教育・面談予定はありません</div>
      ) : (
        rowsByTier.map(group => (
          <section key={group.tier} className={styles.tierSection}>
            <h2>{group.tier}<span>{group.rows.length}件</span></h2>
            <div className={styles.table}>
              <div className={styles.tableHeader}>
                <span>番号</span><span>キャスト</span><span>シフト</span><span>区分・項目</span><span>担当者</span><span>自由メモ</span><span>実施</span>
              </div>
              {group.rows.map((row, index) => (
                <article key={row.schedule.id} className={styles.row} data-category={row.schedule.category}>
                  <b>{index + 1}</b>
                  <strong>{displayCastName(row.cast)}</strong>
                  <span>{row.shiftStatus}</span>
                  <div><small>{CAST_TRAINING_CATEGORY_META[row.schedule.category].label}</small><strong>{row.schedule.topic}</strong></div>
                  <span>{row.staffName}</span>
                  <p>{row.schedule.memo || '—'}</p>
                  <span className={styles.complete}>{row.schedule.is_completed ? '✓ 済' : '□ 未'}</span>
                </article>
              ))}
            </div>
          </section>
        ))
      )}

      <footer className={styles.footer}>印刷後、実施結果は新人教育スケジュール表へ記録してください。</footer>
    </main>
  )
}
