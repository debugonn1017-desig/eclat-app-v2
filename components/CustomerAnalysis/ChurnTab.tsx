'use client'
// ─────────────────────────────────────────────────────────────────
//  ⚠️ 離脱予兆タブ
//   予測来店日を超過してる顧客を、営業優先順 (LTV 降順) で表示
// ─────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { C } from '@/lib/colors'
import type { TabProps } from './types'

const THRESHOLDS = [7, 14, 30, 60, 90]

export default function ChurnTab({ rows, isPC, onCustomerClick }: TabProps) {
  const [threshold, setThreshold] = useState<number>(14)
  const [excludeCertain, setExcludeCertain] = useState<boolean>(true) // 365日超は離脱確定として別枠

  const { active, certain } = useMemo(() => {
    const out = { active: [] as typeof rows, certain: [] as typeof rows }
    for (const r of rows) {
      const od = r.prediction.overdueDays
      if (od == null || od < threshold) continue
      if (od > 365) out.certain.push(r)
      else out.active.push(r)
    }
    const sortFn = (a: typeof rows[number], b: typeof rows[number]) => {
      // LTV 降順 > 超過日数降順 > ランク (S→C)
      if (b.prediction.ltv !== a.prediction.ltv) return b.prediction.ltv - a.prediction.ltv
      const oa = a.prediction.overdueDays ?? 0
      const ob = b.prediction.overdueDays ?? 0
      if (ob !== oa) return ob - oa
      const rankOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 }
      const ra = rankOrder[a.customer.customer_rank ?? 'C'] ?? 4
      const rb = rankOrder[b.customer.customer_rank ?? 'C'] ?? 4
      return ra - rb
    }
    out.active.sort(sortFn)
    out.certain.sort(sortFn)
    return out
  }, [rows, threshold])

  const list = excludeCertain ? active : [...active, ...certain]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* しきい値 + サマリー */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: C.pinkMuted, fontWeight: 600 }}>超過しきい値:</span>
          {THRESHOLDS.map(t => (
            <button
              key={t}
              onClick={() => setThreshold(t)}
              style={{
                fontSize: 11, padding: '5px 14px', borderRadius: 16,
                border: `1px solid ${threshold === t ? C.pink : C.border}`,
                background: threshold === t ? '#FBEAF0' : '#FFF',
                color: threshold === t ? '#72243E' : C.pinkMuted,
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: threshold === t ? 600 : 400,
              }}
            >+{t}日 超過</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: C.dark, flexWrap: 'wrap' }}>
          <span>📍 営業対象: <strong style={{ fontSize: 14, color: '#C53030' }}>{active.length}</strong> 名</span>
          <span>💀 離脱確定 (365日超): <strong style={{ fontSize: 14, color: '#666' }}>{certain.length}</strong> 名</span>
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={excludeCertain}
              onChange={e => setExcludeCertain(e.target.checked)}
              style={{ accentColor: C.pink }}
            />
            <span style={{ fontSize: 10, color: C.pinkMuted }}>離脱確定を除外</span>
          </label>
        </div>
      </div>

      {/* リスト */}
      {list.length === 0 ? (
        <div style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 32, textAlign: 'center', color: C.pinkMuted, fontSize: 12,
        }}>
          🎉 現在、超過 {threshold}日 以上の顧客はいません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((r, i) => {
            const { customer: c, prediction: p, cast } = r
            const isCertain = (p.overdueDays ?? 0) > 365
            const od = p.overdueDays ?? 0
            const odColor = od > 60 ? '#C53030' : od > 30 ? '#E07840' : '#D4A017'
            return (
              <div
                key={c.id}
                onClick={() => onCustomerClick(c.id)}
                style={{
                  background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '10px 12px', cursor: 'pointer',
                  borderLeft: `4px solid ${isCertain ? '#666' : odColor}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: C.pinkMuted, minWidth: 24 }}>#{i + 1}</span>
                  <strong style={{ fontSize: 13, color: C.dark }}>{c.customer_name}</strong>
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
                    background: rankColor(c.customer_rank), color: '#FFF',
                  }}>{c.customer_rank || '—'}</span>
                  <span style={{ fontSize: 10, color: C.pinkMuted }}>{c.nomination_status || ''}</span>
                  <span style={{ fontSize: 10, color: C.pinkMuted }}>{c.region || ''}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: odColor, fontWeight: 700 }}>
                    +{od}日 超過
                  </span>
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: isPC ? 'repeat(5, 1fr)' : 'repeat(2, 1fr)',
                  gap: 6, marginTop: 8, fontSize: 10, color: '#444',
                }}>
                  <Field label="担当" value={cast?.display_name || cast?.cast_name || '—'} />
                  <Field label="LTV" value={`¥${Math.round(p.ltv).toLocaleString()}`} accent />
                  <Field label="最終来店" value={p.lastVisitDate || '—'} />
                  <Field label="連絡日" value={c.last_contact_date || '未記録'} />
                  <Field label="同伴/AF" value={`${c.recommended_line_visit ? '✓' : ''}`} hidden />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, accent, hidden }: { label: string; value: string; accent?: boolean; hidden?: boolean }) {
  if (hidden) return null
  return (
    <div>
      <div style={{ fontSize: 9, color: C.pinkMuted }}>{label}</div>
      <div style={{ fontSize: 11, color: accent ? C.pink : C.dark, fontWeight: accent ? 600 : 400 }}>{value}</div>
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
