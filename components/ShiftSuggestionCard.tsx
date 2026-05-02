'use client'

// シフト最適化提案
//   過去の来店データから「この曜日のこの時間帯はキャスト◯人必要」を提案する。
//
//   ロジック:
//     1) 過去 N 日の customer_visits を取得（visit_time あり、amount_spent>0）
//     2) 曜日×時間帯（1時間刻み）でユニーク来店組数を集計
//     3) 来店組数 ÷ 1人のキャストが同時接客できる目安組数（=2）で必要人数を算出
//     4) 1段階上に余裕を持たせるため Math.ceil
//
//   呼び出し側で過去 visits を渡してもらう（pageごとに集計範囲変えられる）

import { useMemo, useState } from 'react'
import { C } from '@/lib/colors'

export type ShiftHistoryVisit = {
  visit_date: string
  visit_time: string | null
  customer_id: string
  amount_spent: number
}

type Props = {
  visits: ShiftHistoryVisit[]
  /** 1キャストが同時に対応できる組数の上限 */
  capacity?: number
  /** 表示する時間帯 */
  startHour?: number
  endHour?: number
}

const DOWS = ['月', '火', '水', '木', '金', '土', '日']

export default function ShiftSuggestionCard({
  visits,
  capacity = 2,
  startHour = 19,
  endHour = 26,
}: Props) {
  const [selectedCapacity, setSelectedCapacity] = useState(capacity)

  const matrix = useMemo(() => {
    // 7行 × N列 の「曜日×時間帯ごとの平均ユニーク組数」
    const cols = endHour - startHour
    // dow → hour → date → Set<customer_id>
    const dayMap: Map<string, Set<string>>[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: cols }, () => new Map<string, Set<string>>())
    )

    for (const v of visits) {
      if (!v.visit_time) continue
      if (Number(v.amount_spent) <= 0) continue
      const d = new Date(v.visit_date + 'T00:00:00')
      const dow = (d.getDay() + 6) % 7
      const h = parseInt(v.visit_time.split(':')[0] || '0', 10)
      const adjH = h < 6 ? h + 24 : h
      const col = adjH - startHour
      if (col < 0 || col >= cols) continue
      const map = dayMap[dow][col]
      const set = map.get(v.visit_date) ?? new Set<string>()
      set.add(v.customer_id)
      map.set(v.visit_date, set)
    }

    // 各セル: 平均組数 = sum(各日のユニーク組) / 該当曜日のサンプル日数
    return dayMap.map(row =>
      row.map(map => {
        if (map.size === 0) return { avg: 0, samples: 0 }
        let total = 0
        for (const set of map.values()) total += set.size
        return { avg: total / map.size, samples: map.size }
      })
    )
  }, [visits, startHour, endHour])

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const fmtHour = (h: number) => (h >= 24 ? `${h - 24}時` : `${h}時`)

  const cellColor = (need: number) => {
    if (need === 0) return '#F5F0F2'
    if (need >= 4) return '#E8789A'
    if (need >= 3) return '#F4A5B8'
    if (need >= 2) return '#FBD0DC'
    return '#FFF0F5'
  }

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
          <div style={{ fontSize: 9, letterSpacing: '0.2em', color: C.pinkMuted }}>
            SHIFT SUGGESTION
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.dark, marginTop: 2 }}>
            シフト最適化提案 — 必要キャスト人数（過去実績ベース）
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: C.pinkMuted }}>1人あたり対応組数</span>
          <select
            value={selectedCapacity}
            onChange={e => setSelectedCapacity(Number(e.target.value) || 2)}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              border: `1px solid ${C.border}`,
              background: C.white,
              borderRadius: 6,
              fontFamily: 'inherit',
            }}
          >
            <option value={1}>1組</option>
            <option value={2}>2組</option>
            <option value={3}>3組</option>
          </select>
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
                  const need = cell.samples > 0
                    ? Math.ceil(cell.avg / Math.max(1, selectedCapacity))
                    : 0
                  return (
                    <td
                      key={ci}
                      title={
                        cell.samples > 0
                          ? `${dowLabel}曜 ${fmtHour(hours[ci])}: 平均${cell.avg.toFixed(1)}組 → 必要 ${need}名 (${cell.samples}日分の平均)`
                          : `データなし`
                      }
                      style={{
                        background: cellColor(need),
                        color: need >= 3 ? '#FFF' : C.dark,
                        textAlign: 'center',
                        padding: '6px 4px',
                        borderRadius: 6,
                        minWidth: 38,
                        height: 28,
                        fontWeight: need > 0 ? 500 : 300,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {need === 0 ? '' : `${need}名`}
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
          lineHeight: 1.5,
        }}
      >
        ※ 過去 {visits.length} 件の来店記録（時刻あり）から各セルを集計。
        各日のユニーク来店組数の平均 ÷ 1人あたり対応組数。
      </div>
    </div>
  )
}
