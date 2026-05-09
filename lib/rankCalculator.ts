// ─────────────────────────────────────────────────────────────────
//  顧客ランク自動判定ロジック
// ─────────────────────────────────────────────────────────────────
//  rank_criteria の設定値と、その客の来店履歴から
//  推奨ランク（S/A/B/C）を算出して、判定理由付きで返す。
//
//  使い方:
//    const result = calculateRecommendedRank(customer, visits, criteria)
//    result.recommended  // 'B'
//    result.reasons      // [{ kind: 'base', label: '...', delta: 0 }, ...]
//    result.metrics      // 中間値（累計、月平均、同伴率など）
// ─────────────────────────────────────────────────────────────────

import type {
  CustomerRank,
  RankCriteria,
  RankCalculationResult,
  RankReason,
} from '@/types'

const RANK_ORDER: CustomerRank[] = ['C', 'B', 'A', 'S']

/** ランクを上げ下げするユーティリティ。範囲外は丸める。 */
function shiftRank(rank: CustomerRank, delta: number): CustomerRank {
  const idx = RANK_ORDER.indexOf(rank)
  const next = Math.max(0, Math.min(RANK_ORDER.length - 1, idx + delta))
  return RANK_ORDER[next]
}

/** ランクの並びでの差分（A - C = 2 みたいなの）。 */
function rankDistance(from: CustomerRank, to: CustomerRank): number {
  return RANK_ORDER.indexOf(to) - RANK_ORDER.indexOf(from)
}

/** より高いランクを採用する。 */
function higherRank(a: CustomerRank, b: CustomerRank): CustomerRank {
  return RANK_ORDER.indexOf(a) >= RANK_ORDER.indexOf(b) ? a : b
}

/** より低いランクを採用する。 */
function lowerRank(a: CustomerRank, b: CustomerRank): CustomerRank {
  return RANK_ORDER.indexOf(a) <= RANK_ORDER.indexOf(b) ? a : b
}

/** 月次or累計の金額しきい値からランクを引く。3つのしきい値を高い順に渡す。 */
function rankFromThresholds(
  amount: number,
  s: number,
  a: number,
  b: number
): CustomerRank {
  if (amount >= s) return 'S'
  if (amount >= a) return 'A'
  if (amount >= b) return 'B'
  return 'C'
}

// ─── 入力型（依存緩めにしてある、必要フィールドだけ） ───────────
type VisitLike = {
  visit_date: string
  amount_spent: number
  has_douhan: boolean
  has_after: boolean
}
type CustomerLike = {
  id: string
  customer_rank?: CustomerRank | null
  first_visit_date?: string | null
}

/** 「今日」を 00:00 にそろえた Date。テストや i18n を考えるとこの方が安全。 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 2 つの Date（または YYYY-MM-DD 文字列）の差を日数で。
 *  ⚠ 文字列は JST として解釈する（旧: new Date(s) で UTC0:00 解釈 → 9h ズレ）
 */
function diffDays(a: Date | string, b: Date | string): number {
  const aD = typeof a === 'string' ? new Date(a + 'T00:00:00+09:00') : a
  const bD = typeof b === 'string' ? new Date(b + 'T00:00:00+09:00') : b
  return Math.floor((aD.getTime() - bD.getTime()) / (1000 * 60 * 60 * 24))
}

/** 直近 N ヶ月分の visits を抽出する（境界は厳密ではなく日数換算）。
 *  ⚠ JST 解釈で比較
 */
function visitsWithinMonths(visits: VisitLike[], months: number, today: Date): VisitLike[] {
  const cutoff = new Date(today)
  cutoff.setMonth(cutoff.getMonth() - months)
  return visits.filter(v => new Date(v.visit_date + 'T00:00:00+09:00') >= cutoff)
}

/**
 * メイン関数。
 * @param customer 対象の顧客（first_visit_date 推奨）
 * @param visits その顧客の全来店履歴
 * @param criteria 設定値（rank_criteria の 1 行）
 * @param today 計算基準日（デフォルト: 現在）
 */
