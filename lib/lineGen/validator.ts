// NG ワード / NG 絵文字検出
//   - 営業ゴリ押し系の言い回しを排除
//   - 業界用語を排除
//   - 失礼な表現を排除
import { EMOJI_FORBIDDEN } from './emojiPool'

export const NG_WORDS: string[] = [
  '本指名',
  '呼びたい',
  'お店に来て',
  '来店してください',
  'お忙しい中',
  '恐縮です',
]

/**
 * 「指名」単独使用の検出。「本指名」「初指名」「場内指名」等の複合語は除外。
 * 「指名経路」「指名変更」等の複合語も除外。
 */
const SOLO_SHIMEI_RE = /(?<![本場内初リピ安])指名(?![経変履])/u

export type ValidationResult = {
  ok: boolean
  problems: string[]
}

export function validateMessage(text: string): ValidationResult {
  const problems: string[] = []
  for (const w of NG_WORDS) {
    if (text.includes(w)) problems.push(`NG ワード「${w}」`)
  }
  if (SOLO_SHIMEI_RE.test(text)) {
    problems.push('NG ワード「指名（単独）」')
  }
  for (const e of EMOJI_FORBIDDEN) {
    if (text.includes(e)) problems.push(`NG 絵文字「${e}」`)
  }
  return { ok: problems.length === 0, problems }
}
