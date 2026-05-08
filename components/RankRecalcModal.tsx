'use client'
// ─────────────────────────────────────────────────────────────────
//  RankRecalcModal — 本指名顧客のランクを事実から再計算するモーダル
// ─────────────────────────────────────────────────────────────────
//  使い方:
//    <RankRecalcModal
//      open={open}
//      castId={castId}
//      castName={castName}
//      onClose={() => setOpen(false)}
//      onApplied={() => refetchCustomers()}
//    />
//
//  動き:
//    1. open=true になったら rank_criteria と本指名顧客 + 来店履歴を fetch
//    2. lib/rankCalculator で各顧客の推奨ランクと判定理由を出す
//    3. ユーザーは行ごとに「反映」 or 下の「変更がある全員に一括反映」を押せる
//    4. 反映時は customers.customer_rank を直接 update
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo } from 'react'
import { C } from '@/lib/colors'
import { createClient } from '@/lib/supabase/client'
import {
  calculateRecommendedRank,
  resolveRankCriteria,
} from '@/lib/rankCalculator'
import type {
  CustomerRank,
  RankCriteria,
  RankCalculationResult,
} from '@/types'

type Props = {
  open: boolean
  castId: string
  castName: string
  /** キャストの層名（A層 / B層 等）。階層検索で使う。 */
  castTier?: string | null
  onClose: () => void
  /** 反映が起きた後、親側でデータを再取得するためのコールバック */
  onApplied?: () => void
}

type Row = {
  customerId: string
  customerName: string
  currentRank: CustomerRank | null
  result: RankCalculationResult
}

const RANK_COLOR: Record<CustomerRank, string> = {
  S: '#D4A017',
  A: '#B25575',
  B: '#7A4060',
  C: '#999999',
}

