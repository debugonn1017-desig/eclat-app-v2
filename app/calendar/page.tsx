'use client'

// 接客カレンダー
//   月カレンダー × 本指名/場内/フリーの件数バッジ
//   日付タップで当日のお客様リストオーバーレイを開き、顧客名タップで顧客詳細へ
//   - cast role: 自分の担当顧客だけ
//   - admin/owner: 店舗全体（cast_name バッジ付き）
import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/colors'
import BottomNav from '@/components/BottomNav'
import UserChip from '@/components/UserChip'
import NotificationBell from '@/components/NotificationBell'
import CustomerDetailPanel from '@/components/CustomerDetailPanel'
import CustomerActionCardShell from '@/components/CustomerActionCardShell'
import { useViewMode } from '@/hooks/useViewMode'
import {
  useCustomerListActions,
  type CustomerActionTarget,
} from '@/hooks/useCustomerListActions'
import { fetchAllPaginated } from '@/lib/supabaseHelpers'
import { CAST_TIERS, CastTier, type CustomerRank } from '@/types'
import { useScrollTopOnMount } from '@/hooks/useScrollTopOnMount'
// v0.3.43-A: 自分のロール取得は fetchMe (sessionStorage キャッシュ) 経由に統一。
//   ローカル関数 fetchMe との名前衝突を避けるためローカル側を loadMe にリネーム。
//   カレンダーの visits/customers 取得 (supabase) は触らない。
import { fetchMe } from '@/lib/authCache'

type VisitRow = {
  id: string
  customer_id: string
  customer_name: string
  cast_name: string
  nomination_status: 'フリー' | '場内' | '本指名' | string
  customer_rank: CustomerRank | null
  visit_date: string
  visit_time: string | null
  amount_spent: number
  has_douhan: boolean
  has_after: boolean
  table_number: string
}
type FirstVisitRow = {
  customer_id: string
  customer_name: string
  cast_name: string
  customer_rank: CustomerRank | null
  first_visit_date: string
}

type DayBucket = {
  honshimei: VisitRow[]
  banai: VisitRow[]
  free: VisitRow[]
  // first_visit_date マッチで拾った場内（来店記録に出てない人）
  banaiFirsts: FirstVisitRow[]
  // first_visit_date マッチで拾ったフリー
  freeFirsts: FirstVisitRow[]
}

type CastOptionRow = {
  id: string
  cast_name: string | null
  cast_tier: CastTier | null
}

type CalendarCustomerRelation = {
  id: string | number
  customer_name: string | null
  cast_name: string | null
  nomination_status: string | null
  customer_rank: CustomerRank | null
}

type VisitQueryRow = {
  id: string | number
  customer_id: string | number
  visit_date: string
  visit_time: string | null
  amount_spent: number | null
  has_douhan: boolean | null
  has_after: boolean | null
  table_number: string | null
  customers: CalendarCustomerRelation | CalendarCustomerRelation[] | null
}

type DayNominationFilter = 'all' | 'honshimei' | 'banai' | 'free'
type DayActivityFilter = 'all' | 'douhan' | 'after' | 'followUp' | 'sales'
type DaySortKey = 'default' | 'timeAsc' | 'timeDesc' | 'salesDesc'

type FirstCustomerQueryRow = CalendarCustomerRelation & {
  first_visit_date: string
}

