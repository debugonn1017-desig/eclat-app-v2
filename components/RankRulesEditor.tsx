'use client'
// ─────────────────────────────────────────────────────────────────
//  ランクルール編集 UI (V2)
//   - 編集中の scope (default/tier/cast) を受け取る
//   - rank_criteria.rank_rules JSON を読み書き
//   - S/A/B 各カードに 12 項目 × ON/OFF を表示
// ─────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { C } from '@/lib/colors'
import { createClient } from '@/lib/supabase/client'
import { invalidateAllCache } from '@/lib/cache'
import { makeDefaultRankRules } from '@/lib/rankCalculatorV2'
import {
  RANK_FIELD_LABELS, RANK_FIELD_ORDER, RANK_PURPOSE_LABELS,
  type RankRules, type RankRule, type RankCondition,
  type RankConditionField, type RankConditionOp, type RankRuleCombine,
} from '@/types'

type Scope = { type: 'default' | 'tier' | 'cast'; id: string | null }

export default function RankRulesEditor({
  scope, criteriaId, initialRules, onSaved,
}: {
  scope: Scope
  /** 該当 scope に rank_criteria 行があれば id, なければ null (新規作成扱い) */
  criteriaId: string | null
  initialRules: RankRules | null
  onSaved: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [rules, setRules] = useState<RankRules>(initialRules ?? makeDefaultRankRules())
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRules(initialRules ?? makeDefaultRankRules())
    setSavedAt(null)
    setError(null)
  }, [scope.type, scope.id, criteriaId, initialRules])

  const updateRule = (rank: 'S' | 'A' | 'B', mut: (r: RankRule) => RankRule) => {
    setRules(prev => ({ ...prev, [rank]: mut(prev[rank]) }))
  }

  const updateCondition = (rank: 'S' | 'A' | 'B', field: RankConditionField, mut: (c: RankCondition) => RankCondition) => {
    updateRule(rank, r => ({
      ...r,
      conditions: r.conditions.map(c => c.field === field ? mut(c) : c),
    }))
  }

  // ─── 保存 ──────────────────────────────────────────────
  const handleSave = async () => {
    if (saving) return
    setSaving(true); setError(null)
    try {
      if (criteriaId) {
        // 既存行を update
        const { error } = await supabase
          .from('rank_criteria')
          .update({ rank_rules: rules })
          .eq('id', criteriaId)
        if (error) throw error
      } else {
        // 新規行を insert (V2 のみ作成、V1 カラムはデフォルト)
        const { error } = await supabase
          .from('rank_criteria')
          .insert([{
            scope_type: scope.type,
            scope_id: scope.id,
            rank_rules: rules,
            // V1 カラムは最低限ダミー値
            monthly_enabled: false, cumulative_enabled: false,
            monthly_s_threshold: 0, monthly_a_threshold: 0, monthly_b_threshold: 0,
            cumulative_s_threshold: 0, cumulative_a_threshold: 0, cumulative_b_threshold: 0,
            monthly_period_months: 3,
            combine_strategy: 'higher',
            frequency_enabled: false, frequency_high_threshold: 0, frequency_low_threshold: 0,
            douhan_rate_enabled: false, douhan_rate_threshold: 0,
            trend_enabled: false, trend_up_multiplier: 1.5, trend_down_multiplier: 0.5,
            unit_price_enabled: false, unit_price_threshold: 0,
            tenure_enabled: false, tenure_threshold_months: 0,
            after_rate_enabled: false, after_rate_threshold: 0,
            inactive_enabled: false, inactive_warning_days: 60, inactive_force_c_days: 120,
            max_adjustment_steps: 2,
          }])
        if (error) throw error
      }
      setSavedAt(new Date())
      invalidateAllCache()
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: C.white, border: `2px solid ${C.pink}`, borderRadius: 12,
      padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>
          ✨ 新方式 — ランクごとの判定ルール
        </span>
        <span style={{
          fontSize: 9, padding: '2px 6px', background: C.tagBg2, color: '#72243E', borderRadius: 4, fontWeight: 600,
        }}>V2 推奨</span>
        {savedAt && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#0F6E56' }}>
            ✓ {savedAt.toLocaleTimeString('ja-JP')} に保存
          </span>
        )}
      </div>
      <p style={{ fontSize: 10, color: C.pinkMuted, margin: '0 0 12px 0', lineHeight: 1.6 }}>
        S → A → B の順で評価して、最初に該当したランクに確定します。C は「いずれにも該当しない場合」自動。<br/>
        ✓ OFF の項目は判定から除外（後で ON にすれば反映）。
      </p>

      {(['S', 'A', 'B'] as const).map(rank => (
        <RankCard
          key={rank}
          rank={rank}
          rule={rules[rank]}
          onChangeCombine={(combine) => updateRule(rank, r => ({ ...r, combine }))}
          onChangeMinCount={(n) => updateRule(rank, r => ({ ...r, min_match_count: n }))}
          onToggle={(field, enabled) => updateCondition(rank, field, c => ({ ...c, enabled }))}
          onChangeOp={(field, op) => updateCondition(rank, field, c => ({ ...c, op }))}
          onChangeValue={(field, value) => updateCondition(rank, field, c => ({ ...c, value }))}
        />
      ))}

      {/* C カード (説明のみ) */}
      <div style={{
        background: C.miniBg, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: '10px 14px', marginBottom: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.dark }}>
          ⚪ C ランク （優先度低い）
        </div>
        <div style={{ fontSize: 10, color: C.pinkMuted, marginTop: 4 }}>
          S/A/B のどれにも該当しなかった顧客が自動で C ランクになります。
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 11, color: '#C53030', textAlign: 'center', marginBottom: 8 }}>
          ⚠ {error}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%', padding: '12px',
          background: saving ? '#DDD' : C.pink,
          color: '#FFF', border: 'none', borderRadius: 8,
          fontSize: 13, fontWeight: 600, letterSpacing: '0.1em',
          cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        }}
      >
        {saving ? '保存中...' : '💾 このスコープのルールを保存'}
      </button>
    </div>
  )
}

