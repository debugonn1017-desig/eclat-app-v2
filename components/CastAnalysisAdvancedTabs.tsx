'use client'

// キャスト分析の第2段階・第3段階タブ
//   ContactTab / ShiftTab / DetectionTab / CompareTab / ExportTab
//
//   /admin/casts/[id] と /admin/cast-analysis の両方から使われる。
//   各タブは castId 等を受け取り、独自にデータをfetch する。

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/colors'
import { CastKPI, CastProfile } from '@/types'
import { evaluateUnreplied, calcAvgReplyHours } from '@/lib/contactTracking'
import { exportCastAllCustomers } from '@/lib/excelExport'

// ─── 共通型 ─────────────────────────────────────────────
export type CustomerLite = {
  id: string
  customer_name: string
  customer_rank: string | null
  region: string | null
  nomination_status: string | null
  first_visit_date: string | null
  last_visit_date: string | null
  visit_count: number
  total_spent: number
  has_douhan: boolean
  avg_spent: number
  last_contact_date: string | null
}

// ═══ 📞 連絡タブ ════════════════════════════════════════
export function ContactTab({
  castName, customers, isPC, onCustomerClick,
}: {
  castName: string
  customers: CustomerLite[]
  isPC: boolean
  onCustomerClick: (id: string) => void
}) {
  const supabase = useMemo(() => createClient(), [])
  type ContactRow = {
    id: string
    customer_id: string
    contact_date: string
    direction: 'sent' | 'received'
    channel: string
  }
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const customerIds = customers.map(c => c.id)
      if (customerIds.length === 0) { setContacts([]); setLoading(false); return }
      const sinceISO = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('customer_contacts')
        .select('id, customer_id, contact_date, direction, channel')
        .in('customer_id', customerIds)
        .gte('contact_date', sinceISO)
      setContacts(((data ?? []) as ContactRow[]).filter(r =>
        r.direction === 'sent' || r.direction === 'received'
      ))
      setLoading(false)
    }
    load()
  }, [supabase, customers])

  // 顧客ごとの連絡サマリー
  type CustomerContactSummary = {
    customer: CustomerLite
    sent: number
    received: number
    lastContactDate: string | null
    daysSinceLast: number | null
    unreplied: boolean
    daysSinceSent: number | null
    avgReplyHrs: number | null
  }
  const customerContactSummary: CustomerContactSummary[] = useMemo(() => {
    const byCust = new Map<string, ContactRow[]>()
    for (const c of contacts) {
      const list = byCust.get(c.customer_id) ?? []
      list.push(c)
      byCust.set(c.customer_id, list)
    }
    const today = Date.now()
    return customers.map(c => {
      const list = byCust.get(c.id) ?? []
      const sent = list.filter(r => r.direction === 'sent').length
      const received = list.filter(r => r.direction === 'received').length
      const sortedDesc = [...list].sort((a, b) => a.contact_date < b.contact_date ? 1 : -1)
      const lastContactDate = sortedDesc[0]?.contact_date ?? null
      const daysSinceLast = lastContactDate
        ? Math.floor((today - new Date(lastContactDate + 'T00:00:00').getTime()) / 86400000)
        : null
      const status = evaluateUnreplied(
        list.map(r => ({ contact_date: r.contact_date, direction: r.direction })),
        3
      )
      const avgReplyHrs = calcAvgReplyHours(
        list.map(r => ({ contact_date: r.contact_date, direction: r.direction }))
      )
      return {
        customer: c, sent, received,
        lastContactDate, daysSinceLast,
        unreplied: status.unreplied,
        daysSinceSent: status.daysSinceSent,
        avgReplyHrs,
      }
    })
  }, [contacts, customers])

  // 集計
  const totalSent = contacts.filter(c => c.direction === 'sent').length
  const totalReceived = contacts.filter(c => c.direction === 'received').length
  const overallAvgReplyHrs = useMemo(() => calcAvgReplyHours(
    contacts.map(c => ({ contact_date: c.contact_date, direction: c.direction }))
  ), [contacts])

  // チャネル別
  const byChannel = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of contacts) map.set(c.channel, (map.get(c.channel) ?? 0) + 1)
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [contacts])

  // 未返信お客様
  const unreplied = customerContactSummary
    .filter(s => s.unreplied)
    .sort((a, b) => (b.daysSinceSent ?? 0) - (a.daysSinceSent ?? 0))

  // 連絡してないお客様（30日以上）でランクS/A優先
  const noContact = customerContactSummary
    .filter(s => (s.daysSinceLast ?? 999) >= 30)
    .filter(s => ['S', 'A'].includes(s.customer.customer_rank ?? ''))
    .sort((a, b) => (b.daysSinceLast ?? 0) - (a.daysSinceLast ?? 0))
    .slice(0, 20)

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.pinkMuted, fontSize: 12 }}>連絡履歴を読込中...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* サマリー */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '14px 16px',
      }}>
        <div style={{ fontSize: 11, color: C.pinkMuted, marginBottom: 8 }}>
          直近90日の連絡サマリー（{castName}）
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isPC ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 8 }}>
          <Stat label="送信" value={`${totalSent}件`} accent />
          <Stat label="受信" value={`${totalReceived}件`} />
          <Stat label="平均返信" value={overallAvgReplyHrs != null ? (overallAvgReplyHrs >= 24 ? `${(overallAvgReplyHrs / 24).toFixed(1)}日` : `${overallAvgReplyHrs}h`) : '—'} />
          <Stat label="未返信" value={`${unreplied.length}件`} alert={unreplied.length > 0} />
        </div>
      </div>

      {/* チャネル別 */}
      {byChannel.length > 0 && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 6 }}>チャネル別 連絡内訳</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {byChannel.map(([ch, n]) => (
              <span key={ch} style={{
                padding: '4px 10px', borderRadius: 12, background: '#FBEAF0', color: '#72243E',
                fontSize: 11, fontWeight: 500,
              }}>
                {ch} {n}件
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 未返信お客様 */}
      <ListCard
        title={`未返信のお客様（3日以上）— ${unreplied.length}件`}
        items={unreplied.map(s => ({
          customer: s.customer,
          right: s.daysSinceSent != null ? `${s.daysSinceSent}日経過` : '—',
          rightColor: (s.daysSinceSent ?? 0) >= 7 ? '#C53030' : '#B8860B',
        }))}
        onCustomerClick={onCustomerClick}
        emptyText="未返信のお客様はいません 👏"
        accent="#C53030"
      />

      {/* 30日以上連絡してない S/A ランク */}
      <ListCard
        title={`30日以上連絡してない S/Aランク — ${noContact.length}件`}
        items={noContact.map(s => ({
          customer: s.customer,
          right: s.daysSinceLast != null ? `${s.daysSinceLast}日連絡なし` : '連絡なし',
          rightColor: (s.daysSinceLast ?? 0) >= 60 ? '#C53030' : '#B8860B',
        }))}
        onCustomerClick={onCustomerClick}
        emptyText="連絡をきちんと続けられています 👏"
        accent="#BA7517"
      />

      {/* Phase 3-①②: 連絡頻度 × 客単価の相関 + 連絡効果測定 */}
      <ContactCorrelationSection
        customers={customers}
        contacts={contacts}
        isPC={isPC}
      />
    </div>
  )
}

