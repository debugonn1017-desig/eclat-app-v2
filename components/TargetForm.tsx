'use client'
// ─────────────────────────────────────────────────────────────────
//  TargetForm — ノルマ編集用の共通フォーム
// ─────────────────────────────────────────────────────────────────
//  3箇所で再利用される:
//    1. キャスト個別ページ SETTING タブ → 月別ノルマ
//    2. /admin/targets の個別オーバーライド → 個別恒久デフォルト
//    3. /admin/targets の層別デフォルト → 層別恒久デフォルト
//
//  プロパティ:
//    initial: 編集対象の初期値（null なら全部空）
//    onSave : 保存時に呼ばれる、values を受け取る
//    title  : フォーム上部に表示するタイトル
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { C } from '@/lib/colors'
import { AutoCustomerRank, RankTargets } from '@/types'

// ノルマは自動判定対象（S/A/B/C）にのみ設定する。'切れた' は対象外。
const RANKS: AutoCustomerRank[] = ['S', 'A', 'B', 'C']

/** TargetForm が扱う値（cast_targets / cast_tier_targets 共通の項目セット） */
export type TargetValues = {
  target_sales: number
  target_work_days: number
  target_honshimei: number
  target_banai: number
  target_local_customers: number
  target_remote_customers: number
  rank_targets: RankTargets
}

export const EMPTY_TARGET_VALUES: TargetValues = {
  target_sales: 0,
  target_work_days: 0,
  target_honshimei: 0,
  target_banai: 0,
  target_local_customers: 0,
  target_remote_customers: 0,
  rank_targets: {
    S: { sales: 0, visits: 0 },
    A: { sales: 0, visits: 0 },
    B: { sales: 0, visits: 0 },
    C: { sales: 0, visits: 0 },
  },
}

interface Props {
  /** 初期値。null なら全部空。 */
  initial: Partial<TargetValues> | null
  /** 保存時に呼ばれる。await で完了を待つ。 */
  onSave: (values: TargetValues) => Promise<void>
  /** 上部に出すタイトル */
  title?: string
  /** 保存ボタンの label をカスタマイズ（デフォルト: 「保存」）*/
  saveLabel?: string
  /** 編集できないモード（閲覧用） */
  readOnly?: boolean
}