export function calculateRecommendedRank(
  customer: CustomerLike,
  visits: VisitLike[],
  criteria: RankCriteria,
  today: Date = new Date()
): RankCalculationResult {
  const todayStart = startOfDay(today)
  const reasons: RankReason[] = []

  // ─── 1) 中間メトリクスを全部出す ─────────────────────────────
  // ⚠ JST 解釈で並び替え（new Date('YYYY-MM-DD') は UTC0:00 → 9h 早いが
  //    ソートだけなので相対関係は変わらない。一応 JST 明示で揃える）
  const sortedVisits = [...visits].sort(
    (a, b) =>
      new Date(a.visit_date + 'T00:00:00+09:00').getTime() -
      new Date(b.visit_date + 'T00:00:00+09:00').getTime()
  )

  const totalSpent = sortedVisits.reduce((sum, v) => sum + (v.amount_spent ?? 0), 0)
  const visitCountTotal = sortedVisits.length

  // 直近 N ヶ月（criteria.monthly_period_months）の月平均
  const recentVisits = visitsWithinMonths(
    sortedVisits,
    criteria.monthly_period_months,
    todayStart
  )
  const recentTotal = recentVisits.reduce((sum, v) => sum + (v.amount_spent ?? 0), 0)
  const monthlyAverage =
    criteria.monthly_period_months > 0
      ? recentTotal / criteria.monthly_period_months
      : 0

  // 直近3ヶ月の来店回数（補正項目で使う）
  const visitCount3m = visitsWithinMonths(sortedVisits, 3, todayStart).length

  // 同伴率・アフター率（全来店ベース）
  const douhanCount = sortedVisits.filter(v => v.has_douhan).length
  const afterCount = sortedVisits.filter(v => v.has_after).length
  const douhanRate = visitCountTotal > 0 ? (douhanCount / visitCountTotal) * 100 : 0
  const afterRate = visitCountTotal > 0 ? (afterCount / visitCountTotal) * 100 : 0

  // 最終来店日からの日数
  const lastVisit = sortedVisits.length > 0 ? sortedVisits[sortedVisits.length - 1] : null
  const daysSinceLastVisit = lastVisit
    ? diffDays(todayStart, lastVisit.visit_date)
    : null

  // 継続月数（first_visit_date 優先、無ければ最古の来店日）
  const firstDateStr =
    customer.first_visit_date ??
    (sortedVisits[0]?.visit_date ?? null)
  const tenureMonths = firstDateStr
    ? Math.max(0, Math.floor(diffDays(todayStart, firstDateStr) / 30))
    : 0

  // 直近トレンド: 直近3ヶ月 vs その前3ヶ月の月平均比
  let trendRatio: number | null = null
  {
    const last3 = visitsWithinMonths(sortedVisits, 3, todayStart)
    const cutoffPrev = new Date(todayStart)
    cutoffPrev.setMonth(cutoffPrev.getMonth() - 6)
    const cutoffMid = new Date(todayStart)
    cutoffMid.setMonth(cutoffMid.getMonth() - 3)
    const prev3 = sortedVisits.filter(v => {
      // ⚠ JST 解釈で比較
      const d = new Date(v.visit_date + 'T00:00:00+09:00')
      return d >= cutoffPrev && d < cutoffMid
    })
    const last3Sum = last3.reduce((s, v) => s + (v.amount_spent ?? 0), 0)
    const prev3Sum = prev3.reduce((s, v) => s + (v.amount_spent ?? 0), 0)
    if (prev3Sum > 0) {
      trendRatio = last3Sum / prev3Sum
    } else if (last3Sum > 0) {
      // 前3ヶ月ゼロで直近に売上ある = 顕著な上昇トレンド扱い
      trendRatio = Number.POSITIVE_INFINITY
    } else {
      trendRatio = null
    }
  }

  // ─── 2) ベースランク（月次 + 累計の合算）─────────────────────
  let monthlyRank: CustomerRank | null = null
  let cumulativeRank: CustomerRank | null = null

  if (criteria.monthly_enabled) {
    monthlyRank = rankFromThresholds(
      monthlyAverage,
      criteria.monthly_s_threshold,
      criteria.monthly_a_threshold,
      criteria.monthly_b_threshold
    )
    reasons.push({
      kind: 'base',
      label: `月次${monthlyRank}（月平均 ${formatYen(monthlyAverage)}）`,
      delta: 0,
    })
  }
  if (criteria.cumulative_enabled) {
    cumulativeRank = rankFromThresholds(
      totalSpent,
      criteria.cumulative_s_threshold,
      criteria.cumulative_a_threshold,
      criteria.cumulative_b_threshold
    )
    reasons.push({
      kind: 'base',
      label: `累計${cumulativeRank}（累計 ${formatYen(totalSpent)}）`,
      delta: 0,
    })
  }

  let baseRank: CustomerRank
  if (monthlyRank && cumulativeRank) {
    switch (criteria.combine_strategy) {
      case 'higher':
        baseRank = higherRank(monthlyRank, cumulativeRank)
        reasons.push({ kind: 'base', label: `合算: 高い方を採用 → ${baseRank}`, delta: 0 })
        break
      case 'lower':
        baseRank = lowerRank(monthlyRank, cumulativeRank)
        reasons.push({ kind: 'base', label: `合算: 低い方を採用 → ${baseRank}`, delta: 0 })
        break
      case 'monthly_first':
      default:
        // 同点時は累計を優先（タイブレーカー）。違うときはとりあえず月次。
        baseRank =
          monthlyRank === cumulativeRank
            ? monthlyRank
            : monthlyRank
        reasons.push({ kind: 'base', label: `合算: 月次優先 → ${baseRank}`, delta: 0 })
        break
    }
  } else if (monthlyRank) {
    baseRank = monthlyRank
    reasons.push({ kind: 'base', label: `合算: 月次のみ → ${baseRank}`, delta: 0 })
  } else if (cumulativeRank) {
    baseRank = cumulativeRank
    reasons.push({ kind: 'base', label: `合算: 累計のみ → ${baseRank}`, delta: 0 })
  } else {
    // 月次・累計どちらも OFF → 安全側で C にフォールバック
    baseRank = 'C'
    reasons.push({
      kind: 'base',
      label: '⚠ 月次も累計も OFF（C にフォールバック）',
      delta: 0,
    })
  }

  // ─── 3) 補正項目（ON のものだけ適用）────────────────────────
  let totalAdjustment = 0
  const recordAdjustment = (label: string, delta: number) => {
    totalAdjustment += delta
    reasons.push({ kind: 'adjustment', label, delta })
  }

  // 来店頻度
  if (criteria.frequency_enabled) {
    const monthlyVisits = visitCount3m / 3 // 直近3ヶ月の月平均回数
    if (monthlyVisits >= criteria.frequency_high_threshold) {
      recordAdjustment(
        `+1 来店頻度（月平均 ${monthlyVisits.toFixed(1)} 回）`,
        +1
      )
    } else if (monthlyVisits < criteria.frequency_low_threshold) {
      recordAdjustment(
        `-1 来店頻度（月平均 ${monthlyVisits.toFixed(1)} 回）`,
        -1
      )
    }
  }

  // 同伴率
  if (criteria.douhan_rate_enabled) {
    if (douhanRate >= criteria.douhan_rate_threshold) {
      recordAdjustment(`+1 同伴率 ${douhanRate.toFixed(0)}%`, +1)
    }
  }

  // 直近トレンド
  if (criteria.trend_enabled && trendRatio !== null) {
    if (trendRatio >= criteria.trend_up_multiplier) {
      const label =
        trendRatio === Number.POSITIVE_INFINITY
          ? '+1 直近トレンド: 上り（前期間ゼロから売上あり）'
          : `+1 直近トレンド ${trendRatio.toFixed(2)} 倍`
      recordAdjustment(label, +1)
    } else if (trendRatio <= criteria.trend_down_multiplier) {
      recordAdjustment(`-1 直近トレンド ${trendRatio.toFixed(2)} 倍`, -1)
    }
  }

  // 客単価
  if (criteria.unit_price_enabled && visitCountTotal > 0) {
    const unitPrice = totalSpent / visitCountTotal
    if (unitPrice >= criteria.unit_price_threshold) {
      recordAdjustment(`+1 客単価 ${formatYen(unitPrice)}`, +1)
    }
  }

  // 継続月数
  if (criteria.tenure_enabled) {
    if (tenureMonths >= criteria.tenure_threshold_months) {
      recordAdjustment(`+1 継続 ${tenureMonths} ヶ月`, +1)
    }
  }

  // アフター率
  if (criteria.after_rate_enabled) {
    if (afterRate >= criteria.after_rate_threshold) {
      recordAdjustment(`+1 アフター率 ${afterRate.toFixed(0)}%`, +1)
    }
  }

  // ─── 4) 補正の上限（max_adjustment_steps）でクランプ ─────────
  const cap = criteria.max_adjustment_steps
  if (totalAdjustment > cap) {
    reasons.push({
      kind: 'cap',
      label: `上限 +${cap} に制限（実補正 +${totalAdjustment}）`,
      delta: 0,
    })
    totalAdjustment = cap
  } else if (totalAdjustment < -cap) {
    reasons.push({
      kind: 'cap',
      label: `下限 -${cap} に制限（実補正 ${totalAdjustment}）`,
      delta: 0,
    })
    totalAdjustment = -cap
  }

  let recommended = shiftRank(baseRank, totalAdjustment)

  // ─── 5) 非アクティブ判定（補正の後に独立して適用）────────────
  if (criteria.inactive_enabled && daysSinceLastVisit !== null) {
    if (daysSinceLastVisit >= criteria.inactive_force_c_days) {
      reasons.push({
        kind: 'inactive',
        label: `直近 ${daysSinceLastVisit} 日来店なし → 強制 C`,
        delta: rankDistance(recommended, 'C'),
      })
      recommended = 'C'
    } else if (daysSinceLastVisit >= criteria.inactive_warning_days) {
      const after = shiftRank(recommended, -1)
      reasons.push({
        kind: 'inactive',
        label: `直近 ${daysSinceLastVisit} 日来店なし → -1`,
        delta: -1,
      })
      recommended = after
    }
  } else if (lastVisit === null && criteria.inactive_enabled) {
    // 一度も来店がない場合は強制 C
    reasons.push({
      kind: 'inactive',
      label: '来店履歴なし → 強制 C',
      delta: rankDistance(recommended, 'C'),
    })
    recommended = 'C'
  }

  return {
    recommended,
    base: baseRank,
    totalAdjustment,
    reasons,
    metrics: {
      totalSpent,
      monthlyAverage,
      visitCount3m,
      visitCountTotal,
      douhanRate,
      afterRate,
      daysSinceLastVisit,
      tenureMonths,
      trendRatio,
    },
  }
}

