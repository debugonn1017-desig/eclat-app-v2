// ─────────────────────────────────────────────────────────────────
//  顧客ランク自動判定 V2 — ランクごとに別ルール方式
// ─────────────────────────────────────────────────────────────────
//  使い方:
//    const resolved = resolveRankRulesV2(allCriteria, castId, tier)
//    if (resolved) {
//      const result = calculateRankByRules(customer, visits, resolved.rules, resolved.criteria)
//    } else {
//      // V1 にフォールバック (lib/rankCalculator.ts)
//    }
//
//  方針:
//    1. 12 項目の metrics を計算 (visits + customer から純粋関数)
//    2. S → A → B の順で各ランクのルールを評価
//    3. 「enabled=true の条件」だけ見る、combine (all/any/count) で結合
//    4. 最初に通ったランクを採用、いずれも通らなければ C
// ─────────────────────────────────────────────────────────────────

import type {
  CustomerRank, RankCriteria, RankRule, RankRules,
  RankCondition, RankConditionField, RankConditionOp,
} from '@/types'

export type RankMetrics = Record<RankConditionField, number>

export type RankResultV2 = {
  recommended: CustomerRank
  metrics: RankMetrics
  matchedRank: 'S' | 'A' | 'B' | null
  matchedConditions: RankCondition[]
  reasons: string[]
}

// ─── 日付ヘルパ ──────────────────────────────────────────────────
function parseJSTDate(s: string): Date {
  // 'YYYY-MM-DD' or ISO → ローカル0:00として扱う
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(s)
}
function diffDays(a: Date, b: Date): number {
  const MS = 1000 * 60 * 60 * 24
  const aS = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const bS = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.floor((aS.getTime() - bS.getTime()) / MS)
}

// ─── Metrics 計算 ────────────────────────────────────────────────
export function computeMetrics(
  customer: { first_visit_date?: string | null },
  visits: Array<{ visit_date: string; amount_spent: number | null; has_douhan?: boolean | null; has_after?: boolean | null }>,
  criteria: Pick<RankCriteria, 'monthly_period_months'>,
  today: Date = new Date(),
): RankMetrics {
  const N = Math.max(1, criteria.monthly_period_months || 3)

  // amount_spent > 0 の visit だけ採用 (場内チェック等のゼロ円除外)
  const paid = visits
    .filter(v => (Number(v.amount_spent) || 0) > 0)
    .map(v => ({ ...v, _d: parseJSTDate(v.visit_date) }))
    .sort((a, b) => a._d.getTime() - b._d.getTime())

  const cumulativeSales = paid.reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
  const cumulativeVisits = paid.length
  const unitPrice = cumulativeVisits > 0 ? cumulativeSales / cumulativeVisits : 0
  const douhanCount = paid.filter(v => v.has_douhan === true).length
  const afterCount  = paid.filter(v => v.has_after === true).length
  const douhanRate  = cumulativeVisits > 0 ? (douhanCount / cumulativeVisits) * 100 : 0
  const afterRate   = cumulativeVisits > 0 ? (afterCount  / cumulativeVisits) * 100 : 0

  // 直近 N ヶ月の合計と平均
  const Ndays = N * 30
  const cutN = new Date(today.getTime() - Ndays * 24 * 60 * 60 * 1000)
  const recentN = paid.filter(v => v._d >= cutN)
  const recentSales = recentN.reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
  const monthlyAvgSales  = recentSales / N
  const monthlyAvgVisits = recentN.length / N

  // 継続月数 (first_visit_date or 最初の visit から today まで)
  let tenureMonths = 0
  const first = customer.first_visit_date
    ? parseJSTDate(customer.first_visit_date)
    : (paid[0]?._d ?? null)
  if (first) {
    const days = diffDays(today, first)
    tenureMonths = Math.max(0, Math.floor(days / 30))
  }

  // 最終来店からの日数 (来店なしは大きい数 9999)
  const lastV = paid[paid.length - 1]
  const daysSinceLastVisit = lastV ? Math.max(0, diffDays(today, lastV._d)) : 9999

  // 直近 3 ヶ月 / 前 3 ヶ月の売上比
  const D90 = 90 * 24 * 60 * 60 * 1000
  const D180 = 180 * 24 * 60 * 60 * 1000
  const cut90 = new Date(today.getTime() - D90)
  const cut180 = new Date(today.getTime() - D180)
  const last3 = paid.filter(v => v._d >= cut90)
    .reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
  const prev3 = paid.filter(v => v._d >= cut180 && v._d < cut90)
    .reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
  const recentTrendRatio = prev3 > 0 ? last3 / prev3 : 0

  return {
    cumulative_sales:      cumulativeSales,
    monthly_avg_sales:     Math.round(monthlyAvgSales),
    unit_price:            Math.round(unitPrice),
    cumulative_visits:     cumulativeVisits,
    monthly_avg_visits:    Math.round(monthlyAvgVisits * 10) / 10,
    tenure_months:         tenureMonths,
    douhan_count:          douhanCount,
    douhan_rate:           Math.round(douhanRate * 10) / 10,
    after_count:           afterCount,
    after_rate:            Math.round(afterRate * 10) / 10,
    days_since_last_visit: daysSinceLastVisit,
    recent_trend_ratio:    Math.round(recentTrendRatio * 100) / 100,
  }
}