// ─── 連絡頻度×客単価 相関＋連絡効果測定（Phase 3-①②） ─────────
function ContactCorrelationSection({
  customers, contacts, isPC,
}: {
  customers: CustomerLite[]
  contacts: Array<{ id: string; customer_id: string; contact_date: string; direction: 'sent' | 'received'; channel: string }>
  isPC: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  type VisitRow = { customer_id: string; visit_date: string; amount_spent: number; has_douhan: boolean }
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [birthdayMap, setBirthdayMap] = useState<Map<string, string | null>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const ids = customers.map(c => c.id)
      if (ids.length === 0) { setVisits([]); setLoading(false); return }
      // 過去90日の visits（連絡データと同じ期間）
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
      const { data: vd } = await supabase
        .from('customer_visits')
        .select('customer_id, visit_date, amount_spent, has_douhan')
        .in('customer_id', ids)
        .gte('visit_date', since)
      setVisits(((vd ?? []) as VisitRow[]).filter(v => Number(v.amount_spent) > 0))
      // 誕生日も取得
      const { data: cd } = await supabase
        .from('customers')
        .select('id, birthday')
        .in('id', ids)
      const m = new Map<string, string | null>()
      for (const r of (cd ?? []) as Array<{ id: string; birthday: string | null }>) {
        m.set(r.id, r.birthday)
      }
      setBirthdayMap(m)
      setLoading(false)
    }
    load()
  }, [supabase, customers])

  // ─── Phase 3-①: 連絡頻度 × 客単価 ─────────────
  // 各顧客の sent 数(90d) と 客単価(90d) を集計し、頻度バケットでグルーピング
  type FreqBucket = { label: string; range: [number, number]; ids: Set<string>; total: number; visits: number }
  const buckets: FreqBucket[] = useMemo(() => [
    { label: '連絡ゼロ',    range: [0, 0],   ids: new Set(), total: 0, visits: 0 },
    { label: '低頻度(1-2)',  range: [1, 2],   ids: new Set(), total: 0, visits: 0 },
    { label: '中頻度(3-5)',  range: [3, 5],   ids: new Set(), total: 0, visits: 0 },
    { label: '高頻度(6+)',   range: [6, 999], ids: new Set(), total: 0, visits: 0 },
  ], [])

  for (const c of customers) {
    const sent = contacts.filter(ct => ct.customer_id === c.id && ct.direction === 'sent').length
    const cv = visits.filter(v => v.customer_id === c.id)
    const total = cv.reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
    const visitCount = cv.length
    for (const b of buckets) {
      if (sent >= b.range[0] && sent <= b.range[1]) {
        b.ids.add(c.id)
        b.total += total
        b.visits += visitCount
        break
      }
    }
  }

  // ─── Phase 3-②: 連絡 → 来店までの平均日数 ─────────────
  // 各 sent contact について、その後14日以内の visit を探す
  const sentContacts = contacts.filter(c => c.direction === 'sent')
  let visitsWithin14 = 0
  let totalDayDiff = 0
  let countedDayDiffs = 0
  for (const ct of sentContacts) {
    const ctDate = new Date(ct.contact_date + 'T00:00:00').getTime()
    const matched = visits
      .filter(v => v.customer_id === ct.customer_id)
      .map(v => ({ ...v, ts: new Date(v.visit_date + 'T00:00:00').getTime() }))
      .filter(v => v.ts >= ctDate && v.ts <= ctDate + 14 * 86400000)
      .sort((a, b) => a.ts - b.ts)[0]
    if (matched) {
      visitsWithin14 += 1
      const days = Math.round((matched.ts - ctDate) / 86400000)
      totalDayDiff += days
      countedDayDiffs += 1
    }
  }
  const conversionRate = sentContacts.length > 0 ? Math.round((visitsWithin14 / sentContacts.length) * 100) : 0
  const avgConversionDays = countedDayDiffs > 0 ? (totalDayDiff / countedDayDiffs).toFixed(1) : '—'

  // ─── 誕生月効果 ─────────────
  const thisMonth = new Date().getMonth() + 1
  let birthdayMonthVisits = 0
  let birthdayCustomers = 0
  for (const c of customers) {
    const bd = birthdayMap.get(c.id)
    if (!bd) continue
    const bMonth = parseInt(bd.split('-')[1] ?? '0', 10)
    if (bMonth === 0) continue
    birthdayCustomers += 1
    // 直近90日の visits でその誕生月に来店があるか
    const cv = visits.filter(v => v.customer_id === c.id)
    if (cv.some(v => parseInt(v.visit_date.split('-')[1] ?? '0', 10) === bMonth)) {
      birthdayMonthVisits += 1
    }
  }
  const birthdayRate = birthdayCustomers > 0 ? Math.round((birthdayMonthVisits / birthdayCustomers) * 100) : 0

  if (loading) {
    return (
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, textAlign: 'center', fontSize: 11, color: C.pinkMuted }}>
        相関データを読込中...
      </div>
    )
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>🔬</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>連絡分析（直近90日）</span>
      </div>
      <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 12 }}>
        連絡頻度と客単価の相関 / 連絡から来店までの効果測定
      </div>

      {/* Phase 3-①: 連絡頻度 × 客単価 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
          連絡頻度 × 客単価
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ background: '#FBEAF0', color: '#5A2840' }}>
              <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: 10 }}>頻度バケット</th>
              <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: 10 }}>顧客数</th>
              <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: 10 }}>来店数</th>
              <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: 10 }}>累計売上</th>
              <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: 10 }}>客単価</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(b => {
              const cc = b.ids.size
              const avg = b.visits > 0 ? Math.round(b.total / b.visits) : 0
              return (
                <tr key={b.label} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 8px', fontSize: 10, color: C.dark, fontWeight: 500 }}>{b.label}</td>
                  <td style={{ padding: '6px 8px', fontSize: 10, color: C.dark, textAlign: 'right' }}>{cc}名</td>
                  <td style={{ padding: '6px 8px', fontSize: 10, color: C.dark, textAlign: 'right' }}>{b.visits}回</td>
                  <td style={{ padding: '6px 8px', fontSize: 10, color: C.dark, textAlign: 'right', fontWeight: 600 }}>¥{b.total.toLocaleString()}</td>
                  <td style={{ padding: '6px 8px', fontSize: 10, color: C.pink, textAlign: 'right', fontWeight: 700 }}>¥{avg.toLocaleString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ fontSize: 9, color: C.pinkMuted, marginTop: 4, fontStyle: 'italic' }}>
          ※ 連絡が多い客ほど客単価が高ければ「連絡が稼ぎにつながる」サイン。
        </div>
      </div>

      {/* Phase 3-②: 連絡効果 */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
          連絡 → 来店 効果測定
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isPC ? 'repeat(3, 1fr)' : '1fr',
          gap: 8,
        }}>
          <Stat label="送信→14日内 来店率"
            value={sentContacts.length > 0 ? `${conversionRate}%` : '—'}
            accent={conversionRate >= 30}
          />
          <Stat label="送信→来店 平均日数"
            value={typeof avgConversionDays === 'string' ? avgConversionDays : `${avgConversionDays}日`}
          />
          <Stat label={`${thisMonth}月生まれの来店率`}
            value={birthdayCustomers > 0 ? `${birthdayRate}% (${birthdayMonthVisits}/${birthdayCustomers})` : '—'}
            accent={birthdayRate >= 50}
          />
        </div>
        <div style={{ fontSize: 9, color: C.pinkMuted, marginTop: 6, fontStyle: 'italic' }}>
          ※ 来店率が30%超なら、連絡が来店に直結している良い状態。
        </div>
      </div>
    </div>
  )
}

