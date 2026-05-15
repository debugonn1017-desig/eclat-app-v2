'use client'
// ─────────────────────────────────────────────────────────────────
//  📅 来店予測タブ
//   全顧客の次回来店予測日と経過/超過を一覧化。フィルター + ソート可。
// ─────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { C } from '@/lib/colors'
import { CAST_TIERS } from '@/types'
import type { TabProps, CustomerWithDerived } from './types'

type SortKey = 'predicted' | 'overdue' | 'visits' | 'ltv' | 'lastVisit' | 'upcomingFirst'
type NomFilter = 'all' | '本指名' | '場内' | 'フリー'
type ViewMode = 'list' | 'calendar'

export default function PredictionTab({ rows, isPC, onCustomerClick }: TabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [nomFilter, setNomFilter] = useState<NomFilter>('all')
  const [rankFilter, setRankFilter] = useState<Set<string>>(new Set())
  const [regionFilter, setRegionFilter] = useState<'all' | 'local' | 'remote'>('all')
  const [castFilter, setCastFilter] = useState<string>('') // cast_id, '' = all
  const [minVisits, setMinVisits] = useState<number>(3)
  // 「未来日が近い順」をデフォルトに変更 (D-4)
  const [sortKey, setSortKey] = useState<SortKey>('upcomingFirst')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  // 表示用カレンダー基準月
  const [calMonthOffset, setCalMonthOffset] = useState<number>(0)

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const { customer, prediction, cast } = r
      if (nomFilter !== 'all' && customer.nomination_status !== nomFilter) return false
      if (rankFilter.size > 0 && (!customer.customer_rank || !rankFilter.has(customer.customer_rank))) return false
      if (regionFilter === 'local' && customer.region !== '福岡県') return false
      if (regionFilter === 'remote' && (customer.region === '福岡県' || !customer.region)) return false
      if (castFilter && cast?.id !== castFilter) return false
      if (prediction.paidVisitCount < minVisits) return false
      return true
    })
  }, [rows, nomFilter, rankFilter, regionFilter, castFilter, minVisits])

  const sorted = useMemo(() => {
    const out = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    out.sort((a, b) => {
      const A = a.prediction
      const B = b.prediction
      switch (sortKey) {
        case 'upcomingFirst': {
          // 未来日が近い順 (今日に近い未来 → 遠い未来 → 軽度超過 → 重度超過)
          // overdueDays: 負=未来未到達, 0=今日, 正=超過
          const av = A.overdueDays
          const bv = B.overdueDays
          // null は最後尾
          if (av == null && bv == null) return 0
          if (av == null) return 1
          if (bv == null) return -1
          // 未来 (負の値) を上に、超過は後ろに
          // av=-3 (あと3日), bv=-1 (あと1日) → bv が先 (今日に近い未来 = 値が大きい負)
          // av=5 (5日超過), bv=10 (10日超過) → av が先 (超過少ない方が手当しやすい)
          if (av < 0 && bv < 0) return bv - av  // どっちも未来 → 今日に近い未来優先
          if (av >= 0 && bv >= 0) return av - bv  // どっちも超過 → 浅い超過優先
          // 片方未来、片方超過 → 未来を上に
          return av < 0 ? -1 : 1
        }
        case 'predicted': {
          const av = A.predictedDate ?? '9999-99-99'
          const bv = B.predictedDate ?? '9999-99-99'
          return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
        }
        case 'overdue':
          return ((A.overdueDays ?? -9999) - (B.overdueDays ?? -9999)) * dir
        case 'visits':
          return (A.paidVisitCount - B.paidVisitCount) * dir
        case 'ltv':
          return (A.ltv - B.ltv) * dir
        case 'lastVisit': {
          const av = A.lastVisitDate ?? '0000-00-00'
          const bv = B.lastVisitDate ?? '0000-00-00'
          return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
        }
      }
    })
    return out
  }, [filtered, sortKey, sortDir])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir(k === 'overdue' || k === 'visits' || k === 'ltv' ? 'desc' : 'asc') }
  }

  const allCasts = useMemo(() => {
    const seen = new Set<string>()
    const out: { id: string; label: string }[] = []
    for (const r of rows) {
      if (r.cast && !seen.has(r.cast.id)) {
        seen.add(r.cast.id)
        out.push({ id: r.cast.id, label: r.cast.display_name || r.cast.cast_name || '無名' })
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, 'ja'))
  }, [rows])

  const formatYen = (n: number) => `¥${Math.round(n).toLocaleString()}`
  const overdueColor = (od: number | null) => {
    if (od == null) return C.pinkMuted
    if (od < 0) return C.pinkMuted
    if (od <= 7) return '#D4A017'
    if (od <= 30) return '#E07840'
    return '#C53030'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ビュー切替トグル + クイックソート */}
      <div style={{
        display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 600,
              background: viewMode === 'list' ? C.pink : '#FFF',
              color: viewMode === 'list' ? '#FFF' : C.pinkMuted,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >📋 リスト</button>
          <button
            onClick={() => setViewMode('calendar')}
            style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 600,
              background: viewMode === 'calendar' ? C.pink : '#FFF',
              color: viewMode === 'calendar' ? '#FFF' : C.pinkMuted,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >📅 カレンダー</button>
        </div>
        {viewMode === 'list' && (
          <>
            <span style={{ fontSize: 10, color: C.pinkMuted, marginLeft: 6 }}>並び順:</span>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              style={{
                fontSize: 11, padding: '5px 8px',
                border: `1px solid ${C.border}`, borderRadius: 6,
                fontFamily: 'inherit', background: '#FFF',
              }}
            >
              <option value="upcomingFirst">📅 未来日が近い順 (おすすめ)</option>
              <option value="predicted">予測日 昇順</option>
              <option value="overdue">超過日数 多い順</option>
              <option value="visits">来店回数 多い順</option>
              <option value="ltv">LTV 多い順</option>
              <option value="lastVisit">最終来店 新しい順</option>
            </select>
          </>
        )}
      </div>

      {/* フィルターバー */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* 指名 */}
        <ChipGroup
          label="指名状況"
          options={[
            { k: 'all', label: '全' },
            { k: '本指名', label: '本指名' },
            { k: '場内', label: '場内' },
            { k: 'フリー', label: 'フリー' },
          ]}
          value={nomFilter}
          onChange={v => setNomFilter(v as NomFilter)}
        />
        {/* ランク */}
        <ChipMulti
          label="ランク"
          options={['S', 'A', 'B', 'C']}
          selected={rankFilter}
          onChange={setRankFilter}
        />
        {/* 地域 + キャスト + 来店回数 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <ChipGroup
            label="地域"
            options={[
              { k: 'all', label: '全' },
              { k: 'local', label: '福岡' },
              { k: 'remote', label: '県外' },
            ]}
            value={regionFilter}
            onChange={v => setRegionFilter(v as 'all' | 'local' | 'remote')}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: C.pinkMuted }}>担当</span>
            <select
              value={castFilter}
              onChange={e => setCastFilter(e.target.value)}
              style={{
                fontSize: 11, padding: '4px 8px',
                border: `1px solid ${C.border}`, borderRadius: 6,
                fontFamily: 'inherit', background: '#FFF',
              }}
            >
              <option value="">全キャスト</option>
              {allCasts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: C.pinkMuted }}>来店回数 ≥</span>
            <input
              type="number" min={1} max={30}
              value={minVisits}
              onChange={e => setMinVisits(Math.max(1, Number(e.target.value) || 1))}
              style={{
                width: 50, fontSize: 11, padding: '4px 6px',
                border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: 'inherit',
              }}
            />
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: C.dark }}>
            <strong>{sorted.length}</strong> 件
          </div>
        </div>
      </div>

      {/* カレンダー or リスト */}
      {viewMode === 'calendar' ? (
        <CalendarView
          rows={sorted}
          isPC={isPC}
          monthOffset={calMonthOffset}
          onChangeOffset={setCalMonthOffset}
          onCustomerClick={onCustomerClick}
        />
      ) : isPC ? (
        <div style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
          overflow: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: C.tagBg2 }}>
                <Th>顧客名</Th>
                <Th>担当</Th>
                <Th>ランク</Th>
                <Th>指名</Th>
                <Th>地域</Th>
                <Th onClick={() => toggleSort('visits')} sortKey={sortKey === 'visits' ? sortDir : null}>来店回数</Th>
                <Th onClick={() => toggleSort('lastVisit')} sortKey={sortKey === 'lastVisit' ? sortDir : null}>最終来店</Th>
                <Th>平均間隔</Th>
                <Th onClick={() => toggleSort('predicted')} sortKey={sortKey === 'predicted' ? sortDir : null}>予測来店日</Th>
                <Th onClick={() => toggleSort('overdue')} sortKey={sortKey === 'overdue' ? sortDir : null}>超過日数</Th>
                <Th onClick={() => toggleSort('ltv')} sortKey={sortKey === 'ltv' ? sortDir : null}>累計売上</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const { customer: c, prediction: p, cast } = r
                return (
                  <tr
                    key={c.id}
                    onClick={() => onCustomerClick(c.id)}
                    style={{ cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}
                  >
                    <Td>{c.customer_name}</Td>
                    <Td>{cast?.display_name || cast?.cast_name || '—'}</Td>
                    <Td>
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        padding: '2px 6px', borderRadius: 4,
                        background: rankColor(c.customer_rank),
                        color: '#FFF',
                      }}>{c.customer_rank || '—'}</span>
                    </Td>
                    <Td>{c.nomination_status || '—'}</Td>
                    <Td>{c.region || '—'}</Td>
                    <Td align="right">
                      {p.paidVisitCount}
                      {p.sampleQuality === 'low' && <span style={{ fontSize: 9, color: '#D4A017', marginLeft: 2 }} title="サンプル少">⚠</span>}
                    </Td>
                    <Td>{p.lastVisitDate || '—'}</Td>
                    <Td align="right">{p.avgIntervalDays ?? '—'}日</Td>
                    <Td>{p.predictedDate || '—'}</Td>
                    <Td align="right" style={{ color: overdueColor(p.overdueDays), fontWeight: 600 }}>
                      {p.overdueDays == null ? '—' :
                       p.overdueDays < 0 ? `あと${-p.overdueDays}日` :
                       p.overdueDays === 0 ? '今日' :
                       `+${p.overdueDays}日`}
                    </Td>
                    <Td align="right">{formatYen(p.ltv)}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: C.pinkMuted, fontSize: 11 }}>
              該当する顧客がいません（フィルター条件を見直してください）
            </div>
          )}
        </div>
      ) : (
        // モバイル: カード形式
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(r => (
            <CompactCard key={r.customer.id} row={r} onClick={onCustomerClick} />
          ))}
          {sorted.length === 0 && (
            <div style={{
              background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: 24, textAlign: 'center', color: C.pinkMuted, fontSize: 11,
            }}>該当する顧客がいません</div>
          )}
        </div>
      )}
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

