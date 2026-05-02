'use client'

// 時間帯×曜日 ヒートマップ
//   customer_visits の visit_date / visit_time / amount_spent を集計して
//   「どの曜日のどの時間帯がどのくらい売れているか」を可視化する。
//
//   - 行: 曜日（月〜日）
//   - 列: 時間帯（19:00〜25:00 のような区切り、デフォルト 1時間刻み）
//   - 色の濃さ: 売上 or 来店組数（モード切替）
//   - 各セルにツールチップで詳細
//
// データは props で渡してもらう（呼び出し側で月単位など好きに集計）。

import { useMemo, useState } from 'react'
import { C } from '@/lib/colors'

export type HeatmapVisit = {
  visit_date: string         // 'YYYY-MM-DD'
  visit_time: string | null  // 'HH:MM' or null
  amount_spent: number
}

type Props = {
  visits: HeatmapVisit[]
  /** 表示する時間帯の開始時刻（時） */
  startHour?: number
  /** 表示する時間帯の終了時刻（時、含まない） */
  endHour?: number
  title?: string
}

const DOWS = ['月', '火', '水', '木', '金', '土', '日'] // 月始まり

export default function TimeHeatmapCard({
  visits,
  startHour = 19,
  endHour = 26, // 25時=翌1時、26時=翌2時 想定で〜25時まで6コマ
  title = '時間帯×曜日 売上ヒートマップ',
}: Props) {
  const [mode, setMode] = useState<'sales' | 'count'>('sales')

  const { matrix, max, totals } = useMemo(() => {
    // 7行 × N列 のマトリクス
    const cols = endHour - startHour
    const m: { sales: number; count: number }[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: cols }, () => ({ sales: 0, count: 0 }))
    )
    let unknownTimeCount = 0
    let unknownTimeSales = 0
    for (const v of visits) {
      const amount = Number(v.amount_spent) || 0
      if (amount <= 0) continue // 0円来店はヒートマップに入れない
      // 曜日: getDay() は日曜=0、月曜=1。月始まりに変換
      const d = new Date(v.visit_date + 'T00:00:00')
      const dow = (d.getDay() + 6) % 7 // 月=0..日=6

      if (!v.visit_time) {
        unknownTimeCount += 1
        unknownTimeSales += amount
        continue
      }
      const hStr = v.visit_time.split(':')[0]
      const h = parseInt(hStr, 10)
      // 翌日扱い: 0〜5 時 → 24〜29 時として扱う
      const adjH = h < startHour - 12 && h < 6 ? h + 24 : h
      const col = adjH - startHour
      if (col < 0 || col >= cols) continue
      m[dow][col].sales += amount
      m[dow][col].count += 1
    }

    let max = 0
    const totals = { sales: 0, count: 0, unknownTimeCount, unknownTimeSales }
    for (const row of m) {
      for (const cell of row) {
        if (mode === 'sales' && cell.sales > max) max = cell.sales
        if (mode === 'count' && cell.count > max) max = cell.count
        totals.sales += cell.sales
        totals.count += cell.count
      }
    }
    return { matrix: m, max, totals }
  }, [visits, startHour, endHour, mode])

  const formatYen = (n: number) => `¥${n.toLocaleString()}`
  const cellColor = (val: number) => {
    if (max === 0 || val === 0) return '#F5F0F2'
    const ratio = val / max
    // baby pink → pink → deep pink
    const r = Math.round(255 - 23 * ratio)
    const g = Math.round(240 - 120 * ratio)
    const b = Math.round(245 - 91 * ratio)
    return `rgb(${r}, ${g}, ${b})`
  }
  const textColor = (val: number) => {
    if (max === 0) return C.pinkMuted
    return val / max > 0.55 ? '#FFF' : C.dark
  }

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const fmtHour = (h: number) => (h >= 24 ? `${h - 24}時` : `${h}時`)

  return (
    <div
      style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: '0.2em',
              color: C.pinkMuted,
            }}
          >
            TIME HEATMAP
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.dark, marginTop: 2 }}>
            {title}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['sales', 'count'] as const).map(k => (
            <button
              key={k}
              onClick={() => setMode(k)}
              style={{
                padding: '4px 10px',
                fontSize: 10,
                borderRadius: 12,
                background: mode === k ? '#FBEAF0' : C.white,
                color: mode === k ? '#72243E' : C.pinkMuted,
                border: `1px solid ${mode === k ? '#ED93B1' : C.border}`,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {k === 'sales' ? '売上' : '組数'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: 10 }}>
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              {hours.map(h => (
                <th
                  key={h}
                  style={{
                    fontSize: 9,
                    color: C.pinkMuted,
                    fontWeight: 400,
                    minWidth: 38,
                    textAlign: 'center',
                  }}
                >
                  {fmtHour(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOWS.map((dowLabel, di) => (
              <tr key={dowLabel}>
                <td
                  style={{
                    fontSize: 10,
                    color: C.pinkMuted,
                    textAlign: 'right',
                    paddingRight: 4,
                  }}
                >
                  {dowLabel}
                </td>
                {matrix[di].map((cell, ci) => {
                  const v = mode === 'sales' ? cell.sales : cell.count
                  return (
                    <td
                      key={ci}
                      title={`${dowLabel}曜 ${fmtHour(hours[ci])}: 売上 ${formatYen(cell.sales)} / ${cell.count}組`}
                      style={{
                        background: cellColor(v),
                        color: textColor(v),
                        textAlign: 'center',
                        padding: '6px 4px',
                        borderRadius: 6,
                        minWidth: 38,
                        height: 28,
                        fontWeight: v > 0 ? 500 : 300,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {v === 0 ? '' : mode === 'sales' ? `${Math.round(cell.sales / 10000)}` : cell.count}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 10,
          color: C.pinkMuted,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span>※ 売上は万円単位</span>
        <span>合計: {formatYen(totals.sales)} / {totals.count}組</span>
        {totals.unknownTimeCount > 0 && (
          <span style={{ color: '#BA7517' }}>
            時間未入力: {totals.unknownTimeCount}組（{formatYen(totals.unknownTimeSales)}）
          </span>
        )}
      </div>
    </div>
  )
}
