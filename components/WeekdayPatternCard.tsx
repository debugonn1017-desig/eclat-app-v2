'use client'

// 曜日別の来店パターン（件数 / 売上）を表示する共通カード。
// 引数で対象月を渡し、内部で customer_visits を fetch して曜日別に集計する。
// 0円来店は除外（場内チェックなど "売上が立たない" 来店をパターン分析に含めない）。
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { C } from '@/lib/colors'

type Mode = 'count' | 'sales'

export default function WeekdayPatternCard({ month }: { month: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [stats, setStats] = useState<{ count: number[]; sales: number[] }>({
    count: Array(7).fill(0),
    sales: Array(7).fill(0),
  })
  const [mode, setMode] = useState<Mode>('count')

  useEffect(() => {
    const fetchData = async () => {
      const [y, m] = month.split('-').map(Number)
      const start = `${month}-01`
      const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
      const { data } = await supabase
        .from('customer_visits')
        .select('visit_date, amount_spent')
        .gte('visit_date', start)
        .lte('visit_date', end)
      const cnt = Array(7).fill(0)
      const sls = Array(7).fill(0)
      if (data) {
        for (const v of data as any[]) {
          const d = new Date(v.visit_date)
          if (isNaN(d.getTime())) continue
          const dow = d.getDay()
          const amt = Number(v.amount_spent) || 0
          if (amt > 0) {
            cnt[dow] += 1
            sls[dow] += amt
          }
        }
      }
      setStats({ count: cnt, sales: sls })
    }
    fetchData()
  }, [month, supabase])

  const arr = mode === 'count' ? stats.count : stats.sales
  const maxV = Math.max(...arr, 1)
  const labels = ['日', '月', '火', '水', '木', '金', '土']
  const colors = ['#D45060', '#5A2840', '#5A2840', '#5A2840', '#5A2840', '#5A2840', '#5080C0']
  const formatVal = (v: number) =>
    mode === 'count' ? `${v}件` : `¥${(v / 10000).toFixed(0)}万`
  const totalCount = stats.count.reduce((s, n) => s + n, 0)
  const totalSales = stats.sales.reduce((s, n) => s + n, 0)

  return (
    <div style={{
      background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 12, color: C.dark, fontWeight: 600, letterSpacing: '0.1em' }}>
            📊 店舗の曜日別パターン
          </div>
          <div style={{ fontSize: 9, color: C.pinkMuted, marginTop: 2 }}>
            今月の来店傾向（売上0円の来店は除外） · 合計 {totalCount}件 / ¥{totalSales.toLocaleString()}
          </div>
        </div>
        {/* 件数 / 売上 切り替え */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { k: 'count' as const, l: '件数' },
            { k: 'sales' as const, l: '売上' },
          ]).map(opt => (
            <button
              key={opt.k}
              onClick={() => setMode(opt.k)}
              style={{
                padding: '5px 12px', fontSize: 11, borderRadius: 20,
                background: mode === opt.k ? '#FBEAF0' : '#FFF',
                color: mode === opt.k ? '#72243E' : C.pinkMuted,
                border: `1px solid ${mode === opt.k ? '#ED93B1' : C.border}`,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >{opt.l}</button>
          ))}
        </div>
      </div>
      {/* 7日のバー */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, alignItems: 'end' }}>
        {arr.map((v, i) => {
          const pct = (v / maxV) * 100
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: v > 0 ? colors[i] : C.pinkMuted,
                height: 14,
              }}>{v > 0 ? formatVal(v) : '—'}</div>
              <div style={{
                width: '100%', height: 90,
                display: 'flex', alignItems: 'flex-end',
                background: '#FAF7F8', borderRadius: 4, overflow: 'hidden',
              }}>
                <div style={{
                  width: '100%', height: `${pct}%`,
                  background: `linear-gradient(180deg, ${colors[i]}88, ${colors[i]})`,
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s ease',
                }} />
              </div>
              <div style={{
                fontSize: 10, fontWeight: 500,
                color: i === 0 ? '#D45060' : i === 6 ? '#5080C0' : C.pinkMuted,
              }}>{labels[i]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
