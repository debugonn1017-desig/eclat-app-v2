'use client'

import { useState, useEffect, useMemo } from 'react'
import { C } from '@/lib/colors'
import { CastKPI, CastTarget, CustomerRank } from '@/types'
import { useCasts } from '@/hooks/useCasts'

interface Props {
  castId: string
  castName: string
  month: string
  kpi: CastKPI
  castTarget: CastTarget | null
  workDays: number
  isPC?: boolean
}

const RANKS: CustomerRank[] = ['S', 'A', 'B', 'C']
const RANK_COLORS: Record<CustomerRank, string> = {
  S: '#E8789A', A: '#D4A76A', B: '#7BAFCC', C: '#B0909A',
}

export default function CastKPITab({ castId, castName, month, kpi, castTarget, workDays, isPC }: Props) {
  const { getMultiMonthKPI, getCastTarget } = useCasts()

  const [chartRange, setChartRange] = useState<'3m' | '12m'>('3m')
  const [multiKPI, setMultiKPI] = useState<Record<string, CastKPI>>({})
  const [multiTargets, setMultiTargets] = useState<Record<string, number>>({})
  const [chartLoading, setChartLoading] = useState(false)

  const formatYen = (n: number) =>
    n.toLocaleString('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })

  const shortYen = (n: number) => {
    if (n >= 10000) return `${Math.round(n / 10000)}万`
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
    return `${n}`
  }

  // 対象月リスト生成
  const getMonthsList = (range: '3m' | '12m') => {
    const count = range === '3m' ? 3 : 12
    const [y, m] = month.split('-').map(Number)
    const months: string[] = []
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months
  }

  // 複数月データ取得
  useEffect(() => {
    const fetchMulti = async () => {
      setChartLoading(true)
      const months = getMonthsList(chartRange)
      const data = await getMultiMonthKPI(castName, castId, months)
      setMultiKPI(data)

      // 各月の目標も取得
      const targets: Record<string, number> = {}
      for (const m of months) {
        const ct = await getCastTarget(castId, m)
        targets[m] = ct?.target_sales ?? 0
      }
      setMultiTargets(targets)
      setChartLoading(false)
    }
    fetchMulti()
  }, [castId, castName, month, chartRange, getMultiMonthKPI, getCastTarget])

  const months = getMonthsList(chartRange)

  // ─── 売上推移グラフ（SVG） ─────────────────────────────
  const salesChartSVG = useMemo(() => {
    if (Object.keys(multiKPI).length === 0) return null

    const W = 650, H = 200, padL = 55, padR = 20, padT = 15, padB = 30
    const chartW = W - padL - padR
    const chartH = H - padT - padB

    const salesVals = months.map(m => multiKPI[m]?.monthlySales ?? 0)
    const targetVals = months.map(m => multiTargets[m] ?? 0)
    const allVals = [...salesVals, ...targetVals].filter(v => v > 0)
    const maxVal = allVals.length > 0 ? Math.max(...allVals) * 1.15 : 100000

    const xStep = months.length > 1 ? chartW / (months.length - 1) : chartW / 2

    const toX = (i: number) => padL + (months.length > 1 ? i * xStep : chartW / 2)
    const toY = (v: number) => padT + chartH - (v / maxVal) * chartH

    // 売上ライン
    const salesPoints = salesVals.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
    // 目標ライン
    const targetPoints = targetVals.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')

    // グリッドライン
    const gridLines = 4
    const gridVals = Array.from({ length: gridLines + 1 }, (_, i) => Math.round((maxVal / gridLines) * i))

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* グリッド */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)}
              stroke="#F0E8EB" strokeWidth="0.5" />
            <text x={padL - 6} y={toY(v) + 3} textAnchor="end"
              fill={C.pinkMuted} fontSize="8">{shortYen(v)}</text>
          </g>
        ))}
        {/* 目標ライン（点線） */}
        {targetVals.some(v => v > 0) && (
          <polyline points={targetPoints} fill="none"
            stroke={C.pinkMuted} strokeWidth="1.5" strokeDasharray="5,4" />
        )}
        {/* 売上ライン */}
        <polyline points={salesPoints} fill="none"
          stroke={C.pink} strokeWidth="2.5" strokeLinejoin="round" />
        {/* 売上ドット */}
        {salesVals.map((v, i) => (
          <g key={i}>
            <circle cx={toX(i)} cy={toY(v)} r="4" fill={C.pink} />
            <circle cx={toX(i)} cy={toY(v)} r="2" fill="#FFF" />
            {/* 値ラベル */}
            <text x={toX(i)} y={toY(v) - 8} textAnchor="middle"
              fill={C.dark} fontSize="8" fontWeight="600">{shortYen(v)}</text>
          </g>
        ))}
        {/* X軸ラベル */}
        {months.map((m, i) => {
          const [, mm] = m.split('-')
          return (
            <text key={m} x={toX(i)} y={H - 5} textAnchor="middle"
              fill={C.pinkMuted} fontSize="9">
              {Number(mm)}月
            </text>
          )
        })}
      </svg>
    )
  }, [multiKPI, multiTargets, months])

  // ─── ドーナツグラフ（ランク別売上） ────────────────────
  const donutSVG = useMemo(() => {
    const total = RANKS.reduce((s, r) => s + kpi.rankBreakdown[r].sales, 0)
    if (total === 0) return null

    const cx = 70, cy = 70, R = 55, r = 35
    let startAngle = -90

    const slices = RANKS.map(rank => {
      const val = kpi.rankBreakdown[rank].sales
      const pct = val / total
      const angle = pct * 360
      const endAngle = startAngle + angle
      const largeArc = angle > 180 ? 1 : 0

      const toRad = (deg: number) => (deg * Math.PI) / 180
      const x1o = cx + R * Math.cos(toRad(startAngle))
      const y1o = cy + R * Math.sin(toRad(startAngle))
      const x2o = cx + R * Math.cos(toRad(endAngle))
      const y2o = cy + R * Math.sin(toRad(endAngle))
      const x1i = cx + r * Math.cos(toRad(endAngle))
      const y1i = cy + r * Math.sin(toRad(endAngle))
      const x2i = cx + r * Math.cos(toRad(startAngle))
      const y2i = cy + r * Math.sin(toRad(startAngle))

      const path = pct >= 0.999
        ? '' // Handle 100% case
        : `M ${x1o} ${y1o} A ${R} ${R} 0 ${largeArc} 1 ${x2o} ${y2o}
           L ${x1i} ${y1i} A ${r} ${r} 0 ${largeArc} 0 ${x2i} ${y2i} Z`

      const result = { rank, val, pct, path, color: RANK_COLORS[rank] }
      startAngle = endAngle
      return result
    }).filter(s => s.pct > 0)

    return (
      <svg viewBox="0 0 140 140" style={{ width: '120px', height: '120px' }}>
        {slices.length === 1 ? (
          // 1つのランクが100%の場合
          <circle cx={cx} cy={cy} r={R} fill="none"
            stroke={slices[0].color} strokeWidth={R - r} />
        ) : (
          slices.map(s => (
            <path key={s.rank} d={s.path} fill={s.color} />
          ))
        )}
        {/* 中央テキスト */}
        <text x={cx} y={cy - 4} textAnchor="middle" fill={C.dark}
          fontSize="10" fontWeight="600">{shortYen(total)}</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill={C.pinkMuted}
          fontSize="7">合計売上</text>
      </svg>
    )
  }, [kpi.rankBreakdown])

  // ─── 達成率バー項目 ────────────────────────────────────
  const achievementItems = useMemo(() => {
    const ct = castTarget
    const items: { label: string; current: number; target: number; unit: string; color: string }[] = [
      { label: '売上', current: kpi.monthlySales, target: ct?.target_sales ?? 0, unit: '円', color: C.pink },
      { label: '顧客（本指名/福岡/S〜B）', current: kpi.kokyakuCount, target: ct?.target_local_customers ?? 0, unit: '人', color: '#D4A017' },
      { label: '県外顧客', current: kpi.kengaiCount, target: ct?.target_remote_customers ?? 0, unit: '人', color: '#5B8DBE' },
      { label: '場内指名', current: kpi.banaCount, target: ct?.target_banai ?? 0, unit: '人', color: '#E8A0B0' },
      { label: '出勤日数', current: workDays, target: ct?.target_work_days ?? 0, unit: '日', color: C.pinkLight },
    ]
    return items
  }, [kpi, castTarget, workDays])

  // PC用カラム分割用ヘルパー
  const pcLeft = isPC ? { gridColumn: '1' } : {}
  const pcRight = isPC ? { gridColumn: '2' } : {}
  const pcFull = isPC ? { gridColumn: '1 / -1' } : {}

  return (
    <div style={isPC ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px', alignItems: 'start' } : undefined}>
      {/* ─── 売上 / ノルマ サマリーカード ─── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', ...pcFull }}>
        <div style={{
          flex: 1, background: C.white, border: `1px solid ${C.border}`,
          padding: '16px 12px', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
            background: C.pink,
          }} />
          <div style={{ fontSize: '7px', letterSpacing: '0.2em', color: C.pinkMuted }}>月間売上</div>
          <div style={{ fontSize: '20px', fontWeight: 500, marginTop: '6px', color: C.pink }}>
            {formatYen(kpi.monthlySales)}
          </div>
          <div style={{ fontSize: '9px', color: C.pinkMuted, marginTop: '2px' }}>
            {kpi.visitGroups}組の来店
          </div>
        </div>
        <div style={{
          flex: 1, background: C.white, border: `1px solid ${C.border}`,
          padding: '16px 12px', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
            background: C.pinkMuted,
          }} />
          <div style={{ fontSize: '7px', letterSpacing: '0.2em', color: C.pinkMuted }}>ノルマ</div>
          <div style={{ fontSize: '20px', fontWeight: 500, marginTop: '6px', color: C.dark }}>
            {kpi.targetSales > 0 ? formatYen(kpi.targetSales) : '未設定'}
          </div>
          <div style={{ fontSize: '9px', color: C.pinkMuted, marginTop: '2px' }}>
            {kpi.targetSales > 0
              ? `差額 ${formatYen(kpi.monthlySales - kpi.targetSales)}`
              : '—'}
          </div>
        </div>
      </div>

      {/* ─── 売上達成率 ─── */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '14px 16px', marginBottom: '8px', ...pcFull,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '9px', color: C.pinkMuted }}>売上達成率</span>
          <span style={{ fontSize: '14px', color: C.pink, fontWeight: 600 }}>
            {kpi.targetSales > 0 ? `${kpi.achievementRate}%` : '—'}
          </span>
        </div>
        <div style={{
          height: '8px', background: C.border, borderRadius: '4px', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: '4px',
            width: `${Math.min(kpi.achievementRate, 100)}%`,
            background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight})`,
            transition: 'width 0.6s ease',
          }} />
        </div>
      </div>

      {/* ─── 売上推移グラフ ─── */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '14px 16px', marginBottom: '8px', ...pcLeft,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '10px', letterSpacing: '0.15em', color: C.pinkMuted }}>売上推移</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['3m', '12m'] as const).map(r => (
              <button key={r} onClick={() => setChartRange(r)} style={{
                padding: '4px 10px', fontSize: '9px', fontFamily: 'inherit',
                background: chartRange === r ? C.pink : 'transparent',
                color: chartRange === r ? C.white : C.pinkMuted,
                border: `1px solid ${chartRange === r ? C.pink : C.border}`,
                cursor: 'pointer',
              }}>
                {r === '3m' ? '3ヶ月' : '年間'}
              </button>
            ))}
          </div>
        </div>
        {/* 凡例 */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '6px', fontSize: '9px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '14px', height: '2px', background: C.pink, display: 'inline-block' }} />
            <span style={{ color: C.dark }}>実績</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '14px', height: '2px', background: C.pinkMuted, display: 'inline-block', borderTop: '1px dashed ' + C.pinkMuted }} />
            <span style={{ color: C.dark }}>目標</span>
          </span>
        </div>
        {chartLoading ? (
          <div style={{ height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: C.pinkMuted }}>
            読み込み中...
          </div>
        ) : salesChartSVG}
      </div>

      {/* ─── ノルマ達成率バー ─── */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '14px 16px', marginBottom: '8px', ...pcRight,
      }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: C.pinkMuted, marginBottom: '12px' }}>
          ノルマ達成状況
        </div>
        {achievementItems.map((item, i) => {
          const pct = item.target > 0 ? Math.round((item.current / item.target) * 100) : 0
          const displayCurrent = item.unit === '円' ? shortYen(item.current) : `${item.current}`
          const displayTarget = item.unit === '円' ? shortYen(item.target) : `${item.target}`
          return (
            <div key={i} style={{ marginBottom: i < achievementItems.length - 1 ? '10px' : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: C.dark }}>{item.label}</span>
                <span style={{ fontSize: '10px', color: item.target > 0 ? C.dark : C.pinkMuted }}>
                  {item.target > 0
                    ? `${displayCurrent} / ${displayTarget}${item.unit}（${pct}%）`
                    : '未設定'}
                </span>
              </div>
              <div style={{
                height: '6px', background: C.border, borderRadius: '3px', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: '3px',
                  width: `${Math.min(pct, 100)}%`,
                  background: item.color,
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── 顧客カテゴリ内訳 ─── */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '14px 16px', marginBottom: '8px', ...pcLeft,
      }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: C.pinkMuted, marginBottom: '10px' }}>
          顧客カテゴリ内訳
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
          {[
            { label: '顧客', count: kpi.kokyakuCount, color: '#D4A017', sub: '本指名/福岡/S〜B' },
            { label: '県外顧客', count: kpi.kengaiCount, color: '#5B8DBE', sub: '本指名/県外' },
            { label: 'ランクC', count: kpi.rankCCount, color: '#C4A265', sub: '' },
            { label: '場内指名', count: kpi.banaCount, color: '#E8A0B0', sub: '' },
            { label: 'フリー', count: kpi.freeCount, color: '#B0B0B0', sub: '' },
          ].map((item, i) => (
            <div key={i} style={{
              background: C.tagBg, border: `1px solid ${C.border}`,
              padding: '10px 8px', position: 'relative', textAlign: 'center',
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
                background: item.color,
              }} />
              <div style={{ fontSize: '9px', color: C.pinkMuted, letterSpacing: '0.05em' }}>{item.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: item.color, marginTop: '2px' }}>
                {item.count}
              </div>
              <div style={{ fontSize: '7px', color: C.pinkMuted }}>人</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── ランク別売上（ドーナツ）+ 来店回数 ─── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', ...pcRight }}>
        {/* ドーナツ */}
        <div style={{
          flex: 1, background: C.white, border: `1px solid ${C.border}`,
          padding: '14px 12px',
        }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: C.pinkMuted, marginBottom: '8px' }}>
            ランク別売上
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {donutSVG || (
              <div style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: C.pinkMuted }}>
                データなし
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {RANKS.map(r => {
                const val = kpi.rankBreakdown[r].sales
                const target = castTarget?.rank_targets
                  ? ((castTarget.rank_targets as Record<string, { sales: number }>)[r]?.sales ?? 0)
                  : 0
                return (
                  <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: RANK_COLORS[r], display: 'inline-block',
                    }} />
                    <span style={{ fontSize: '10px', color: C.dark, fontWeight: 500, width: '14px' }}>{r}</span>
                    <span style={{ fontSize: '10px', color: C.dark }}>{shortYen(val)}</span>
                    {target > 0 && (
                      <span style={{ fontSize: '8px', color: C.pinkMuted }}>/ {shortYen(target)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ─── ランク別来店回数（横棒グラフ） ─── */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '14px 16px', marginBottom: '8px', ...pcLeft,
      }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: C.pinkMuted, marginBottom: '10px' }}>
          ランク別来店回数
        </div>
        {RANKS.map(r => {
          const visits = kpi.rankBreakdown[r].visits
          const target = castTarget?.rank_targets
            ? ((castTarget.rank_targets as Record<string, { visits: number }>)[r]?.visits ?? 0)
            : 0
          const maxVisits = Math.max(
            ...RANKS.map(rk => kpi.rankBreakdown[rk].visits),
            ...RANKS.map(rk => castTarget?.rank_targets
              ? ((castTarget.rank_targets as Record<string, { visits: number }>)[rk]?.visits ?? 0)
              : 0),
            1
          )
          return (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: RANK_COLORS[r], width: '18px' }}>{r}</span>
              <div style={{ flex: 1, position: 'relative', height: '16px', background: C.border, borderRadius: '3px' }}>
                {/* 目標バー（背景） */}
                {target > 0 && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, height: '100%',
                    width: `${(target / maxVisits) * 100}%`,
                    borderRadius: '3px',
                    border: `1px dashed ${RANK_COLORS[r]}`,
                    opacity: 0.3,
                  }} />
                )}
                {/* 実績バー */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  width: `${(visits / maxVisits) * 100}%`,
                  background: RANK_COLORS[r],
                  borderRadius: '3px',
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <span style={{ fontSize: '11px', color: C.dark, fontWeight: 500, width: '40px', textAlign: 'right' }}>
                {visits}回
                {target > 0 && <span style={{ fontSize: '8px', color: C.pinkMuted }}> /{target}</span>}
              </span>
            </div>
          )
        })}
      </div>

      {/* ─── 同伴・アフター KPI ─── */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '14px 16px', marginBottom: '8px', ...pcRight,
      }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: C.pinkMuted, marginBottom: '10px' }}>
          同伴・アフター実績
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', color: C.dark }}>同伴</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: C.pink }}>
                {kpi.douhanCount}回
                {kpi.totalVisitCount > 0 && (
                  <span style={{ fontSize: '9px', color: C.pinkMuted, marginLeft: '4px' }}>
                    ({Math.round((kpi.douhanCount / kpi.totalVisitCount) * 100)}%)
                  </span>
                )}
              </span>
            </div>
            <div style={{
              height: '6px', background: C.border, borderRadius: '3px', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: '3px',
                width: `${kpi.totalVisitCount > 0 ? Math.min((kpi.douhanCount / kpi.totalVisitCount) * 100, 100) : 0}%`,
                background: `linear-gradient(90deg, ${C.pink}, ${C.pinkLight})`,
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', color: C.dark }}>アフター</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#D4607A' }}>
                {kpi.afterCount}回
                {kpi.totalVisitCount > 0 && (
                  <span style={{ fontSize: '9px', color: C.pinkMuted, marginLeft: '4px' }}>
                    ({Math.round((kpi.afterCount / kpi.totalVisitCount) * 100)}%)
                  </span>
                )}
              </span>
            </div>
            <div style={{
              height: '6px', background: C.border, borderRadius: '3px', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: '3px',
                width: `${kpi.totalVisitCount > 0 ? Math.min((kpi.afterCount / kpi.totalVisitCount) * 100, 100) : 0}%`,
                background: '#D4607A',
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        </div>
        <div style={{
          fontSize: '9px', color: C.pinkMuted, marginTop: '8px', textAlign: 'center',
        }}>
          総来店: {kpi.totalVisitCount}回
        </div>
      </div>

      {/* ─── 場内→本指名 転換 & ミニ統計 ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: isPC ? 'repeat(3, 1fr)' : '1fr 1fr', gap: '6px', marginBottom: '8px', ...pcFull }}>
        {[
          { label: '場内→本指名', value: `${kpi.conversionCount}人`, accent: C.pink },
          { label: '客単価', value: formatYen(kpi.avgSpend), accent: C.pinkMuted },
          { label: '来店組数', value: `${kpi.visitGroups}組`, accent: '#D4A76A' },
          { label: '1出勤あたり', value: workDays > 0 ? formatYen(Math.round(kpi.monthlySales / workDays)) : '—', accent: C.pinkLight },
          { label: '実出勤日数', value: `${workDays}日`, accent: '#7BAFCC' },
          { label: '設定出勤', value: castTarget?.target_work_days ? `${castTarget.target_work_days}日` : '未設定', accent: '#B0909A' },
        ].map((item, i) => (
          <div key={i} style={{
            background: C.white, border: `1px solid ${C.border}`,
            padding: '12px', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
              background: item.accent,
            }} />
            <span style={{ fontSize: '9px', color: C.pinkMuted }}>{item.label}</span>
            <div style={{ fontSize: '16px', fontWeight: 500, color: C.dark, marginTop: '4px' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* ─── 月次レポートダウンロード ─── */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`,
        padding: '14px 16px', marginBottom: '8px', ...pcFull,
      }}>
        <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: C.pinkMuted, marginBottom: '10px' }}>
          月次レポート
        </div>
        <button
          onClick={() => {
            const [y, m] = month.split('-')
            const ct = castTarget
            const douhanRate = kpi.totalVisitCount > 0
              ? Math.round((kpi.douhanCount / kpi.totalVisitCount) * 100) : 0
            const afterRate = kpi.totalVisitCount > 0
              ? Math.round((kpi.afterCount / kpi.totalVisitCount) * 100) : 0

            const lines = [
              `Éclat 月次レポート`,
              `キャスト: ${castName}`,
              `対象月: ${y}年${Number(m)}月`,
              `生成日: ${new Date().toLocaleDateString('ja-JP')}`,
              ``,
              `■ 売上実績`,
              `  月間売上: ${formatYen(kpi.monthlySales)}`,
              `  ノルマ: ${(ct?.target_sales ?? 0) > 0 ? formatYen(ct!.target_sales!) : '未設定'}`,
              `  達成率: ${kpi.targetSales > 0 ? `${kpi.achievementRate}%` : '—'}`,
              `  差額: ${kpi.targetSales > 0 ? formatYen(kpi.monthlySales - kpi.targetSales) : '—'}`,
              ``,
              `■ 指名・顧客数`,
              `  総顧客数: ${kpi.customerCount}人`,
              `  本指名: ${kpi.honshimeiCount}人`,
              `  場内: ${kpi.banaCount}人`,
              `  場内→本指名転換: ${kpi.conversionCount}人`,
              `  県内（福岡）: ${kpi.localCustomerCount}人`,
              `  県外: ${kpi.remoteCustomerCount}人`,
              ``,
              `■ 来店実績`,
              `  来店組数: ${kpi.visitGroups}組`,
              `  総来店回数: ${kpi.totalVisitCount}回`,
              `  客単価: ${formatYen(kpi.avgSpend)}`,
              `  出勤日数: ${workDays}日`,
              `  1出勤あたり: ${workDays > 0 ? formatYen(Math.round(kpi.monthlySales / workDays)) : '—'}`,
              ``,
              `■ 同伴・アフター`,
              `  同伴: ${kpi.douhanCount}回 (${douhanRate}%)`,
              `  アフター: ${kpi.afterCount}回 (${afterRate}%)`,
              ``,
              `■ ランク別内訳`,
              ...RANKS.map(r => {
                const rd = kpi.rankBreakdown[r]
                return `  ${r}ランク: 売上${shortYen(rd.sales)} / 来店${rd.visits}回`
              }),
            ]

            const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `report_${castName}_${month}.txt`
            a.click()
            URL.revokeObjectURL(url)
          }}
          style={{
            width: '100%', padding: '10px',
            background: `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
            color: C.white, border: 'none',
            fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          レポートをダウンロード (.txt)
        </button>

        <button
          onClick={() => {
            const [y, m] = month.split('-')
            const douhanRate = kpi.totalVisitCount > 0
              ? Math.round((kpi.douhanCount / kpi.totalVisitCount) * 100) : 0
            const afterRate = kpi.totalVisitCount > 0
              ? Math.round((kpi.afterCount / kpi.totalVisitCount) * 100) : 0

            const header = '項目,値'
            const rows = [
              `キャスト,${castName}`,
              `対象月,${y}年${Number(m)}月`,
              `月間売上,${kpi.monthlySales}`,
              `ノルマ,${castTarget?.target_sales ?? 0}`,
              `達成率,${kpi.achievementRate}%`,
              `総顧客数,${kpi.customerCount}`,
              `本指名数,${kpi.honshimeiCount}`,
              `場内数,${kpi.banaCount}`,
              `場内→本指名転換,${kpi.conversionCount}`,
              `県内顧客,${kpi.localCustomerCount}`,
              `県外顧客,${kpi.remoteCustomerCount}`,
              `来店組数,${kpi.visitGroups}`,
              `総来店回数,${kpi.totalVisitCount}`,
              `客単価,${kpi.avgSpend}`,
              `出勤日数,${workDays}`,
              `同伴回数,${kpi.douhanCount}`,
              `同伴率,${douhanRate}%`,
              `アフター回数,${kpi.afterCount}`,
              `アフター率,${afterRate}%`,
              ...RANKS.map(r => `${r}ランク売上,${kpi.rankBreakdown[r].sales}`),
              ...RANKS.map(r => `${r}ランク来店,${kpi.rankBreakdown[r].visits}`),
            ]

            const csv = '\uFEFF' + [header, ...rows].join('\n')
            const blob = new Blob([csv], { type: 'text/csv; charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `report_${castName}_${month}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
          style={{
            width: '100%', padding: '10px', marginTop: '6px',
            background: C.white,
            color: C.pink, border: `1px solid ${C.pink}`,
            fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          CSV形式でダウンロード
        </button>
      </div>
    </div>
  )
}
