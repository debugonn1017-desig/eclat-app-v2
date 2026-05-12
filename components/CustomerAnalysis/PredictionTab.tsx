'use client'
// ─────────────────────────────────────────────────────────────────
//  📅 来店予測タブ
//   全顧客の次回来店予測日と経過/超過を一覧化。フィルター + ソート可。
// ─────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { C } from '@/lib/colors'
import { CAST_TIERS } from '@/types'
import type { TabProps, CustomerWithDerived } from './types'

type SortKey = 'predicted' | 'overdue' | 'visits' | 'ltv' | 'lastVisit'
type NomFilter = 'all' | '本指名' | '場内' | 'フリー'

export default function PredictionTab({ rows, isPC, onCustomerClick }: TabProps) {
  const [nomFilter, setNomFilter] = useState<NomFilter>('all')
  const [rankFilter, setRankFilter] = useState<Set<string>>(new Set())
  const [regionFilter, setRegionFilter] = useState<'all' | 'local' | 'remote'>('all')
  const [castFilter, setCastFilter] = useState<string>('') // cast_id, '' = all
  const [minVisits, setMinVisits] = useState<number>(3)
  const [sortKey, setSortKey] = useState<SortKey>('predicted')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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

      {/* テーブル / カード */}
      {isPC ? (
        <div style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
          overflow: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#FBEAF0' }}>
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
            background: value === o.k ? '#FBEAF0' : '#FFF',
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
              background: on ? '#FBEAF0' : '#FFF',
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