function relationCustomer(
  relation: VisitQueryRow['customers'],
): CalendarCustomerRelation | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation
}

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), [])
  const { isPC } = useViewMode()
  useScrollTopOnMount()
  const [me, setMe] = useState<{ id: string; role: 'cast' | 'admin'; is_owner: boolean; cast_name: string | null } | null>(null)
  const [canManageCustomerActions, setCanManageCustomerActions] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // admin/owner 用: カレンダー上で「全体 / 特定キャスト」を切り替え
  const [castFilter, setCastFilter] = useState<string>('')
  const [castOptions, setCastOptions] = useState<{ id: string; cast_name: string; cast_tier: CastTier | null }[]>([])

  // 対象月（YYYY-MM）
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [visits, setVisits] = useState<VisitRow[]>([])
  const [firstBanai, setFirstBanai] = useState<FirstVisitRow[]>([])
  const [firstFree, setFirstFree] = useState<FirstVisitRow[]>([])
  const [openDay, setOpenDay] = useState<number | null>(null)
  const [dayFiltersOpen, setDayFiltersOpen] = useState(false)
  const [dayNominationFilter, setDayNominationFilter] = useState<DayNominationFilter>('all')
  const [dayActivityFilter, setDayActivityFilter] = useState<DayActivityFilter>('all')
  const [dayCastFilter, setDayCastFilter] = useState('')
  const [daySortKey, setDaySortKey] = useState<DaySortKey>('default')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [calendarRevision, setCalendarRevision] = useState(0)
  const [bulkSelectMode, setBulkSelectMode] = useState(false)
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set())
  const [openCustomerActionsId, setOpenCustomerActionsId] = useState<string | null>(null)
  const refreshAfterRankChange = useCallback(() => {
    setCalendarRevision(value => value + 1)
  }, [])
  const {
    activeFollowUpIds,
    busy: customerActionBusy,
    loadActiveFollowUpIds,
    addToFollowUp,
    removeFromFollowUp,
    moveToSevered,
    ToastView: customerActionToastView,
  } = useCustomerListActions({ onRanksChanged: refreshAfterRankChange })

  // 自分のロール取得
  useEffect(() => {
    // v0.3.43-A: ローカル関数を loadMe にリネームし、内部で import 版 fetchMe を呼ぶ。
    //   /api/auth/me は cast_name / is_owner も返すよう拡張済み。
    const loadMe = async () => {
      const me = await fetchMe()
      if (!me) { setLoaded(true); return }
      setMe({
        id: me.id,
        role: me.role as 'cast' | 'admin',
        is_owner: me.is_owner ?? false,
        cast_name: me.cast_name ?? null,
      })
      setCanManageCustomerActions(
        me.role === 'cast'
        || me.is_owner === true
        || me.permissions?.['顧客.編集'] === true,
      )
      setLoaded(true)
    }
    loadMe()
  }, [])

  useEffect(() => {
    if (!canManageCustomerActions) return
    void loadActiveFollowUpIds()
  }, [canManageCustomerActions, loadActiveFollowUpIds])

  // admin/owner のとき、キャスト一覧をプルダウン用に取得
  useEffect(() => {
    if (!me || me.role === 'cast') return
    const fetchCasts = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, cast_name, cast_tier')
        .eq('role', 'cast')
        .eq('is_active', true)
        .order('cast_name', { ascending: true })
      if (data) {
        setCastOptions(
          (data as CastOptionRow[])
            .filter((c): c is CastOptionRow & { cast_name: string } => Boolean(c.cast_name))
            .map(c => ({
              id: c.id, cast_name: c.cast_name, cast_tier: c.cast_tier ?? null,
            })),
        )
      }
    }
    fetchCasts()
  }, [me, supabase])

  // 月内の来店データを取得（cast の場合は cast_name で絞り込み）
  useEffect(() => {
    if (!me) return
    const fetchVisits = async () => {
      const [y, m] = month.split('-').map(Number)
      const start = `${month}-01`
      const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`

      // 来店データ + 顧客情報を join（1000件超対策）
      const data = await fetchAllPaginated<VisitQueryRow>((from, to) =>
        supabase
          .from('customer_visits')
          .select('id, customer_id, visit_date, visit_time, amount_spent, has_douhan, has_after, table_number, customers!inner(id, customer_name, cast_name, nomination_status, customer_rank)')
          .gte('visit_date', start)
          .lte('visit_date', end)
          .order('visit_date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
            data: VisitQueryRow[] | null
            error: { message?: string } | null
          }>
      ).catch(e => { console.error("[fetchAllPaginated]", e); return [] })
      if (data) {
        let rows = data.map(v => {
          const customer = relationCustomer(v.customers)
          return {
            id: String(v.id),
            customer_id: String(v.customer_id),
            customer_name: customer?.customer_name ?? '',
            cast_name: customer?.cast_name ?? '',
            nomination_status: customer?.nomination_status ?? '',
            customer_rank: customer?.customer_rank ?? null,
            visit_date: v.visit_date,
            visit_time: v.visit_time ? String(v.visit_time).slice(0, 5) : null,
            amount_spent: Number(v.amount_spent) || 0,
            has_douhan: v.has_douhan ?? false,
            has_after: v.has_after ?? false,
            table_number: v.table_number ?? '',
          }
        })
        // cast 本人の場合は自分の担当顧客に絞る
        if (me.role === 'cast' && me.cast_name) {
          rows = rows.filter(r => r.cast_name === me.cast_name)
        } else if (castFilter) {
          // admin/owner で特定キャストを選択していれば、そのキャストの担当顧客だけに絞る
          rows = rows.filter(r => r.cast_name === castFilter)
        }
        setVisits(rows)
      }

      // 場内 / フリーのお客様で「first_visit_date が当月」の人（1000件超対策）
      const custData = await fetchAllPaginated<FirstCustomerQueryRow>((from, to) =>
        supabase
          .from('customers')
          .select('id, customer_name, cast_name, nomination_status, customer_rank, first_visit_date')
          .in('nomination_status', ['場内', 'フリー'])
          .gte('first_visit_date', start)
          .lte('first_visit_date', end)
          .range(from, to) as unknown as PromiseLike<{
            data: FirstCustomerQueryRow[] | null
            error: { message?: string } | null
          }>
      ).catch(e => { console.error("[fetchAllPaginated]", e); return [] })
      if (custData) {
        const all = custData.map(c => ({
          customer_id: String(c.id),
          customer_name: c.customer_name ?? '',
          cast_name: c.cast_name ?? '',
          nomination_status: c.nomination_status ?? '',
          customer_rank: c.customer_rank ?? null,
          first_visit_date: c.first_visit_date,
        }))
        let filtered = all
        if (me.role === 'cast' && me.cast_name) {
          filtered = filtered.filter(f => f.cast_name === me.cast_name)
        } else if (castFilter) {
          filtered = filtered.filter(f => f.cast_name === castFilter)
        }
        const toFirstVisitRow = (row: typeof filtered[number]): FirstVisitRow => ({
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          cast_name: row.cast_name,
          customer_rank: row.customer_rank,
          first_visit_date: row.first_visit_date,
        })
        setFirstBanai(filtered.filter(f => f.nomination_status === '場内').map(toFirstVisitRow))
        setFirstFree(filtered.filter(f => f.nomination_status === 'フリー').map(toFirstVisitRow))
      }
    }
    void calendarRevision
    void fetchVisits()
  }, [me, month, supabase, castFilter, calendarRevision])

  // 日別バケット
  const dayBuckets = useMemo(() => {
    const map = new Map<number, DayBucket>()
    const ensure = (d: number): DayBucket => {
      let b = map.get(d)
      if (!b) {
        b = { honshimei: [], banai: [], free: [], banaiFirsts: [], freeFirsts: [] }
        map.set(d, b)
      }
      return b
    }
    for (const v of visits) {
      const d = Number(v.visit_date.split('-')[2])
      if (!Number.isFinite(d)) continue
      const b = ensure(d)
      if (v.nomination_status === '本指名') b.honshimei.push(v)
      else if (v.nomination_status === '場内') b.banai.push(v)
      else b.free.push(v)
    }
    for (const f of firstBanai) {
      const d = Number(f.first_visit_date.split('-')[2])
      if (!Number.isFinite(d)) continue
      const b = ensure(d)
      const already = b.banai.some(v => v.customer_id === f.customer_id)
      if (!already) b.banaiFirsts.push(f)
    }
    for (const f of firstFree) {
      const d = Number(f.first_visit_date.split('-')[2])
      if (!Number.isFinite(d)) continue
      const b = ensure(d)
      const already = b.free.some(v => v.customer_id === f.customer_id)
      if (!already) b.freeFirsts.push(f)
    }
    return map
  }, [visits, firstBanai, firstFree])

  const openDayCustomers = useMemo(() => {
    const bucket = openDay === null ? null : dayBuckets.get(openDay)
    const map = new Map<string, {
      id: string
      name: string
      previousRank: CustomerRank | null
    }>()
    if (!bucket) return map
    for (const row of [...bucket.honshimei, ...bucket.banai, ...bucket.free]) {
      map.set(String(row.customer_id), {
        id: String(row.customer_id),
        name: row.customer_name,
        previousRank: row.customer_rank,
      })
    }
    for (const row of [...bucket.banaiFirsts, ...bucket.freeFirsts]) {
      map.set(String(row.customer_id), {
        id: String(row.customer_id),
        name: row.customer_name,
        previousRank: row.customer_rank,
      })
    }
    return map
  }, [dayBuckets, openDay])

  const toggleBulkCustomer = useCallback((customerId: string) => {
    setSelectedCustomerIds(previous => {
      const next = new Set(previous)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }, [])

  const closeBulkSelection = useCallback(() => {
    setBulkSelectMode(false)
    setSelectedCustomerIds(new Set())
    setOpenCustomerActionsId(null)
  }, [])

  const resetDayFilters = useCallback(() => {
    setDayNominationFilter('all')
    setDayActivityFilter('all')
    setDayCastFilter('')
    setDaySortKey('default')
  }, [])

  const openDayDetail = useCallback((day: number) => {
    closeBulkSelection()
    resetDayFilters()
    setDayFiltersOpen(false)
    setOpenDay(day)
  }, [closeBulkSelection, resetDayFilters])

  const closeDayDetail = useCallback(() => {
    setOpenDay(null)
    setDayFiltersOpen(false)
    closeBulkSelection()
  }, [closeBulkSelection])

  const openCustomerDetail = useCallback((customerId: string) => {
    setOpenDay(null)
    closeBulkSelection()
    setSelectedCustomerId(customerId)
  }, [closeBulkSelection])

  const addSelectedCustomersToFollowUp = useCallback(async () => {
    const changed = await addToFollowUp([...selectedCustomerIds], true)
    if (changed) closeBulkSelection()
  }, [addToFollowUp, closeBulkSelection, selectedCustomerIds])

  const moveSelectedCustomersToSevered = useCallback(async () => {
    const targets = [...selectedCustomerIds]
      .map(customerId => openDayCustomers.get(customerId))
      .filter((target): target is NonNullable<typeof target> => Boolean(target))
    const changed = await moveToSevered(targets)
    if (changed) closeBulkSelection()
  }, [closeBulkSelection, moveToSevered, openDayCustomers, selectedCustomerIds])

  // カレンダー生成
  const { calendarDays, year, monthNumber, monthLabel } = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const firstDay = new Date(y, m - 1, 1).getDay()
    const daysInMonth = new Date(y, m, 0).getDate()
    const days: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    return {
      calendarDays: days,
      year: y, monthNumber: m,
      monthLabel: `${y}年${m}月`,
    }
  }, [month])

  const changeMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const todayStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const todayY = Number(todayStr.split('-')[0])
  const todayM = Number(todayStr.split('-')[1])
  const todayD = Number(todayStr.split('-')[2])

  const formatYen = (n: number) => `¥${n.toLocaleString()}`

  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, color: C.pinkMuted }}>読み込み中…</div>
      </div>
    )
  }

  const openBucket = openDay !== null ? dayBuckets.get(openDay) : null
  const openDateStr = openDay !== null ? `${month}-${String(openDay).padStart(2, '0')}` : ''
  const openWd = openDay !== null
    ? ['日','月','火','水','木','金','土'][new Date(year, monthNumber - 1, openDay).getDay()]
    : ''
  const openTotal = openBucket
    ? [...openBucket.honshimei, ...openBucket.banai, ...openBucket.free].reduce((s, v) => s + v.amount_spent, 0)
    : 0
  const openCount = openBucket
    ? openBucket.honshimei.length + openBucket.banai.length + openBucket.free.length
      + openBucket.banaiFirsts.length + openBucket.freeFirsts.length
    : 0

  const matchesDayCast = (castName: string) => !dayCastFilter || castName === dayCastFilter
  const matchesDayActivity = (row: VisitRow) => {
    if (dayActivityFilter === 'douhan') return row.has_douhan
    if (dayActivityFilter === 'after') return row.has_after
    if (dayActivityFilter === 'followUp') return activeFollowUpIds.has(String(row.customer_id))
    if (dayActivityFilter === 'sales') return row.amount_spent > 0
    return true
  }
  const sortDayVisits = (rows: VisitRow[]) => {
    if (daySortKey === 'default') return [...rows]
    return [...rows].sort((a, b) => {
      if (daySortKey === 'salesDesc') {
        return b.amount_spent - a.amount_spent
      }
      if (daySortKey === 'timeAsc' || daySortKey === 'timeDesc') {
        if (a.visit_time === null && b.visit_time !== null) return 1
        if (a.visit_time !== null && b.visit_time === null) return -1
        if (a.visit_time && b.visit_time && a.visit_time !== b.visit_time) {
          return daySortKey === 'timeAsc'
            ? a.visit_time.localeCompare(b.visit_time)
            : b.visit_time.localeCompare(a.visit_time)
        }
      }
      return 0
    })
  }
  const filterVisits = (rows: VisitRow[]) => sortDayVisits(
    rows.filter(row => matchesDayCast(row.cast_name) && matchesDayActivity(row)),
  )
  const filterFirsts = (rows: FirstVisitRow[]) => rows.filter(row => {
    if (!matchesDayCast(row.cast_name)) return false
    if (dayActivityFilter === 'followUp') {
      return activeFollowUpIds.has(String(row.customer_id))
    }
    return dayActivityFilter === 'all'
  })
  const visibleOpenBucket: DayBucket | null = openBucket ? {
    honshimei: dayNominationFilter === 'all' || dayNominationFilter === 'honshimei'
      ? filterVisits(openBucket.honshimei)
      : [],
    banai: dayNominationFilter === 'all' || dayNominationFilter === 'banai'
      ? filterVisits(openBucket.banai)
      : [],
    free: dayNominationFilter === 'all' || dayNominationFilter === 'free'
      ? filterVisits(openBucket.free)
      : [],
    banaiFirsts: dayNominationFilter === 'all' || dayNominationFilter === 'banai'
      ? filterFirsts(openBucket.banaiFirsts)
      : [],
    freeFirsts: dayNominationFilter === 'all' || dayNominationFilter === 'free'
      ? filterFirsts(openBucket.freeFirsts)
      : [],
  } : null
  const visibleOpenCount = visibleOpenBucket
    ? visibleOpenBucket.honshimei.length
      + visibleOpenBucket.banai.length
      + visibleOpenBucket.free.length
      + visibleOpenBucket.banaiFirsts.length
      + visibleOpenBucket.freeFirsts.length
    : 0
  const visibleOpenTotal = visibleOpenBucket
    ? [...visibleOpenBucket.honshimei, ...visibleOpenBucket.banai, ...visibleOpenBucket.free]
        .reduce((sum, visit) => sum + visit.amount_spent, 0)
    : 0
  const dayOptionCount = [
    dayNominationFilter !== 'all',
    dayActivityFilter !== 'all',
    Boolean(dayCastFilter),
    daySortKey !== 'default',
  ].filter(Boolean).length

  // PC + admin/owner のとき左側に層別キャストサイドバーを出す
  const showSidebar = isPC && me && me.role !== 'cast' && castOptions.length > 0
  const sidebarWidth = 200

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      // v0.3.38: paddingBottom 統一 (76px → 60px + safe-area)。BottomNav 常時表示
      paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
      display: showSidebar ? 'flex' : 'block',
    }}>
      {/* ─── 層別キャストサイドバー（PC + 管理者のみ） ─── */}
      {showSidebar && (
        <div style={{
          width: sidebarWidth, minWidth: sidebarWidth,
          background: C.headerBg,
          borderRight: `1px solid ${C.border}`,
          position: 'sticky', top: 0, height: '100vh',
          overflowY: 'auto', flexShrink: 0,
        }}>
          <div style={{
            padding: '14px 12px 8px',
            fontSize: '8px', letterSpacing: '0.25em', color: C.pinkMuted, fontWeight: 600,
          }}>キャスト一覧</div>
          {/* 店舗全体トグル */}
          <div
            onClick={() => setCastFilter('')}
            style={{
              padding: '10px 12px',
              cursor: 'pointer',
              background: castFilter === '' ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})` : 'transparent',
              color: castFilter === '' ? '#FFF' : C.dark,
              borderLeft: castFilter === '' ? `3px solid ${C.pink}` : '3px solid transparent',
              fontWeight: castFilter === '' ? 700 : 500,
              fontSize: '12px',
              letterSpacing: '0.05em',
              borderBottom: `1px solid ${C.border}`,
            }}
          >🏠 店舗全体</div>
          {(() => {
            const tierGroups = CAST_TIERS.map(tier => ({
              tier,
              casts: castOptions.filter(c => c.cast_tier === tier),
            }))
            const unset = castOptions.filter(c => !c.cast_tier)
            if (unset.length > 0) tierGroups.push({ tier: '未設定' as never, casts: unset })
            return tierGroups.filter(g => g.casts.length > 0).map(group => (
              <div key={group.tier}>
                <div style={{
                  padding: '8px 12px 4px',
                  fontSize: '9px', fontWeight: 700,
                  color: C.pink, letterSpacing: '0.1em',
                  borderBottom: `1px solid ${C.border}`,
                  marginTop: '4px',
                }}>
                  {group.tier}
                  <span style={{ color: C.pinkMuted, fontWeight: 400, marginLeft: '4px' }}>
                    {group.casts.length}人
                  </span>
                </div>
                {group.casts.map(c => {
                  const isActive = castFilter === c.cast_name
                  return (
                    <div
                      key={c.id}
                      onClick={() => setCastFilter(c.cast_name)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        background: isActive ? `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})` : 'transparent',
                        color: isActive ? '#FFF' : C.dark,
                        borderLeft: isActive ? `3px solid ${C.pink}` : '3px solid transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: isActive ? 600 : 400, letterSpacing: '0.05em' }}>
                        {c.cast_name}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          })()}
        </div>
      )}

      {/* ─── メインコンテンツ ─── */}
      <div style={{ flex: showSidebar ? 1 : undefined, minWidth: 0 }}>
      {/* ヘッダー */}
      <div style={{
        background: C.headerBg, borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 20,
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}>
        <div style={{
          maxWidth: isPC ? 1100 : 420,
          margin: '0 auto',
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <Link href="/home" style={{ display: 'inline-block', cursor: 'pointer' }}>
              <Image
                src="/logo.png" alt="Éclat" width={100} height={30}
                className="object-contain"
                style={{ filter: 'brightness(0.6) sepia(1) saturate(3) hue-rotate(310deg)' }}
              />
            </Link>
            <p style={{ fontSize: '7px', letterSpacing: '0.35em', color: C.pinkMuted, margin: '2px 0 0 0' }}>
              接客カレンダー
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationBell />
            <UserChip />
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: isPC ? 1100 : 420,
        margin: '0 auto',
        padding: '14px 16px',
      }}>
        {/* 月ナビ（リブランド版：角丸＋桜影） */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: '10px 14px', marginBottom: 10,
          boxShadow: '0 4px 14px rgba(232,135,154,0.08)',
        }}>
          <button onClick={() => changeMonth(-1)} style={{
            background: 'rgba(255,255,255,0.85)',
            border: `1px solid ${C.border}`,
            color: C.pink, fontSize: 18,
            cursor: 'pointer', fontFamily: 'inherit',
            width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(232,135,154,0.12)',
          }}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 15, fontWeight: 700,
              background: 'linear-gradient(135deg, #5A2840 0%, #8E4A5C 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.03em',
            }}>{monthLabel}</div>
            {me && (
              <div style={{ fontSize: 9.5, color: C.pinkMuted, marginTop: 3, letterSpacing: '0.05em' }}>
                {me.role === 'cast'
                  ? `${me.cast_name} さんの接客履歴`
                  : (castFilter ? `${castFilter} さんの接客履歴` : '店舗全体')}
              </div>
            )}
          </div>
          <button onClick={() => changeMonth(1)} style={{
            background: 'rgba(255,255,255,0.85)',
            border: `1px solid ${C.border}`,
            color: C.pink, fontSize: 18,
            cursor: 'pointer', fontFamily: 'inherit',
            width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(232,135,154,0.12)',
          }}>›</button>
        </div>

        {/* admin/owner: キャスト切替セレクト（モバイルのみ・PCはサイドバーで切替） */}
        {me && me.role !== 'cast' && !showSidebar && (
          <div style={{ marginBottom: 12 }}>
            <select
              value={castFilter}
              onChange={(e) => setCastFilter(e.target.value)}
              style={{
                width: '100%', padding: '11px 36px 11px 14px',
                fontSize: 12,
                background: 'rgba(255,255,255,0.95)', color: C.dark,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                fontFamily: 'inherit', cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23E8879B' stroke-width='1.8'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 14px center',
                boxShadow: '0 2px 8px rgba(232,135,154,0.08)',
                outline: 'none',
              }}
            >
              <option value="">店舗全体（全キャスト）</option>
              {castOptions.map(c => (
                <option key={c.id} value={c.cast_name}>{c.cast_name}</option>
              ))}
            </select>
          </div>
        )}

        {/* カレンダー（リブランド版：角丸＋柔らか影＋桜土曜） */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3,
          background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          padding: 10,
          boxShadow: '0 6px 18px rgba(232,135,154,0.08)',
        }}>
          {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
            <div key={d} style={{
              textAlign: 'center', fontSize: 9.5, padding: '5px 0',
              // 桜世界観：日=深紅、土=薄紫ピンク、平日=ピンクミュート
              color: i === 0 ? C.danger : i === 6 ? '#C58FB0' : C.pinkMuted,
              letterSpacing: '0.12em', fontWeight: 700,
            }}>{d}</div>
          ))}
          {calendarDays.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />
            const b = dayBuckets.get(day)
            const honN = b?.honshimei.length ?? 0
            const banaN = (b?.banai.length ?? 0) + (b?.banaiFirsts.length ?? 0)
            const freeN = (b?.free.length ?? 0) + (b?.freeFirsts.length ?? 0)
            const total = honN + banaN + freeN
            const isToday = year === todayY && monthNumber === todayM && day === todayD
            const wd = new Date(year, monthNumber - 1, day).getDay()
            return (
              <button
                key={day}
                onClick={() => openDayDetail(day)}
                style={{
                  width: '100%', minHeight: 70,
                  display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                  border: `1px solid ${isToday ? C.pink : C.border}`,
                  background: isToday
                    ? 'linear-gradient(160deg, #FFE8EE 0%, #FFF5F7 100%)'
                    : (total > 0 ? C.bgPale : C.white),
                  borderRadius: 10,
                  cursor: 'pointer', fontFamily: 'inherit',
                  padding: '5px 3px',
                  boxShadow: isToday ? '0 4px 10px rgba(232,135,154,0.18)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  fontSize: 12, fontWeight: isToday ? 700 : 500,
                  // 桜世界観：日=深紅、土=薄紫ピンク、平日=ダーク
                  color: wd === 0 ? C.danger : wd === 6 ? '#C58FB0' : C.dark,
                  textAlign: 'center',
                }}>{day}</div>
                {total > 0 && (
                  <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 2,
                    marginTop: 2,
                  }}>
                    {honN > 0 && <span style={{ fontSize: 8.5, fontWeight: 700, color: C.danger, lineHeight: 1 }}>本{honN}</span>}
                    {banaN > 0 && <span style={{ fontSize: 8.5, fontWeight: 700, color: C.pink, lineHeight: 1 }}>場{banaN}</span>}
                    {freeN > 0 && <span style={{ fontSize: 8.5, fontWeight: 700, color: C.pinkMuted, lineHeight: 1 }}>フ{freeN}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* 凡例（桜系で色統一） */}
        <div style={{
          marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap',
          fontSize: 9.5, color: C.pinkMuted, padding: '0 6px',
        }}>
          <span><span style={{ color: C.danger, fontWeight: 700 }}>本</span> 本指名</span>
          <span><span style={{ color: C.pink, fontWeight: 700 }}>場</span> 場内</span>
          <span><span style={{ color: C.pinkMuted, fontWeight: 700 }}>フ</span> フリー</span>
        </div>
      </div>

      {/* 当日詳細オーバーレイ */}
      {openDay !== null && openBucket && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeDayDetail() }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.45)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div style={{
            background: C.white, width: '100%', maxWidth: 460,
            maxHeight: '85vh', overflowY: 'auto', borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            {/* ヘッダー */}
            <div style={{
              position: 'sticky', top: 0, background: C.white, zIndex: 1,
              padding: '14px 16px 12px', borderBottom: `1px solid ${C.border}`,
              borderRadius: '12px 12px 0 0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexWrap: 'wrap', gap: 8,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>
                  {openDateStr}（{openWd}）
                </div>
                <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 4 }}>
                  接客 {openCount}件 ・ 売上 {formatYen(openTotal)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <button
                  type="button"
                  onClick={() => {
                    closeBulkSelection()
                    setDayFiltersOpen(value => !value)
                  }}
                  aria-expanded={dayFiltersOpen}
                  style={{
                    minHeight: 32,
                    padding: '0 9px',
                    borderRadius: 14,
                    border: `1px solid ${dayFiltersOpen || dayOptionCount > 0 ? C.pink : C.border}`,
                    background: dayFiltersOpen ? '#FFF0F4' : C.white,
                    color: dayFiltersOpen || dayOptionCount > 0 ? C.pinkDeep : C.pinkMuted,
                    fontSize: 9.5,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  絞り込み{dayOptionCount > 0 ? ` ${dayOptionCount}` : ''}
                </button>
                {canManageCustomerActions && openDayCustomers.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (bulkSelectMode) closeBulkSelection()
                      else {
                        setDayFiltersOpen(false)
                        setBulkSelectMode(true)
                        setOpenCustomerActionsId(null)
                      }
                    }}
                    style={{
                      minHeight: 32,
                      padding: '0 10px',
                      borderRadius: 14,
                      border: `1px solid ${C.pink}`,
                      background: bulkSelectMode ? C.pink : C.white,
                      color: bulkSelectMode ? C.white : C.pink,
                      fontSize: 9.5,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {bulkSelectMode ? '選択終了' : '複数選択'}
                  </button>
                )}
                <button onClick={closeDayDetail} style={{
                  background: C.rankBadge, border: 'none', fontSize: 14,
                  color: C.pinkMuted, cursor: 'pointer',
                  width: 32, height: 32, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✕</button>
              </div>
            </div>

            {dayFiltersOpen && (
              <div style={{
                padding: '11px 16px 12px',
                background: '#FFF9FB',
                borderBottom: `1px solid ${C.border}`,
              }}>
                <div style={{ marginBottom: 9 }}>
                  <div style={{ fontSize: 9, color: C.pinkMuted, marginBottom: 5 }}>指名状況</div>
                  <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2 }}>
                    {([
                      ['all', 'すべて'],
                      ['honshimei', '本指名'],
                      ['banai', '場内'],
                      ['free', 'フリー'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          closeBulkSelection()
                          setDayNominationFilter(value)
                        }}
                        style={{
                          minHeight: 30,
                          padding: '0 11px',
                          flex: '0 0 auto',
                          borderRadius: 15,
                          border: `1px solid ${dayNominationFilter === value ? C.pink : C.border}`,
                          background: dayNominationFilter === value ? C.pink : C.white,
                          color: dayNominationFilter === value ? C.white : C.dark,
                          fontSize: 9.5,
                          fontWeight: 700,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: me?.role !== 'cast' && !castFilter ? '1fr 1fr' : '1fr',
                  gap: 7,
                }}>
                  <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 9, color: C.pinkMuted }}>内容</span>
                    <select
                      value={dayActivityFilter}
                      onChange={(event) => {
                        closeBulkSelection()
                        setDayActivityFilter(event.target.value as DayActivityFilter)
                      }}
                      style={{
                        width: '100%', minWidth: 0, minHeight: 36,
                        border: `1px solid ${C.border}`, borderRadius: 8,
                        background: C.white, color: C.dark, fontFamily: 'inherit',
                        fontSize: 10, padding: '0 9px',
                      }}
                    >
                      <option value="all">すべて</option>
                      <option value="douhan">同伴あり</option>
                      <option value="after">アフターあり</option>
                      <option value="followUp">追いかけ中</option>
                      <option value="sales">売上あり</option>
                    </select>
                  </label>
                  {me?.role !== 'cast' && !castFilter && (
                    <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                      <span style={{ fontSize: 9, color: C.pinkMuted }}>担当キャスト</span>
                      <select
                        value={dayCastFilter}
                        onChange={(event) => {
                          closeBulkSelection()
                          setDayCastFilter(event.target.value)
                        }}
                        style={{
                          width: '100%', minWidth: 0, minHeight: 36,
                          border: `1px solid ${C.border}`, borderRadius: 8,
                          background: C.white, color: C.dark, fontFamily: 'inherit',
                          fontSize: 10, padding: '0 9px',
                        }}
                      >
                        <option value="">全キャスト</option>
                        {castOptions.map(cast => (
                          <option key={cast.id} value={cast.cast_name}>{cast.cast_name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <label style={{ display: 'grid', gap: 4, marginTop: 7 }}>
                  <span style={{ fontSize: 9, color: C.pinkMuted }}>並び替え</span>
                  <select
                    value={daySortKey}
                    onChange={(event) => {
                      closeBulkSelection()
                      setDaySortKey(event.target.value as DaySortKey)
                    }}
                    style={{
                      width: '100%', minHeight: 36,
                      border: `1px solid ${C.border}`, borderRadius: 8,
                      background: C.white, color: C.dark, fontFamily: 'inherit',
                      fontSize: 10, padding: '0 9px',
                    }}
                  >
                    <option value="default">記録順（従来どおり）</option>
                    <option value="timeAsc">来店時間が早い順</option>
                    <option value="timeDesc">来店時間が遅い順</option>
                    <option value="salesDesc">売上が高い順</option>
                  </select>
                </label>

                <div style={{
                  marginTop: 9, display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 8,
                }}>
                  <span style={{ fontSize: 10, color: C.dark, fontWeight: 700 }}>
                    表示 {visibleOpenCount}件 ・ 売上 {formatYen(visibleOpenTotal)}
                  </span>
                  {dayOptionCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        closeBulkSelection()
                        resetDayFilters()
                      }}
                      style={{
                        border: 'none', background: 'transparent', color: C.pink,
                        fontSize: 9.5, fontWeight: 700, fontFamily: 'inherit',
                        padding: '5px 0', cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      条件を戻す
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{
              padding: bulkSelectMode ? '12px 16px 104px' : '12px 16px 16px',
            }}>
              <Section
                label="本指名"
                color="#B25575"
                bg="#FBEAF0"
                rows={visibleOpenBucket?.honshimei ?? []}
                firsts={[]}
                onClick={openCustomerDetail}
                showCast={me?.role !== 'cast'}
                formatYen={formatYen}
                canManage={canManageCustomerActions}
                selectionMode={bulkSelectMode}
                selectedIds={selectedCustomerIds}
                activeFollowUpIds={activeFollowUpIds}
                openActionsId={openCustomerActionsId}
                busy={customerActionBusy}
                onToggleSelected={toggleBulkCustomer}
                onToggleActions={setOpenCustomerActionsId}
                onAddFollowUp={(customerId) => {
                  void addToFollowUp([customerId]).then(changed => {
                    if (changed) setOpenCustomerActionsId(null)
                  })
                }}
                onRemoveFollowUp={(customerId) => {
                  void removeFromFollowUp([customerId]).then(changed => {
                    if (changed) setOpenCustomerActionsId(null)
                  })
                }}
                onMoveToSevered={(target) => {
                  void moveToSevered([target]).then(changed => {
                    if (changed) setOpenCustomerActionsId(null)
                  })
                }}
              />
              <Section
                label="場内"
                color="#7A4060"
                bg="#F4E4EE"
                rows={visibleOpenBucket?.banai ?? []}
                firsts={visibleOpenBucket?.banaiFirsts ?? []}
                onClick={openCustomerDetail}
                showCast={me?.role !== 'cast'}
                formatYen={formatYen}
                canManage={canManageCustomerActions}
                selectionMode={bulkSelectMode}
                selectedIds={selectedCustomerIds}
                activeFollowUpIds={activeFollowUpIds}
                openActionsId={openCustomerActionsId}
                busy={customerActionBusy}
                onToggleSelected={toggleBulkCustomer}
                onToggleActions={setOpenCustomerActionsId}
                onAddFollowUp={(customerId) => {
                  void addToFollowUp([customerId]).then(changed => {
                    if (changed) setOpenCustomerActionsId(null)
                  })
                }}
                onRemoveFollowUp={(customerId) => {
                  void removeFromFollowUp([customerId]).then(changed => {
                    if (changed) setOpenCustomerActionsId(null)
                  })
                }}
                onMoveToSevered={(target) => {
                  void moveToSevered([target]).then(changed => {
                    if (changed) setOpenCustomerActionsId(null)
                  })
                }}
              />
              <Section
                label="フリー"
                color="#888"
                bg="#F0F0F0"
                rows={visibleOpenBucket?.free ?? []}
                firsts={visibleOpenBucket?.freeFirsts ?? []}
                onClick={openCustomerDetail}
                showCast={me?.role !== 'cast'}
                formatYen={formatYen}
                canManage={canManageCustomerActions}
                selectionMode={bulkSelectMode}
                selectedIds={selectedCustomerIds}
                activeFollowUpIds={activeFollowUpIds}
                openActionsId={openCustomerActionsId}
                busy={customerActionBusy}
                onToggleSelected={toggleBulkCustomer}
                onToggleActions={setOpenCustomerActionsId}
                onAddFollowUp={(customerId) => {
                  void addToFollowUp([customerId]).then(changed => {
                    if (changed) setOpenCustomerActionsId(null)
                  })
                }}
                onRemoveFollowUp={(customerId) => {
                  void removeFromFollowUp([customerId]).then(changed => {
                    if (changed) setOpenCustomerActionsId(null)
                  })
                }}
                onMoveToSevered={(target) => {
                  void moveToSevered([target]).then(changed => {
                    if (changed) setOpenCustomerActionsId(null)
                  })
                }}
              />
              {openCount === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: 11, color: C.pinkMuted }}>
                  この日の接客記録はありません
                </div>
              )}
              {openCount > 0 && visibleOpenCount === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: 11, color: C.pinkMuted }}>
                  条件に合う接客記録はありません
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {openDay !== null && bulkSelectMode && (
        <div
          role="toolbar"
          aria-label="選択したお客様の一括操作"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
            transform: 'translateX(-50%)',
            zIndex: 1100,
            width: 'min(440px, calc(100% - 24px))',
            boxSizing: 'border-box',
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) minmax(0, 1fr)',
            gap: 8,
            alignItems: 'center',
            padding: 10,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.98)',
            boxShadow: '0 10px 30px rgba(80,40,55,0.25)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ minWidth: 52, textAlign: 'center' }}>
            <div style={{ fontSize: 16, lineHeight: 1, color: C.dark, fontWeight: 800 }}>
              {selectedCustomerIds.size}
            </div>
            <div style={{ marginTop: 3, fontSize: 9, color: C.pinkMuted }}>人選択中</div>
          </div>
          <button
            type="button"
            disabled={
              customerActionBusy
              || selectedCustomerIds.size === 0
              || [...selectedCustomerIds].every(customerId => activeFollowUpIds.has(customerId))
            }
            onClick={() => void addSelectedCustomersToFollowUp()}
            style={{
              minHeight: 46,
              border: 'none',
              borderRadius: 12,
              background: C.pink,
              color: C.white,
              fontSize: 10.5,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: customerActionBusy ? 'wait' : 'pointer',
              opacity: selectedCustomerIds.size === 0 ? 0.5 : 1,
              padding: '6px 8px',
            }}
          >
            追いかけに追加
          </button>
          <button
            type="button"
            disabled={
              customerActionBusy
              || selectedCustomerIds.size === 0
              || [...selectedCustomerIds]
                .map(customerId => openDayCustomers.get(customerId))
                .filter(Boolean)
                .every(customer => customer?.previousRank === '切れた')
            }
            onClick={() => void moveSelectedCustomersToSevered()}
            style={{
              minHeight: 46,
              border: 'none',
              borderRadius: 12,
              background: '#6E3D4B',
              color: C.white,
              fontSize: 10.5,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: customerActionBusy ? 'wait' : 'pointer',
              opacity: selectedCustomerIds.size === 0 ? 0.5 : 1,
              padding: '6px 8px',
            }}
          >
            切れたにする
          </button>
        </div>
      )}

      {/* 顧客詳細オーバーレイ — PCは右からスライド50%、モバイルはフルスクリーン */}
      {selectedCustomerId && (
        <>
          <div
            onClick={() => setSelectedCustomerId(null)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.45)', zIndex: 100,
            }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: isPC ? '52%' : '100%',
            left: isPC ? 'auto' : 0,
            background: C.bg, zIndex: 101, overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
            animation: 'calendarPanelIn .22s ease-out',
          }}>
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              background: C.headerBg, borderBottom: `1px solid ${C.border}`,
              padding: '10px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <button onClick={() => setSelectedCustomerId(null)} style={{
                background: 'transparent', border: 'none', color: C.pink,
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 16 }}>←</span>
                <span style={{ letterSpacing: '0.05em' }}>カレンダーへ戻る</span>
              </button>
              <span style={{ fontSize: 11, letterSpacing: '0.15em', color: C.dark, fontWeight: 600 }}>
                顧客詳細
              </span>
              <div style={{ width: 60 }} />
            </div>
            <CustomerDetailPanel
              customerId={selectedCustomerId}
              isPC={isPC}
              isAdmin={me?.role === 'admin' || me?.is_owner === true}
            />
          </div>
          <style jsx>{`
            @keyframes calendarPanelIn {
              from { transform: translateX(20px); opacity: 0 }
              to { transform: translateX(0); opacity: 1 }
            }
          `}</style>
        </>
      )}

      </div>{/* メインコンテンツ end */}

      {customerActionToastView}
      <BottomNav />
    </div>
  )
}

// ─── 共通セクション（visits + firsts 両方を表示） ─────────────
function Section({
  label,
  color,
  bg,
  rows,
  firsts,
  onClick,
  showCast,
  formatYen,
  canManage,
  selectionMode,
  selectedIds,
  activeFollowUpIds,
  openActionsId,
  busy,
  onToggleSelected,
  onToggleActions,
  onAddFollowUp,
  onRemoveFollowUp,
  onMoveToSevered,
}: {
  label: string
  color: string
  bg: string
  rows: VisitRow[]
  firsts: FirstVisitRow[]
  onClick: (customerId: string) => void
  showCast: boolean
  formatYen: (n: number) => string
  canManage: boolean
  selectionMode: boolean
  selectedIds: Set<string>
  activeFollowUpIds: Set<string>
  openActionsId: string | null
  busy: boolean
  onToggleSelected: (customerId: string) => void
  onToggleActions: (actionId: string | null) => void
  onAddFollowUp: (customerId: string) => void
  onRemoveFollowUp: (customerId: string) => void
  onMoveToSevered: (target: CustomerActionTarget) => void
}) {
  if (rows.length === 0 && firsts.length === 0) return null
  const total = rows.length + firsts.length
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color, background: bg,
          padding: '3px 10px', borderRadius: 10,
        }}>{label}</span>
        <span style={{ fontSize: 10, color: C.pinkMuted }}>{total}件</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(v => {
          const customerId = String(v.customer_id)
          const actionId = `visit:${v.id}`
          const actionsOpen = openActionsId === actionId
          return (
          <CustomerActionCardShell
            key={v.id}
            customerId={customerId}
            customerName={v.customer_name}
            customerRank={v.customer_rank}
            isFollowUp={activeFollowUpIds.has(customerId)}
            canManage={canManage}
            selectionMode={selectionMode}
            selected={selectedIds.has(customerId)}
            actionsOpen={actionsOpen}
            busy={busy}
            borderRadius={6}
            onOpen={() => onClick(customerId)}
            onToggleSelected={() => onToggleSelected(customerId)}
            onToggleActions={() => onToggleActions(actionsOpen ? null : actionId)}
            onAddFollowUp={() => onAddFollowUp(customerId)}
            onRemoveFollowUp={() => onRemoveFollowUp(customerId)}
            onMoveToSevered={() => onMoveToSevered({
              id: customerId,
              name: v.customer_name,
              previousRank: v.customer_rank,
            })}
          >
          <button
            type="button"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px',
              background: C.bgLight, border: `1px solid ${C.border}`, borderRadius: 6,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
              borderLeft: `3px solid ${color}`,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: C.dark,
                  textDecoration: 'underline', textDecorationColor: 'rgba(232,120,154,0.3)',
                }}>{v.customer_name}</span>
                {activeFollowUpIds.has(customerId) && (
                  <span style={{
                    fontSize: 8.5, color: C.pinkDeep, fontWeight: 700,
                    background: '#FFF0F4', border: `1px solid ${C.border}`,
                    padding: '1px 6px', borderRadius: 8,
                  }}>追いかけ中</span>
                )}
                {showCast && v.cast_name && (
                  <span style={{
                    fontSize: 9, color: C.pinkMuted,
                    background: '#FFF', padding: '1px 6px', border: `1px solid ${C.border}`, borderRadius: 8,
                  }}>{v.cast_name}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, fontSize: 9 }}>
                {v.visit_time && (
                  <span style={{
                    color: C.dark, fontWeight: 700, background: '#FFF',
                    border: `1px solid ${C.border}`, borderRadius: 7, padding: '1px 5px',
                  }}>
                    {v.visit_time}
                  </span>
                )}
                {v.table_number && <span style={{ color: C.pinkMuted }}>卓 {v.table_number}</span>}
                {v.has_douhan && (
                  <span style={{ background: C.pink, color: '#FFF', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>同</span>
                )}
                {v.has_after && (
                  <span style={{ background: '#D4607A', color: '#FFF', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>ア</span>
                )}
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.pink, whiteSpace: 'nowrap' }}>
              {v.amount_spent > 0 ? formatYen(v.amount_spent) : '—'}
            </span>
          </button>
          </CustomerActionCardShell>
          )
        })}
        {firsts.map(f => {
          const customerId = String(f.customer_id)
          const actionId = `first:${customerId}`
          const actionsOpen = openActionsId === actionId
          return (
          <CustomerActionCardShell
            key={`first-${f.customer_id}`}
            customerId={customerId}
            customerName={f.customer_name}
            customerRank={f.customer_rank}
            isFollowUp={activeFollowUpIds.has(customerId)}
            canManage={canManage}
            selectionMode={selectionMode}
            selected={selectedIds.has(customerId)}
            actionsOpen={actionsOpen}
            busy={busy}
            borderRadius={6}
            onOpen={() => onClick(customerId)}
            onToggleSelected={() => onToggleSelected(customerId)}
            onToggleActions={() => onToggleActions(actionsOpen ? null : actionId)}
            onAddFollowUp={() => onAddFollowUp(customerId)}
            onRemoveFollowUp={() => onRemoveFollowUp(customerId)}
            onMoveToSevered={() => onMoveToSevered({
              id: customerId,
              name: f.customer_name,
              previousRank: f.customer_rank,
            })}
          >
          <button
            type="button"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px',
              background: bg, border: `1px solid ${C.border}`, borderRadius: 6,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
              borderLeft: `3px solid ${color}`,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: C.dark,
                  textDecoration: 'underline', textDecorationColor: 'rgba(232,120,154,0.3)',
                }}>{f.customer_name}</span>
                {activeFollowUpIds.has(customerId) && (
                  <span style={{
                    fontSize: 8.5, color: C.pinkDeep, fontWeight: 700,
                    background: '#FFF0F4', border: `1px solid ${C.border}`,
                    padding: '1px 6px', borderRadius: 8,
                  }}>追いかけ中</span>
                )}
                {showCast && f.cast_name && (
                  <span style={{
                    fontSize: 9, color: C.pinkMuted,
                    background: '#FFF', padding: '1px 6px', border: `1px solid ${C.border}`, borderRadius: 8,
                  }}>{f.cast_name}</span>
                )}
                <span style={{ fontSize: 9, color, fontWeight: 600 }}>初回来店</span>
              </div>
            </div>
            <span style={{ fontSize: 11, color: C.pinkMuted }}>—</span>
          </button>
          </CustomerActionCardShell>
          )
        })}
      </div>
    </div>
  )
}