export default function TargetForm({ initial, onSave, title, saveLabel, readOnly }: Props) {
  // ─── フォーム状態 ──────────────────────────────────────────
  const [targetSales, setTargetSales] = useState('')
  const [targetWorkDays, setTargetWorkDays] = useState('')
  const [targetHonshimei, setTargetHonshimei] = useState('')
  const [targetBanai, setTargetBanai] = useState('')
  const [targetLocal, setTargetLocal] = useState('')
  const [targetRemote, setTargetRemote] = useState('')
  const [rankTargets, setRankTargets] = useState<Record<AutoCustomerRank, { sales: string; visits: string }>>({
    S: { sales: '', visits: '' },
    A: { sales: '', visits: '' },
    B: { sales: '', visits: '' },
    C: { sales: '', visits: '' },
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // initial が変わったら state を上書き
  useEffect(() => {
    const v = initial ?? {}
    setTargetSales(v.target_sales != null ? String(v.target_sales) : '')
    setTargetWorkDays(v.target_work_days != null ? String(v.target_work_days) : '')
    setTargetHonshimei(v.target_honshimei != null ? String(v.target_honshimei) : '')
    setTargetBanai(v.target_banai != null ? String(v.target_banai) : '')
    setTargetLocal(v.target_local_customers != null ? String(v.target_local_customers) : '')
    setTargetRemote(v.target_remote_customers != null ? String(v.target_remote_customers) : '')
    const rt = (v.rank_targets ?? {}) as Partial<RankTargets>
    setRankTargets({
      S: { sales: rt.S?.sales?.toString() ?? '', visits: rt.S?.visits?.toString() ?? '' },
      A: { sales: rt.A?.sales?.toString() ?? '', visits: rt.A?.visits?.toString() ?? '' },
      B: { sales: rt.B?.sales?.toString() ?? '', visits: rt.B?.visits?.toString() ?? '' },
      C: { sales: rt.C?.sales?.toString() ?? '', visits: rt.C?.visits?.toString() ?? '' },
    })
    setSaved(false)
  }, [initial])

  const handleSave = async () => {
    if (readOnly) return
    setSaving(true)
    setSaved(false)
    try {
      await onSave({
        target_sales: Number(targetSales) || 0,
        target_work_days: Number(targetWorkDays) || 0,
        target_honshimei: Number(targetHonshimei) || 0,
        target_banai: Number(targetBanai) || 0,
        target_local_customers: Number(targetLocal) || 0,
        target_remote_customers: Number(targetRemote) || 0,
        rank_targets: {
          S: { sales: Number(rankTargets.S.sales) || 0, visits: Number(rankTargets.S.visits) || 0 },
          A: { sales: Number(rankTargets.A.sales) || 0, visits: Number(rankTargets.A.visits) || 0 },
          B: { sales: Number(rankTargets.B.sales) || 0, visits: Number(rankTargets.B.visits) || 0 },
          C: { sales: Number(rankTargets.C.sales) || 0, visits: Number(rankTargets.C.visits) || 0 },
        },
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    fontSize: '14px', fontFamily: 'inherit',
    border: `1px solid ${C.border}`, background: C.white,
    color: C.dark, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '10px', letterSpacing: '0.15em',
    color: C.pinkMuted, marginBottom: '4px', display: 'block',
  }

  return (
    <div>
      {title && (
        <div style={{
          fontSize: '11px', letterSpacing: '0.2em', color: C.pinkMuted,
          marginBottom: '12px', fontWeight: 600,
        }}>{title}</div>
      )}

      {/* 基本目標 */}
      <FormSection accent={C.pink} label="基本目標">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>設定売上（円）</label>
            <input type="number" value={targetSales}
              onChange={e => setTargetSales(e.target.value)}
              placeholder="0" style={inputStyle} disabled={readOnly} />
          </div>
          <div>
            <label style={labelStyle}>設定出勤日数</label>
            <input type="number" value={targetWorkDays}
              onChange={e => setTargetWorkDays(e.target.value)}
              placeholder="0" style={inputStyle} disabled={readOnly} />
          </div>
        </div>
      </FormSection>

      {/* 指名目標 */}
      <FormSection accent="#D4A76A" label="指名目標">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>目標本指名数</label>
            <input type="number" value={targetHonshimei}
              onChange={e => setTargetHonshimei(e.target.value)}
              placeholder="0" style={inputStyle} disabled={readOnly} />
          </div>
          <div>
            <label style={labelStyle}>目標 場内獲得数（人）</label>
            <input type="number" value={targetBanai}
              onChange={e => setTargetBanai(e.target.value)}
              placeholder="0" style={inputStyle} disabled={readOnly} />
          </div>
        </div>
      </FormSection>

      {/* エリア目標 — 今月の来店組数を目標とする */}
      <FormSection accent={C.pinkLight} label="エリア目標（今月の来店組数）">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>目標 県内（福岡）来店組数</label>
            <input type="number" value={targetLocal}
              onChange={e => setTargetLocal(e.target.value)}
              placeholder="0" style={inputStyle} disabled={readOnly} />
          </div>
          <div>
            <label style={labelStyle}>目標 県外 来店組数</label>
            <input type="number" value={targetRemote}
              onChange={e => setTargetRemote(e.target.value)}
              placeholder="0" style={inputStyle} disabled={readOnly} />
          </div>
        </div>
      </FormSection>

      {/* ランク別目標 */}
      <FormSection accent={C.pinkMuted} label="ランク別目標">
        <div style={{
          display: 'grid', gridTemplateColumns: '40px 1fr 1fr', gap: '6px',
          alignItems: 'center', marginBottom: '4px',
        }}>
          <div style={{ fontSize: '9px', color: C.pinkMuted }}>ランク</div>
          <div style={{ fontSize: '9px', color: C.pinkMuted, textAlign: 'center' }}>売上（円）</div>
          <div style={{ fontSize: '9px', color: C.pinkMuted, textAlign: 'center' }}>来店回数</div>
        </div>
        {RANKS.map(rank => (
          <div key={rank} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 1fr', gap: '6px',
            alignItems: 'center', marginBottom: '6px',
          }}>
            <span style={{
              fontSize: '13px', fontWeight: 600, color: C.pink, textAlign: 'center',
            }}>{rank}</span>
            <input type="number" value={rankTargets[rank].sales}
              onChange={e => setRankTargets(prev => ({
                ...prev, [rank]: { ...prev[rank], sales: e.target.value },
              }))}
              placeholder="0" style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px' }}
              disabled={readOnly} />
            <input type="number" value={rankTargets[rank].visits}
              onChange={e => setRankTargets(prev => ({
                ...prev, [rank]: { ...prev[rank], visits: e.target.value },
              }))}
              placeholder="0" style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px' }}
              disabled={readOnly} />
          </div>
        ))}
      </FormSection>

      {/* 保存ボタン */}
      {!readOnly && (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '14px',
            background: saving ? C.pinkMuted : `linear-gradient(135deg, ${C.pink}, ${C.pinkLight})`,
            color: C.white, border: 'none',
            fontSize: '12px', letterSpacing: '0.15em',
            fontFamily: 'inherit', cursor: saving ? 'default' : 'pointer',
            fontWeight: 600,
          }}
        >
          {saving ? '保存中...' : saved ? '保存しました' : (saveLabel ?? '保存')}
        </button>
      )}
    </div>
  )
}

function FormSection({ accent, label, children }: {
  accent: string; label: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`,
      padding: '16px', marginBottom: '10px', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
        background: accent,
      }} />
      <div style={{ fontSize: '11px', fontWeight: 600, color: C.dark, marginBottom: '12px' }}>
        {label}
      </div>
      {children}
    </div>
  )
}
