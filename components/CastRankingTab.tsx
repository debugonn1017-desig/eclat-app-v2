'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCasts } from '@/hooks/useCasts'
import { C } from '@/lib/colors'
import { CastKPI, CastProfile, CastTarget, CastTier } from '@/types'
import CastKPITab from '@/components/CastKPITab'

// ─── ランキング API レスポンス型 ────────────────────────────
type RankingRowApi = {
  cast: CastProfile
  kpi: CastKPI
  prevSales: number
  targetSales: number
  achievementRate: number
}

// ─── ソート種別 ──────────────────────────────────────────────
type SortKey = 'sales' | 'avgSpend' | 'honshimei' | 'conversion' | 'douhan' | 'diff'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'sales', label: '売上順' },
  { key: 'avgSpend', label: '客単価順' },
  { key: 'honshimei', label: '指名数順' },
  { key: 'conversion', label: '転換数順' },
  { key: 'douhan', label: '同伴数順' },
  { key: 'diff', label: '前月比' },
]

// ─── キャスト行データ型 ──────────────────────────────────────
type CastRow = {
  cast: CastProfile
  kpi: CastKPI
  prevSales: number
  targetSales: number
  achievementRate: number
}

// ─── ランクバッジスタイル ────────────────────────────────────
const rankStyle = (i: number): React.CSSProperties => ({
  width: 28, height: 28, borderRadius: '50%', display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, flexShrink: 0,
  background: i === 0 ? 'linear-gradient(135deg, #FAEEDA, #FAC775)'
    : i === 1 ? 'linear-gradient(135deg, #F1EFE8, #D3D1C7)'
    : i === 2 ? 'linear-gradient(135deg, #FAECE7, #F5C4B3)'
    : '#F5F0F2',
  color: i === 0 ? '#633806' : i === 1 ? '#444441' : i === 2 ? '#712B13' : C.pinkMuted,
})

// ─── 層ピルスタイル ─────────────────────────────────────────
const tierPill = (tier: CastTier | null): React.CSSProperties => {
  const m: Record<string, { bg: string; fg: string }> = {
    'A層': { bg: '#FBEAF0', fg: '#72243E' },
    'B層': { bg: '#E6F1FB', fg: '#0C447C' },
    '新人層': { bg: '#E1F5EE', fg: '#085041' },
    '無類': { bg: '#FAEEDA', fg: '#633806' },
    'C層': { bg: '#F1EFE8', fg: '#5F5E5A' },
  }
  const c = m[tier ?? ''] ?? { bg: '#F5F5F5', fg: '#999' }
  return {
    fontSize: 9, padding: '3px 10px', borderRadius: 20,
    background: c.bg, color: c.fg, whiteSpace: 'nowrap',
  }
}

// ─── ミニ指標セル ───────────────────────────────────────────
const MetricCell = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div style={{
    textAlign: 'center', padding: '7px 2px',
    background: '#F9F6F7', borderRadius: 8, minWidth: 0,
  }}>
    <div style={{ fontSize: 9, color: C.pinkMuted, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 500, color: color ?? C.dark, whiteSpace: 'nowrap' }}>{value}</div>
  </div>
)

interface CastRankingTabProps {
  isPC: boolean
  isAdmin: boolean
}