function Th({ children, onClick, sortKey, align }: { children: React.ReactNode; onClick?: () => void; sortKey?: 'asc' | 'desc' | null; align?: 'right' }) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: '8px 10px', textAlign: align || 'left',
        fontSize: 10, color: '#72243E', fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap', userSelect: 'none',
      }}
    >
      {children}
      {sortKey && <span style={{ marginLeft: 4 }}>{sortKey === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
}

function Td({ children, align, style }: { children: React.ReactNode; align?: 'right'; style?: React.CSSProperties }) {
  return (
    <td style={{
      padding: '7px 10px',
      fontSize: 11, color: '#3A2530',
      textAlign: align || 'left',
      whiteSpace: 'nowrap',
      ...style,
    }}>{children}</td>
  )
}

function CompactCard({ row, onClick }: { row: CustomerWithDerived; onClick: (id: string) => void }) {
  const { customer: c, prediction: p, cast } = row
  const od = p.overdueDays
  const odColor = od == null ? C.pinkMuted : od < 0 ? C.pinkMuted : od <= 7 ? '#D4A017' : od <= 30 ? '#E07840' : '#C53030'
  return (
    <div
      onClick={() => onClick(c.id)}
      style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: '10px 12px', cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <strong style={{ fontSize: 13, color: C.dark }}>{c.customer_name}</strong>
        <span style={{
          fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
          background: rankColor(c.customer_rank), color: '#FFF',
        }}>{c.customer_rank || '—'}</span>
        <span style={{ fontSize: 9, color: C.pinkMuted }}>{c.nomination_status || ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: C.pinkMuted }}>{c.region || ''}</span>
      </div>
      <div style={{ fontSize: 10, color: C.pinkMuted, marginBottom: 6 }}>
        担当: {cast?.display_name || cast?.cast_name || '—'} / {p.paidVisitCount} 回来店 / ¥{Math.round(p.ltv).toLocaleString()}
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
        <span style={{ color: C.dark }}>予測 <strong>{p.predictedDate || '—'}</strong></span>
        <span style={{ color: odColor, fontWeight: 600, marginLeft: 'auto' }}>
          {od == null ? '—' : od < 0 ? `あと${-od}日` : od === 0 ? '今日' : `+${od}日 超過`}
        </span>
      </div>
    </div>
  )
}

