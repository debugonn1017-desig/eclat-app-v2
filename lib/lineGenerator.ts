// ─────────────────────────────────────────────────────────────────
//  LINE 文面動的生成のエントリ
//
//  使い方:
//    const proposals = generateLineMessages(
//      customer,                          // Customer型 (Partial OK)
//      { forceSituation: 's07_absent_90d' }, // 任意
//      5                                  // パターン数 (デフォルト 5)
//    )
//    → LineProposal[] (各パターンに text と meta)
// ─────────────────────────────────────────────────────────────────

import type { Customer } from '@/types'
import { todayJST } from '@/lib/dateUtils'
import { PHRASE_TABLE } from './lineGen/phrasePool'
import { EMOJI_BY_SCORE, EMOJI_BOTTLE } from './lineGen/emojiPool'
import { detectSituations } from './lineGen/situationDetector'
import { applyTokens } from './lineGen/tokenizer'
import { rotatedPicker } from './lineGen/seedRandom'
import { validateMessage } from './lineGen/validator'
import type {
  LineContext, LineProposal, ScoreLevel, SituationKey, SlotKey,
} from './lineGen/types'

export type { LineContext, LineProposal, SituationKey, ScoreLevel } from './lineGen/types'
export { SITUATION_LABELS } from './lineGen/types'

/** customer.score (number | null | undefined) → 1-5 にクランプ */
function clampScore(raw: unknown): ScoreLevel {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  const r = Math.round(n)
  if (r < 1) return 1
  if (r > 5) return 5
  return r as ScoreLevel
}

/** スロット候補から空文字でないテンプレを 1 つ選ぶ */
function pickSlot(
  candidates: string[],
  customer: Partial<Customer>,
  seedStr: string,
  rotateIndex: number,
): string {
  if (candidates.length === 0) return ''
  // hobby を要求する候補が hobby なしで使えない → ローテーション続ける
  for (let attempt = 0; attempt < candidates.length; attempt++) {
    const tmpl = rotatedPicker(seedStr, candidates, rotateIndex + attempt) ?? ''
    const out = applyTokens(tmpl, customer)
    if (out) return out
  }
  // 全部 hobby 必須だった場合 (実装上ほぼ起こらない) は、空 hobby 用のフォールバック
  return applyTokens(candidates[0], { ...customer, hobby: 'お話' })
}

/** 絵文字 1 つを score とパターン番号で deterministic に選ぶ */
function pickEmoji(score: ScoreLevel, seedStr: string, rotateIndex: number, includeBottle: boolean): string {
  const pool = EMOJI_BY_SCORE[score]
  const base = rotatedPicker(seedStr, pool, rotateIndex) ?? '✨'
  if (includeBottle) {
    // ボトル後限定絵文字を 1 個プラス
    const bottle = rotatedPicker(seedStr + 'b', EMOJI_BOTTLE, rotateIndex) ?? '🍷'
    return `${base}${bottle}`
  }
  return base
}

/** 4 スロット + emoji を組み立てて 1 メッセージにする */
function assembleMessage(slots: {
  greeting: string; care: string; call: string; close: string; emoji: string
}): string {
  // 4 行構成 (改行)
  return `${slots.greeting}\n${slots.care}\n${slots.call}\n${slots.close}${slots.emoji}`
}

/**
 * メインエントリ: 指定された顧客と状況コンテキストから N 個の LINE 提案を返す。
 */
export function generateLineMessages(
  customer: Partial<Customer>,
  context: LineContext = {},
  count: number = 5,
): LineProposal[] {
  const today = context.today ?? todayJST()
  const score = clampScore(customer.score)
  const seedTick = context.seedTick ?? 0

  // 状況を確定
  let situations: SituationKey[]
  if (context.forceSituation) {
    situations = [context.forceSituation]
  } else {
    situations = detectSituations(customer, today)
  }
  if (situations.length === 0) situations = ['s13_daily_care']

  // ボトル絵文字解禁判定
  const includeBottle = context.isAfterBottle === true
    || situations.includes('s09_after_bottle')

  const proposals: LineProposal[] = []
  for (let i = 0; i < count; i++) {
    // パターンごとに状況をローテーション (複数あれば交互に)
    const situation = situations[i % situations.length]
    const cell = PHRASE_TABLE[score][situation]

    const seedBase = `${customer.id ?? 'x'}-${today}-${situation}-${seedTick}-${i}`
    const rotate = i // 連続パターンで同じ候補を避けるためのローテ

    // 各スロットをピック
    const slots: Record<SlotKey, string> = {
      greeting: pickSlot(cell.greeting, customer, seedBase + 'g', rotate),
      care:     pickSlot(cell.care,     customer, seedBase + 'c', rotate),
      call:     pickSlot(cell.call,     customer, seedBase + 'l', rotate),
      close:    pickSlot(cell.close,    customer, seedBase + 'z', rotate),
    }
    const emoji = pickEmoji(
      score, seedBase + 'e', rotate,
      includeBottle && situation === 's09_after_bottle',
    )

    const text = assembleMessage({ ...slots, emoji })

    // バリデーション
    const v = validateMessage(text)
    proposals.push({
      text,
      situation,
      scoreLevel: score,
      slots: { ...slots, emoji },
      warnings: v.problems,
    })
  }

  return proposals
}