// ═══ 🗓 出勤タブ ════════════════════════════════════════
export function ShiftTab({
  castId, multiKPI, allMonths, isPC,
}: {
  castId: string
  multiKPI: Record<string, CastKPI>
  allMonths: string[]
  isPC: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  type ShiftRow = { shift_date: string; status: string }
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  type VisitRow = { visit_date: string; amount_spent: number }
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      // 過去6ヶ月のシフトと visits
      const sinceISO = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10)
      const { data: sd } = await supabase
        .from('cast_shifts')
        .select('shift_date, status')
        .eq('cast_id', castId)
        .gte('shift_date', sinceISO)
      setShifts((sd ?? []) as ShiftRow[])

      // visits は customers cast_name で絞る必要がある。簡易的に customers 経由で
      const { data: cs } = await supabase.from('customers').select('id, cast_name')
      const myCustomerIds = ((cs ?? []) as Array<{id: string; cast_name: string}>)
        .filter(c => c.cast_name)
        .map(c => c.id)
      // 当該キャストの全顧客を絞り込むためには castName が必要なのでここでは簡易に全量取り、後段で月集計する
      if (myCustomerIds.length > 0) {
        const { data: vd } = await supabase
          .from('customer_visits')
          .select('visit_date, amount_spent, customer_id')
          .gte('visit_date', sinceISO)
          .in('customer_id', myCustomerIds.slice(0, 1000))
        setVisits((vd ?? []) as VisitRow[])
      }
      setLoading(false)
    }
    load()
  }, [supabase, castId])

  // 月別出勤日数（出勤・希望出勤・来客出勤）
  const workdaysByMonth = useMemo(() => {
    const map = new Map<string, number>()
    const seen = new Set<string>()
    for (const s of shifts) {
      const ym = s.shift_date.slice(0, 7)
      if (s.status !== '出勤' && s.status !== '希望出勤' && s.status !== '来客出勤') continue
      const key = `${ym}:${s.shift_date}`
      if (seen.has(key)) continue
      seen.add(key)
      map.set(ym, (map.get(ym) ?? 0) + 1)
    }
    return map
  }, [shifts])

  // 曜日 × 売上ヒートマップ
  const heatmap = useMemo(() => {
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0)) // [dow][hour] = sales
    // visit_time は別途必要だが、現在 visit_date のみで集計できるので簡易版で曜日×売上のみ
    const dowSales: number[] = Array(7).fill(0)
    const dowCount: number[] = Array(7).fill(0)
    for (const v of visits) {
      if (Number(v.amount_spent) <= 0) continue
      const d = new Date(v.visit_date + 'T00:00:00')
      const dow = (d.getDay() + 6) % 7 // 月曜=0
      dowSales[dow] += Number(v.amount_spent) || 0
      dowCount[dow] += 1
    }
    return { matrix, dowSales, dowCount }
  }, [visits])

  // 連続休みの最長
  const maxOffStreak = useMemo(() => {
    const sortedDates = shifts
      .map(s => s.shift_date)
      .sort()
    if (sortedDates.length === 0) return 0
    const offSet = new Set(shifts.filter(s => s.status === '休み' || s.status === '希望休み').map(s => s.shift_date))
    let maxStreak = 0
    let current = 0
    let prevDate: Date | null = null
    for (const d of sortedDates) {
      if (offSet.has(d)) {
        const dt = new Date(d + 'T00:00:00')
        if (prevDate && (dt.getTime() - prevDate.getTime()) === 86400000) {
          current += 1
        } else {
          current = 1
        }
        if (current > maxStreak) maxStreak = current
        prevDate = dt
      } else {
        current = 0
        prevDate = null
      }
    }
    return maxStreak
  }, [shifts])

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.pinkMuted, fontSize: 12 }}>読込中...</div>

  const dowLabels = ['月', '火', '水', '木', '金', '土', '日']
  const maxSales = Math.max(...heatmap.dowSales, 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 月別出勤日数 */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 6 }}>月別 出勤日数（直近）</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {allMonths.slice(-6).map(m => {
            const days = workdaysByMonth.get(m) ?? 0
            const k = multiKPI[m]
            return (
              <div key={m} style={{
                flex: '1 1 100px', minWidth: 100,
                padding: '8px 10px',
                background: '#F9F6F7', borderRadius: 8,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, color: C.pinkMuted }}>{m.slice(5).replace(/^0/, '')}月</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.pink }}>{days}日</div>
                {k && k.monthlySales > 0 && (
                  <div style={{ fontSize: 9, color: C.pinkMuted }}>
                    日均 ¥{Math.round(k.monthlySales / Math.max(1, days) / 1000)}K
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 曜日 × 売上 */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 8 }}>
          曜日別 売上分布（直近6ヶ月）
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 100 }}>
          {dowLabels.map((l, i) => {
            const ratio = heatmap.dowSales[i] / maxSales
            return (
              <div key={l} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                <div style={{ fontSize: 8, color: C.pinkMuted, marginBottom: 2 }}>
                  {heatmap.dowSales[i] > 0 ? `${Math.round(heatmap.dowSales[i] / 10000)}万` : ''}
                </div>
                <div style={{
                  width: '100%',
                  height: `${Math.max(2, ratio * 80)}px`,
                  background: `linear-gradient(180deg, #E8789A, #F4A5B8)`,
                  borderRadius: 4,
                }} />
                <div style={{ fontSize: 10, color: C.dark, marginTop: 4 }}>{l}</div>
                <div style={{ fontSize: 8, color: C.pinkMuted }}>{heatmap.dowCount[i]}組</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 連続休み */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 6 }}>その他</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Stat label="直近最長 連続休み" value={`${maxOffStreak}日`} alert={maxOffStreak >= 7} />
          <Stat label="直近6ヶ月の総出勤日数" value={`${Array.from(workdaysByMonth.values()).reduce((s, n) => s + n, 0)}日`} />
        </div>
      </div>
    </div>
  )
}

