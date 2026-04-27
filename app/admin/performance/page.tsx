'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCasts } from '@/hooks/useCasts'
import { useViewMode } from '@/hooks/useViewMode'
import { C } from '@/lib/colors'
import { CastKPI, CastProfile, CAST_TIERS, CastTier } from '@/types'

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

export default function PerformancePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { casts, isLoaded: castsLoaded, getCastKPI, getMultiMonthKPI, getCastTarget } = useCasts()
  const { isPC } = useViewMode()

  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<CastRow[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('sales')

  // ─── 権限チェック ──────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) { setAuthorized(false); return }
        const data = await res.json()
        if (data.role === 'cast') { setAuthorized(false); return }
        setAuthorized(data.is_owner === true || data.permissions?.['レポート閲覧'] === true)
      } catch { setAuthorized(false) }
    }
    check()
  }, [])

  // ─── 前月計算 ──────────────────────────────────────────────
  const prevMonth = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [month])

  // ─── データ取得 ────────────────────────────────────────────
  useEffect(() => {
    if (!castsLoaded || casts.length === 0 || !authorized) return

    const fetchAll = async () => {
      setLoading(true)
      const activeCasts = casts.filter(c => c.is_active)

      const results: CastRow[] = await Promise.all(
        activeCasts.map(async (cast) => {
          const [kpi, prevKpi, target] = await Promise.all([
            getCastKPI(cast.cast_name, month, cast.id),
            getCastKPI(cast.cast_name, prevMonth, cast.id),
            getCastTarget(cast.id, month),
          ])

          const targetSales = target?.target_sales ?? 0
          const achievementRate = targetSales > 0 ? Math.round((kpi.monthlySales / targetSales) * 100) : 0

          return {
            cast,
            kpi,
            prevSales: prevKpi.monthlySales,
            targetSales,
            achievementRate,
          }
        })
      )

      setRows(results)
      setLoading(false)
    }
    fetchAll()
  }, [month, castsLoaded, casts, authorized, getCastKPI, getCastTarget, prevMonth])

  // ─── ソート ────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    const sorted = [...rows]
    switch (sortKey) {
      case 'sales':
        sorted.sort((a, b) => b.kpi.monthlySales - a.kpi.monthlySales)
        break
      case 'avgSpend':
        sorted.sort((a, b) => b.kpi.avgSpend - a.kpi.avgSpend)
        break
      case 'honshimei':
        sorted.sort((a, b) => b.kpi.honshimeiCount - a.kpi.honshimeiCount)
        break
      case 'conversion':
        sorted.sort((a, b) => b.kpi.conversionCount - a.kpi.conversionCount)
        break
      case 'douhan':
        sorted.sort((a, b) => b.kpi.douhanCount - a.kpi.douhanCount)
        break
      case 'diff':
        sorted.sort((a, b) => (b.kpi.monthlySales - b.prevSales) - (a.kpi.monthlySales - a.prevSales))
        break
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

  const formatYen = (n: number) =>
    `¥${n.toLocaleString()}`

  const rateColor = (rate: number) => {
    if (rate >= 100) return '#0F6E56'
    if (rate >= 80) return '#BA7517'
    if (rate > 0) return '#A32D2D'
    return C.pinkMuted
  }

  const diffDisplay = (current: number, prev: number) => {
    const diff = current - prev
    if (prev === 0 && current === 0) return { text: '—', color: C.pinkMuted }
    if (prev === 0) return { text: '+' + shortYen(current), color: '#0F6E56' }
    const pct = Math.round(((current - prev) / prev) * 100)
    if (diff > 0) return { text: `+${pct}%`, color: '#0F6E56' }
    if (diff < 0) return { text: `${pct}%`, color: '#A32D2D' }
    return { text: '±0%', color: C.pinkMuted }
  }

  const tierColor = (tier: CastTier | null): { bg: string; fg: string } => {
    switch (tier) {
      case 'A層': return { bg: '#FBEAF0', fg: '#72243E' }
      case 'B層': return { bg: '#E6F1FB', fg: '#0C447C' }
      case '新人層': return { bg: '#E1F5EE', fg: '#085041' }
      case '無類': return { bg: '#FAEEDA', fg: '#633806' }
      case 'C層': return { bg: '#F1EFE8', fg: '#5F5E5A' }
      default: return { bg: '#F5F5F5', fg: '#999' }
    }
  }

  // ─── CSVダウンロード ───────────────────────────────────────
  const downloadCSV = () => {
    const header = '順位,キャスト,層,売上,目標,達成率,本指名,場内,転換,客単価,同伴,アフター,出勤日数,前月売上,前月比'
    const csvRows = sortedRows.map((r, i) => {
      const diff = r.prevSales > 0 ? Math.round(((r.kpi.monthlySales - r.prevSales) / r.prevSales) * 100) : 0
      return [
        i + 1,
        r.cast.cast_name,
        r.cast.cast_tier ?? '未分類',
        r.kpi.monthlySales,
        r.targetSales,
        `${r.achievementRate}%`,
        r.kpi.honshimeiCount,
        r.kpi.banaCount,
        r.kpi.conversionCount,
        r.kpi.avgSpend,
        r.kpi.douhanCount,
        r.kpi.afterCount,
        r.kpi.totalVisitCount,
        r.prevSales,
        `${diff}%`,
      ].join(',')
    })
    const csv = '\uFEFF' + [header, ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv; charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cast_performance_${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── 権限チェックUI ────────────────────────────────────────
  if (authorized === null) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: `2px solid ${C.pink}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 14, color: C.dark }}>この機能へのアクセス権限がありません</p>
        <button onClick={() => router.push('/admin/casts')} style={{ background: C.pink, color: '#FFF', border: 'none', padding: '10px 24px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          管理ページに戻る
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {/* ─── ヘッダー ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
        borderBottom: `1px solid ${C.border}`, background: C.headerBg, flexWrap: 'wrap',
      }}>
        <button onClick={() => router.push('/admin/casts')} style={{
          background: 'transparent', border: 'none', color: C.pink,
          fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
        }}>
          ← 管理ページ
        </button>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#FFF', border: `1px solid ${C.border}`, padding: '8px 14px', fontSize: 14, fontWeight: 500,
        }}>
          <span onClick={() => changeMonth(-1)} style={{ cursor: 'pointer', color: C.pinkMuted, fontSize: 16, userSelect: 'none' }}>‹</span>
          <span>{monthLabel}</span>
          <span onClick={() => changeMonth(1)} style={{ cursor: 'pointer', color: C.pinkMuted, fontSize: 16, userSelect: 'none' }}>›</span>
        </div>

        <span style={{ fontSize: 11, letterSpacing: '0.15em', color: C.pinkMuted }}>
          キャスト成績一覧
        </span>

        <button onClick={downloadCSV} style={{
          marginLeft: 'auto', background: '#FFF', border: `1px solid ${C.border}`,
          color: C.dark, padding: '6px 14px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          CSVダウンロード
        </button>
      </div>

      {/* ─── サマリーカード ─── */}
      <div style={{
        display: 'grid', gridTemplateColumns: isPC ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
        gap: 8, padding: '12px 20px',
      }}>
        {[
          { label: '店舗月間売上', value: formatYen(summary.totalSales) },
          { label: '平均達成率', value: summary.avgRate > 0 ? `${summary.avgRate}%` : '—' },
          { label: '総指名転換', value: `${summary.totalConv}件` },
          { label: '稼働キャスト', value: `${summary.activeCount}名` },
        ].map((item, i) => (
          <div key={i} style={{
            background: '#FFF', border: `1px solid ${C.border}`,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 9, color: C.pinkMuted, letterSpacing: '0.1em' }}>{item.label}</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: C.dark, marginTop: 4 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* ─── ソートタブ ─── */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 20px 12px', flexWrap: 'wrap' }}>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortKey(opt.key)}
            style={{
              padding: '5px 12px', fontSize: 11,
              background: sortKey === opt.key ? '#FBEAF0' : '#FFF',
              color: sortKey === opt.key ? '#72243E' : C.pinkMuted,
              border: `1px solid ${sortKey === opt.key ? '#ED93B1' : C.border}`,
              borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ─── メインコンテンツ ─── */}
      <div style={{ padding: '0 20px 20px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <div style={{ width: 32, height: 32, border: `2px solid ${C.pink}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : isPC ? (
          /* ─── PC: テーブル表示 ─── */
          <div style={{ background: '#FFF', border: `1px solid ${C.border}`, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.headerBg }}>
                  <th style={thS}>#</th>
                  <th style={{ ...thS, textAlign: 'left' }}>キャスト</th>
                  <th style={thS}>層</th>
                  <th style={{ ...thS, textAlign: 'right' }}>売上</th>
                  <th style={{ ...thS, textAlign: 'right' }}>目標</th>
                  <th style={{ ...thS, width: 100 }}>達成率</th>
                  <th style={{ ...thS, textAlign: 'right' }}>本指名</th>
                  <th style={{ ...thS, textAlign: 'right' }}>場内</th>
                  <th style={{ ...thS, textAlign: 'right' }}>転換</th>
                  <th style={{ ...thS, textAlign: 'right' }}>客単価</th>
                  <th style={{ ...thS, textAlign: 'right' }}>同伴</th>
                  <th style={{ ...thS, textAlign: 'right' }}>アフター</th>
                  <th style={{ ...thS, textAlign: 'right' }}>出勤</th>
                  <th style={{ ...thS, textAlign: 'right' }}>前月比</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => {
                  const tc = tierColor(r.cast.cast_tier)
                  const rc = rateColor(r.achievementRate)
                  const dd = diffDisplay(r.kpi.monthlySales, r.prevSales)
                  return (
                    <tr
                      key={r.cast.id}
                      onClick={() => router.push(`/casts/${r.cast.id}`)}
                      style={{
                        borderBottom: `1px solid ${C.border}`,
                        cursor: 'pointer',
                        opacity: r.kpi.monthlySales === 0 && r.kpi.totalVisitCount === 0 ? 0.45 : 1,
                      }}
                    >
                      <td style={{ ...tdS, textAlign: 'center' }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: '50%', display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500,
                          background: i === 0 ? '#FAEEDA' : i === 1 ? '#F1EFE8' : i === 2 ? '#FAECE7' : C.headerBg,
                          color: i === 0 ? '#854F0B' : i === 1 ? '#5F5E5A' : i === 2 ? '#993C1D' : C.pinkMuted,
                        }}>
                          {i + 1}
                        </span>
                      </td>
                      <td style={{ ...tdS, fontWeight: 500 }}>{r.cast.cast_name}</td>
                      <td style={{ ...tdS, textAlign: 'center' }}>
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 3,
                          background: tc.bg, color: tc.fg,
                        }}>
                          {r.cast.cast_tier ?? '—'}
                        </span>
                      </td>
                      <td style={{ ...tdS, textAlign: 'right', fontWeight: 500 }}>{formatYen(r.kpi.monthlySales)}</td>
                      <td style={{ ...tdS, textAlign: 'right', color: C.pinkMuted }}>{r.targetSales > 0 ? formatYen(r.targetSales) : '—'}</td>
                      <td style={tdS}>
                        {r.targetSales > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(r.achievementRate, 100)}%`, background: rc, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 500, color: rc, minWidth: 32, textAlign: 'right' }}>
                              {r.achievementRate}%
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: C.pinkMuted, fontSize: 10 }}>—</span>
                        )}
                      </td>
                      <td style={{ ...tdS, textAlign: 'right' }}>{r.kpi.honshimeiCount}</td>
                      <td style={{ ...tdS, textAlign: 'right' }}>{r.kpi.banaCount}</td>
                      <td style={{ ...tdS, textAlign: 'right', color: r.kpi.conversionCount > 0 ? '#0F6E56' : C.pinkMuted, fontWeight: r.kpi.conversionCount > 0 ? 500 : 400 }}>
                        {r.kpi.conversionCount}
                      </td>
                      <td style={{ ...tdS, textAlign: 'right' }}>{formatYen(r.kpi.avgSpend)}</td>
                      <td style={{ ...tdS, textAlign: 'right' }}>{r.kpi.douhanCount}</td>
                      <td style={{ ...tdS, textAlign: 'right' }}>{r.kpi.afterCount}</td>
                      <td style={{ ...tdS, textAlign: 'right' }}>{r.kpi.totalVisitCount}</td>
                      <td style={{ ...tdS, textAlign: 'right', color: dd.color, fontWeight: 500, fontSize: 11 }}>
                        {dd.text}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ─── モバイル: カード表示 ─── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedRows.map((r, i) => {
              const tc = tierColor(r.cast.cast_tier)
              const rc = rateColor(r.achievementRate)
              const dd = diffDisplay(r.kpi.monthlySales, r.prevSales)
              const isInactive = r.kpi.monthlySales === 0 && r.kpi.totalVisitCount === 0

              return (
                <div
                  key={r.cast.id}
                  onClick={() => router.push(`/casts/${r.cast.id}`)}
                  style={{
                    background: '#FFF', border: `1px solid ${C.border}`,
                    padding: '12px 14px', cursor: 'pointer',
                    opacity: isInactive ? 0.45 : 1,
                  }}
                >
                  {/* 上段: 順位 + 名前 + 層 + 売上 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: '50%', display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, flexShrink: 0,
                      background: i === 0 ? '#FAEEDA' : i === 1 ? '#F1EFE8' : i === 2 ? '#FAECE7' : C.headerBg,
                      color: i === 0 ? '#854F0B' : i === 1 ? '#5F5E5A' : i === 2 ? '#993C1D' : C.pinkMuted,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.dark }}>{r.cast.cast_name}</span>
                    <span style={{
                      fontSize: 9, padding: '2px 7px', borderRadius: 3,
                      background: tc.bg, color: tc.fg,
                    }}>
                      {r.cast.cast_tier ?? '—'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 500, color: C.pink }}>
                      {shortYen(r.kpi.monthlySales)}
                    </span>
                  </div>

                  {/* 達成率バー */}
                  {r.targetSales > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(r.achievementRate, 100)}%`, background: rc, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 500, color: rc }}>
                        {r.achievementRate}%
                      </span>
                      <span style={{ fontSize: 10, color: C.pinkMuted }}>
                        / {shortYen(r.targetSales)}
                      </span>
                    </div>
                  )}

                  {/* 下段: ミニ指標 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                    {[
                      { label: '本指名', value: `${r.kpi.honshimeiCount}`, accent: false },
                      { label: '場内', value: `${r.kpi.banaCount}`, accent: false },
                      { label: '転換', value: `${r.kpi.conversionCount}`, accent: r.kpi.conversionCount > 0 },
                      { label: '同伴', value: `${r.kpi.douhanCount}`, accent: false },
                      { label: '前月比', value: dd.text, accent: false, color: dd.color },
                    ].map((item, j) => (
                      <div key={j} style={{
                        textAlign: 'center', padding: '4px 0',
                        background: C.headerBg, borderRadius: 3,
                      }}>
                        <div style={{ fontSize: 8, color: C.pinkMuted }}>{item.label}</div>
                        <div style={{
                          fontSize: 13, fontWeight: 500, marginTop: 1,
                          color: item.color ?? (item.accent ? '#0F6E56' : C.dark),
                        }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── テーブルスタイル ────────────────────────────────────────
const thS: React.CSSProperties = {
  padding: '8px 6px', fontSize: 10, fontWeight: 400,
  color: '#999', borderBottom: '1px solid #E8E0E4',
  textAlign: 'center', whiteSpace: 'nowrap',
}
const tdS: React.CSSProperties = {
  padding: '8px 6px', fontSize: 12, whiteSpace: 'nowrap',
}
