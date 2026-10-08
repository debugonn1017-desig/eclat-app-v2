export type CastDetailTab = 'KPI' | 'TRAINING' | 'SALES' | 'SHIFT' | 'CUSTOMERS' | 'RANKING' | 'SETTING' | 'EXPORTS'

/** ボタン表示・左右スワイプ・選択タブ検証で同じロール別配列を使う。 */
export function getCastDetailTabs(isAdmin: boolean, isNewCast: boolean): CastDetailTab[] {
  return [
    'KPI', 'CUSTOMERS', 'SALES', 'SHIFT',
    ...(isNewCast ? ['TRAINING' as const] : []),
    ...(isAdmin ? ['SETTING' as const] : []),
    'RANKING',
    ...(isAdmin ? ['EXPORTS' as const] : []),
  ]
}
