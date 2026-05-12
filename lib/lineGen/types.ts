// LINE 動的文面生成の型定義

export type ScoreLevel = 1 | 2 | 3 | 4 | 5

export type SlotKey = 'greeting' | 'care' | 'call' | 'close'

export type SituationKey =
  | 's01_first_followup'   // 初回後フォロー
  | 's02_birthday_before'  // 誕生日前
  | 's03_birthday_day'     // 誕生日当日
  | 's04_birthday_after'   // 誕生日後
  | 's05_absent_30d'       // 未来店30日
  | 's06_absent_60d'       // 未来店60日
  | 's07_absent_90d'       // 未来店90日
  | 's08_absent_180d'      // 未来店180日超
  | 's09_after_bottle'     // ボトル後
  | 's10_after_douhan'     // 同伴後
  | 's11_after_after'      // アフター後
  | 's12_season_greet'     // 季節挨拶
  | 's13_daily_care'       // 日常気遣い
  | 's14_weather'          // 天気イベント
  | 's15_weekday_invite'   // 週末出勤前
  | 's16_routine_break'    // 曜日固定崩れ

export const SITUATION_LABELS: Record<SituationKey, string> = {
  s01_first_followup:  '初回後フォロー',
  s02_birthday_before: '誕生日前',
  s03_birthday_day:    '誕生日当日',
  s04_birthday_after:  '誕生日後',
  s05_absent_30d:      '未来店30日',
  s06_absent_60d:      '未来店60日',
  s07_absent_90d:      '未来店90日',
  s08_absent_180d:     '未来店180日超',
  s09_after_bottle:    'ボトル後お礼',
  s10_after_douhan:    '同伴後お礼',
  s11_after_after:     'アフター後お礼',
  s12_season_greet:    '季節挨拶',
  s13_daily_care:      '日常気遣い',
  s14_weather:         '天気イベント',
  s15_weekday_invite:  '週末出勤前',
  s16_routine_break:   '曜日固定崩れ',
}

export type LineContext = {
  /** JST yyyy-mm-dd。省略時は今日 */
  today?: string
  /** UI で状況を強制指定 (ドロップダウン) */
  forceSituation?: SituationKey | null
  /** ボトル後限定の絵文字を有効化 */
  isAfterBottle?: boolean
  /** 再生成用のチック値 (UI で「もう一回」を押した回数) */
  seedTick?: number
}

export type LineProposal = {
  text: string
  situation: SituationKey
  scoreLevel: ScoreLevel
  slots: { greeting: string; care: string; call: string; close: string; emoji: string }
  warnings: string[]
}

export type PhraseSet = Record<SlotKey, string[]>
export type PhraseBucket = Record<SituationKey, PhraseSet>
export type PhraseTable = Record<ScoreLevel, PhraseBucket>