// ─── 単一条件の評価 ──────────────────────────────────────────────
function evalOp(left: number, op: RankConditionOp, right: number): boolean {
  switch (op) {
    case 'gte': return left >= right
    case 'lte': return left <= right
    case 'gt':  return left >  right
    case 'lt':  return left <  right
  }
}

// ─── ランクルール評価 ────────────────────────────────────────────
function evaluateRule(rule: RankRule, metrics: RankMetrics): {
  passed: boolean
  matched: RankCondition[]
  activeCount: number
} {
  const active = (rule.conditions ?? []).filter(c => c.enabled)
  if (active.length === 0) return { passed: false, matched: [], activeCount: 0 }
  const matched = active.filter(c => evalOp(metrics[c.field] ?? 0, c.op, c.value))
  let passed = false
  switch (rule.combine) {
    case 'all':   passed = matched.length === active.length; break
    case 'any':   passed = matched.length >= 1; break
    case 'count': passed = matched.length >= Math.max(1, rule.min_match_count ?? 1); break
  }
  return { passed, matched, activeCount: active.length }
}

// ─── メイン: 上から評価 → 最初に通ったランクを返す ───────────────
export function calculateRankByRules(
  customer: { first_visit_date?: string | null; customer_rank?: CustomerRank | null },
  visits: Array<{ visit_date: string; amount_spent: number | null; has_douhan?: boolean | null; has_after?: boolean | null }>,
  rules: RankRules,
  criteria: Pick<RankCriteria, 'monthly_period_months'>,
  today: Date = new Date(),
): RankResultV2 {
  // ─── 「切れた」は自動変動の対象外 ──────────────────────────
  //   連絡が切れた / 離脱したお客様。手動で戻すまで '切れた' を維持。
  if (customer.customer_rank === '切れた') {
    const metrics = computeMetrics(customer, visits, criteria, today)
    return {
      recommended: '切れた',
      metrics,
      matchedRank: null,
      matchedConditions: [],
      reasons: ['「切れた」のため自動計算スキップ'],
    }
  }

  const metrics = computeMetrics(customer, visits, criteria, today)
  const reasons: string[] = []

  for (const rank of ['S', 'A', 'B'] as const) {
    const rule = rules?.[rank]
    if (!rule) continue
    const { passed, matched, activeCount } = evaluateRule(rule, metrics)
    if (activeCount === 0) {
      reasons.push(`${rank}: ON の条件なし → スキップ`)
      continue
    }
    reasons.push(
      `${rank}: ${matched.length}/${activeCount} 条件マッチ (${rule.combine})${passed ? ' ✓' : ''}`
    )
    if (passed) {
      return { recommended: rank, metrics, matchedRank: rank, matchedConditions: matched, reasons }
    }
  }
  reasons.push('C: いずれにも該当しないため')
  return { recommended: 'C', metrics, matchedRank: null, matchedConditions: [], reasons }
}

// ─── 階層検索 (default / tier / cast) ────────────────────────────
export function resolveRankRulesV2(
  rows: RankCriteria[],
  castId: string | null,
  tier: string | null,
): { criteria: RankCriteria; rules: RankRules } | null {
  if (castId) {
    const r = rows.find(x => x.scope_type === 'cast' && x.scope_id === castId && x.rank_rules)
    if (r?.rank_rules) return { criteria: r, rules: r.rank_rules }
  }
  if (tier) {
    const r = rows.find(x => x.scope_type === 'tier' && x.scope_id === tier && x.rank_rules)
    if (r?.rank_rules) return { criteria: r, rules: r.rank_rules }
  }
  const def = rows.find(x => x.scope_type === 'default' && x.rank_rules)
  if (def?.rank_rules) return { criteria: def, rules: def.rank_rules }
  return null
}

// ─── デフォルトの空 RankRules を作る (UI で「新規作成」時など) ──
export function makeDefaultRankRules(): RankRules {
  const fields: RankConditionField[] = [
    'unit_price', 'cumulative_sales', 'monthly_avg_sales',
    'cumulative_visits', 'monthly_avg_visits', 'tenure_months',
    'douhan_count', 'douhan_rate', 'after_count', 'after_rate',
    'days_since_last_visit', 'recent_trend_ratio',
  ]
  const conditionsFor = (overrides: Partial<Record<RankConditionField, Partial<RankCondition>>>): RankCondition[] =>
    fields.map(f => ({
      field: f,
      op: f === 'days_since_last_visit' ? 'lte' as const : 'gte' as const,
      value: 0,
      enabled: false,
      ...overrides[f],
    }))
  return {
    S: { combine: 'all', conditions: conditionsFor({
      unit_price: { value: 200000, enabled: true },
    }) },
    A: { combine: 'all', conditions: conditionsFor({
      monthly_avg_visits: { value: 3, enabled: true },
    }) },
    B: { combine: 'any', conditions: conditionsFor({
      monthly_avg_sales: { value: 90000, enabled: true },
      days_since_last_visit: { value: 30, enabled: true },
    }) },
  }
}
