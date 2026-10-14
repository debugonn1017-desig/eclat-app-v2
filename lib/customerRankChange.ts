import type { CustomerRank } from '../types'

export type CustomerRankTarget = { id: string; name: string; previousRank: CustomerRank | null }
export const CUSTOMER_RANK_CHOICES: readonly (CustomerRank | null)[] = ['S', 'A', 'B', 'C', '切れた', null]

export function isCustomerRankValue(value: unknown): value is CustomerRank | null {
  return CUSTOMER_RANK_CHOICES.some(rank => rank === value)
}

export function customerRankLabel(rank: CustomerRank | null): string {
  return rank === null ? '未設定' : rank === '切れた' ? '切れた' : `${rank}ランク`
}
