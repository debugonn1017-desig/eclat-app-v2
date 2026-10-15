'use client'

import { C } from '@/lib/colors'

export type CastStarView = 'today' | 'all'
export default function CastStarViewSwitch({ value, todayCount, todayBreakdown, totalCount, disabled, onChange }: {
  value: CastStarView; todayCount: number | null; totalCount: number; disabled: boolean
  todayBreakdown?: { honshimei: number; banai: number } | null
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
    {value === 'today' && todayBreakdown && <p aria-label="本日連絡の内訳" style={{ margin: '5px 0 0', fontSize: 10, color: C.dark2 }}>場{todayBreakdown.banai}名・本{todayBreakdown.honshimei}名を指名別・地域別に表示（⭐️付きのみ）</p>}
    <details style={{ marginTop: 5, fontSize: 10, color: C.dark2 }}><summary style={{ cursor: 'pointer' }}>表示条件</summary><p style={{ margin: '4px 0', lineHeight: 1.6 }}>本日連絡は⭐️付きのみ。場内は1・3・6…30日前を県内・県外に、本指名は3の倍数日前（上限なし）を県内顧客・県外顧客・その他に分けます。本日・未来・来店未記録・切れたは対象外です。県内は福岡県。地域未設定の場内は県外、本指名はその他です。⭐️全員表示は従来の分類です。</p></details>
  </div>
}
