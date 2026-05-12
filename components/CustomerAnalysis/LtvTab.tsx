'use client'
// ─────────────────────────────────────────────────────────────────
//  💰 LTV 分布タブ
//   顧客ごとの累計売上 (LTV) ヒストグラム + Top 20 ランキング + サマリー
// ─────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { C } from '@/lib/colors'
import type { TabProps } from './types'

const BINS: { label: string; min: number; max: number }[] = [
  { label: '〜10万',     min: 0,        max: 100000 },
  { label: '10〜30万',   min: 100000,   max: 300000 },
  { label: '30〜50万',   min: 300000,   max: 500000 },
  { label: '50〜100万',  min: 500000,   max: 1000000 },
  { label: '100〜300万', min: 1000000,  max: 3000000 },
  { label: '300万〜',    min: 3000000,  max: Infinity },
]

export default function LtvTab({ rows, isPC, onCustomerClick }: TabProps) {
  const [includeZero, setIncludeZero] = useState<boolean>(false)

  const stats = useMemo(() => {
    const ltvs = rows
      .map(r => r.prediction.ltv)
      .filter(v => includeZero ? true : v > 0)
    const sortedLtvs = [...ltvs].sort((a, b) => a - b)
    const total = ltvs.reduce((s, v) => s + v, 0)
    const avg = ltvs.length > 0 ? total / ltvs.length : 0
    const median = sortedLtvs.length === 0 ? 0
      : sortedLtvs.length % 2 === 1
        ? sortedLtvs[Math.floor(sortedLtvs.length / 2)]
        : (sortedLtvs[sortedLtvs.length / 2 - 1] + sortedLtvs[sortedLtvs.length / 2]) / 2
    const max = sortedLtvs[sortedLtvs.length - 1] ?? 0
    const min = sortedLtvs[0] ?? 0

    const histogram: number[] = BINS.map(() => 0)
    for (const v of ltvs) {
      for (let i = 0; i < BINS.length; i++) {
        if (v >= BINS[i].min && v < BINS[i].max) {
          histogram[i]++
          break
        }
      }
    }

    const top20 = [...rows]
      .filter(r => includeZero ? true : r.prediction.ltv > 0)
      .sort((a, b) => b.prediction.ltv - a.prediction.ltv)
      .slice(0, 20)

    return { count: ltvs.length, total, avg, median, max, min, histogram, top20 }
  }, [rows, includeZero])

  const formatYen = (n: number) => `¥${Math.round(n).toLocaleString()}`
  const formatYenShort = (n: number) => {
    if (n >= 1000000) return `¥${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `¥${Math.round(n / 1000)}K`
    return `¥${Math.round(n)}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* サマリーカード 4 つ */}
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: isPC ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
      }}>
        <SumCard label="平均 LTV" value={formatYen(stats.avg)} accent />
        <SumCard label="中央値 LTV" value={formatYen(stats.median)} />
        <SumCard label="最大 LTV" value={formatYen(stats.max)} />
        <SumCard label="最小 LTV" value={formatYen(stats.min)} />
      </div>

      {/* オプション + 全体集計 */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: C.dark }}>
          対象 <strong>{stats.count}</strong> 名 / 総売上 <strong>{formatYen(stats.total)}</strong>
        </span>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={includeZero}
            onChange={e => setIncludeZero(e.target.checked)}
            style={{ accentColor: C.pink }}
          />
          <span style={{ fontSize: 10, color: C.pinkMuted }}>LTV=0 の顧客を含める</span>
        </label>
      </div>

      {/* ヒストグラム */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.dark, marginBottom: 12 }}>
          LTV 分布ヒストグラム
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, marginBottom: 6 }}>
          {stats.histogram.map((v, i) => {
            const max = Math.max(...stats.histogram, 1)
            const h = (v / max) * 130
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: C.dark, minHeight: 12 }}>
                  {v > 0 ? v : ''}
                </span>
                <div style={{
                  width: '100%', height: `${h}px`, minHeight: v > 0 ? 4 : 0,
                  background: `linear-gradient(180deg, ${C.pink}, #C84F7B)`,
                  borderRadius: '4px 4px 0 0',
                }} />
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, fontSize: 9, color: C.pinkMuted, textAlign: 'center' }}>
          {BINS.map((b, i) => (
            <div key={i} style={{ flex: 1 }}>{b.label}</div>
          ))}
        </div>
      </div>

      {/* Top 20 */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.dark, marginBottom: 10 }}>
          🏆 LTV ランキング Top 20
        </div>
        {stats.top20.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: C.pinkMuted, fontSize: 11 }}>
            対象顧客がいません
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ padding: 6, textAlign: 'left', fontSize: 10, color: C.pinkMuted, width: 30 }}>順位</th>
                <th style={{ padding: 6, textAlign: 'left', fontSize: 10, color: C.pinkMuted }}>顧客名</th>
                <th style={{ padding: 6, textAlign: 'left', fontSize: 10, color: C.pinkMuted }}>担当</th>
                <th style={{ padding: 6, textAlign: 'center', fontSize: 10, color: C.pinkMuted, width: 40 }}>ランク</th>
                <th style={{ padding: 6, textAlign: 'right', fontSize: 10, color: C.pinkMuted, width: 100 }}>LTV</th>
                <th style={{ padding: 6, textAlign: 'right', fontSize: 10, color: C.pinkMuted, width: 60 }}>来店</th>
              </tr>
            </thead>
            <tbody>
              {stats.top20.map((r, i) => {
                const medalBg = i === 0 ? 'linear-gradient(135deg, #D4A017, #F5C842)'
                  : i === 1 ? 'linear-gradient(135deg, #B8B8B8, #DCDCDC)'
                  : i === 2 ? 'linear-gradient(135deg, #C28C5C, #DBA877)'
                  : 'transparent'
                return (
                  <tr
                    key={r.customer.id}
                    onClick={() => onCustomerClick(r.customer.id)}
                    style={{ cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}
                  >
                    <td style={{ padding: 6 }}>
                      <span style={{
                        display: 'inline-block', width: 22, height: 22, lineHeight: '22px',
                        textAlign: 'center', borderRadius: '50%', fontSize: 10, fontWeight: 700,
                        background: medalBg, color: i < 3 ? '#FFF' : C.dark,
                      }}>{i + 1}</span>
                    </td>
                    <td style={{ padding: 6, fontWeight: 500, color: C.dark }}>
                      {r.customer.customer_name}
                    </td>
                    <td style={{ padding: 6, color: C.pinkMuted }}>
                      {r.cast?.display_name || r.cast?.cast_name || '—'}
                    </td>
                    <td style={{ padding: 6, textAlign: 'center' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
                        background: rankColor(r.customer.customer_rank), color: '#FFF',
                      }}>{r.customer.customer_rank || '—'}</span>
                    </td>
                    <td style={{ padding: 6, textAlign: 'right', fontWeight: 600, color: C.pink }}>
                      {formatYenShort(r.prediction.ltv)}
                    </td>
                    <td style={{ padding: 6, textAlign: 'right', color: C.pinkMuted }}>
                      {r.prediction.paidVisitCount}回
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function SumCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '12px 14px', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: accent ? C.pink : C.pinkMuted,
      }} />
      <div style={{ fontSize: 9, letterSpacing: '0.15em', color: C.pinkMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: accent ? C.pink : C.dark }}>{value}</div>
    </div>
  )
}

function rankColor(r: string | null): string {
  switch (r) {
    case 'S': return '#D4A017'
    case 'A': return '#5B8DBE'
    case 'B': return '#0F6E56'
    case 'C': return '#999'
    default: return '#CCC'
  }
}