// ─── 個別ランクカード ───────────────────────────────────────
function RankCard({
  rank, rule,
  onChangeCombine, onChangeMinCount,
  onToggle, onChangeOp, onChangeValue,
}: {
  rank: 'S' | 'A' | 'B'
  rule: RankRule
  onChangeCombine: (c: RankRuleCombine) => void
  onChangeMinCount: (n: number) => void
  onToggle: (f: RankConditionField, enabled: boolean) => void
  onChangeOp: (f: RankConditionField, op: RankConditionOp) => void
  onChangeValue: (f: RankConditionField, v: number) => void
}) {
  const rankColor =
    rank === 'S' ? '#D4A017' :
    rank === 'A' ? '#5B8DBE' :
                   '#0F6E56'
  const rankEmoji = rank === 'S' ? '💎' : rank === 'A' ? '⭐' : '🌷'
  const enabledCount = rule.conditions.filter(c => c.enabled).length

  return (
    <div style={{
      background: '#FFFEFE', border: `2px solid ${rankColor}33`, borderRadius: 10,
      padding: '12px 14px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 13, fontWeight: 700, color: '#FFF',
          background: rankColor, padding: '4px 10px', borderRadius: 6,
        }}>{rankEmoji} {rank}</span>
        <span style={{ fontSize: 11, color: C.dark, fontWeight: 500 }}>
          {RANK_PURPOSE_LABELS[rank]}
        </span>
        <span style={{ fontSize: 9, color: C.pinkMuted, marginLeft: 8 }}>
          ✓ {enabledCount} 項目 ON
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: C.pinkMuted }}>結合:</span>
          <select
            value={rule.combine}
            onChange={e => onChangeCombine(e.target.value as RankRuleCombine)}
            style={{
              fontSize: 11, padding: '3px 6px',
              border: `1px solid ${C.border}`, borderRadius: 4,
              fontFamily: 'inherit', background: '#FFF',
            }}
          >
            <option value="all">全部 (AND)</option>
            <option value="any">どれか (OR)</option>
            <option value="count">N 個以上</option>
          </select>
          {rule.combine === 'count' && (
            <input
              type="number" min={1}
              value={rule.min_match_count ?? 1}
              onChange={e => onChangeMinCount(Math.max(1, Number(e.target.value) || 1))}
              style={{
                width: 44, fontSize: 11, padding: '3px 4px',
                border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: 'inherit',
              }}
            />
          )}
        </div>
      </div>

      {/* 12 項目を全部表示 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {RANK_FIELD_ORDER.map(field => {
          const cond = rule.conditions.find(c => c.field === field)
          if (!cond) return null
          return (
            <ConditionRow
              key={field}
              cond={cond}
              onToggle={(e) => onToggle(field, e)}
              onChangeOp={(op) => onChangeOp(field, op)}
              onChangeValue={(v) => onChangeValue(field, v)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── 条件行 ─────────────────────────────────────────────────
function ConditionRow({
  cond, onToggle, onChangeOp, onChangeValue,
}: {
  cond: RankCondition
  onToggle: (e: boolean) => void
  onChangeOp: (op: RankConditionOp) => void
  onChangeValue: (v: number) => void
}) {
  const meta = RANK_FIELD_LABELS[cond.field]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 6px', borderRadius: 4,
      background: cond.enabled ? C.tagBg2 : 'transparent',
      opacity: cond.enabled ? 1 : 0.7,
    }}>
      <input
        type="checkbox"
        checked={cond.enabled}
        onChange={e => onToggle(e.target.checked)}
        style={{ accentColor: C.pink, cursor: 'pointer' }}
      />
      <span style={{
        flex: 1, fontSize: 11,
        color: cond.enabled ? C.dark : C.pinkMuted,
        fontWeight: cond.enabled ? 500 : 400,
      }}>{meta.label}</span>
      <select
        value={cond.op}
        onChange={e => onChangeOp(e.target.value as RankConditionOp)}
        disabled={!cond.enabled}
        style={{
          fontSize: 11, padding: '2px 4px',
          border: `1px solid ${C.border}`, borderRadius: 4,
          fontFamily: 'inherit', background: '#FFF',
          cursor: cond.enabled ? 'pointer' : 'not-allowed',
        }}
      >
        <option value="gte">≥</option>
        <option value="lte">≤</option>
        <option value="gt">&gt;</option>
        <option value="lt">&lt;</option>
      </select>
      <input
        type="number"
        value={cond.value}
        onChange={e => onChangeValue(Number(e.target.value) || 0)}
        disabled={!cond.enabled}
        step={meta.unit === '%' ? 1 : meta.unit === '倍' ? 0.1 : 1000}
        style={{
          width: 110, fontSize: 11, padding: '3px 6px',
          border: `1px solid ${C.border}`, borderRadius: 4,
          fontFamily: 'inherit', textAlign: 'right',
          background: cond.enabled ? '#FFF' : C.rankBadge,
        }}
      />
      <span style={{ fontSize: 10, color: C.pinkMuted, minWidth: 28 }}>
        {meta.unit}
      </span>
    </div>
  )
}
