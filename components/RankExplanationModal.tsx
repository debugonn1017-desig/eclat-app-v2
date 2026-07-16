'use client'
// ─────────────────────────────────────────────────────────────────
//  ランク判定理由オーバーレイ
//   1顧客の V2 ランク判定結果を可視化:
//     - 推奨ランク + 現在のランク
//     - 12 項目の現在値 (metrics)
//     - 各ランクの判定結果 (S/A/B/C の通過状況)
//     - 適用されたルール (どの scope から)
// ─────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { C } from '@/lib/colors'
import { createClient } from '@/lib/supabase/client'
import {
  resolveRankRulesV2, calculateRankByRules,
} from '@/lib/rankCalculatorV2'
import type {
  Customer, RankCriteria, RankRules,
  RankConditionField,
} from '@/types'
import { RANK_FIELD_LABELS, RANK_PURPOSE_LABELS } from '@/types'

type Props = {
  open: boolean
  customer: Customer
  onClose: () => void
}

export default function RankExplanationModal({ open, customer, onClose }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [evalResult, setEvalResult] = useState<{
    recommended: string
    metrics: Record<RankConditionField, number>
    reasons: string[]
    rulesScope: 'cast' | 'tier' | 'default' | 'none'
    rulesScopeLabel: string
    // v0.3.53-E: any → RankRules (resolveRankRulesV2 の戻り値 rules と同じ既存型)
    rules: RankRules
  } | null>(null)

  useEffect(() => {
    if (!open) return
    // v0.3.53-E: 依存配列に customer.cast_name / customer.first_visit_date を追加し、
    //   顧客の切り替え・担当キャスト変更・初回来店日変更のいずれでも最新条件で再判定する。
    //   cancelled フラグは、判定中に顧客が切り替わった (effect が再実行された) 場合に
    //   古いリクエストの結果が新しい顧客の表示を上書きしないための競合ガード。
    let cancelled = false
    const run = async () => {
      setLoading(true); setError(null); setEvalResult(null)
      try {
        // ① 担当キャストとスコープ情報を取得
        let castId: string | null = null
        let castTier: string | null = null
        const castName = customer.cast_name?.trim() || null
        if (castName) {
          const { data: cast } = await supabase
            .from('profiles')
            .select('id, cast_tier')
            .eq('cast_name', castName)
            .eq('role', 'cast')
            .single()
          if (cast) {
            castId = (cast as { id: string }).id
            castTier = (cast as { cast_tier: string | null }).cast_tier ?? null
          }
        }

        // ② rank_criteria 全件
        const { data: criteriaRows } = await supabase
          .from('rank_criteria').select('*')
        const allCriteria = (criteriaRows ?? []) as RankCriteria[]

        // ③ V2 ルールを階層検索
        const v2 = resolveRankRulesV2(allCriteria, castId, castTier)
        if (!v2) {
          if (cancelled) return
          setError('この顧客に適用される V2 ルールが見つかりません。/admin/rank-criteria でルールを設定してください。')
          setLoading(false)
          return
        }
        const rulesScope: 'cast' | 'tier' | 'default' = v2.criteria.scope_type as 'cast' | 'tier' | 'default'
        const rulesScopeLabel =
          rulesScope === 'cast' ? `この顧客の担当キャスト ${castName} 専用`
          : rulesScope === 'tier' ? `${castTier} 層のルール`
          : '全店デフォルト'

        // ④ 来店履歴を取得
        const { data: visits } = await supabase
          .from('customer_visits')
          .select('visit_date, amount_spent, has_douhan, has_after')
          .eq('customer_id', customer.id)
          .order('visit_date', { ascending: true })

        // ⑤ ランク計算
        const result = calculateRankByRules(
          { first_visit_date: customer.first_visit_date },
          (visits ?? []).map(v => ({
            visit_date: (v as { visit_date: string }).visit_date,
            amount_spent: (v as { amount_spent: number | null }).amount_spent ?? 0,
            has_douhan: !!(v as { has_douhan: boolean | null }).has_douhan,
            has_after: !!(v as { has_after: boolean | null }).has_after,
          })),
          v2.rules,
          v2.criteria,
        )

        if (cancelled) return
        setEvalResult({
          recommended: result.recommended,
          metrics: result.metrics,
          reasons: result.reasons,
          rulesScope,
          rulesScopeLabel,
          rules: v2.rules,
        })
      } catch (e) {
        if (cancelled) return
        setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [open, customer.id, customer.cast_name, customer.first_visit_date, supabase])

  if (!open) return null

  const currentRank = customer.customer_rank
  const recommended = evalResult?.recommended

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: 12,
        width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* ヘッダー */}
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>💎 ランク判定の理由</span>
          <span style={{ fontSize: 10, color: C.pinkMuted }}>— {customer.customer_name}</span>
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            fontSize: 22, color: C.pinkMuted, cursor: 'pointer',
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          {loading && (
            <div style={{ padding: 40, textAlign: 'center', color: C.pinkMuted, fontSize: 12 }}>
              判定中...
            </div>
          )}
          {error && (
            <div style={{
              padding: 12, background: '#FCEBEB', border: '1px solid #C53030',
              borderRadius: 8, fontSize: 11, color: '#C53030',
            }}>⚠ {error}</div>
          )}

          {evalResult && (
            <>
              {/* ランク比較 */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 16, padding: '14px 0',
                background: C.tagBg2, borderRadius: 10, marginBottom: 14,
              }}>
                <RankBadge rank={currentRank} label="現在" />
                <span style={{ fontSize: 20, color: C.pinkMuted }}>→</span>
                <RankBadge rank={recommended as string} label="推奨" highlighted={recommended !== currentRank} />
              </div>

              <div style={{ fontSize: 11, color: C.pinkMuted, marginBottom: 14, textAlign: 'center' }}>
                適用ルール: <strong style={{ color: C.dark }}>{evalResult.rulesScopeLabel}</strong>
              </div>

              {/* 12 項目の現在値 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
                  📊 この顧客の現在値 (全12項目)
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6,
                  fontSize: 11,
                }}>
                  {(Object.keys(RANK_FIELD_LABELS) as Array<keyof typeof RANK_FIELD_LABELS>).map(field => {
                    const meta = RANK_FIELD_LABELS[field]
                    const val = evalResult.metrics[field as RankConditionField]
                    return (
                      <div key={field} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 8px', background: C.miniBg, borderRadius: 4,
                      }}>
                        <span style={{ color: C.pinkMuted, flex: 1 }}>{meta.label}</span>
                        <span style={{ color: C.dark, fontWeight: 500 }}>
                          {formatValue(val, meta.unit)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 評価過程 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
                  🔍 評価過程
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {evalResult.reasons.map((r, i) => (
                    <div key={i} style={{
                      fontSize: 11, padding: '6px 10px',
                      background: r.includes('✓') ? '#E1F5EE' : C.miniBg,
                      borderRadius: 4,
                      color: r.includes('✓') ? '#0F6E56' : C.dark,
                      fontWeight: r.includes('✓') ? 600 : 400,
                    }}>{r}</div>
                  ))}
                </div>
              </div>

              {/* 適用ルール詳細 */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
                  ⚙️ 適用ルール詳細
                </div>
                {(['S', 'A', 'B'] as const).map(rank => {
                  const rule = evalResult.rules[rank]
                  if (!rule) return null
                  // v0.3.53-E: rules が RankRules 型になったため as キャスト不要
                  const active = rule.conditions.filter(c => c.enabled)
                  return (
                    <div key={rank} style={{
                      marginBottom: 8, padding: '8px 12px',
                      background: '#FFFEFE', border: `1px solid ${C.border}`, borderRadius: 6,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <RankBadge rank={rank} label={null} compact />
                        <span style={{ fontSize: 11, color: C.dark, fontWeight: 500 }}>
                          {RANK_PURPOSE_LABELS[rank]}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 9, color: C.pinkMuted }}>
                          {rule.combine === 'all' ? '全部 (AND)' :
                           rule.combine === 'any' ? 'どれか (OR)' :
                           `${rule.min_match_count ?? 1} 個以上`}
                        </span>
                      </div>
                      {active.length === 0 ? (
                        <p style={{ fontSize: 10, color: C.pinkMuted, margin: 0 }}>
                          ON の条件なし → スキップ
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {active.map(c => {
                            const meta = RANK_FIELD_LABELS[c.field as RankConditionField]
                            const val = evalResult.metrics[c.field as RankConditionField]
                            const passed = evalOp(val, c.op, c.value)
                            return (
                              <div key={c.field} style={{
                                fontSize: 10, padding: '3px 6px',
                                background: passed ? '#E1F5EE' : '#FCEBEB',
                                borderRadius: 3,
                                color: passed ? '#0F6E56' : '#C53030',
                              }}>
                                {passed ? '✓' : '✗'} {meta.label} {opLabel(c.op)} {c.value}{meta.unit}
                                <span style={{ marginLeft: 6, color: C.pinkMuted }}>
                                  (現在: {formatValue(val, meta.unit)})
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function evalOp(left: number, op: string, right: number): boolean {
  switch (op) {
    case 'gte': return left >= right
    case 'lte': return left <= right
    case 'gt':  return left >  right
    case 'lt':  return left <  right
    default: return false
  }
}

function opLabel(op: string): string {
  return op === 'gte' ? '≥' : op === 'lte' ? '≤' : op === 'gt' ? '>' : '<'
}

function formatValue(n: number | undefined, unit: string): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (unit === '円') return `¥${Math.round(n).toLocaleString()}`
  if (unit === '%') return `${n.toFixed(1)}%`
  if (unit === '倍') return `${n.toFixed(2)}倍`
  return `${n.toLocaleString()}${unit}`
}

function RankBadge({ rank, label, highlighted, compact }: {
  rank: string | null | undefined
  label: string | null
  highlighted?: boolean
  compact?: boolean
}) {
  const colors: Record<string, string> = {
    S: '#D4A017', A: '#5B8DBE', B: '#0F6E56', C: '#999',
  }
  const bg = rank ? colors[rank] : '#CCC'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      {label && <span style={{ fontSize: 9, color: C.pinkMuted }}>{label}</span>}
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: compact ? 24 : 36, height: compact ? 24 : 36, borderRadius: '50%',
        background: bg, color: '#FFF',
        fontSize: compact ? 12 : 18, fontWeight: 700,
        boxShadow: highlighted ? '0 0 0 3px rgba(232,135,155,0.5)' : 'none',
      }}>{rank ?? '—'}</span>
    </div>
  )
}