// ═══ ⚠ 検知タブ ════════════════════════════════════════
export function DetectionTab({
  customers, currentMonth, multiKPI, multiTarget, isPC, onCustomerClick,
}: {
  customers: CustomerLite[]
  currentMonth: string
  multiKPI: Record<string, CastKPI>
  multiTarget: Record<string, number>
  isPC: boolean
  onCustomerClick: (id: string) => void
}) {
  const today = useMemo(() => Date.now(), [])

  // ① S/Aランク × 30日連絡なし
  const sa30NoContact = useMemo(() => customers
    .filter(c => ['S', 'A'].includes(c.customer_rank ?? ''))
    .filter(c => {
      if (!c.last_contact_date) return true
      return Math.floor((today - new Date(c.last_contact_date).getTime()) / 86400000) >= 30
    })
    .slice(0, 20), [customers, today])

  // ② 同伴経験あり × 60日未来店
  const douhanInactive = useMemo(() => customers
    .filter(c => c.has_douhan)
    .filter(c => {
      if (!c.last_visit_date) return false
      return Math.floor((today - new Date(c.last_visit_date).getTime()) / 86400000) >= 60
    })
    .slice(0, 20), [customers, today])

  // ③ 個別周期×1.5超過（Phase 2-①：離脱予兆スコア）
  //   各顧客の過去 visits から平均来店間隔を算出し、最終来店からの経過日数が
  //   平均間隔の 1.5 倍を超えていれば「予兆あり」、2.0 倍超は「重度」として表示。
  const supabaseDet = useMemo(() => createClient(), [])
  type AnomalyRow = {
    customer: CustomerLite
    avgIntervalDays: number
    daysSinceLast: number
    ratio: number
    severity: 'mild' | 'severe'
  }
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([])
  useEffect(() => {
    const load = async () => {
      const ids = customers.map(c => c.id)
      if (ids.length === 0) { setAnomalies([]); return }
      const { data } = await supabaseDet
        .from('customer_visits')
        .select('customer_id, visit_date, amount_spent')
        .in('customer_id', ids)
        .order('visit_date', { ascending: true })
      const visitsByCust = new Map<string, string[]>()
      for (const v of (data ?? []) as Array<{ customer_id: string; visit_date: string; amount_spent: number }>) {
        if (Number(v.amount_spent) <= 0) continue
        const list = visitsByCust.get(v.customer_id) ?? []
        list.push(v.visit_date)
        visitsByCust.set(v.customer_id, list)
      }
      const result: AnomalyRow[] = []
      for (const c of customers) {
        const dates = visitsByCust.get(c.id) ?? []
        if (dates.length < 2) continue // 周期算出不可
        // 連続する来店間隔の平均
        let totalGap = 0
        for (let i = 1; i < dates.length; i++) {
          const gap = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000
          totalGap += gap
        }
        const avgInterval = totalGap / (dates.length - 1)
        if (avgInterval < 7) continue // 1週間未満は周期検出に向かない
        const lastDate = new Date(dates[dates.length - 1])
        const since = (today - lastDate.getTime()) / 86400000
        const ratio = since / avgInterval
        if (ratio >= 1.5) {
          result.push({
            customer: c,
            avgIntervalDays: Math.round(avgInterval),
            daysSinceLast: Math.round(since),
            ratio,
            severity: ratio >= 2.0 ? 'severe' : 'mild',
          })
        }
      }
      result.sort((a, b) => b.ratio - a.ratio)
      setAnomalies(result.slice(0, 25))
    }
    load()
  }, [supabaseDet, customers, today])

  // ④ 目標まで残り
  const cur = multiKPI[currentMonth]
  const target = multiTarget[currentMonth] ?? 0
  const remaining = target > 0 && cur ? Math.max(0, target - cur.monthlySales) : null
  const avgPerCustomer = cur && cur.visitGroups > 0 ? Math.round(cur.monthlySales / cur.visitGroups) : 0
  const customersNeeded = remaining != null && avgPerCustomer > 0 ? Math.ceil(remaining / avgPerCustomer) : null

  // ⑤ 離脱リスク（90日以上未来店、本指名のSランク優先）
  const dropoutPriority = useMemo(() => customers
    .filter(c => c.nomination_status === '本指名')
    .filter(c => {
      if (!c.last_visit_date) return false
      return Math.floor((today - new Date(c.last_visit_date).getTime()) / 86400000) >= 90
    })
    .sort((a, b) => {
      const order: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 }
      return (order[a.customer_rank ?? 'C'] ?? 4) - (order[b.customer_rank ?? 'C'] ?? 4)
    })
    .slice(0, 20), [customers, today])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 目標残り */}
      {remaining != null && (
        <div style={{
          background: 'linear-gradient(135deg, #FFF0F5 0%, #FFE4ED 60%, #FFD7E4 100%)',
          border: `1px solid ${C.border}`, borderRadius: 12,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 6 }}>
            🎯 月末まで残り目標
          </div>
          {remaining > 0 ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.pink }}>
                ¥{remaining.toLocaleString()}
              </div>
              {customersNeeded != null && (
                <div style={{ fontSize: 11, color: C.pinkMuted, marginTop: 4 }}>
                  推定 あと {customersNeeded} 組（客単価 ¥{avgPerCustomer.toLocaleString()} 換算）
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0F6E56' }}>
              🎉 目標達成済み（+ ¥{Math.abs(remaining).toLocaleString()}）
            </div>
          )}
        </div>
      )}

      {/* 推奨アクション */}
      <ListCard
        title={`🚨 30日以上 連絡なしの S/Aランク — ${sa30NoContact.length}名`}
        items={sa30NoContact.map(c => ({
          customer: c,
          right: c.last_contact_date
            ? `${Math.floor((today - new Date(c.last_contact_date).getTime()) / 86400000)}日連絡なし`
            : '連絡履歴なし',
          rightColor: '#C53030',
        }))}
        onCustomerClick={onCustomerClick}
        emptyText="該当なし 👏"
        accent="#C53030"
      />

      <ListCard
        title={`⚠ 同伴経験あり × 60日以上未来店 — ${douhanInactive.length}名`}
        items={douhanInactive.map(c => ({
          customer: c,
          right: c.last_visit_date
            ? `${Math.floor((today - new Date(c.last_visit_date).getTime()) / 86400000)}日未来店`
            : '—',
          rightColor: '#B8860B',
        }))}
        onCustomerClick={onCustomerClick}
        emptyText="該当なし"
        accent="#B8860B"
      />

      <ListCard
        title={`🔻 離脱リスク（本指名 × 90日未来店）— ${dropoutPriority.length}名`}
        items={dropoutPriority.map(c => ({
          customer: c,
          right: c.last_visit_date
            ? `${Math.floor((today - new Date(c.last_visit_date).getTime()) / 86400000)}日`
            : '—',
          rightColor: '#C53030',
        }))}
        onCustomerClick={onCustomerClick}
        emptyText="離脱リスクなし 👏"
        accent="#C53030"
      />

      {/* Phase 2-①: 来店周期×1.5倍超過（離脱予兆スコア） */}
      <ListCard
        title={`🎯 普段の周期を超えてきた — ${anomalies.length}名`}
        description="個別の来店周期を学習し、平均間隔の 1.5 倍を超えた顧客を検出（赤=2倍超の重度）"
        items={anomalies.map(a => ({
          customer: a.customer,
          right: `${a.daysSinceLast}日 / 周期${a.avgIntervalDays}日 (×${a.ratio.toFixed(1)})`,
          rightColor: a.severity === 'severe' ? '#C53030' : '#B8860B',
        }))}
        onCustomerClick={onCustomerClick}
        emptyText="周期からの離脱予兆なし 👏"
        accent="#9B59B6"
      />
    </div>
  )
}

