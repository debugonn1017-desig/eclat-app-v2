// ─────────────────────────────────────────────────────────────────
//  キャストノルマの階層検索（v3 / 全項目対応 — 2026-05-12）
// ─────────────────────────────────────────────────────────────────
//  優先順（各項目ごとに独立してフォールバック）:
//    1. cast_targets   [cast_id, month=今月]  個別月別の特例
//    2. cast_targets   [cast_id, month=NULL]  個別恒久デフォルト
//    3. cast_tier_targets [tier,  month=今月]  層別月別（レガシー）
//    4. cast_tier_targets [tier,  month=NULL]  層別恒久デフォルト
//    5. なし → 0 / null
//
//  ⚠ 重要: フィールドごとに独立して階層を降りていく。例えば
//          個別月別行に target_sales だけ入っていて他が null の場合、
//          残りの項目は個別恒久 → 層別月別 → 層別恒久 と順にフォールバックする。
//
//  使い方:
//    const resolved = resolveCastTargetFull(
//      castTargets, // この cast_id の cast_targets 全行 (月別 + 恒久)
//      tierTargets, // 全 tier の cast_tier_targets 全行 (月別 + 恒久)
//      castId,
//      tier,        // CastTier or null
//      '2026-05',
//    )
//    resolved.target_sales / target_honshimei / ... / rank_targets
// ─────────────────────────────────────────────────────────────────

import type { RankTargets } from '@/types'

export type TargetField =
  | 'target_sales'
  | 'target_honshimei'
  | 'target_banai'
  | 'target_local_customers'
  | 'target_remote_customers'
  | 'target_work_days'

export type CastTargetLike = {
  cast_id?: string | null
  month?: string | null
  target_sales?: number | null
  target_honshimei?: number | null
  target_banai?: number | null
  target_local_customers?: number | null
  target_remote_customers?: number | null
  target_work_days?: number | null
  rank_targets?: RankTargets | null
}

export type TierTargetLike = {
  tier: string
  month?: string | null
  target_sales?: number | null
  target_honshimei?: number | null
  target_banai?: number | null
  target_local_customers?: number | null
  target_remote_customers?: number | null
  target_work_days?: number | null
  rank_targets?: RankTargets | null
}

export type TargetSource = 'month_specific' | 'cast_default' | 'tier_month' | 'tier_default' | 'none'

export type ResolvedFullTarget = {
  target_sales: number
  target_honshimei: number
  target_banai: number
  target_local_customers: number
  target_remote_customers: number
  target_work_days: number
  rank_targets: RankTargets | null
  /** 売上ノルマの最終出所（UI ラベル用） */
  source: TargetSource
  /** 各項目の出所内訳 */
  sources: Record<TargetField | 'rank_targets', TargetSource>
}

const ZERO_RESOLVED: ResolvedFullTarget = {
  target_sales: 0,
  target_honshimei: 0,
  target_banai: 0,
  target_local_customers: 0,
  target_remote_customers: 0,
  target_work_days: 0,
  rank_targets: null,
  source: 'none',
  sources: {
    target_sales: 'none',
    target_honshimei: 'none',
    target_banai: 'none',
    target_local_customers: 'none',
    target_remote_customers: 'none',
    target_work_days: 'none',
    rank_targets: 'none',
  },
}

/**
 * 全項目を 4 階層で個別に解決する。
 * 与える配列は事前にフィルター済みである必要はない（内部で cast_id / tier / month で絞る）。
 */
export function resolveCastTargetFull(
  castTargets: CastTargetLike[],
  tierTargets: TierTargetLike[],
  castId: string,
  tier: string | null,
  yearMonth: string,
): ResolvedFullTarget {
  // 各階層を 1 行ずつ取り出す
  const lvl1 = castTargets.find(t => t.cast_id === castId && t.month === yearMonth) ?? null
  const lvl2 = castTargets.find(t => t.cast_id === castId && (t.month == null)) ?? null
  const lvl3 = tier ? (tierTargets.find(t => t.tier === tier && t.month === yearMonth) ?? null) : null
  const lvl4 = tier ? (tierTargets.find(t => t.tier === tier && (t.month == null)) ?? null) : null

  const result: ResolvedFullTarget = { ...ZERO_RESOLVED, sources: { ...ZERO_RESOLVED.sources } }

  const pickNumber = (field: TargetField): { value: number; source: TargetSource } => {
    if (lvl1 && lvl1[field] != null) return { value: Number(lvl1[field]) || 0, source: 'month_specific' }
    if (lvl2 && lvl2[field] != null) return { value: Number(lvl2[field]) || 0, source: 'cast_default' }
    if (lvl3 && lvl3[field] != null) return { value: Number(lvl3[field]) || 0, source: 'tier_month' }
    if (lvl4 && lvl4[field] != null) return { value: Number(lvl4[field]) || 0, source: 'tier_default' }
    return { value: 0, source: 'none' }
  }

  const pickRank = (): { value: RankTargets | null; source: TargetSource } => {
    if (lvl1 && lvl1.rank_targets) return { value: lvl1.rank_targets, source: 'month_specific' }
    if (lvl2 && lvl2.rank_targets) return { value: lvl2.rank_targets, source: 'cast_default' }
    if (lvl3 && lvl3.rank_targets) return { value: lvl3.rank_targets, source: 'tier_month' }
    if (lvl4 && lvl4.rank_targets) return { value: lvl4.rank_targets, source: 'tier_default' }
    return { value: null, source: 'none' }
  }

  const fields: TargetField[] = [
    'target_sales',
    'target_honshimei',
    'target_banai',
    'target_local_customers',
    'target_remote_customers',
    'target_work_days',
  ]
  for (const f of fields) {
    const { value, source } = pickNumber(f)
    result[f] = value
    result.sources[f] = source
  }
  const rk = pickRank()
  result.rank_targets = rk.value
  result.sources.rank_targets = rk.source

  // 「全体としての出所ラベル」は売上ノルマの出所をそのまま使う
  result.source = result.sources.target_sales

  return result
}

/**
 * 売上ノルマだけが欲しいレガシー API（後方互換目的、現状コード内で参照無し）。
 * 新規呼び出しでは `resolveCastTargetFull` を使うこと。
 */
export type ResolvedTarget = {
  targetSales: number
  source: TargetSource
}

export function resolveCastTarget(
  castTargets: CastTargetLike[],
  tierTargets: TierTargetLike[],
  castId: string,
  tier: string | null,
  yearMonth: string,
): ResolvedTarget {
  const full = resolveCastTargetFull(castTargets, tierTargets, castId, tier, yearMonth)
  return { targetSales: full.target_sales, source: full.source }
}

/** UI 表示用にソース名を日本語化 */
export function targetSourceLabel(source: TargetSource): string {
  switch (source) {
    case 'month_specific': return '今月の特例'
    case 'cast_default':   return '個別デフォルト'
    case 'tier_month':     return '層別 今月の特例'
    case 'tier_default':   return '層別デフォルト'
    case 'none':           return 'ノルマ未設定'
  }
}