// ─────────────────────────────────────────────────────────────────
//  階層検索: 個別キャスト → 層 → 全店デフォルト
// ─────────────────────────────────────────────────────────────────

/** Supabase の rank_criteria レコードの薄い形（型 import を避けるため） */
type CriteriaRow = RankCriteria

/** あるキャストに適用される rank_criteria を 1 行返す。
 *  優先順: scope='cast'(その castId) > scope='tier'(その tier) > scope='default'
 *  全部見つからない場合は null。
 *
 *  rows: 取得済みの全 rank_criteria 行を渡す（毎回クエリしない）
 */
export function resolveRankCriteria(
  rows: CriteriaRow[],
  castId: string | null,
  tier: string | null
): CriteriaRow | null {
  // 1) cast 個別
  if (castId) {
    const found = rows.find(r => r.scope_type === 'cast' && r.scope_id === castId)
    if (found) return found
  }
  // 2) tier 別
  if (tier) {
    const found = rows.find(r => r.scope_type === 'tier' && r.scope_id === tier)
    if (found) return found
  }
  // 3) default
  const def = rows.find(r => r.scope_type === 'default')
  return def ?? null
}

/** 千円単位で見やすく整形（10万 → "10万円"、1万2千 → "1.2万円"） */
function formatYen(amount: number): string {
  if (amount >= 10000) {
    const man = amount / 10000
    return `${man >= 100 ? Math.round(man) : man.toFixed(1)}万円`
  }
  return `${Math.round(amount).toLocaleString()}円`
}
