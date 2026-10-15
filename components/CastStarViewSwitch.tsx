'use client'

import { C } from '@/lib/colors'

export type CastStarView = 'today' | 'all'
export default function CastStarViewSwitch({ value, todayCount, totalCount, disabled, onChange }: {
  value: CastStarView; todayCount: number | null; totalCount: number; disabled: boolean
  onChange: (value: CastStarView) => void
}) {
  return <div style={{ padding: '6px 0 8px' }}>
    <div role="group" aria-label="⭐️のお客様の表示" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 6 }}>
      {([{ key: 'today', label: '本日連絡のお客様', count: todayCount }, { key: 'all', label: '⭐️全員表示', count: totalCount }] as const).map(option => <button
        key={option.key} type="button" aria-pressed={value === option.key} disabled={disabled}
        onClick={() => onChange(option.key)} style={{ minHeight: 38, padding: '6px 4px', border: `1px solid ${C.border}`, borderRadius: 10, background: value === option.key ? C.pink : C.white, color: value === option.key ? C.white : C.dark2, fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}>
        {option.label}（{option.count === null ? '—' : option.count}名）
      </button>)}
    </div>
    <details style={{ marginTop: 5, fontSize: 10, color: C.dark2 }}><summary style={{ cursor: 'pointer' }}>表示条件</summary><p style={{ margin: '4px 0', lineHeight: 1.6 }}>⭐️付きのみ。場内は1・3・6…30日前、本指名は3の倍数日前（上限なし）。本日・未来・来店未記録・切れたは本日連絡の対象外です。その他は地域未設定のお客様です。</p></details>
  </div>
}
