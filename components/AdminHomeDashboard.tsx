'use client'

// 管理者・スタッフ向けホームダッシュボード
//   ・今日の出勤キャスト（出勤希望/出勤/来客出勤を出勤扱いで算出）
//   ・昨日の店舗売上
//   ・今月累計 + 月予算進捗バー + 月末予測
//   ・今日誕生日のお客様（担当キャスト併記）
//   ・90日以上未来店の S・A ランク（離脱リスク）
//   ・場内→本指名 今月転換数
import { useEffect, useMemo, useState } from 'react'
import { C } from '@/lib/colors'
import SalesPaceCard from './SalesPaceCard'
import { calcSalesPace } from '@/lib/salesPace'

type Props = {
  /** 折りたたみ状態を外で持たせる場合 */
  defaultCollapsed?: boolean
  /** 顧客名タップで詳細オーバーレイを開きたい場合のコールバック */
  onCustomerClick?: (customerId: string) => void
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

export default function AdminHomeDashboard({ defaultCollapsed = false, onCustomerClick }: Props) {
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
    // ⚡ パフォーマンス対策: 13+のクエリを1リクエストに集約した
    //    /api/admin/home-dashboard を呼ぶ。サーバー側で並列実行されるので
    //    旧実装より2-5倍速い。HTTP キャッシュ30秒も効く。
    const load = async () => {
      try {
        const params = new URLSearchParams({ month, today, yesterday, todayMD })
        const res = await fetch(`/api/admin/home-dashboard?${params.toString()}`)
        if (!res.ok) {
          console.error('[home-dashboard] fetch failed', res.status)
          return
        }
        const data = await res.json()
        setShifts(data.shifts ?? [])
        setYesterdaySales(data.yesterdaySales ?? 0)
        setMonthSales(data.monthSales ?? 0)
        setMonthTarget(data.monthTarget ?? 0)
        setConversionCount(data.conversionCount ?? 0)
        setBirthdayCustomers(data.birthdayCustomers ?? [])
        setRiskCustomers(data.riskCustomers ?? [])
        setWorkedDays(data.workedDays ?? 0)
        setTotalWorkDays(data.totalWorkDays ?? 0)
        setUnrepliedCount(data.unrepliedCount ?? 0)
      } catch (e) {
        console.error('AdminHomeDashboard load error', e)
      }
    }
    load()
  }, [today, yesterday, month, todayMD])

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
                    onClick={onCustomerClick ? () => onCustomerClick(c.id) : undefined}
                    style={{
                      padding: '8px 12px',
                      background: '#FFF6F9',
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      cursor: onCustomerClick ? 'pointer' : 'default',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>★</span>
                    <span style={{
                      fontSize: 13, fontWeight: 500,
                      color: onCustomerClick ? C.pink : C.dark,
                      borderBottom: onCustomerClick ? `1px dashed ${C.pink}` : 'none',
                    }}>{c.name}</span>
                    {c.rank && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: '2px 6px',
                          background: C.tagBg2,
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
                    onClick={onCustomerClick ? () => onCustomerClick(c.id) : undefined}
                    style={{
                      padding: '8px 12px',
                      background: '#FFF',
                      borderRadius: 8,
                      border: `1px solid ${c.exceedsPersonalCycle ? '#F5A5A5' : C.border}`,
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      cursor: onCustomerClick ? 'pointer' : 'default',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        padding: '2px 6px',
                        background: c.rank === 'S' ? C.tagBg2 : '#FAEEDA',
                        color: c.rank === 'S' ? '#72243E' : '#633806',
                        borderRadius: 8,
                      }}
                    >
                      {c.rank}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: c.hasDouhanHistory ? 700 : 500,
                      color: onCustomerClick ? C.pink : C.dark,
                      borderBottom: onCustomerClick ? `1px dashed ${C.pink}` : 'none',
                    }}>
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
        background: C.miniBg,
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
