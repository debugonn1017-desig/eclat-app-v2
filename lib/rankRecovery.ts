import type { CustomerRank, RankCriteria } from '../types'
import { calculateRankByRules, isAutoRankEligible, rankLastActualVisitDate, resolveRankRulesV2 } from './rankCalculatorV2'

export type RankOrigin = 'unknown' | 'manual' | 'auto'
export type RankSnapshot = {
  customer: { id: number; customer_name: string | null; cast_name: string | null; nomination_status: string | null;
    first_visit_date: string | null; customer_rank: CustomerRank | null; customer_rank_origin: RankOrigin; customer_rank_revision: number }
  visits: Array<{ id: number; visit_date: string; amount_spent: number | null; is_planned: boolean | null; has_douhan: boolean | null; has_after: boolean | null }>
  criteria: RankCriteria[]
  cast: { id: string; cast_tier: string | null } | null
}
export const RANK_ORIGIN_LABELS: Record<RankOrigin, string> = { unknown: '履歴なし・要確認', manual: '手動の切れた', auto: '自動判定' }

export function evaluateRankSnapshot(snapshot: RankSnapshot, review = false, today = new Date()) {
  const c = snapshot.customer
  const resolved = resolveRankRulesV2(snapshot.criteria, snapshot.cast?.id ?? null, snapshot.cast?.cast_tier ?? null)
  if (!resolved) return null // 基準の取得失敗/未設定を既定値で成功扱いしない。
  const calculationCustomer = review && c.customer_rank === '切れた' && c.customer_rank_origin !== 'manual'
    ? { ...c, customer_rank: 'C' as const, customer_rank_origin: 'auto' } : c
  const result = calculateRankByRules(calculationCustomer, snapshot.visits, resolved.rules, resolved.criteria, today)
  const lastVisitDate = rankLastActualVisitDate(snapshot.visits, today)
  const canRestore = c.customer_rank === '切れた' && c.customer_rank_origin !== 'manual' &&
    c.nomination_status === '本指名' && lastVisitDate !== null && result.recommended !== '切れた'
  return { id: String(c.id), name: c.customer_name || 'お名前未登録', castName: c.cast_name || '担当未設定',
    currentRank: c.customer_rank, origin: c.customer_rank_origin, revision: c.customer_rank_revision,
    lastVisitDate, days: lastVisitDate ? result.metrics.days_since_last_visit : null,
    recommended: result.recommended, canRestore, autoEligible: isAutoRankEligible(c),
    scope: resolved.criteria.scope_type, reasons: result.reasons, result }
}