// ═══ 🆚 比較タブ ════════════════════════════════════════
export function CompareTab({
  cast, currentMonth, multiKPI, isPC,
}: {
  cast: CastProfile
  currentMonth: string
  multiKPI: Record<string, CastKPI>
  isPC: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  type RankRow = { cast: CastProfile; kpi: CastKPI; prevSales: number; targetSales: number; achievementRate: number }
  const [allRows, setAllRows] = useState<RankRow[]>([])

  useEffect(() => {
    fetch(`/api/cast-rankings?month=${currentMonth}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((data: RankRow[]) => setAllRows(data))
      .catch(() => {})
  }, [currentMonth, supabase])

  // 同層平均
  const sameTier = allRows.filter(r => r.cast.cast_tier === cast.cast_tier && r.cast.id !== cast.id)
  const avg = (key: keyof CastKPI) => {
    if (sameTier.length === 0) return 0
    const sum = sameTier.reduce((s, r) => s + Number(r.kpi[key] ?? 0), 0)
    return Math.round(sum / sameTier.length)
  }
  const avgSales = avg('monthlySales')
  const avgHonshimei = avg('honshimeiCount')
  const avgConv = avg('conversionCount')
  const avgDouhan = avg('douhanCount')
  const avgSpend = avg('avgSpend')

  // 自分の今月
  const me = allRows.find(r => r.cast.id === cast.id)

  // 順位
  const sortedBySales = [...allRows].sort((a, b) => b.kpi.monthlySales - a.kpi.monthlySales)
  const myRank = sortedBySales.findIndex(r => r.cast.id === cast.id) + 1

  // キャリアハイ
  const bestSales = useMemo(() => {
    let max = 0
    for (const k of Object.values(multiKPI)) {
      if (k && k.monthlySales > max) max = k.monthlySales
    }
    return max
  }, [multiKPI])

  const bestSpend = useMemo(() => {
    let max = 0
    for (const k of Object.values(multiKPI)) {
      if (k && k.avgSpend > max) max = k.avgSpend
    }
    return max
  }, [multiKPI])

  const formatYen = (n: number) => `¥${n.toLocaleString()}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 同層比較 */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 8 }}>
          同{cast.cast_tier ?? '層'}平均との比較（{currentMonth}・他{sameTier.length}名）
        </div>
        {sameTier.length === 0 ? (
          <div style={{ fontSize: 11, color: C.pinkMuted }}>同層のキャストがいません</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isPC ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 8 }}>
            <CompareCell label="売上" mine={me?.kpi.monthlySales ?? 0} avg={avgSales} formatter={formatYen} />
            <CompareCell label="本指名数" mine={me?.kpi.honshimeiCount ?? 0} avg={avgHonshimei} formatter={n => `${n}人`} />
            <CompareCell label="場内→本転換" mine={me?.kpi.conversionCount ?? 0} avg={avgConv} formatter={n => `${n}件`} />
            <CompareCell label="同伴回数" mine={me?.kpi.douhanCount ?? 0} avg={avgDouhan} formatter={n => `${n}回`} />
            <CompareCell label="客単価" mine={me?.kpi.avgSpend ?? 0} avg={avgSpend} formatter={formatYen} />
          </div>
        )}
      </div>

      {/* 順位 */}
      {me && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 6 }}>店舗内 売上順位</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: C.pink }}>
            {myRank}<span style={{ fontSize: 14, color: C.pinkMuted, marginLeft: 4 }}>/ {allRows.length}名</span>
          </div>
        </div>
      )}

      {/* キャリアハイ */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 8 }}>キャリアハイ</div>
        <div style={{ display: 'grid', gridTemplateColumns: isPC ? 'repeat(2, 1fr)' : '1fr', gap: 8 }}>
          <Stat label="最高月売上" value={formatYen(bestSales)} accent />
          <Stat label="最高客単価" value={formatYen(bestSpend)} />
        </div>
      </div>
    </div>
  )
}

