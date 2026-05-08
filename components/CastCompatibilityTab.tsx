'use client'

// 🧲 相性タブ
//   担当顧客のランク / 地域 / 入口（指名ルート）ごとに、
//   売上 / 客単価 / リピート率 / LTV を集計し、
//   このキャストが「どんなお客様に強いか」を可視化する。
//
//   /admin/casts/[id] と /admin/cast-analysis の両方から使用。

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/colors'
import type { CustomerLite } from './CastAnalysisAdvancedTabs'

type Period = 'all' | '6m' | '3m'

type ExtraAttrs = {
  nomination_route: string | null
  age_group: string | null
  occupation: string | null
}

type GroupRow = {
  key: string
  customer_count: number
  total_sales: number
  visit_count: number
  avg_per_visit: number
  repeat_rate: number   // %（2回以上来店した顧客の割合）
  avg_ltv: number       // 顧客あたりの累計売上
}

type CustomerStats = {
  visit_count: number
  total_spent: number
  has_visit: boolean
}

const RANK_ORDER = ['S', 'A', 'B', 'C', '未設定']

export function CompatibilityTab({
  customers,
  isPC,
}: {
  customers: CustomerLite[]
  isPC: boolean
}) {
  const supabase = useMemo(() => createClient(), [])

  const [period, setPeriod] = useState<Period>('all')

  // 顧客の追加属性（nomination_route 等）
  const [extra, setExtra] = useState<Map<string, ExtraAttrs>>(new Map())
  // 期間絞り込み時の visits 集計
  const [periodVisits, setPeriodVisits] = useState<Map<string, { count: number; total: number }>>(new Map())
  const [loadingExtra, setLoadingExtra] = useState(false)
  const [loadingPeriod, setLoadingPeriod] = useState(false)

  // 追加属性のフェッチ
  useEffect(() => {
    const load = async () => {
      if (customers.length === 0) { setExtra(new Map()); return }
      setLoadingExtra(true)
      const ids = customers.map(c => c.id)
      const { data } = await supabase
        .from('customers')
        .select('id, nomination_route, age_group, occupation')
        .in('id', ids)
      const m = new Map<string, ExtraAttrs>()
      for (const r of (data ?? []) as Array<{
        id: string
        nomination_route: string | null
        age_group: string | null
        occupation: string | null
      }>) {
        m.set(r.id, {
          nomination_route: r.nomination_route,
          age_group: r.age_group,
          occupation: r.occupation,
        })
      }
      setExtra(m)
      setLoadingExtra(false)
    }
    load()
  }, [supabase, customers])

  // 期間別 visits の集計（全期間なら不要）
  useEffect(() => {
    if (period === 'all' || customers.length === 0) {
      setPeriodVisits(new Map())
      return
    }
    setLoadingPeriod(true)
    const days = period === '6m' ? 180 : 90
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const ids = customers.map(c => c.id)
    const load = async () => {
      const { data } = await supabase
        .from('customer_visits')
        .select('customer_id, amount_spent')
        .in('customer_id', ids)
        .gte('visit_date', since)
      const m = new Map<string, { count: number; total: number }>()
      for (const v of (data ?? []) as Array<{ customer_id: string; amount_spent: number }>) {
        const a = Number(v.amount_spent) || 0
        if (a <= 0) continue
        const cur = m.get(v.customer_id) ?? { count: 0, total: 0 }
        cur.count += 1
        cur.total += a
        m.set(v.customer_id, cur)
      }
      setPeriodVisits(m)
      setLoadingPeriod(false)
    }
    load()
  }, [supabase, customers, period])

  // 顧客ごとの実効ステータス（期間ごと）
  const getStats = (c: CustomerLite): CustomerStats => {
    if (period === 'all') {
      return { visit_count: c.visit_count, total_spent: c.total_spent, has_visit: c.visit_count > 0 }
    }
    const p = periodVisits.get(c.id)
    return { visit_count: p?.count ?? 0, total_spent: p?.total ?? 0, has_visit: (p?.count ?? 0) > 0 }
  }

  // グルーピング集計
  const computeGroups = (getKey: (c: CustomerLite) => string | null): GroupRow[] => {
    const groups = new Map<string, { ids: Set<string>; total: number; visits: number; repeat: number }>()
    for (const c of customers) {
      const stats = getStats(c)
      // 期間絞り込み時は来店ゼロ顧客を除外
      if (period !== 'all' && !stats.has_visit) continue
      const key = getKey(c)
      if (!key) continue
      const g = groups.get(key) ?? { ids: new Set<string>(), total: 0, visits: 0, repeat: 0 }
      g.ids.add(c.id)
      g.total += stats.total_spent
      g.visits += stats.visit_count
      if (stats.visit_count >= 2) g.repeat += 1
      groups.set(key, g)
    }
    const rows: GroupRow[] = []
    for (const [key, g] of groups) {
      const cc = g.ids.size
      rows.push({
        key,
        customer_count: cc,
        total_sales: g.total,
        visit_count: g.visits,
        avg_per_visit: g.visits > 0 ? Math.round(g.total / g.visits) : 0,
        repeat_rate: cc > 0 ? Math.round((g.repeat / cc) * 100) : 0,
        avg_ltv: cc > 0 ? Math.round(g.total / cc) : 0,
      })
    }
    return rows
  }

  const rankRows = useMemo(() => {
    const rows = computeGroups(c => c.customer_rank ?? '未設定')
    return rows.sort((a, b) => RANK_ORDER.indexOf(a.key) - RANK_ORDER.indexOf(b.key))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, period, periodVisits])

  const regionRows = useMemo(() =>
    computeGroups(c => c.region ?? '未設定')
      .sort((a, b) => b.total_sales - a.total_sales)
      .slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customers, period, periodVisits])

  const routeRows = useMemo(() =>
    computeGroups(c => extra.get(c.id)?.nomination_route ?? '未設定')
      .sort((a, b) => b.total_sales - a.total_sales),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customers, extra, period, periodVisits])

  const totalForPeriod = useMemo(() => {
    let s = 0
    for (const c of customers) s += getStats(c).total_spent
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, period, periodVisits])

  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const shortYen = (n: number) => {
    if (Math.abs(n) >= 100000000) return `¥${(n / 100000000).toFixed(1)}億`
    if (Math.abs(n) >= 10000) return `¥${Math.round(n / 10000)}万`
    return `¥${n.toLocaleString()}`
  }

  if (customers.length === 0) {
    return (
      <div style={{
        padding: 30, textAlign: 'center',
        background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.dark, marginBottom: 8 }}>
          相性分析
        </div>
        <div style={{ fontSize: 11, color: C.pinkMuted }}>
          担当顧客がいないため、相性分析を表示できません。
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 期間切替 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '10px 14px',
        background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12,
      }}>
        <span style={{ fontSize: 11, color: C.pinkMuted, fontWeight: 600 }}>集計期間：</span>
        {([
          { k: 'all' as Period, label: '全期間' },
          { k: '6m'  as Period, label: '過去6ヶ月' },
          { k: '3m'  as Period, label: '過去3ヶ月' },
        ]).map(p => (
          <button
            key={p.k}
            onClick={() => setPeriod(p.k)}
            style={{
              fontSize: 11, fontWeight: 500,
              padding: '5px 14px',
              borderRadius: 20,
              border: `1px solid ${period === p.k ? C.pink : C.border}`,
              background: period === p.k ? '#FBEAF0' : '#FFF',
              color: period === p.k ? '#72243E' : C.pinkMuted,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            {p.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: C.pinkMuted }}>
          総売上 <strong style={{ color: C.dark }}>{shortYen(totalForPeriod)}</strong> / 顧客 <strong style={{ color: C.dark }}>{customers.length}名</strong>
          {(loadingExtra || loadingPeriod) && <span style={{ marginLeft: 8, color: C.pink }}>読込中...</span>}
        </span>
      </div>

      {/* 概要カード */}
      <BestZoneCard rankRows={rankRows} regionRows={regionRows} routeRows={routeRows} totalSales={totalForPeriod} isPC={isPC} />

      {/* セクション1: 顧客ランク別の相性 */}
      <SectionCard
        icon="📊"
        title="顧客ランク別の相性"
        description="どのランクのお客様から一番稼げているか / リピートしやすいか"
      >
        <CompatibilityTable rows={rankRows} totalSales={totalForPeriod} isPC={isPC} keyLabel="ランク" />
      </SectionCard>

      {/* セクション2: 地域別の相性 */}
      <SectionCard
        icon="📍"
        title="地域別の相性 (Top 8)"
        description="どの地域のお客様が太客になりやすいか"
      >
        <CompatibilityTable rows={regionRows} totalSales={totalForPeriod} isPC={isPC} keyLabel="地域" />
      </SectionCard>

      {/* セクション3: 入口別の相性（LTV） */}
      <SectionCard
        icon="🎯"
        title="入口別の相性（指名ルート × LTV）"
        description="本指名 / 場内→本指名 / フリー→本指名 / 紹介 等、入口別の生涯売上比較"
      >
        <CompatibilityTable rows={routeRows} totalSales={totalForPeriod} isPC={isPC} keyLabel="入口" />
        {extra.size === 0 && !loadingExtra && (
          <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 6, fontStyle: 'italic' }}>
            ※ 顧客データに「指名ルート」が入力されていない場合、すべて「未設定」にまとめられます。
          </div>
        )}
      </SectionCard>

      {/* セクション4: LTV Top 10（B-1） */}
      <LtvRankingSection customers={customers} period={period} periodVisits={periodVisits} totalSales={totalForPeriod} isPC={isPC} />

      {/* セクション5: ボトル分析（Phase 3-④） */}
      <BottleAnalysisSection customers={customers} isPC={isPC} />
    </div>
  )
}