// 共通 chips コンポーネント
function ChipGroup({ label, options, value, onChange }: {
  label: string
  options: { k: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, color: C.pinkMuted, minWidth: 56 }}>{label}</span>
      {options.map(o => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 14,
            border: `1px solid ${value === o.k ? C.pink : C.border}`,
            background: value === o.k ? C.tagBg2 : '#FFF',
            color: value === o.k ? '#72243E' : C.pinkMuted,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >{o.label}</button>
      ))}
    </div>
  )
}

function ChipMulti({ label, options, selected, onChange }: {
  label: string
  options: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, color: C.pinkMuted, minWidth: 56 }}>{label}</span>
      {options.map(o => {
        const on = selected.has(o)
        return (
          <button
            key={o}
            onClick={() => {
              const next = new Set(selected)
              if (on) next.delete(o); else next.add(o)
              onChange(next)
            }}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 14,
              border: `1px solid ${on ? C.pink : C.border}`,
              background: on ? C.tagBg2 : '#FFF',
              color: on ? '#72243E' : C.pinkMuted,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >{o}</button>
        )
      })}
    </div>
  )
}
// CAST_TIERS imported to satisfy ESLint of unused; mark intentional usage.
void CAST_TIERS

// ─── カレンダー表示 ──────────────────────────────────────────
function CalendarView({ rows, isPC, monthOffset, onChangeOffset, onCustomerClick }: {
  rows: CustomerWithDerived[]
  isPC: boolean
  monthOffset: number
  onChangeOffset: (n: number) => void
  onCustomerClick: (id: string) => void
}) {
  // 選択中の日付 (オーバーレイ表示用)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  // 表示する月の base
  const today = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  const viewMonth = useMemo(() => {
    return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  }, [today, monthOffset])

  const monthLabel = `${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`
  const todayStr = (() => {
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })()

  // 日別の予測顧客マップ
  const byDate = useMemo(() => {
    const map = new Map<string, CustomerWithDerived[]>()
    for (const r of rows) {
      const p = r.prediction.predictedDate
      if (!p) continue
      // viewMonth と同じ年月のみ
      if (!p.startsWith(`${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`)) continue
      // 既に超過してる (過去) はカレンダーから除外、別セクションで表示
      const list = map.get(p) ?? []
      list.push(r)
      map.set(p, list)
    }
    return map
  }, [rows, viewMonth])

  // 超過リスト (今日より前の予測日)
  const overdueList = useMemo(() => {
    const arr = rows
      .filter(r => r.prediction.predictedDate && r.prediction.predictedDate < todayStr)
      .sort((a, b) => (a.prediction.predictedDate ?? '') < (b.prediction.predictedDate ?? '') ? 1 : -1)
    return arr.slice(0, 50)
  }, [rows, todayStr])

  // カレンダーの日付グリッド
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay()
  const lastDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()
  const cells: { day: number | null; dateStr: string; isToday: boolean; isPast: boolean }[] = []
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: '', isToday: false, isPast: false })
  for (let d = 1; d <= lastDate; d++) {
    const dateStr = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({
      day: d, dateStr,
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* カレンダー本体 */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: isPC ? '14px 16px' : '10px 12px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>📅 来店予測カレンダー</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => onChangeOffset(monthOffset - 1)} style={{
              background: 'transparent', border: 'none', fontSize: 18,
              color: C.pink, cursor: 'pointer', padding: 4, fontFamily: 'inherit',
            }}>‹</button>
            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 86, textAlign: 'center', color: C.dark }}>
              {monthLabel}
            </span>
            <button onClick={() => onChangeOffset(monthOffset + 1)} style={{
              background: 'transparent', border: 'none', fontSize: 18,
              color: C.pink, cursor: 'pointer', padding: 4, fontFamily: 'inherit',
            }}>›</button>
            {monthOffset !== 0 && (
              <button onClick={() => onChangeOffset(0)} style={{
                marginLeft: 4, fontSize: 10, padding: '4px 10px',
                background: 'transparent', color: C.pink,
                border: `1px solid ${C.pink}`, borderRadius: 12,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>今月へ</button>
            )}
          </div>
        </div>

        {/* 曜日ヘッダー */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4,
          fontSize: 10, color: C.pinkMuted, marginBottom: 4, textAlign: 'center',
        }}>
          {['日', '月', '火', '水', '木', '金', '土'].map(d => <div key={d}>{d}</div>)}
        </div>

        {/* 日付セル */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((c, i) => {
            if (c.day == null) {
              return <div key={i} style={{ minHeight: isPC ? 88 : 68, opacity: 0.3 }} />
            }
            const customers = byDate.get(c.dateStr) ?? []
            const visibleCount = isPC ? 3 : 2
            const hasCustomers = customers.length > 0
            return (
              <div
                key={i}
                onClick={() => hasCustomers && setSelectedDate(c.dateStr)}
                style={{
                  background: c.isToday ? C.tagBg2 : c.isPast ? '#FAFAF9' : C.white,
                  border: c.isToday ? `2px solid ${C.pink}` : `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '4px 4px 3px',
                  minHeight: isPC ? 88 : 68,
                  opacity: c.isPast && !c.isToday ? 0.45 : 1,
                  cursor: hasCustomers ? 'pointer' : 'default',
                  transition: 'background 0.15s, transform 0.05s',
                }}
                onMouseEnter={e => {
                  if (hasCustomers) e.currentTarget.style.background = c.isToday ? '#F4C0D1' : C.tagBg2
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = c.isToday ? C.tagBg2 : c.isPast ? '#FAFAF9' : C.white
                }}
              >
                <div style={{
                  fontSize: 10, fontWeight: c.isToday ? 700 : 400,
                  color: c.isToday ? '#72243E' : C.pinkMuted,
                  marginBottom: 3, display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  <span>{c.day}</span>
                  {c.isToday && (
                    <span style={{
                      fontSize: 8, padding: '0 4px', borderRadius: 2,
                      background: C.pink, color: '#FFF', fontWeight: 600,
                    }}>今日</span>
                  )}
                  {hasCustomers && (
                    <span style={{
                      marginLeft: 'auto', fontSize: 9, color: C.pinkMuted,
                    }}>{customers.length}名</span>
                  )}
                </div>
                {customers.slice(0, visibleCount).map(r => (
                  <div
                    key={r.customer.id}
                    style={{
                      background: C.tagBg2, color: '#72243E',
                      fontSize: 9, padding: '2px 4px', borderRadius: 3,
                      marginBottom: 2, pointerEvents: 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >{r.customer.customer_name}</div>
                ))}
                {customers.length > visibleCount && (
                  <div
                    style={{
                      fontSize: 9, color: C.pinkMuted, padding: '0 4px',
                      pointerEvents: 'none',
                    }}
                  >+{customers.length - visibleCount}件</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 超過リスト */}
      {overdueList.length > 0 && (
        <div style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>
              ⚠ 既に超過 (営業優先順)
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.pinkMuted }}>
              {overdueList.length} 件
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isPC ? 'repeat(2, 1fr)' : '1fr',
            gap: 4,
          }}>
            {overdueList.map(r => {
              const od = r.prediction.overdueDays ?? 0
              const bg = od > 90 ? '#FCEBEB' : od > 30 ? '#FAEEDA' : C.tagBg2
              const fg = od > 90 ? '#501313' : od > 30 ? '#412402' : '#72243E'
              const accent = od > 90 ? '#A32D2D' : od > 30 ? '#854F0B' : '#993556'
              return (
                <div
                  key={r.customer.id}
                  onClick={() => onCustomerClick(r.customer.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', background: bg, borderRadius: 4,
                    cursor: 'pointer', fontSize: 11,
                  }}
                >
                  <span style={{ color: fg, fontWeight: 500 }}>{r.customer.customer_name}</span>
                  <span style={{ fontSize: 9, color: fg, opacity: 0.7 }}>
                    {r.cast?.display_name || r.cast?.cast_name || '—'}
                  </span>
                  <span style={{ marginLeft: 'auto', color: accent, fontWeight: 600 }}>
                    +{od}日
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 凡例 */}
      <div style={{
        display: 'flex', gap: 12, fontSize: 10, color: C.pinkMuted, padding: '0 4px',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, background: C.tagBg2, borderRadius: 2 }} />
          <span>未来予測</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, background: '#FAEEDA', borderRadius: 2 }} />
          <span>軽度超過 (~90日)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, background: '#FCEBEB', borderRadius: 2 }} />
          <span>離脱リスク (90日超)</span>
        </div>
        <span style={{ marginLeft: 'auto' }}>💡 日付タップで一覧</span>
      </div>

      {/* 日付別オーバーレイ */}
      {selectedDate && (
        <DateOverlay
          dateStr={selectedDate}
          customers={byDate.get(selectedDate) ?? []}
          onClose={() => setSelectedDate(null)}
          onCustomerClick={(id) => { onCustomerClick(id); setSelectedDate(null) }}
        />
      )}
    </div>
  )
}

// ─── 日付別 顧客リストオーバーレイ ──────────────────────────
function DateOverlay({ dateStr, customers, onClose, onCustomerClick }: {
  dateStr: string
  customers: CustomerWithDerived[]
  onClose: () => void
  onCustomerClick: (id: string) => void
}) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
  const label = `${y}年${m}月${d}日 (${weekday})`

  // LTV 降順でソート (営業優先)
  const sorted = [...customers].sort((a, b) => b.prediction.ltv - a.prediction.ltv)

  const formatYen = (n: number) => `¥${Math.round(n).toLocaleString()}`
  const rankColor = (r: string | null): string => {
    switch (r) {
      case 'S': return '#D4A017'
      case 'A': return '#5B8DBE'
      case 'B': return '#0F6E56'
      case 'C': return '#999'
      default: return '#CCC'
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1050,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.white, borderRadius: 12,
          width: '100%', maxWidth: 540, maxHeight: '85vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 48px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>📅 {label}</span>
          <span style={{ fontSize: 11, color: C.pinkMuted, marginLeft: 'auto' }}>
            {sorted.length}名 (LTV順)
          </span>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none',
            fontSize: 22, color: C.pinkMuted, cursor: 'pointer', padding: 0,
            lineHeight: 1, fontFamily: 'inherit',
          }} aria-label="閉じる">×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {sorted.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.pinkMuted, fontSize: 12 }}>
              この日に予測される顧客はいません
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sorted.map(r => {
                const c = r.customer
                const p = r.prediction
                return (
                  <div
                    key={c.id}
                    onClick={() => onCustomerClick(c.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px',
                      background: C.white, border: `1px solid ${C.border}`,
                      borderRadius: 8, cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = C.tagBg2}
                    onMouseLeave={e => e.currentTarget.style.background = C.white}
                  >
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: '2px 6px', borderRadius: 4,
                      background: rankColor(c.customer_rank), color: '#FFF',
                      minWidth: 22, textAlign: 'center',
                    }}>{c.customer_rank ?? '—'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.customer_name}
                      </div>
                      <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 1 }}>
                        担当 {r.cast?.display_name || r.cast?.cast_name || '—'}
                        ・{c.nomination_status || '—'}
                        ・{c.region || '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 10 }}>
                      <div style={{ color: C.pink, fontWeight: 600 }}>
                        {formatYen(p.ltv)}
                      </div>
                      <div style={{ color: C.pinkMuted, marginTop: 1 }}>
                        {p.paidVisitCount}回 / 平均{p.avgIntervalDays ?? '—'}日
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{
          padding: '10px 18px', borderTop: `1px solid ${C.border}`,
          background: '#FAFAF9', fontSize: 10, color: C.pinkMuted,
        }}>
          顧客名タップで詳細を開きます
        </div>
      </div>
    </div>
  )
}
