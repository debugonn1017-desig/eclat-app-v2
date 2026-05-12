'use client'
// ─────────────────────────────────────────────────────────────────
//  LINE 文面提案モーダル
//   - score (色恋関係値) × 状況 で 5 パターン deterministic 生成
//   - 状況プルダウン (自動 / 16 種)
//   - 各パターンに COPY ボタン
//   - 「もう一回」ボタンで再シード生成
// ─────────────────────────────────────────────────────────────────

import { useMemo, useState, useEffect } from 'react'
import { C } from '@/lib/colors'
import type { Customer } from '@/types'
import {
  generateLineMessages, SITUATION_LABELS,
  type SituationKey, type LineProposal,
} from '@/lib/lineGenerator'

type Props = {
  open: boolean
  customer: Customer
  onClose: () => void
}

const SITUATION_OPTIONS: { k: 'auto' | SituationKey; label: string }[] = [
  { k: 'auto', label: '自動判定 (おすすめ)' },
  ...Object.entries(SITUATION_LABELS).map(([k, label]) => ({
    k: k as SituationKey, label,
  })),
]

export default function LineMessageProposerModal({ open, customer, onClose }: Props) {
  const [situation, setSituation] = useState<'auto' | SituationKey>('auto')
  const [seedTick, setSeedTick] = useState(0)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  // Escape キーで閉じる
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  const proposals = useMemo<LineProposal[]>(() => {
    if (!open) return []
    return generateLineMessages(customer, {
      forceSituation: situation === 'auto' ? null : situation,
      isAfterBottle: situation === 's09_after_bottle',
      seedTick,
    }, 5)
  }, [open, customer, situation, seedTick])

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    } catch (e) {
      console.error('[copy]', e)
      alert('コピーに失敗しました')
    }
  }

  if (!open) return null

  const score = Number(customer.score) || 1
  const scoreLabel = score === 1 ? '軽いボディタッチ'
    : score === 2 ? 'ゼロセンチ接客'
    : score === 3 ? '店外接客'
    : score === 4 ? 'キスまで'
    : score === 5 ? 'プライベート'
    : `score=${score}`

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.white, borderRadius: 12,
          width: '100%', maxWidth: 720, maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ヘッダー */}
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>
            💌 LINE 文面提案
          </span>
          <span style={{ fontSize: 10, color: C.pinkMuted, marginLeft: 6 }}>
            — {customer.nickname || customer.customer_name}
          </span>
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            fontSize: 22, color: C.pinkMuted, cursor: 'pointer', padding: 0,
            lineHeight: 1, fontFamily: 'inherit',
          }} aria-label="閉じる">×</button>
        </div>

        {/* コントロールバー */}
        <div style={{
          padding: '12px 18px', borderBottom: `1px solid ${C.border}`,
          background: '#FAFAF9',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: C.pinkMuted, fontWeight: 600 }}>状況:</span>
            <select
              value={situation}
              onChange={e => { setSituation(e.target.value as 'auto' | SituationKey); setCopiedIdx(null) }}
              style={{
                fontSize: 11, padding: '5px 8px',
                border: `1px solid ${C.border}`, borderRadius: 6,
                fontFamily: 'inherit', background: '#FFF',
              }}
            >
              {SITUATION_OPTIONS.map(opt => (
                <option key={opt.k} value={opt.k}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: C.pinkMuted, fontWeight: 600 }}>色恋度:</span>
            <span style={{
              fontSize: 11, padding: '4px 10px',
              background: '#FBEAF0', color: '#72243E',
              borderRadius: 12, fontWeight: 600,
            }}>{score} ({scoreLabel})</span>
          </div>
          <button
            onClick={() => setSeedTick(t => t + 1)}
            style={{
              marginLeft: 'auto',
              fontSize: 11, padding: '6px 14px',
              background: 'transparent', color: C.pink,
              border: `1px solid ${C.pink}`, borderRadius: 14,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >🔄 もう一回</button>
        </div>

        {/* 提案リスト */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 18px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {proposals.map((p, i) => (
            <div key={i} style={{
              border: `1px solid ${C.border}`, borderRadius: 10,
              padding: '12px 14px', background: C.white,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 8, fontSize: 10, color: C.pinkMuted,
              }}>
                <span style={{
                  padding: '2px 8px', background: '#FBEAF0', color: '#72243E',
                  borderRadius: 4, fontWeight: 600,
                }}>パターン {i + 1}</span>
                <span>{SITUATION_LABELS[p.situation]}</span>
                {p.warnings.length > 0 && (
                  <span style={{ color: '#C53030', fontSize: 9 }}>
                    ⚠ {p.warnings.join(', ')}
                  </span>
                )}
                <button
                  onClick={() => handleCopy(p.text, i)}
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10, padding: '4px 12px',
                    background: copiedIdx === i ? '#0F6E56' : C.pink,
                    color: '#FFF', border: 'none', borderRadius: 12,
                    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                  }}
                >{copiedIdx === i ? '✓ コピー済' : '📋 コピー'}</button>
              </div>
              <pre style={{
                margin: 0, fontFamily: 'inherit', fontSize: 12,
                color: C.dark, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{p.text}</pre>
            </div>
          ))}
        </div>

        {/* フッター */}
        <div style={{
          padding: '10px 18px', borderTop: `1px solid ${C.border}`,
          background: '#FAFAF9',
          fontSize: 9, color: C.pinkMuted, lineHeight: 1.5,
        }}>
          💡 色恋度 (score) は顧客情報の「色恋関係値」を厳密に反映しています。
          🔄 もう一回で別の組み合わせを生成。各パターンは{customer.nickname || customer.customer_name}さんの趣味・誕生日・最終連絡日を考慮しています。
        </div>
      </div>
    </div>
  )
}
