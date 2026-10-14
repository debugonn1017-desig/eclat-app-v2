'use client'

import { useState } from 'react'
import type { CustomerRank } from '@/types'
import { C } from '@/lib/colors'
import { CUSTOMER_RANK_CHOICES, customerRankLabel, type CustomerRankTarget } from '@/lib/customerRankChange'
import CustomerCardPreview from './CustomerCardPreview'

export default function CustomerRankDialog({ target, busy, onClose, onSave }: {
  target: CustomerRankTarget
  busy: boolean
  onClose: () => void
  onSave: (rank: CustomerRank | null) => Promise<void>
}) {
  const [rank, setRank] = useState<CustomerRank | null>(target.previousRank)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setError(null)
    try { await onSave(rank) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'ランクを変更できませんでした') }
  }
  return <CustomerCardPreview name={target.name || 'お客様'} title="ランク変更" busy={busy} onClose={onClose}
    footer={<>
      <button type="button" disabled={busy} onClick={onClose}>キャンセル</button>
      <button type="button" disabled={busy || rank === target.previousRank} onClick={() => void save()}
        style={{ opacity: busy || rank === target.previousRank ? 0.5 : 1 }}>{busy ? '保存中…' : 'このランクで保存'}</button>
    </>}>
    <h2 style={{ margin: '4px 0 8px', fontSize: 17, color: C.dark, overflowWrap: 'anywhere' }}>{target.name || 'お客様'}</h2>
    <p style={{ margin: '0 0 12px', fontSize: 12, color: C.dark2 }}>現在：{customerRankLabel(target.previousRank)}</p>
    <div role="group" aria-label="変更後のランク" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
      {CUSTOMER_RANK_CHOICES.map(value => <button type="button" key={value ?? '未設定'} disabled={busy}
        aria-pressed={rank === value} onClick={() => { setRank(value); setError(null) }}
        style={{ minHeight: 44, border: `2px solid ${rank === value ? C.pinkDeep : C.border}`, borderRadius: 10,
          background: rank === value ? C.tagBg2 : C.white, color: rank === value ? C.tagTextStrong : C.dark,
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer' }}>
        {customerRankLabel(value)}
      </button>)}
    </div>
    <p style={{ margin: '12px 0 4px', fontSize: 12, lineHeight: 1.7, color: C.dark2 }}>ランクを上げる・下げる・「切れた」から戻す操作ができます。S〜C・未設定は、次の自動再評価で変わる場合があります。</p>
    {rank === '切れた' && <p style={{ fontSize: 12, color: C.dangerDeep }}>「切れた」にしても、再評価ボタンで現在の基準へ戻せます。見るだけではランクは変わりません。</p>}
    {target.previousRank === '切れた' && rank !== '切れた' && <p style={{ fontSize: 12, color: C.caution }}>本指名のお客様は自動再評価の対象に戻ります。「切れた」の条件が正しいか確認してください。</p>}
    {error && <p role="alert" style={{ fontSize: 12, color: C.dangerDeep, lineHeight: 1.6 }}>{error}</p>}
  </CustomerCardPreview>
}
