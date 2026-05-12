'use client'
// ─────────────────────────────────────────────────────────────────
//  📊 顧客分布タブ
//   ランク × 地域マトリクス + 指名状況/地域/ランクの構成比チャート
// ─────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { C } from '@/lib/colors'
import type { TabProps } from './types'

const RANKS = ['S', 'A', 'B', 'C', '—'] as const
const REGIONS = ['福岡県', '県外', 'その他'] as const

export default function DistributionTab({ rows, isPC }: TabProps) {
  const stats = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {}
    for (const r of RANKS) {
      matrix[r] = {}
      for (const reg of REGIONS) matrix[r][reg] = 0
    }
    const nom: Record<string, number> = {}
    const region: Record<string, number> = {}
    const rank: Record<string, number> = {}
    for (const r of rows) {
      const rk = (RANKS as readonly string[]).includes(r.customer.customer_rank ?? '—')
        ? (r.customer.customer_rank ?? '—') : '—'
      const reg = r.customer.region === '福岡県' ? '福岡県'
        : r.customer.region ? '県外' : 'その他'
      matrix[rk][reg]++
      const ns = r.customer.nomination_status || 'フリー'
      nom[ns] = (nom[ns] ?? 0) + 1
      region[reg] = (region[reg] ?? 0) + 1
      rank[rk] = (rank[rk] ?? 0) + 1
    }
    return { matrix, nom, region, rank, total: rows.length }
  }, [rows])

  if (stats.total === 0) {
    return (
      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 32, textAlign: 'center', color: C.pinkMuted, fontSize: 12,
      }}>顧客データがありません</div>
    )
  }

  // セル背景濃度 (人数 / max 比)
  let matrixMax = 0
  for (const r of RANKS) for (const reg of REGIONS) {
    if (stats.matrix[r][reg] > matrixMax) matrixMax = stats.matrix[r][reg]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* マトリクス */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.dark, marginBottom: 10 }}>
          ランク × 地域 マトリクス（{stats.total}人）
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: 6, textAlign: 'left', fontSize: 10, color: C.pinkMuted }}></th>
              {REGIONS.map(reg => (
                <th key={reg} style={{ padding: 6, fontSize: 10, color: C.pinkMuted, textAlign: 'center' }}>{reg}</th>
              ))}
              <th style={{ padding: 6, fontSize: 10, color: C.pinkMuted, textAlign: 'center' }}>合計</th>
            </tr>
          </thead>
          <tbody>
            {RANKS.map(r => {
              const total = REGIONS.reduce((s, reg) => s + stats.matrix[r][reg], 0)
              return (
                <tr key={r}>
                  <td style={{
                    padding: 8, fontWeight: 600, fontSize: 11,
                    color: '#FFF', background: rankColor(r),
                    textAlign: 'center', minWidth: 36,
                  }}>{r}</td>
                  {REGIONS.map(reg => {
                    const v = stats.matrix[r][reg]
                    const intensity = matrixMax > 0 ? v / matrixMax : 0
                    const bg = `rgba(232, 120, 154, ${0.05 + intensity * 0.35})`
                    return (
                      <td key={reg} style={{
                        padding: 10, textAlign: 'center',
                        background: bg, border: `1px solid ${C.border}`,
                        fontSize: 13, fontWeight: v > 0 ? 600 : 400,
                        color: v > 0 ? C.dark : C.pinkMuted,
                      }}>
                        {v}
                        {v > 0 && <span style={{ fontSize: 9, color: C.pinkMuted, marginLeft: 4 }}>
                          ({Math.round(v / stats.total * 100)}%)
                        </span>}
                      </td>
                    )
                  })}
                  <td style={{
                    padding: 8, textAlign: 'center', fontWeight: 600,
                    fontSize: 12, color: C.dark, background: '#F9F6F7',
                  }}>{total}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 3 つの構成比チャート */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isPC ? 'repeat(3, 1fr)' : '1fr',
        gap: 10,
      }}>
        <StackBar title="指名状況" data={stats.nom} total={stats.total} colors={{
          '本指名': '#C84F7B', '場内': '#E8879A', 'フリー': '#B0B0B0', 'その他': '#DDD',
        }} />
        <StackBar title="地域" data={stats.region} total={stats.total} colors={{
          '福岡県': '#5B8DBE', '県外': '#D4A017', 'その他': '#999',
        }} />
        <BarChart title="ランク別人数" data={stats.rank} order={['S', 'A', 'B', 'C', '—']} colors={{
          'S': '#D4A017', 'A': '#5B8DBE', 'B': '#0F6E56', 'C': '#999', '—': '#CCC',
        }} />
      </div>
    </div>
  )
}

function rankColor(r: string): string {
  switch (r) {
    case 'S': return '#D4A017'
    case 'A': return '#5B8DBE'
    case 'B': return '#0F6E56'
    case 'C': return '#999'
    default: return '#BBB'
  }
}

function StackBar({ title, data, total, colors }: {
  title: string
  data: Record<string, number>
  total: number
  colors: Record<string, string>
}) {
  const keys = Object.keys(data).filter(k => data[k] > 0)
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 8 }}>{title}</div>
      <div style={{
        display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden',
        marginBottom: 8, border: `1px solid ${C.border}`,
      }}>
        {keys.map(k => {
          const w = (data[k] / total) * 100
          return <div key={k} title={`${k} ${data[k]}人 (${w.toFixed(1)}%)`}
            style={{ width: `${w}%`, background: colors[k] ?? '#CCC' }} />
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10 }}>
        {keys.map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, background: colors[k] ?? '#CCC', borderRadius: 2 }} />
            <span style={{ color: C.dark, flex: 1 }}>{k}</span>
            <span style={{ color: C.pinkMuted }}>{data[k]}人</span>
            <span style={{ color: C.pinkMuted, minWidth: 38, textAlign: 'right' }}>
              {((data[k] / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarChart({ title, data, order, colors }: {
  title: string
  data: Record<string, number>
  order: readonly string[]
  colors: Record<string, string>
}) {
  const max = Math.max(...order.map(o => data[o] ?? 0), 1)
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
        {order.map(k => {
          const v = data[k] ?? 0
          const h = max > 0 ? (v / max) * 90 : 0
          return (
            <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10, color: C.dark, fontWeight: 600 }}>{v}</span>
              <div style={{
                width: '100%', height: `${h}px`, minHeight: v > 0 ? 4 : 0,
                background: colors[k] ?? '#CCC', borderRadius: '4px 4px 0 0',
              }} />
              <span style={{ fontSize: 10, color: C.pinkMuted }}>{k}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
