// 絵文字パレット (score 別)
//   - NG: 🔥 💋 は絶対使わない (女の子が引くため)
//   - ボトル後限定: 🍷 🥂 🍾 はその状況のみ
import type { ScoreLevel } from './types'

export const EMOJI_FORBIDDEN: string[] = ['🔥', '💋']
export const EMOJI_BOTTLE: string[]   = ['🍷', '🥂', '🍾']

export const EMOJI_BY_SCORE: Record<ScoreLevel, string[]> = {
  1: ['☺️', '🌸', '✨', '🌷', '☕', '🌼', '🌿', '🙌'],
  2: ['☺️', '🌸', '✨', '🌷', '🌼', '🌙', '💭', '🙌'],
  3: ['🌙', '💭', '🥺', '💗', '✨', '☺️', '🌷', '🌸'],
  4: ['🥺', '💗', '💭', '🌙', '✨', '☺️', '🌷'],
  5: ['💞', '❣️', '💌', '💗', '🥺', '💭', '🌙', '☺️'],
}
