// バッジ・称号判定ロジック
//   既存の KPI データから自動判定。DBスキーマ追加不要。

import type { CastKPI } from '@/types'

export type BadgeId =
  | 'top1'           // 🏆 月間1位
  | 'top3'           // 🥉 月間Top3
  | 'achieve'        // 🥇 目標達成
  | 'streak3'        // 🔥 3ヶ月連続達成
  | 'streak6'        // 🔥🔥 6ヶ月連続達成
  | 'million1'       // 💎 100万キャスト
  | 'million3'       // 💎💎 300万キャスト
  | 'million5'       // 💎💎💎 500万キャスト
  | 'million10'      // 👑 1000万キャスト
  | 'douhan10'       // 🌟 同伴マスター（10回）
  | 'douhan20'       // 🌟⭐ 同伴の鬼（20回）
  | 'honshimei10'    // 🎯 本指名10名
  | 'honshimei20'    // 🎯⭐ 本指名20名
  | 'conversion5'    // 🔄 場内→本転換マスター（5件）
  | 'conversion10'   // 🔄⭐ 転換王（10件）
  | 'workdays20'     // 💪 出勤20日以上
  | 'avgSpend100k'   // 💎 高単価キャスト（客単価10万超）
  | 'newcomerStar'   // 🌱 新人スター（新人層+月100万超）

export type Badge = {
  id: BadgeId
  emoji: string
  label: string
  description: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

export const BADGE_DEFINITIONS: Record<BadgeId, Badge> = {
  top1:        { id: 'top1',        emoji: '🏆', label: '月間1位',         description: '月間売上1位を獲得',                rarity: 'legendary' },
  top3:        { id: 'top3',        emoji: '🥉', label: 'Top 3',           description: '月間売上Top 3にランクイン',         rarity: 'epic' },
  achieve:     { id: 'achieve',     emoji: '🥇', label: '目標達成',         description: 'その月の売上目標を達成',           rarity: 'rare' },
  streak3:     { id: 'streak3',     emoji: '🔥', label: '3ヶ月連続達成',   description: '3ヶ月連続で目標達成',              rarity: 'epic' },
  streak6:     { id: 'streak6',     emoji: '🔥', label: '半年連続達成',     description: '6ヶ月連続で目標達成',              rarity: 'legendary' },
  million1:    { id: 'million1',    emoji: '💎', label: '100万キャスト',   description: '月売上100万円達成',                rarity: 'rare' },
  million3:    { id: 'million3',    emoji: '💎', label: '300万キャスト',   description: '月売上300万円達成',                rarity: 'epic' },
  million5:    { id: 'million5',    emoji: '💎', label: '500万キャスト',   description: '月売上500万円達成',                rarity: 'legendary' },
  million10:   { id: 'million10',   emoji: '👑', label: '1000万キャスト', description: '月売上1000万円達成',                rarity: 'legendary' },
  douhan10:    { id: 'douhan10',    emoji: '🌟', label: '同伴マスター',     description: '月10回以上の同伴',                  rarity: 'rare' },
  douhan20:    { id: 'douhan20',    emoji: '🌟', label: '同伴の鬼',         description: '月20回以上の同伴',                  rarity: 'epic' },
  honshimei10: { id: 'honshimei10', emoji: '🎯', label: '本指名10名',       description: '月10名以上の本指名',                rarity: 'rare' },
  honshimei20: { id: 'honshimei20', emoji: '🎯', label: '本指名20名',       description: '月20名以上の本指名',                rarity: 'epic' },
  conversion5: { id: 'conversion5', emoji: '🔄', label: '転換マスター',     description: '月5件以上の場内→本指名転換',         rarity: 'rare' },
  conversion10:{ id: 'conversion10',emoji: '🔄', label: '転換王',           description: '月10件以上の場内→本指名転換',        rarity: 'legendary' },
  workdays20:  { id: 'workdays20',  emoji: '💪', label: '皆勤賞',           description: '月20日以上出勤',                   rarity: 'common' },
  avgSpend100k:{ id: 'avgSpend100k',emoji: '💎', label: '高単価キャスト',   description: '客単価10万円超え',                 rarity: 'epic' },
  newcomerStar:{ id: 'newcomerStar',emoji: '🌱', label: '新人スター',       description: '新人層で月売上100万円達成',         rarity: 'legendary' },
}

export const RARITY_STYLES: Record<Badge['rarity'], { bg: string; fg: string; border: string }> = {
  common:    { bg: '#F5F0F2',                              fg: '#5A4750',    border: '#D8D2D5' },
  rare:      { bg: 'linear-gradient(135deg, #E1F5EE, #C8EBDB)', fg: '#0F6E56', border: '#A0D9BC' },
  epic:      { bg: 'linear-gradient(135deg, #F0E0FA, #DCC4F0)', fg: '#5A2880', border: '#B89AD0' },
  legendary: { bg: 'linear-gradient(135deg, #FFF6E5, #FFE9C8)', fg: '#9C6300', border: '#E5B14C' },
}

/** 当月のバッジを判定 */
export function detectBadgesForMonth(params: {
  kpi: CastKPI
  targetSales: number
  rankInMonth?: number    // その月の売上順位（1位なら 1）
  totalCasts?: number     // 比較対象のキャスト総数
  castTier?: string | null
  prevMonths?: Array<{ kpi: CastKPI; targetSales: number }> // 過去月（連続達成判定用、最新月から降順）
}): Badge[] {
  const { kpi, targetSales, rankInMonth, castTier, prevMonths = [] } = params
  const result: BadgeId[] = []

  // 順位
  if (rankInMonth === 1) result.push('top1')
  else if (rankInMonth != null && rankInMonth <= 3) result.push('top3')

  // 目標達成
  if (targetSales > 0 && kpi.monthlySales >= targetSales) {
    result.push('achieve')
    // 連続達成（過去2ヶ月 or 5ヶ月も達成？）
    let streak = 1
    for (const pm of prevMonths) {
      if (pm.targetSales > 0 && pm.kpi.monthlySales >= pm.targetSales) streak += 1
      else break
    }
    if (streak >= 6) result.push('streak6')
    else if (streak >= 3) result.push('streak3')
  }

  // 売上閾値
  if (kpi.monthlySales >= 10_000_000) result.push('million10')
  else if (kpi.monthlySales >= 5_000_000) result.push('million5')
  else if (kpi.monthlySales >= 3_000_000) result.push('million3')
  else if (kpi.monthlySales >= 1_000_000) result.push('million1')

  // 同伴
  if (kpi.douhanCount >= 20) result.push('douhan20')
  else if (kpi.douhanCount >= 10) result.push('douhan10')

  // 本指名
  if (kpi.honshimeiCount >= 20) result.push('honshimei20')
  else if (kpi.honshimeiCount >= 10) result.push('honshimei10')

  // 転換
  if (kpi.conversionCount >= 10) result.push('conversion10')
  else if (kpi.conversionCount >= 5) result.push('conversion5')

  // 出勤
  if (kpi.workDays >= 20) result.push('workdays20')

  // 高単価
  if (kpi.avgSpend >= 100_000) result.push('avgSpend100k')

  // 新人スター
  if (castTier === '新人層' && kpi.monthlySales >= 1_000_000) result.push('newcomerStar')

  // 重複削除して順序保持
  const uniq: BadgeId[] = []
  const seen = new Set<BadgeId>()
  for (const id of result) {
    if (seen.has(id)) continue
    seen.add(id)
    uniq.push(id)
  }
  return uniq.map(id => BADGE_DEFINITIONS[id])
}
