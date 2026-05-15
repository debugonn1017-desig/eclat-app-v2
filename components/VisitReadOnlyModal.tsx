'use client'
// ─────────────────────────────────────────────────────────────────
//  VisitReadOnlyModal — 来店記録の閲覧専用モーダル（キャスト用）
//
//  キャストアカウントでログインしたとき、SALES タブのセルクリックで
//  売上の中身を読み取り専用で確認するためのモーダル。
//
//  - 編集ボタンは出さない、閉じるのみ
//  - 背景クリック or × ボタン or Escape キー で閉じる
//  - 桜カラー（C オブジェクト）統一
// ─────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { C } from '@/lib/colors'

export type ReadOnlyVisit = {
  id: string
  customer_id: string
  visit_date: string
  amount_spent: number
  party_size: number
  has_douhan: boolean
  has_after: boolean
  is_planned: boolean
  companion_honshimei: string
  companion_banai: string
  memo: string
  customer_name?: string
  // 拡張プロパティ（型上は無いが実データに含まれる可能性あり）
  visit_time?: string | null
  extension_minutes?: number | null
  table_number?: string | null
}

type Props = {
  open: boolean
  visit: ReadOnlyVisit | null
  customerName: string
  /** YYYY-MM-DD */
  date: string
  /** 同日複数来店時のインデックス情報（任意） */
  visitIndex?: number
  visitTotal?: number
  onClose: () => void
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土']

const formatDate = (d: string): string => {
  // YYYY-MM-DD → YYYY/MM/DD（曜）
  const parts = d.split('-').map(Number)
  if (parts.length !== 3) return d
  const [y, m, day] = parts
  const dt = new Date(y, m - 1, day)
  const wd = WEEKDAY[dt.getDay()]
  return `${y}/${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}（${wd}）`
}

const formatYen = (n: number): string => `¥${n.toLocaleString('ja-JP')}`

export default function VisitReadOnlyModal({
  open, visit, customerName, date,
  visitIndex, visitTotal,
  onClose,
}: Props) {
  // Esc キーで閉じる
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open || !visit) return null

  const hasMulti = typeof visitIndex === 'number' && typeof visitTotal === 'number' && visitTotal > 1
  const hasCompanionHon = visit.companion_honshimei && visit.companion_honshimei.trim().length > 0
  const hasCompanionBan = visit.companion_banai && visit.companion_banai.trim().length > 0
  const hasMemo = visit.memo && visit.memo.trim().length > 0
  const hasVisitTime = visit.visit_time && String(visit.visit_time).length > 0
  const hasExtension = typeof visit.extension_minutes === 'number' && visit.extension_minutes > 0
  const hasTableNumber = visit.table_number && String(visit.table_number).length > 0

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div style={{
        background: 'linear-gradient(160deg, #FFFFFF 0%, #FFFAFC 100%)',
        width: '100%',
        maxWidth: '440px',
        maxHeight: '90vh', overflowY: 'auto',
        borderRadius: 22,
        boxShadow: '0 20px 60px rgba(212,80,96,0.22), 0 6px 18px rgba(232,135,154,0.15)',
        border: `1px solid ${C.border}`,
      }}>
        {/* ヘッダー */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 1,
          background: C.white, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: '16px 16px 12px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontSize: '9px', letterSpacing: '0.22em',
              color: C.pink, fontWeight: 700, marginBottom: 4,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                display: 'inline-block', width: 3, height: 11,
                background: `linear-gradient(180deg, ${C.pink}, ${C.pinkLight})`,
                borderRadius: 2,
              }} />
              売上詳細
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: C.dark }}>
              {customerName} さん
              {hasMulti && (
                <span style={{
                  marginLeft: 6, fontSize: '9px', fontWeight: 700, color: C.pinkMuted,
                  background: '#FFF0F3', padding: '1px 6px', borderRadius: '7px',
                }}>
                  {(visitIndex as number) + 1}/{visitTotal}
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: C.pinkMuted, marginTop: 2 }}>
              {formatDate(date)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: '#F5F0F2', border: 'none', fontSize: '14px',
              color: C.pinkMuted, cursor: 'pointer',
              width: '32px', height: '32px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
            }}
          >✕</button>
        </div>

        {/* 本体 */}
        <div style={{ padding: '14px 16px 18px' }}>
          {/* 金額（大きく表示） */}
          <div style={{
            background: 'linear-gradient(135deg, #FFF8FA 0%, #FFFFFF 100%)',
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: '18px 14px', marginBottom: 12,
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(232,135,154,0.08)',
          }}>
            <div style={{
              fontSize: 9, letterSpacing: '0.28em',
              color: C.pinkMuted, fontWeight: 600, marginBottom: 6,
            }}>SALES</div>
            <div style={{
              fontSize: 30, fontWeight: 700,
              background: 'linear-gradient(135deg, #D45060 0%, #E8879B 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatYen(visit.amount_spent || 0)}
            </div>
          </div>

          {/* バッジ群 */}
          {(visit.has_douhan || visit.has_after || visit.is_planned) && (
            <div style={{
              display: 'flex', gap: 6, flexWrap: 'wrap',
              marginBottom: 12,
            }}>
              {visit.has_douhan && (
                <span style={{
                  padding: '5px 12px', fontSize: 10, fontWeight: 600,
                  background: '#E8789A', color: '#FFF',
                  borderRadius: 100, letterSpacing: '0.05em',
                }}>同伴あり</span>
              )}
              {visit.has_after && (
                <span style={{
                  padding: '5px 12px', fontSize: 10, fontWeight: 600,
                  background: '#D4607A', color: '#FFF',
                  borderRadius: 100, letterSpacing: '0.05em',
                }}>アフターあり</span>
              )}
              {visit.is_planned && (
                <span style={{
                  padding: '5px 12px', fontSize: 10, fontWeight: 600,
                  background: '#C58FB0', color: '#FFF',
                  borderRadius: 100, letterSpacing: '0.05em',
                }}>予定あり</span>
              )}
            </div>
          )}

          {/* 詳細項目 */}
          <div style={{
            background: C.white,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '6px 0',
            marginBottom: 12,
          }}>
            <ReadOnlyRow label="来店人数" value={`${visit.party_size || 1}名`} />
            {hasVisitTime && (
              <ReadOnlyRow label="来店時刻" value={String(visit.visit_time).slice(0, 5)} />
            )}
            {hasExtension && (
              <ReadOnlyRow label="延長" value={`${visit.extension_minutes}分`} />
            )}
            {hasTableNumber && (
              <ReadOnlyRow label="卓番" value={String(visit.table_number)} />
            )}
            {hasCompanionHon && (
              <ReadOnlyRow label="お連れ様 本指名" value={visit.companion_honshimei} />
            )}
            {hasCompanionBan && (
              <ReadOnlyRow label="お連れ様 場内" value={visit.companion_banai} />
            )}
          </div>

          {/* メモ */}
          {hasMemo && (
            <div style={{
              background: '#FFFAFC',
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: '10px 12px',
              marginBottom: 14,
            }}>
              <div style={{
                fontSize: 9, letterSpacing: '0.22em',
                color: C.pinkMuted, fontWeight: 600, marginBottom: 4,
              }}>メモ</div>
              <div style={{
                fontSize: 12, color: C.dark, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {visit.memo}
              </div>
            </div>
          )}

          {/* 閉じるボタン */}
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '10px',
              background: 'linear-gradient(135deg, #E8879A, #F4B0BF)',
              color: '#FFF', border: 'none',
              fontSize: '11px', fontWeight: 600,
              letterSpacing: '0.15em',
              cursor: 'pointer', fontFamily: 'inherit',
              borderRadius: 10,
              boxShadow: '0 4px 12px rgba(232,135,154,0.25)',
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 14px',
      borderBottom: `1px solid #F5F0F2`,
      fontSize: 11,
    }}>
      <span style={{
        color: C.pinkMuted, letterSpacing: '0.1em',
        fontSize: 10, fontWeight: 500,
      }}>{label}</span>
      <span style={{
        color: C.dark, fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'right', maxWidth: '60%',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</span>
    </div>
  )
}