function CompareCell({ label, mine, avg, formatter }: { label: string; mine: number; avg: number; formatter: (n: number) => string }) {
  const diff = mine - avg
  const ratio = avg > 0 ? Math.round(((mine - avg) / avg) * 100) : null
  return (
    <div style={{ background: '#F9F6F7', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: C.pinkMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.pink }}>
        {formatter(mine)}
      </div>
      <div style={{ fontSize: 9, color: C.pinkMuted, marginTop: 2 }}>
        平均 {formatter(avg)}
        {ratio != null && (
          <span style={{
            marginLeft: 6,
            color: diff > 0 ? '#0F6E56' : diff < 0 ? '#A32D2D' : C.pinkMuted,
            fontWeight: 500,
          }}>
            ({diff > 0 ? '+' : ''}{ratio}%)
          </span>
        )}
      </div>
    </div>
  )
}

// ═══ 📁 出力タブ ════════════════════════════════════════
export function ExportTab({
  cast, customers, isPC,
}: {
  cast: CastProfile
  customers: CustomerLite[]
  isPC: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [exporting, setExporting] = useState(false)

  const handleExportCustomers = async () => {
    if (exporting) return
    setExporting(true)
    try {
      // 担当顧客の全データ取得（exportCastAllCustomers に合わせた形式）
      const customerIds = customers.map(c => c.id)
      // フル顧客レコードを取得し直す
      const { data: fullCustomers } = await supabase
        .from('customers')
        .select('*')
        .in('id', customerIds)

      const visitsByCustomer: Record<string, unknown[]> = {}
      if (customerIds.length > 0) {
        const { data: visits } = await supabase
          .from('customer_visits')
          .select('*')
          .in('customer_id', customerIds)
          .order('visit_date', { ascending: false })
        for (const v of (visits ?? []) as Array<{ customer_id: string }>) {
          const list = visitsByCustomer[v.customer_id] ?? []
          list.push(v)
          visitsByCustomer[v.customer_id] = list
        }
      }
      await exportCastAllCustomers({
        cast,
        customers: (fullCustomers ?? []) as Parameters<typeof exportCastAllCustomers>[0]['customers'],
        visitsByCustomer: visitsByCustomer as Parameters<typeof exportCastAllCustomers>[0]['visitsByCustomer'],
      })
    } catch (e) {
      console.error('export error', e)
      alert('Excel 出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, color: C.dark, fontWeight: 500, marginBottom: 8 }}>
          ファイル出力
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isPC ? 'repeat(2, 1fr)' : '1fr', gap: 8 }}>
          <a
            href={`/casts/${cast.id}/monthly-report`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block', padding: '12px 14px',
              background: '#F9F6F7', border: `1px solid ${C.border}`,
              borderRadius: 8, textDecoration: 'none', color: C.dark,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: C.pink }}>📄 個人月次レポート (PDF)</div>
            <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 2 }}>
              ブラウザの印刷で PDF 保存できる、A4 縦向きの個人レポート
            </div>
          </a>
          <button
            onClick={handleExportCustomers}
            disabled={exporting}
            style={{
              display: 'block', padding: '12px 14px',
              background: exporting ? '#F5F0F2' : '#F9F6F7',
              border: `1px solid ${C.border}`,
              borderRadius: 8, textAlign: 'left',
              cursor: exporting ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: C.pink }}>
              📊 担当顧客全員の Excel
            </div>
            <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 2 }}>
              {exporting ? '出力中...' : '全担当顧客の累計売上・来店履歴を1ファイルで出力'}
            </div>
          </button>
        </div>
      </div>

      <div style={{ fontSize: 10, color: C.pinkMuted }}>
        ※ 過去全データ Excel（売上・シフト・連絡など全部入り）は次回追加予定
      </div>
    </div>
  )
}