// ─── ボトル分析（Phase 3-④） ─────────────────────────────────
function BottleAnalysisSection({ customers, isPC }: { customers: CustomerLite[]; isPC: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  type Bottle = { id: string; customer_id: string; bottle_name: string; remaining_amount: string }
  const [bottles, setBottles] = useState<Bottle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const ids = customers.map(c => c.id)
      if (ids.length === 0) { setBottles([]); setLoading(false); return }
      const { data } = await supabase
        .from('customer_bottles')
        .select('id, customer_id, bottle_name, remaining_amount')
        .in('customer_id', ids)
      setBottles((data ?? []) as Bottle[])
      setLoading(false)
    }
    load()
  }, [supabase, customers])

  // 顧客あたりのボトル数
  const bottleByCust = new Map<string, number>()
  for (const b of bottles) {
    bottleByCust.set(b.customer_id, (bottleByCust.get(b.customer_id) ?? 0) + 1)
  }
  const customersWithBottle = [...bottleByCust.keys()]
  const customersWithoutBottle = customers.filter(c => !bottleByCust.has(c.id))

  // ボトル銘柄別
  const byBrand = new Map<string, number>()
  for (const b of bottles) {
    const name = (b.bottle_name ?? '不明').trim() || '不明'
    byBrand.set(name, (byBrand.get(name) ?? 0) + 1)
  }
  const topBrands = [...byBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  // ボトル入り客 vs ボトルなし客の客単価・LTV比較
  const withBottle = customers.filter(c => bottleByCust.has(c.id))
  const sumStats = (arr: typeof customers) => {
    const total = arr.reduce((s, c) => s + c.total_spent, 0)
    const visits = arr.reduce((s, c) => s + c.visit_count, 0)
    const repeated = arr.filter(c => c.visit_count >= 2).length
    return {
      cnt: arr.length,
      total,
      visits,
      ltv: arr.length > 0 ? Math.round(total / arr.length) : 0,
      avgPerVisit: visits > 0 ? Math.round(total / visits) : 0,
      repeatRate: arr.length > 0 ? Math.round((repeated / arr.length) * 100) : 0,
    }
  }
  const wb = sumStats(withBottle)
  const nb = sumStats(customersWithoutBottle)

  // Top 10 ボトラー
  const topBottlers = [...bottleByCust.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => {
      const c = customers.find(cc => cc.id === id)
      return { customer: c, count }
    })
    .filter((x): x is { customer: CustomerLite; count: number } => !!x.customer)

  return (
    <SectionCard
      icon="🍾"
      title="ボトル分析"
      description="ボトル入りお客様の特徴 / 銘柄分布 / Top10 ボトラー"
    >
      {loading ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, textAlign: 'center', padding: 12 }}>読込中...</div>
      ) : bottles.length === 0 ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, textAlign: 'center', padding: 12 }}>ボトル登録なし</div>
      ) : (
        <>
          {/* サマリ＋ボトル有無比較 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isPC ? 'repeat(2, 1fr)' : '1fr',
            gap: 10, marginBottom: 12,
          }}>
            <div style={{
              padding: '10px 12px',
              background: 'linear-gradient(135deg, #FFF6E5 0%, #FFE9C8 100%)',
              borderRadius: 8, border: '1px solid #E5B14C',
            }}>
              <div style={{ fontSize: 10, color: '#9C6300', marginBottom: 4, fontWeight: 600 }}>🍾 ボトル入り客</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#5C3A00' }}>{wb.cnt}名（{bottles.length}本）</div>
              <div style={{ fontSize: 10, color: '#9C6300', marginTop: 4 }}>
                LTV平均 ¥{wb.ltv.toLocaleString()} / 客単価 ¥{wb.avgPerVisit.toLocaleString()} / リピート率 {wb.repeatRate}%
              </div>
            </div>
            <div style={{
              padding: '10px 12px',
              background: '#F9F6F7',
              borderRadius: 8, border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 4, fontWeight: 600 }}>ボトルなし客</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.dark }}>{nb.cnt}名</div>
              <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 4 }}>
                LTV平均 ¥{nb.ltv.toLocaleString()} / 客単価 ¥{nb.avgPerVisit.toLocaleString()} / リピート率 {nb.repeatRate}%
              </div>
            </div>
          </div>

          {/* 銘柄分布 */}
          {topBrands.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
                銘柄分布（Top {topBrands.length}）
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {topBrands.map(([name, n]) => (
                  <span key={name} style={{
                    padding: '4px 10px', borderRadius: 12,
                    background: '#FBEAF0', color: '#72243E',
                    fontSize: 11, fontWeight: 500,
                  }}>{name} × {n}</span>
                ))}
              </div>
            </div>
          )}

          {/* Top 10 ボトラー */}
          {topBottlers.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
                Top 10 ボトラー
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {topBottlers.map((b, i) => (
                  <div key={b.customer.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px',
                    background: i === 0 ? '#FFF6E5' : '#F9F6F7',
                    borderRadius: 6, fontSize: 11,
                  }}>
                    <span style={{ minWidth: 28, fontWeight: 700, color: i === 0 ? '#9C6300' : C.dark }}>
                      {i + 1}位
                    </span>
                    <span style={{ flex: 1, fontWeight: 600 }}>{b.customer.customer_name}</span>
                    {b.customer.customer_rank && (
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: '#F5F0F2' }}>
                        {b.customer.customer_rank}
                      </span>
                    )}
                    <span style={{ color: C.pink, fontWeight: 700 }}>{b.count}本</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─── LTV Top10 セクション（B-1） ─────────────────────────────────
function LtvRankingSection({
  customers, period, periodVisits, totalSales, isPC,
}: {
  customers: CustomerLite[]
  period: Period
  periodVisits: Map<string, { count: number; total: number }>
  totalSales: number
  isPC: boolean
}) {
  type Row = {
    id: string
    name: string
    rank: string | null
    region: string | null
    nomination_status: string | null
    visit_count: number
    total_spent: number
    avg_per_visit: number
  }
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = customers.map(c => {
      let visit = c.visit_count
      let total = c.total_spent
      if (period !== 'all') {
        const p = periodVisits.get(c.id)
        visit = p?.count ?? 0
        total = p?.total ?? 0
      }
      return {
        id: c.id,
        name: c.customer_name,
        rank: c.customer_rank,
        region: c.region,
        nomination_status: c.nomination_status,
        visit_count: visit,
        total_spent: total,
        avg_per_visit: visit > 0 ? Math.round(total / visit) : 0,
      }
    })
    return list
      .filter(r => r.total_spent > 0)
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, period, periodVisits])

  const top10Total = rows.reduce((s, r) => s + r.total_spent, 0)
  const concentration = totalSales > 0 ? Math.round((top10Total / totalSales) * 100) : 0

  return (
    <SectionCard
      icon="💎"
      title="顧客LTVランキング Top 10"
      description="累計売上の多い顧客 / 上位10名で全体の何%を占めるか（パレート集中度）"
    >
      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: C.pinkMuted, padding: '12px 0', textAlign: 'center' }}>
          該当データなし
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
            padding: '6px 10px',
            background: '#FBEAF0', borderRadius: 8,
          }}>
            <span style={{ fontSize: 10, color: '#5A2840', fontWeight: 600 }}>
              Top 10 集中度
            </span>
            <div style={{
              flex: 1, height: 8, background: '#FFF', borderRadius: 4, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, concentration)}%`,
                background: 'linear-gradient(90deg, #ED93B1 0%, #C84F7B 100%)',
              }} />
            </div>
            <span style={{ fontSize: 12, color: '#72243E', fontWeight: 700 }}>
              {concentration}%
            </span>
            <span style={{ fontSize: 9, color: C.pinkMuted }}>
              （¥{top10Total.toLocaleString()} / 全体¥{totalSales.toLocaleString()}）
            </span>
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{
              width: '100%', minWidth: isPC ? 'auto' : 540,
              borderCollapse: 'collapse', fontSize: 11,
            }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.pinkMuted }}>
                  <th style={thStyle('left')}>順位</th>
                  <th style={thStyle('left')}>顧客名</th>
                  <th style={thStyle('left')}>ランク</th>
                  <th style={thStyle('left')}>地域</th>
                  <th style={thStyle('right')}>来店回数</th>
                  <th style={thStyle('right')}>客単価</th>
                  <th style={thStyle('right')}>累計売上</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isTop3 = i < 3
                  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''
                  return (
                    <tr key={r.id} style={{
                      borderBottom: `1px solid ${C.border}`,
                      background: isTop3 ? 'linear-gradient(90deg, #FFF6E5 0%, #FFFDF7 100%)' : 'transparent',
                    }}>
                      <td style={tdStyle('left')}>
                        <span style={{ fontWeight: 700, color: isTop3 ? '#9C6300' : C.dark }}>
                          {medal} {i + 1}位
                        </span>
                      </td>
                      <td style={tdStyle('left')}>
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                      </td>
                      <td style={tdStyle('left')}>
                        {r.rank && (
                          <span style={{
                            fontSize: 9, padding: '2px 6px', borderRadius: 8,
                            background: '#F5F0F2', color: C.dark,
                          }}>{r.rank}</span>
                        )}
                      </td>
                      <td style={tdStyle('left')}>{r.region ?? '—'}</td>
                      <td style={tdStyle('right')}>{r.visit_count}回</td>
                      <td style={tdStyle('right')}>¥{r.avg_per_visit.toLocaleString()}</td>
                      <td style={tdStyle('right')}>
                        <span style={{ fontWeight: 700, color: C.pink }}>
                          ¥{r.total_spent.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {concentration >= 70 && (
            <div style={{
              fontSize: 10, color: '#B8860B', marginTop: 8,
              padding: '6px 10px', background: '#FFF4E0', borderRadius: 6,
              border: '1px solid #F5C97B',
            }}>
              ⚠️ 集中度 {concentration}% — 上位10名に売上が偏っています。離脱リスク分散のため、中堅顧客の育成を意識すると良いかもしれません。
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─── サブコンポーネント ────────────────────────────────────────

function SectionCard({
  icon, title, description, children,
}: {
  icon: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      background: '#FFF',
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{title}</span>
      </div>
      <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 10 }}>{description}</div>
      {children}
    </div>
  )
}

function CompatibilityTable({
  rows, totalSales, isPC, keyLabel,
}: {
  rows: GroupRow[]
  totalSales: number
  isPC: boolean
  keyLabel: string
}) {
  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 11, color: C.pinkMuted, padding: '12px 0', textAlign: 'center' }}>
        該当データなし
      </div>
    )
  }
  // ベスト（売上最大）の行を強調
  const bestKey = [...rows].sort((a, b) => b.total_sales - a.total_sales)[0]?.key

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{
        width: '100%',
        minWidth: isPC ? 'auto' : 540,
        borderCollapse: 'collapse',
        fontSize: 11,
      }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}`, color: C.pinkMuted }}>
            <th style={thStyle('left')}>{keyLabel}</th>
            <th style={thStyle('right')}>顧客数</th>
            <th style={thStyle('right')}>累計売上</th>
            <th style={thStyle('right')}>シェア</th>
            <th style={thStyle('right')}>客単価</th>
            <th style={thStyle('right')}>リピート率</th>
            <th style={thStyle('right')}>LTV平均</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const share = totalSales > 0 ? (r.total_sales / totalSales) * 100 : 0
            const isBest = r.key === bestKey && r.total_sales > 0
            return (
              <tr key={r.key} style={{
                borderBottom: `1px solid ${C.border}`,
                background: isBest ? 'linear-gradient(90deg, #FFF6E5 0%, #FFFDF7 100%)' : 'transparent',
              }}>
                <td style={tdStyle('left')}>
                  <span style={{ fontWeight: 600, color: isBest ? '#9C6300' : C.dark }}>
                    {isBest && '⭐ '}{r.key}
                  </span>
                </td>
                <td style={tdStyle('right')}>{r.customer_count}名</td>
                <td style={tdStyle('right')}>
                  <span style={{ fontWeight: 600 }}>¥{r.total_sales.toLocaleString()}</span>
                </td>
                <td style={tdStyle('right')}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    <div style={{
                      width: 60, height: 6, borderRadius: 3,
                      background: '#F5F0F2', position: 'relative', overflow: 'hidden',
                    }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${Math.min(100, share)}%`,
                        background: isBest ? '#E5B14C' : C.pink,
                      }} />
                    </div>
                    <span style={{ minWidth: 32, color: C.pinkMuted }}>{Math.round(share)}%</span>
                  </div>
                </td>
                <td style={tdStyle('right')}>¥{r.avg_per_visit.toLocaleString()}</td>
                <td style={tdStyle('right')}>
                  <span style={{
                    color: r.repeat_rate >= 50 ? '#0F6E56' : r.repeat_rate >= 25 ? '#B8860B' : C.pinkMuted,
                    fontWeight: 600,
                  }}>{r.repeat_rate}%</span>
                </td>
                <td style={tdStyle('right')}>¥{r.avg_ltv.toLocaleString()}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BestZoneCard({
  rankRows, regionRows, routeRows, totalSales, isPC,
}: {
  rankRows: GroupRow[]
  regionRows: GroupRow[]
  routeRows: GroupRow[]
  totalSales: number
  isPC: boolean
}) {
  const bestRank = [...rankRows].sort((a, b) => b.total_sales - a.total_sales)[0]
  const bestRegion = regionRows[0]
  const bestRoute = routeRows[0]

  const items: { label: string; value: string; sub: string }[] = []
  if (bestRank && bestRank.total_sales > 0) {
    items.push({
      label: '最も稼げているランク',
      value: bestRank.key,
      sub: `¥${bestRank.total_sales.toLocaleString()}（リピート率 ${bestRank.repeat_rate}%）`,
    })
  }
  if (bestRegion && bestRegion.total_sales > 0) {
    items.push({
      label: '最も多い地域',
      value: bestRegion.key,
      sub: `¥${bestRegion.total_sales.toLocaleString()}（${bestRegion.customer_count}名）`,
    })
  }
  if (bestRoute && bestRoute.total_sales > 0 && bestRoute.key !== '未設定') {
    items.push({
      label: '最も育つ入口',
      value: bestRoute.key,
      sub: `LTV ¥${bestRoute.avg_ltv.toLocaleString()}`,
    })
  }

  if (items.length === 0) return null

  return (
    <div style={{
      background: 'linear-gradient(135deg, #FFF8EC 0%, #FFF0D9 60%, #FFE9C8 100%)',
      border: `1px solid #E5B14C`,
      borderRadius: 12,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 11, color: '#9C6300', fontWeight: 600, marginBottom: 8 }}>
        ⭐ このキャストの「得意ゾーン」
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isPC ? `repeat(${items.length}, 1fr)` : '1fr',
        gap: 8,
      }}>
        {items.map((it, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.65)',
            borderRadius: 8,
            padding: '8px 10px',
          }}>
            <div style={{ fontSize: 9, color: '#9C6300', marginBottom: 2 }}>{it.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#5C3A00', marginBottom: 2 }}>{it.value}</div>
            <div style={{ fontSize: 9, color: '#9C6300' }}>{it.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function thStyle(align: 'left' | 'right'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '6px 8px',
    fontSize: 10,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  }
}
function tdStyle(align: 'left' | 'right'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '8px',
    fontSize: 11,
    color: C.dark,
    whiteSpace: 'nowrap',
  }
}
