'use client'

// 管理者・スタッフ向けホームダッシュボード
//   ・今日の出勤キャスト（出勤希望/出勤/来客出勤を出勤扱いで算出）
//   ・昨日の店舗売上
//   ・今月累計 + 月予算進捗バー + 月末予測
//   ・今日誕生日のお客様（担当キャスト併記）
//   ・90日以上未来店の S・A ランク（離脱リスク）
//   ・場内→本指名 今月転換数
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/colors'
import SalesPaceCard from './SalesPaceCard'
import { calcSalesPace } from '@/lib/salesPace'
import { evaluateUnreplied } from '@/lib/contactTracking'

type Props = {
  /** 折りたたみ状態を外で持たせる場合 */
  defaultCollapsed?: boolean
}

type ShiftCast = { id: string; name: string; tier: string | null; status: string }
type BirthdayCustomer = { id: string; name: string; cast: string; rank: string | null }
type RiskCustomer = {
  id: string
  name: string
  cast: string
  rank: string | null
  daysSince: number
  /** 平均来店周期（日）。null なら来店履歴1回以下 */
  avgCycleDays: number | null
  /** 個別周期×1.5 を超過しているか */
  exceedsPersonalCycle: boolean
  hasDouhanHistory: boolean
}

export default function AdminHomeDashboard({ defaultCollapsed = false }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const { today, yesterday, month, todayDow, todayMD } = useMemo(() => {
    const d = new Date()
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const today = `${month}-${String(d.getDate()).padStart(2, '0')}`
    const y = new Date(d)
    y.setDate(y.getDate() - 1)
    const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
    const todayMD = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { today, yesterday, month, todayDow: dow, todayMD }
  }, [])

  const [shifts, setShifts] = useState<ShiftCast[]>([])
  const [yesterdaySales, setYesterdaySales] = useState(0)
  const [monthSales, setMonthSales] = useState(0)
  const [monthTarget, setMonthTarget] = useState(0)
  const [conversionCount, setConversionCount] = useState(0)
  const [birthdayCustomers, setBirthdayCustomers] = useState<BirthdayCustomer[]>([])
  const [riskCustomers, setRiskCustomers] = useState<RiskCustomer[]>([])
  const [workedDays, setWorkedDays] = useState(0)
  const [totalWorkDays, setTotalWorkDays] = useState(0)
  const [unrepliedCount, setUnrepliedCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      const startDate = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

      // 今日の出勤キャスト（出勤希望含む）
      const { data: shiftRows } = await supabase
        .from('cast_shifts')
        .select('cast_id, status, profiles!inner(id, cast_name, cast_tier, role, is_active)')
        .eq('shift_date', today)
        .in('status', ['出勤', '希望出勤', '来客出勤'])
      if (shiftRows) {
        const list: ShiftCast[] = []
        for (const s of shiftRows as any[]) {
          const p = s.profiles
          if (!p || !p.is_active || p.role !== 'cast') continue
          list.push({ id: p.id, name: p.cast_name ?? '', tier: p.cast_tier ?? null, status: s.status })
        }
        setShifts(list)
      }

      // 昨日売上 + 場内延長
      const { data: yVisits } = await supabase
        .from('customer_visits')
        .select('amount_spent')
        .eq('visit_date', yesterday)
      const ySum = (yVisits ?? []).reduce((s, v: any) => s + (Number(v.amount_spent) || 0), 0)
      const { data: yExt } = await supabase
        .from('cast_extension_sales')
        .select('amount_spent')
        .eq('sale_date', yesterday)
      const yExtSum = (yExt ?? []).reduce((s, v: any) => s + (Number(v.amount_spent) || 0), 0)
      setYesterdaySales(ySum + yExtSum)

      // 今月累計売上
      const { data: mVisits } = await supabase
        .from('customer_visits')
        .select('visit_date, amount_spent')
        .gte('visit_date', startDate)
        .lte('visit_date', endDate)
      const mSum = (mVisits ?? []).reduce((s, v: any) => s + (Number(v.amount_spent) || 0), 0)
      const { data: mExt } = await supabase
        .from('cast_extension_sales')
        .select('amount_spent')
        .gte('sale_date', startDate)
        .lte('sale_date', endDate)
      const mExtSum = (mExt ?? []).reduce((s, v: any) => s + (Number(v.amount_spent) || 0), 0)
      setMonthSales(mSum + mExtSum)

      // 営業実績日（売上が立った日のユニーク数）
      const workedDateSet = new Set<string>()
      for (const v of (mVisits ?? []) as any[]) {
        if (Number(v.amount_spent) > 0) workedDateSet.add(v.visit_date)
      }
      setWorkedDays(workedDateSet.size)

      // 月の出勤予定日数（出勤・希望出勤・来客出勤の日付ユニーク数）
      const { data: monthShifts } = await supabase
        .from('cast_shifts')
        .select('shift_date, status')
        .gte('shift_date', startDate)
        .lte('shift_date', endDate)
        .in('status', ['出勤', '希望出勤', '来客出勤'])
      const planDates = new Set<string>()
      for (const s of (monthShifts ?? []) as any[]) {
        planDates.add(s.shift_date)
      }
      setTotalWorkDays(planDates.size)

      // 月予算（cast_targets 全キャスト合算）
      const { data: targets } = await supabase
        .from('cast_targets')
        .select('target_sales')
        .eq('month', month)
      const tgt = (targets ?? []).reduce(
        (s, t: any) => s + (Number(t.target_sales) || 0),
        0
      )
      setMonthTarget(tgt)

      // 場内→本指名 今月転換数
      const { data: convs } = await supabase
        .from('nomination_history')
        .select('id')
        .eq('old_status', '場内')
        .eq('new_status', '本指名')
        .gte('changed_at', startDate)
        .lte('changed_at', endDate + 'T23:59:59')
      setConversionCount((convs ?? []).length)

      // 今日誕生日 (MM-DD一致)
      const { data: birthdayRows } = await supabase
        .from('customers')
        .select('id, customer_name, cast_name, customer_rank, birthday')
      const todayBirthdays: BirthdayCustomer[] = []
      for (const c of (birthdayRows ?? []) as any[]) {
        if (!c.birthday) continue
        const md = String(c.birthday).slice(5, 10) // YYYY-MM-DD → MM-DD
        if (md === todayMD) {
          todayBirthdays.push({
            id: c.id,
            name: c.customer_name,
            cast: c.cast_name,
            rank: c.customer_rank,
          })
        }
      }
      setBirthdayCustomers(todayBirthdays)

      // 未返信トラッキング: 過去14日の連絡ログから未返信顧客数を集計
      const sinceISO = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      const { data: contactRows } = await supabase
        .from('customer_contacts')
        .select('customer_id, contact_date, direction')
        .gte('contact_date', sinceISO)
      const byCustomer = new Map<string, { contact_date: string; direction: 'sent' | 'received' }[]>()
      for (const c of (contactRows ?? []) as any[]) {
        if (c.direction !== 'sent' && c.direction !== 'received') continue
        const list = byCustomer.get(c.customer_id) ?? []
        list.push({ contact_date: c.contact_date, direction: c.direction })
        byCustomer.set(c.customer_id, list)
      }
      let unrep = 0
      for (const list of byCustomer.values()) {
        const status = evaluateUnreplied(list, 3)
        if (status.unreplied) unrep += 1
      }
      setUnrepliedCount(unrep)

      // 個別周期×1.5倍超過 + 90日以上未来店 の S/A 本指名
      // S/A 本指名のみに絞った上で、来店履歴を全部取って平均周期を出す
      const targetCustomers = (birthdayRows ?? []).filter(
        (c: any) =>
          ['S', 'A'].includes(c.customer_rank) &&
          (!c.nomination_status || c.nomination_status === '本指名')
      )
      const targetIds = targetCustomers.map((c: any) => c.id)
      if (targetIds.length > 0) {
        const { data: allVisits } = await supabase
          .from('customer_visits')
          .select('customer_id, visit_date, has_douhan')
          .in('customer_id', targetIds)
          .order('visit_date', { ascending: true })
        const visitsByCustomer = new Map<string, { date: string; douhan: boolean }[]>()
        for (const v of (allVisits ?? []) as any[]) {
          const list = visitsByCustomer.get(v.customer_id) ?? []
          list.push({ date: v.visit_date, douhan: !!v.has_douhan })
          visitsByCustomer.set(v.customer_id, list)
        }
        const now = new Date(today + 'T00:00:00').getTime()
        const dayMs = 1000 * 60 * 60 * 24

        const risks: RiskCustomer[] = []
        for (const c of targetCustomers) {
          const visits = visitsByCustomer.get(c.id) ?? []
          if (visits.length === 0) continue
          const last = visits[visits.length - 1].date
          const daysSince = Math.floor(
            (now - new Date(last + 'T00:00:00').getTime()) / dayMs
          )

          // 平均周期: 連続する来店間隔の平均
          let avgCycleDays: number | null = null
          if (visits.length >= 2) {
            const gaps: number[] = []
            for (let i = 1; i < visits.length; i++) {
              const a = new Date(visits[i - 1].date + 'T00:00:00').getTime()
              const b = new Date(visits[i].date + 'T00:00:00').getTime()
              gaps.push(Math.max(1, Math.round((b - a) / dayMs)))
            }
            avgCycleDays = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
          }

          const exceedsPersonalCycle =
            avgCycleDays != null && daysSince >= Math.round(avgCycleDays * 1.5)
          const isInactive90 = daysSince >= 90

          // 採用基準: (個別周期×1.5超過) または (90日超過)
          if (!exceedsPersonalCycle && !isInactive90) continue

          const hasDouhanHistory = visits.some(v => v.douhan)

          risks.push({
            id: c.id,
            name: c.customer_name,
            cast: c.cast_name,
            rank: c.customer_rank,
            daysSince,
            avgCycleDays,
            exceedsPersonalCycle,
            hasDouhanHistory,
          })
        }
        // 同伴ありを優先、その後 daysSince 降順
        risks.sort((a, b) => {
          if (a.hasDouhanHistory !== b.hasDouhanHistory) {
            return a.hasDouhanHistory ? -1 : 1
          }
          return b.daysSince - a.daysSince
        })
        setRiskCustomers(risks.slice(0, 8))
      }
    }
    load().catch(e => console.error('AdminHomeDashboard load error', e))
  }, [supabase, today, yesterday, month, todayMD])

  const pace = useMemo(
    () =>
      calcSalesPace({
        currentSales: monthSales,
        month,
        workedDays,
        totalWorkDays,
        targetSales: monthTarget,
      }),
    [monthSales, month, workedDays, totalWorkDays, monthTarget]
  )

  const formatYen = (n: number) => `¥${n.toLocaleString()}`

  return (
    <div
      style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      {/* ─── ヘッダー ─── */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: `linear-gradient(135deg, #FFF0F5 0%, #FFE4ED 60%, #FFD7E4 100%)`,
          border: 'none',
          borderBottom: collapsed ? 'none' : `1px solid ${C.border}`,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div
            style={{
              display: 'inline-block',
              fontSize: 8,
              letterSpacing: '0.25em',
              color: C.pink,
              background: 'rgba(255,255,255,0.55)',
              padding: '2px 8px',
              borderRadius: 10,
              fontWeight: 700,
            }}
          >
            STORE TODAY · {today}（{todayDow}）
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: C.dark,
              marginTop: 6,
              letterSpacing: '0.05em',
            }}
          >
            店舗ダッシュボード
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            color: C.pink,
            fontWeight: 700,
            background: '#FFF',
            padding: '4px 8px',
            borderRadius: '50%',
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(232,120,154,0.2)',
          }}
        >
          {collapsed ? '▼' : '▲'}
        </span>
      </button>

      {!collapsed && (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 売上サマリー 4カード */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <SummaryCard label="昨日の売上" value={formatYen(yesterdaySales)} accent={false} />
            <SummaryCard label="今月累計" value={formatYen(monthSales)} accent />
            <SummaryCard label="場内→本転換" value={`${conversionCount}件`} accent={false} />
            <SummaryCard
              label="未返信(3日+)"
              value={`${unrepliedCount}件`}
              accent={unrepliedCount > 0}
            />
          </div>

          {/* 売上ペース予測 */}
          <SalesPaceCard pace={pace} variant="full" />

          {/* 今日の出勤キャスト */}
          <div>
            <SectionLabel>今日の出勤希望 — {shifts.length}名</SectionLabel>
            {shifts.length === 0 ? (
              <div style={{ fontSize: 11, color: C.pinkMuted }}>
                出勤予定のキャストがいません
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {shifts.map(s => (
                  <span
                    key={s.id}
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      background: s.status === '来客出勤' ? '#FFE4ED' : C.tagBg,
                      color: C.tagText,
                      border: `1px solid ${C.border}`,
                      borderRadius: 12,
                    }}
                    title={s.status}
                  >
                    {s.name}
                    {s.tier ? (
                      <span style={{ fontSize: 9, marginLeft: 4, color: C.pinkMuted }}>
                        {s.tier}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 今日の誕生日 */}
          {birthdayCustomers.length > 0 && (
            <div>
              <SectionLabel>今日が誕生日のお客様 — {birthdayCustomers.length}名</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {birthdayCustomers.map(c => (
                  <div
                    key={c.id}
                    style={{
                      padding: '8px 12px',
                      background: '#FFF6F9',
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>★</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                    {c.rank && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: '2px 6px',
                          background: '#FBEAF0',
                          color: '#72243E',
                          borderRadius: 8,
                        }}
                      >
                        {c.rank}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: C.pinkMuted, marginLeft: 'auto' }}>
                      担当: {c.cast}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 離脱リスク（個別周期×1.5超過 or 90日超過） */}
          {riskCustomers.length > 0 && (
            <div>
              <SectionLabel>
                離脱リスク S/A 本指名 — {riskCustomers.length}名
                <span style={{ fontSize: 9, marginLeft: 6, color: C.pinkMuted, letterSpacing: 0 }}>
                  （個別周期×1.5超過 or 90日超過）
                </span>
              </SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {riskCustomers.map(c => (
                  <div
                    key={c.id}
                    style={{
                      padding: '8px 12px',
                      background: '#FFF',
                      borderRadius: 8,
                      border: `1px solid ${c.exceedsPersonalCycle ? '#F5A5A5' : C.border}`,
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        padding: '2px 6px',
                        background: c.rank === 'S' ? '#FBEAF0' : '#FAEEDA',
                        color: c.rank === 'S' ? '#72243E' : '#633806',
                        borderRadius: 8,
                      }}
                    >
                      {c.rank}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: c.hasDouhanHistory ? 700 : 500 }}>
                      {c.name}
                      {c.hasDouhanHistory && (
                        <span
                          style={{
                            fontSize: 9,
                            marginLeft: 6,
                            color: '#0F6E56',
                            background: '#E1F5EE',
                            padding: '1px 6px',
                            borderRadius: 6,
                          }}
                        >
                          同伴経験
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 11, color: C.pinkMuted }}>担当: {c.cast}</span>
                    <span
                      style={{
                        fontSize: 11,
                        marginLeft: 'auto',
                        color: c.exceedsPersonalCycle
                          ? '#A32D2D'
                          : c.daysSince >= 120
                          ? '#A32D2D'
                          : '#BA7517',
                        fontWeight: 500,
                      }}
                    >
                      {c.daysSince}日未来店
                      {c.avgCycleDays != null && (
                        <span style={{ fontSize: 10, marginLeft: 4, color: C.pinkMuted, fontWeight: 400 }}>
                          / 通常{c.avgCycleDays}日
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        letterSpacing: '0.2em',
        color: C.pinkMuted,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: boolean
}) {
  return (
    <div
      style={{
        background: '#F9F6F7',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 2 }}>{label}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: accent ? C.pink : C.dark,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  )
}