export default function RankRecalcModal({
  open,
  castId,
  castName,
  castTier = null,
  onClose,
  onApplied,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [applying, setApplying] = useState<Set<string>>(new Set())
  const [bulkApplying, setBulkApplying] = useState(false)
  const [showAll, setShowAll] = useState(false) // false なら「変更ありのみ」表示

  // ─── データ取得 ─────────────────────────────────────────────
  useEffect(() => {
    if (!open || !castId) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const supabase = createClient()

        // 1) ランク基準を「全行」取得（階層検索のため）
        //    cast 個別 > 層別 > 全店デフォルト の優先順
        const { data: criteriaRows, error: cErr } = await supabase
          .from('rank_criteria')
          .select('*')
        if (cErr) {
          console.warn('[RankRecalcModal] rank_criteria fetch error:', cErr)
        }
        const allCriteria = (criteriaRows ?? []) as RankCriteria[]
        // このキャスト + その層に当てはまる基準を1つに確定
        const resolved = resolveRankCriteria(allCriteria, castId, castTier)
        const criteria: RankCriteria = resolved ?? getDefaultCriteria()
        if (!resolved) {
          console.warn('[RankRecalcModal] criteria が取得できなかったためコード内デフォルトで動作')
        }

        // 2) このキャスト担当の本指名顧客を取得
        //    cast_name で結びつくのが現状の構造
        if (!castName) {
          throw new Error('キャスト名が空です（ページのデータがまだロード中の可能性）')
        }
        const { data: customers, error: custErr } = await supabase
          .from('customers')
          .select('id, customer_name, customer_rank, first_visit_date, nomination_status, cast_name')
          .eq('cast_name', castName)
          .eq('nomination_status', '本指名')
        if (custErr) {
          console.error('[RankRecalcModal] customers fetch error:', custErr)
          throw new Error(`顧客取得失敗: ${custErr.message ?? JSON.stringify(custErr)}`)
        }

        const customerIds = (customers ?? []).map(c => c.id)
        if (customerIds.length === 0) {
          if (!cancelled) {
            setRows([])
            setLoading(false)
          }
          return
        }

        // 3) 全本指名顧客の来店履歴を一括取得
        const { data: visits, error: vErr } = await supabase
          .from('customer_visits')
          .select('customer_id, visit_date, amount_spent, has_douhan, has_after')
          .in('customer_id', customerIds)
        if (vErr) {
          console.error('[RankRecalcModal] visits fetch error:', vErr)
          throw new Error(`来店履歴取得失敗: ${vErr.message ?? JSON.stringify(vErr)}`)
        }

        const visitsByCustomer = new Map<string, typeof visits>()
        for (const v of visits ?? []) {
          if (!visitsByCustomer.has(v.customer_id)) {
            visitsByCustomer.set(v.customer_id, [])
          }
          visitsByCustomer.get(v.customer_id)!.push(v)
        }

        // 4) 各顧客で推奨ランクを計算
        const computed: Row[] = (customers ?? []).map(c => {
          const cVisits = visitsByCustomer.get(c.id) ?? []
          const result = calculateRecommendedRank(
            {
              id: c.id,
              customer_rank: c.customer_rank as CustomerRank | null,
              first_visit_date: c.first_visit_date,
            },
            cVisits.map(v => ({
              visit_date: v.visit_date,
              amount_spent: v.amount_spent ?? 0,
              has_douhan: !!v.has_douhan,
              has_after: !!v.has_after,
            })),
            criteria
          )
          return {
            customerId: c.id,
            customerName: c.customer_name ?? '(無名)',
            currentRank: (c.customer_rank as CustomerRank | null) ?? null,
            result,
          }
        })

        // ランク差分が大きい順に並べる（変更ありを上に）
        computed.sort((a, b) => {
          const aDiff = a.currentRank !== a.result.recommended ? 1 : 0
          const bDiff = b.currentRank !== b.result.recommended ? 1 : 0
          if (aDiff !== bDiff) return bDiff - aDiff
          return a.customerName.localeCompare(b.customerName, 'ja')
        })

        if (!cancelled) {
          setRows(computed)
          setLoading(false)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          // Supabase errors are plain objects, not Error instances. Surface fully.
          let msg = '取得に失敗しました'
          if (e instanceof Error) msg = e.message
          else if (e && typeof e === 'object') {
            const obj = e as { message?: string; details?: string; hint?: string; code?: string }
            msg = obj.message ?? obj.details ?? obj.hint ?? JSON.stringify(e)
          } else if (typeof e === 'string') msg = e
          console.error('[RankRecalcModal] load error:', e)
          setError(msg)
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open, castId, castName])

  /** rank_criteria が DB で読めなかったときに使うコード内デフォルト */
  function getDefaultCriteria(): RankCriteria {
    return {
      id: 'default',
      scope_type: 'default',
      scope_id: null,
      monthly_enabled: true,
      monthly_s_threshold: 100000,
      monthly_a_threshold: 50000,
      monthly_b_threshold: 20000,
      monthly_period_months: 3,
      cumulative_enabled: true,
      cumulative_s_threshold: 5000000,
      cumulative_a_threshold: 2000000,
      cumulative_b_threshold: 1000000,
      combine_strategy: 'lower',
      frequency_enabled: true,
      frequency_high_threshold: 4,
      frequency_low_threshold: 2,
      douhan_rate_enabled: true,
      douhan_rate_threshold: 30,
      trend_enabled: true,
      trend_up_multiplier: 1.5,
      trend_down_multiplier: 0.5,
      unit_price_enabled: false,
      unit_price_threshold: 50000,
      tenure_enabled: false,
      tenure_threshold_months: 12,
      after_rate_enabled: false,
      after_rate_threshold: 20,
      inactive_enabled: true,
      inactive_warning_days: 30,
      inactive_force_c_days: 90,
      max_adjustment_steps: 2,
    }
  }

  // ─── 変更がある行・無い行を分ける ──────────────────────────
  const changedRows = useMemo(
    () => rows.filter(r => r.currentRank !== r.result.recommended),
    [rows]
  )
  const visibleRows = showAll ? rows : changedRows

  // ─── 個別反映 ────────────────────────────────────────────
  const applyOne = async (row: Row) => {
    if (applying.has(row.customerId)) return
    setApplying(prev => new Set(prev).add(row.customerId))
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('customers')
        .update({ customer_rank: row.result.recommended })
        .eq('id', row.customerId)
      if (error) throw error

      // ローカル更新
      setRows(prev =>
        prev.map(r =>
          r.customerId === row.customerId
            ? { ...r, currentRank: row.result.recommended }
            : r
        )
      )
      onApplied?.()
    } catch (e) {
      alert('反映に失敗しました: ' + (e instanceof Error ? e.message : ''))
    } finally {
      setApplying(prev => {
        const next = new Set(prev)
        next.delete(row.customerId)
        return next
      })
    }
  }

  // ─── 一括反映 ────────────────────────────────────────────
  const applyAll = async () => {
    if (changedRows.length === 0) return
    const ok = window.confirm(
      `変更がある ${changedRows.length} 名のランクを推奨値に書き換えます。\nよろしいですか？`
    )
    if (!ok) return

    setBulkApplying(true)
    try {
      const supabase = createClient()
      // 並列で update（少数なので一気に投げて OK）
      const results = await Promise.all(
        changedRows.map(r =>
          supabase
            .from('customers')
            .update({ customer_rank: r.result.recommended })
            .eq('id', r.customerId)
        )
      )
      const firstError = results.find(x => x.error)?.error
      if (firstError) throw firstError

      // ローカル更新
      setRows(prev =>
        prev.map(r => {
          const updated = changedRows.find(x => x.customerId === r.customerId)
          return updated ? { ...r, currentRank: updated.result.recommended } : r
        })
      )
      onApplied?.()
    } catch (e) {
      alert('一括反映に失敗しました: ' + (e instanceof Error ? e.message : ''))
    } finally {
      setBulkApplying(false)
    }
  }

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFF', maxWidth: '560px', width: '100%',
          maxHeight: '90vh', overflow: 'auto',
          borderRadius: 16, padding: '20px 18px',
          fontFamily: 'inherit',
        }}
      >
        {/* ヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '14px', borderBottom: `1px solid ${C.border}`, paddingBottom: '10px',
        }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: C.pink, marginBottom: 2 }}>
              📊 RANK RE-EVALUATION
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: C.dark }}>
              {castName} の本指名顧客
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              fontSize: '20px', cursor: 'pointer', color: C.pinkMuted,
            }}
          >×</button>
        </div>

        {/* ロード中 / エラー */}
        {loading && <div style={{ padding: '40px 0', textAlign: 'center', color: C.pinkMuted }}>計算中…</div>}
        {error && <div style={{ padding: '12px', color: C.danger, background: '#FFF5F5' }}>{error}</div>}

        {/* 本体 */}
        {!loading && !error && (
          <>
            {/* 集計 + フィルタ */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '12px', fontSize: '12px', color: C.pinkMuted,
            }}>
              <div>
                対象 <strong style={{ color: C.dark }}>{rows.length}</strong> 名 ／
                変更あり <strong style={{ color: C.pink }}>{changedRows.length}</strong> 名
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={e => setShowAll(e.target.checked)}
                />
                変更なしも表示
              </label>
            </div>

            {/* 行リスト */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {visibleRows.length === 0 && (
                <div style={{
                  textAlign: 'center', padding: '30px 0',
                  color: C.pinkMuted, fontSize: '13px',
                }}>
                  {showAll ? '対象顧客がいません' : '変更が必要な顧客はいません ✨'}
                </div>
              )}

              {visibleRows.map(row => {
                const changed = row.currentRank !== row.result.recommended
                const direction =
                  !changed
                    ? null
                    : (row.currentRank ?? 'C') < row.result.recommended
                      ? 'up'
                      : 'down'

                return (
                  <div
                    key={row.customerId}
                    style={{
                      border: `1px solid ${changed ? 'rgba(232,135,155,0.3)' : C.border}`,
                      background: changed ? 'rgba(232,135,155,0.04)' : '#FAFAF9',
                      padding: '10px 12px', borderRadius: 8,
                    }}
                  >
                    {/* 1段目: 名前 + ランク変化 + 反映ボタン */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: C.dark, flex: 1 }}>
                        {direction === 'up' ? '🔼 ' : direction === 'down' ? '🔽 ' : ''}
                        {row.customerName}
                      </span>
                      <span style={{ fontSize: '11px', color: C.pinkMuted }}>現在</span>
                      <span style={{
                        fontSize: '12px', fontWeight: 700,
                        color: row.currentRank ? RANK_COLOR[row.currentRank] : C.pinkMuted,
                        minWidth: 18, textAlign: 'center',
                      }}>
                        {row.currentRank ?? '—'}
                      </span>
                      <span style={{ fontSize: '11px', color: C.pinkMuted }}>→</span>
                      <span style={{
                        fontSize: '13px', fontWeight: 800,
                        color: RANK_COLOR[row.result.recommended],
                        minWidth: 18, textAlign: 'center',
                      }}>
                        {row.result.recommended}
                      </span>
                      {changed ? (
                        <button
                          onClick={() => applyOne(row)}
                          disabled={applying.has(row.customerId)}
                          style={{
                            fontSize: '10px', letterSpacing: '0.1em',
                            padding: '4px 10px', borderRadius: 6,
                            background: C.pink, color: '#FFF',
                            border: 'none', cursor: applying.has(row.customerId) ? 'wait' : 'pointer',
                            fontFamily: 'inherit', opacity: applying.has(row.customerId) ? 0.6 : 1,
                          }}
                        >
                          {applying.has(row.customerId) ? '…' : '反映'}
                        </button>
                      ) : (
                        <span style={{
                          fontSize: '10px', color: C.pinkMuted,
                          padding: '4px 8px',
                        }}>✓</span>
                      )}
                    </div>

                    {/* 2段目: 判定理由（簡潔に） */}
                    <div style={{
                      marginTop: 6, fontSize: '11px', color: C.pinkMuted,
                      display: 'flex', flexDirection: 'column', gap: 2,
                    }}>
                      {row.result.reasons
                        .filter(r => r.kind !== 'base' || r.label.includes('合算') || r.label.includes('フォールバック'))
                        .map((r, i) => (
                          <div key={i} style={{
                            color: r.delta > 0 ? '#229954' : r.delta < 0 ? '#C0392B' : C.pinkMuted,
                          }}>
                            {r.label}
                          </div>
                        ))}
                    </div>

                    {/* 3段目: 中間メトリクス（数字の根拠）*/}
                    <div style={{
                      marginTop: 4, fontSize: '10px', color: C.pinkMuted,
                      paddingTop: 4, borderTop: `1px dashed ${C.border}`,
                    }}>
                      累計 {Math.round(row.result.metrics.totalSpent / 10000).toLocaleString()}万円 ／
                      月平均 {Math.round(row.result.metrics.monthlyAverage / 1000) / 10}万円 ／
                      来店 {row.result.metrics.visitCountTotal}回 ／
                      同伴 {row.result.metrics.douhanRate.toFixed(0)}%
                      {row.result.metrics.daysSinceLastVisit !== null && (
                        <> ／ 最終 {row.result.metrics.daysSinceLastVisit}日前</>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* フッター: 一括反映 */}
            {changedRows.length > 0 && (
              <div style={{
                marginTop: '14px', paddingTop: '12px',
                borderTop: `1px solid ${C.border}`,
                display: 'flex', gap: '10px', alignItems: 'center',
              }}>
                <button
                  onClick={applyAll}
                  disabled={bulkApplying}
                  style={{
                    flex: 1, fontSize: '13px', fontWeight: 700,
                    padding: '10px', borderRadius: 8,
                    background: C.pink, color: '#FFF',
                    border: 'none', cursor: bulkApplying ? 'wait' : 'pointer',
                    fontFamily: 'inherit', opacity: bulkApplying ? 0.6 : 1,
                  }}
                >
                  {bulkApplying ? '反映中…' : `変更がある ${changedRows.length} 名に一括反映`}
                </button>
                <button
                  onClick={onClose}
                  style={{
                    fontSize: '12px', padding: '10px 16px', borderRadius: 8,
                    background: 'transparent', color: C.dark,
                    border: `1px solid ${C.border}`, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  閉じる
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
