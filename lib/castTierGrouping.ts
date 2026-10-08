import { CAST_TIER_GROUPS } from '../types'

/** 表示用は旧層も保持する。新規入力用 CAST_TIERS と混同しない。 */
export function groupCastRowsByTier<T extends { cast_tier?: string | null }>(rows: readonly T[]) {
  const groups = new Map<string, T[]>(CAST_TIER_GROUPS.map(tier => [tier, []]))
  groups.set('層未設定', [])
  for (const row of rows) {
    const tier = row.cast_tier || '層未設定'
    // 想定外の既存値があっても一覧から消さない。
    if (!groups.has(tier)) groups.set(tier, [])
    groups.get(tier)!.push(row)
  }
  return [...groups].map(([tier, rows]) => ({ tier, rows })).filter(group => group.rows.length > 0)
}