// ═══ 共通パーツ ════════════════════════════════════════
function Stat({ label, value, accent, alert }: { label: string; value: string; accent?: boolean; alert?: boolean }) {
  return (
    <div style={{
      background: alert ? '#FCEBEB' : '#F9F6F7',
      borderRadius: 8, padding: '8px 10px',
    }}>
      <div style={{ fontSize: 9, color: C.pinkMuted, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 16, fontWeight: 600,
        color: alert ? '#C53030' : accent ? C.pink : C.dark,
      }}>{value}</div>
    </div>
  )
}

function ListCard({
  title, description, items, onCustomerClick, emptyText, accent,
}: {
  title: string
  description?: string
  items: Array<{
    customer: CustomerLite
    right: string
    rightColor?: string
  }>
  onCustomerClick: (id: string) => void
  emptyText: string
  accent: string
}) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: accent,
        borderLeft: `3px solid ${accent}`, paddingLeft: 8,
        marginBottom: description ? 4 : 8,
      }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 8, paddingLeft: 11 }}>
          {description}
        </div>
      )}
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, padding: 12 }}>{emptyText}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(({ customer: c, right, rightColor }) => (
            <button
              key={c.id}
              onClick={() => onCustomerClick(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8,
                background: '#F9F6F7', border: `1px solid ${C.border}`,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                width: '100%', flexWrap: 'wrap',
              }}
            >
              {c.customer_rank && (
                <span style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 4,
                  background: c.customer_rank === 'S' ? '#FBEAF0' : c.customer_rank === 'A' ? '#FAEEDA' : C.tagBg,
                  color: C.dark, fontWeight: 500,
                }}>{c.customer_rank}</span>
              )}
              <span style={{
                fontSize: 13, fontWeight: 600, color: C.dark,
                textDecoration: 'underline', textDecorationColor: 'rgba(232,120,154,0.3)',
              }}>{c.customer_name} 様</span>
              {c.has_douhan && (
                <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 6, background: '#FBEAF0', color: '#72243E' }}>同伴経験</span>
              )}
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 500,
                color: rightColor ?? C.pinkMuted,
              }}>{right}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