export default function CastRankingTab({ isPC, isAdmin }: CastRankingTabProps) {
  const router = useRouter()
  // overlay の詳細表示用にだけ getCastTarget / getShifts を使う。
  // ランキング本体は /api/cast-rankings （RLS バイパス）から取得する。
  const { getCastTarget, getShifts } = useCasts()

  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<CastRow[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('sales')

  // ─── オーバーレイ ─────────────────────────────────────────
  const [overlayRow, setOverlayRow] = useState<CastRow | null>(null)
  const [overlayCastTarget, setOverlayCastTarget] = useState<CastTarget | null>(null)
  const [overlayWorkDays, setOverlayWorkDays] = useState(0)

  // ─── データ取得 ────────────────────────────────────────────
  //   RLS では他キャストが見えないのでサーバー側集計の API を叩く。
  useEffect(() => {
    let cancelled = false
    const fetchRanking = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/cast-rankings?month=${month}`, {
          cache: 'no-store',
        })
        if (!res.ok) {
          console.error('cast-rankings fetch failed', await res.text())
          if (!cancelled) setRows([])
          return
        }
        const data: RankingRowApi[] = await res.json()
        if (!cancelled) setRows(data)
      } catch (e) {
        console.error('cast-rankings fetch error', e)
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchRanking()
    return () => { cancelled = true }
  }, [month])

  // ─── ソート ────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    const sorted = [...rows]
    switch (sortKey) {
      case 'sales': sorted.sort((a, b) => b.kpi.monthlySales - a.kpi.monthlySales); break
      case 'avgSpend': sorted.sort((a, b) => b.kpi.avgSpend - a.kpi.avgSpend); break
      case 'honshimei': sorted.sort((a, b) => b.kpi.honshimeiCount - a.kpi.honshimeiCount); break
      case 'conversion': sorted.sort((a, b) => b.kpi.conversionCount - a.kpi.conversionCount); break
      case 'douhan': sorted.sort((a, b) => b.kpi.douhanCount - a.kpi.douhanCount); break
      case 'diff': sorted.sort((a, b) => (b.kpi.monthlySales - b.prevSales) - (a.kpi.monthlySales - a.prevSales)); break
    }
    return sorted
  }, [rows, sortKey])

  // ─── 集計 ──────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalSales = rows.reduce((s, r) => s + r.kpi.monthlySales, 0)
    const totalTarget = rows.reduce((s, r) => s + r.targetSales, 0)
    const avgRate = totalTarget > 0 ? Math.round((totalSales / totalTarget) * 100) : 0
    const totalConv = rows.reduce((s, r) => s + r.kpi.conversionCount, 0)
    const activeCount = rows.filter(r => r.kpi.monthlySales > 0 || r.kpi.totalVisitCount > 0).length
    return { totalSales, avgRate, totalConv, activeCount }
  }, [rows])

  // ─── 月変更 ────────────────────────────────────────────────
  const changeMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return `${y}年${m}月`
  }, [month])

  // ─── ユーティリティ ────────────────────────────────────────
  const shortYen = (n: number) => {
    if (n >= 10000) return `¥${Math.round(n / 10000)}万`
    if (n >= 1000) return `¥${(n / 1000).toFixed(0)}K`
    return `¥${n}`
  }

  const formatYen = (n: number) => `¥${n.toLocaleString()}`

  const rateColor = (rate: number) => {
    if (rate >= 100) return '#0F6E56'
    if (rate >= 80) return '#BA7517'
    if (rate > 0) return '#A32D2D'
    return C.pinkMuted
  }

  const diffDisplay = (current: number, prev: number) => {
    const diff = current - prev
    if (prev === 0 && current === 0) return { text: '—', color: C.pinkMuted }
    if (prev === 0) return { text: '+' + formatYen(current), color: '#0F6E56' }
    const pct = Math.round(((current - prev) / prev) * 100)
    if (diff > 0) return { text: `+${pct}%`, color: '#0F6E56' }
    if (diff < 0) return { text: `${pct}%`, color: '#A32D2D' }
    return { text: '±0%', color: C.pinkMuted }
  }

  // ─── オーバーレイ表示 ─────────────────────────────────────
  //   キャストロールは RLS で他キャストの詳細データが取れないので、
  //   詳細オーバーレイは管理者のみで開く（ランキング自体は全員見られる）。
  const openOverlay = useCallback(async (row: CastRow) => {
    if (!isAdmin) return
    setOverlayRow(row)
    const [target, shifts] = await Promise.all([
      getCastTarget(row.cast.id, month),
      getShifts(row.cast.id, month),
    ])
    setOverlayCastTarget(target)
    setOverlayWorkDays(shifts.filter(s => s.status === '出勤' || s.status === '来客出勤').length)
  }, [getCastTarget, getShifts, month, isAdmin])

  // ─── CSVダウンロード（管理者のみ） ────────────────────────
  const downloadCSV = () => {
    const header = '順位,キャスト,層,売上,目標,達成率,本指名,場内(今月),転換,顧客数,同伴,アフター,客単価,来店組数,出勤日数,県外顧客,前月売上,前月比'
    const csvRows = sortedRows.map((r, i) => {
      const diff = r.prevSales > 0 ? Math.round(((r.kpi.monthlySales - r.prevSales) / r.prevSales) * 100) : 0
      return [
        i + 1, r.cast.cast_name, r.cast.cast_tier ?? '未分類',
        r.kpi.monthlySales, r.targetSales, `${r.achievementRate}%`,
        r.kpi.honshimeiCount, r.kpi.banaiMonthlyCount, r.kpi.conversionCount,
        r.kpi.customerCount, r.kpi.douhanCount, r.kpi.afterCount,
        r.kpi.avgSpend, r.kpi.visitGroups, r.kpi.totalVisitCount,
        r.kpi.kengaiCount, r.prevSales, `${diff}%`,
      ].join(',')
    })
    const csv = '﻿' + [header, ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cast_performance_${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* ─── ヘッダー ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '8px 16px', fontSize: 14, fontWeight: 500,
        }}>
          <span onClick={() => changeMonth(-1)} style={{ cursor: 'pointer', color: C.pinkMuted, fontSize: 18, userSelect: 'none' }}>‹</span>
          <span>{monthLabel}</span>
          <span onClick={() => changeMonth(1)} style={{ cursor: 'pointer', color: C.pinkMuted, fontSize: 18, userSelect: 'none' }}>›</span>
        </div>

        <span style={{ fontSize: 11, letterSpacing: '0.15em', color: C.pinkMuted }}>
          キャスト成績ランキング
        </span>

        {isAdmin && (
          <button onClick={downloadCSV} style={{
            marginLeft: 'auto', background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.dark, padding: '7px 16px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            CSVダウンロード
          </button>
        )}
      </div>

      {/* ─── サマリーカード ─── */}
      <div style={{
        display: 'grid', gridTemplateColumns: isPC ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
        gap: 10, marginBottom: 14,
      }}>
        {[
          { label: '店舗月間売上', value: formatYen(summary.totalSales), accent: true },
          { label: '平均達成率', value: summary.avgRate > 0 ? `${summary.avgRate}%` : '—', accent: false },
          { label: '総指名転換', value: `${summary.totalConv}件`, accent: false },
          { label: '稼働キャスト', value: `${summary.activeCount}名`, accent: false },
        ].map((item, i) => (
          <div key={i} style={{
            background: '#F9F6F7', borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, color: C.pinkMuted, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: item.accent ? C.pink : C.dark }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* ─── ソートタブ ─── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortKey(opt.key)}
            style={{
              padding: '6px 14px', fontSize: 11, borderRadius: 20,
              background: sortKey === opt.key ? '#FBEAF0' : '#FFF',
              color: sortKey === opt.key ? '#72243E' : C.pinkMuted,
              border: `1px solid ${sortKey === opt.key ? '#ED93B1' : C.border}`,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ─── メインコンテンツ ─── */}
      <div>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <div style={{ width: 32, height: 32, border: `2px solid ${C.pink}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : isPC ? (
          /* ═══ PC: 横長カード表示 ═══ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedRows.map((r, i) => {
              const rc = rateColor(r.achievementRate)
              const dd = diffDisplay(r.kpi.monthlySales, r.prevSales)
              const isInactive = r.kpi.monthlySales === 0 && r.kpi.totalVisitCount === 0

              return (
                <div
                  key={r.cast.id}
                  onClick={() => openOverlay(r)}
                  style={{
                    background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12,
                    padding: '14px 20px',
                    cursor: isAdmin ? 'pointer' : 'default',
                    opacity: isInactive ? 0.4 : 1,
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => { if (isAdmin) e.currentTarget.style.borderColor = '#ED93B1' }}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  {/* 上段: 名前 + 売上 + 達成率バー */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <span style={rankStyle(i)}>{i + 1}</span>
                    <span style={{ fontSize: 15, fontWeight: 500, color: C.dark, minWidth: 60 }}>{r.cast.cast_name}</span>
                    <span style={tierPill(r.cast.cast_tier)}>{r.cast.cast_tier ?? '—'}</span>

                    <div style={{ width: 1, height: 28, background: C.border, flexShrink: 0, margin: '0 4px' }} />

                    <span style={{ fontSize: 18, fontWeight: 500, color: C.pink }}>{formatYen(r.kpi.monthlySales)}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: dd.color }}>{dd.text}</span>

                    {r.targetSales > 0 && (
                      <>
                        <div style={{ width: 1, height: 28, background: C.border, flexShrink: 0, margin: '0 4px' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
                          <div style={{ width: 100, height: 7, background: '#F0EBE8', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(r.achievementRate, 100)}%`, background: rc, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 500, color: rc }}>{r.achievementRate}%</span>
                          <span style={{ fontSize: 10, color: C.pinkMuted, whiteSpace: 'nowrap' }}>/ {formatYen(r.targetSales)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 下段: 指標横並び */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 5 }}>
                    <MetricCell label="本指名" value={`${r.kpi.honshimeiCount}`} />
                    <MetricCell label="場内" value={`${r.kpi.banaiMonthlyCount}`} />
                    <MetricCell label="転換" value={`${r.kpi.conversionCount}`} color={r.kpi.conversionCount > 0 ? '#0F6E56' : undefined} />
                    <MetricCell label="顧客数" value={`${r.kpi.customerCount}`} />
                    <MetricCell label="同伴" value={`${r.kpi.douhanCount}`} />
                    <MetricCell label="アフター" value={`${r.kpi.afterCount}`} />
                    <MetricCell label="客単価" value={shortYen(r.kpi.avgSpend)} />
                    <MetricCell label="来店組" value={`${r.kpi.visitGroups}`} />
                    <MetricCell label="出勤日" value={`${r.kpi.totalVisitCount}`} />
                    <MetricCell label="県外顧客" value={`${r.kpi.kengaiCount}`} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ═══ モバイル: カード表示 ═══ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedRows.map((r, i) => {
              const rc = rateColor(r.achievementRate)
              const dd = diffDisplay(r.kpi.monthlySales, r.prevSales)
              const isInactive = r.kpi.monthlySales === 0 && r.kpi.totalVisitCount === 0

              return (
                <div
                  key={r.cast.id}
                  onClick={() => openOverlay(r)}
                  style={{
                    background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 12,
                    padding: '14px 16px',
                    cursor: isAdmin ? 'pointer' : 'default',
                    opacity: isInactive ? 0.4 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={rankStyle(i)}>{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.dark }}>{r.cast.cast_name}</span>
                    <span style={tierPill(r.cast.cast_tier)}>{r.cast.cast_tier ?? '—'}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: dd.color, marginLeft: 'auto' }}>{dd.text}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 18, fontWeight: 500, color: C.pink, whiteSpace: 'nowrap' }}>
                      {formatYen(r.kpi.monthlySales)}
                    </span>
                  </div>

                  {r.targetSales > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 80px', minWidth: 80, height: 7, background: '#F0EBE8', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(r.achievementRate, 100)}%`, background: rc, borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: rc }}>{r.achievementRate}%</span>
                      <span style={{ fontSize: 10, color: C.pinkMuted, whiteSpace: 'nowrap' }}>/ {formatYen(r.targetSales)}</span>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
                    <MetricCell label="本指名" value={`${r.kpi.honshimeiCount}`} />
                    <MetricCell label="場内" value={`${r.kpi.banaiMonthlyCount}`} />
                    <MetricCell label="転換" value={`${r.kpi.conversionCount}`} color={r.kpi.conversionCount > 0 ? '#0F6E56' : undefined} />
                    <MetricCell label="同伴" value={`${r.kpi.douhanCount}`} />
                    <MetricCell label="顧客数" value={`${r.kpi.customerCount}`} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ═══ オーバーレイモーダル ═══ */}
      {overlayRow && (
        <div
          onClick={() => { setOverlayRow(null); setOverlayCastTarget(null); setOverlayWorkDays(0) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(61, 45, 56, 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: isPC ? 40 : 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.bg, borderRadius: 16, width: '100%',
              maxWidth: isPC ? 800 : 480,
              maxHeight: 'calc(100vh - 80px)',
              overflow: 'auto',
              position: 'relative',
            }}
          >
            <button
              onClick={() => { setOverlayRow(null); setOverlayCastTarget(null); setOverlayWorkDays(0) }}
              style={{
                position: 'sticky', top: 12, float: 'right', marginRight: 12,
                width: 32, height: 32, borderRadius: '50%', border: `1px solid ${C.border}`,
                background: '#FFF', color: C.dark, fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit', zIndex: 10,
              }}
            >
              ✕
            </button>

            <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 500 }}>{overlayRow.cast.cast_name}</span>
              <span style={tierPill(overlayRow.cast.cast_tier)}>{overlayRow.cast.cast_tier ?? '—'}</span>
              <button
                onClick={() => router.push(`/casts/${overlayRow.cast.id}`)}
                style={{
                  marginLeft: 'auto', background: 'transparent', border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '6px 14px', fontSize: 11, color: C.pink,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                詳細ページへ →
              </button>
            </div>

            <div style={{ padding: '12px 8px 20px' }}>
              <CastKPITab
                castId={overlayRow.cast.id}
                castName={overlayRow.cast.cast_name}
                month={month}
                kpi={overlayRow.kpi}
                castTarget={overlayCastTarget}
                workDays={overlayWorkDays}
                isPC={isPC}
              />
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
