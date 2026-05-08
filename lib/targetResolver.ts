// ─────────────────────────────────────────────────────────────────
//  キャストノルマの階層検索
// ─────────────────────────────────────────────────────────────────
//  優先順:
//    1. cast_targets で month=今月 のレコード（特例月、最優先）
//    2. cast_targets で month=NULL のレコード（個別恒久デフォルト）
//    3. cast_tier_targets で該当の層
//    4. なし → null（UI 側で「ノルマ未設定」表示）
// ─────────────────────────────────────────────────────────────────

export type TargetRow = {
  cast_id?: string | null
  month?: string | null      // 'YYYY-MM' or null
  target_sales: number
  // 他のノルマ項目（visits 等）があるなら必要に応じて追加
}

export type TierTargetRow = {
  tier: string               // 'A層' | 'B層' | ...
  target_sales: number
}

export type ResolvedTarget = {
  /** 月別ノルマ円 */
  targetSales: number
  /** どこから来たノルマか（UI でラベル表示用） */
  source: 'month_specific' | 'cast_default' | 'tier' | 'none'
}

/**
 * 1人のキャスト × 月のノルマを階層検索で1件に確定する。
 * 何も見つからなければ source='none' / targetSales=0 を返す。
 */
export function resolveCastTarget(
  castTargets: TargetRow[],
  tierTargets: TierTargetRow[],
  castId: string,
  tier: string | null,
  yearMonth: string  // 'YYYY-MM'
): ResolvedTarget {
  // 1) 月別の特例
  const monthSpec = castTargets.find(
    t => t.cast_id === castId && t.month === yearMonth
  )
  if (monthSpec) {
    return { targetSales: monthSpec.target_sales ?? 0, source: 'month_specific' }
  }

  // 2) 個別恒久デフォルト
  const castDefault = castTargets.find(
    t => t.cast_id === castId && (t.month === null || t.month === undefined)
  )
  if (castDefault) {
    return { targetSales: castDefault.target_sales ?? 0, source: 'cast_default' }
  }

  // 3) 層デフォルト
  if (tier) {
    const tierDef = tierTargets.find(t => t.tier === tier)
    if (tierDef) {
      return { targetSales: tierDef.target_sales ?? 0, source: 'tier' }
    }
  }

  // 4) なし
  return { targetSales: 0, source: 'none' }
}

/** UI 表示用にソース名を日本語化 */
export function targetSourceLabel(source: ResolvedTarget['source']): string {
  switch (source) {
    case 'month_specific': return '今月の特例'
    case 'cast_default':   return '個別デフォルト'
    case 'tier':           return '層デフォルト'
    case 'none':           return 'ノルマ未設定'
  }
}
