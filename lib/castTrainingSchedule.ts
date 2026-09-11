export const CAST_TRAINING_MEMO_MAX = 5000
export const CAST_TRAINING_TOPIC_MAX = 120
export const CAST_TRAINING_BULK_MAX = 100

export const CAST_TRAINING_ELIGIBLE_SHIFT_STATUSES = [
  '出勤',
  '来客出勤',
  '希望出勤',
] as const

export const CAST_TRAINING_CATEGORIES = [
  'phase1',
  'phase2',
  'phase3',
  'communication',
] as const

export type CastTrainingCategory = typeof CAST_TRAINING_CATEGORIES[number]

export const CAST_TRAINING_CATEGORY_META: Record<CastTrainingCategory, {
  label: string
  shortLabel: string
  topics: readonly string[]
}> = {
  phase1: {
    label: 'フェーズ1',
    shortLabel: 'P1',
    topics: [
      'お店の仕組み・基本ルール',
      '接客の基本姿勢',
      'テーブルマナー・所作',
      'お客様情報の登録・活用',
      '次回来店につなげる基本',
      'その他',
    ],
  },
  phase2: {
    label: 'フェーズ2',
    shortLabel: 'P2',
    topics: [
      '本指名につなげる会話設計',
      '場内獲得後の追いかけ',
      '顧客分類と優先順位',
      '連絡頻度・LINE内容の改善',
      '売上・単価の振り返り',
      'その他',
    ],
  },
  phase3: {
    label: 'フェーズ3',
    shortLabel: 'P3',
    topics: [
      '固定客づくり',
      '来店周期の管理',
      '客単価を上げる提案',
      '月間目標と行動計画',
      '自走に向けた課題整理',
      'その他',
    ],
  },
  communication: {
    label: 'コミュニケーション',
    shortLabel: '対話',
    topics: [
      '最近の悩み・不安',
      '人間関係・働きやすさ',
      'モチベーション確認',
      '体調・生活リズム',
      '自由面談',
      'その他',
    ],
  },
}

export type CastTrainingSchedule = {
  id: string
  cast_id: string
  schedule_date: string
  category: CastTrainingCategory
  topic: string
  memo: string
  assigned_staff_id: string
  is_completed: boolean
  completed_at: string | null
  completed_by: string | null
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export type CastTrainingScheduleInput = {
  castIds: string[]
  scheduleDate: string
  category: CastTrainingCategory
  topic: string
  memo: string
  assignedStaffId: string
  isCompleted: boolean
}

export type CastTrainingScheduleParseResult =
  | { ok: true; value: CastTrainingScheduleInput }
  | { ok: false; error: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isRealDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

export function getCastTrainingMonthBounds(month: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return null
  const year = Number(match[1])
  const monthNumber = Number(match[2])
  if (year < 2020 || year > 2100 || monthNumber < 1 || monthNumber > 12) return null
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function isTrainingScheduleEligibleShift(status: unknown): boolean {
  return CAST_TRAINING_ELIGIBLE_SHIFT_STATUSES.some(eligible => eligible === status)
}

const normalizeSingleLine = (value: unknown) => (
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
)

const normalizeMemo = (value: unknown) => (
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''
)

export function parseCastTrainingScheduleInput(input: unknown): CastTrainingScheduleParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: '入力内容を確認してください' }
  }

  const body = input as Record<string, unknown>
  const rawCastIds = Array.isArray(body.castIds) ? body.castIds : []
  const castIds = [...new Set(rawCastIds.map(normalizeSingleLine).filter(Boolean))]
  const scheduleDate = normalizeSingleLine(body.scheduleDate)
  const category = normalizeSingleLine(body.category) as CastTrainingCategory
  const topic = normalizeSingleLine(body.topic)
  const memo = normalizeMemo(body.memo)
  const assignedStaffId = normalizeSingleLine(body.assignedStaffId)

  if (castIds.length === 0) return { ok: false, error: '対象キャストを選択してください' }
  if (castIds.length > CAST_TRAINING_BULK_MAX) {
    return { ok: false, error: `一度に設定できるのは${CAST_TRAINING_BULK_MAX}人までです` }
  }
  if (castIds.some(id => !UUID_PATTERN.test(id))) {
    return { ok: false, error: '対象キャストを選び直してください' }
  }
  if (!isRealDateOnly(scheduleDate)) return { ok: false, error: '実施日を選び直してください' }
  if (!CAST_TRAINING_CATEGORIES.includes(category)) {
    return { ok: false, error: '区分を選択してください' }
  }
  if (!topic) return { ok: false, error: '話す項目を選択してください' }
  if (topic.length > CAST_TRAINING_TOPIC_MAX) {
    return { ok: false, error: `話す項目は${CAST_TRAINING_TOPIC_MAX}文字以内です` }
  }
  if (!CAST_TRAINING_CATEGORY_META[category].topics.includes(topic)) {
    return { ok: false, error: '区分に合う話す項目を選択してください' }
  }
  if (memo.length > CAST_TRAINING_MEMO_MAX) {
    return { ok: false, error: `自由メモは${CAST_TRAINING_MEMO_MAX.toLocaleString()}文字以内です` }
  }
  if (!UUID_PATTERN.test(assignedStaffId)) return { ok: false, error: '担当者を選択してください' }
  if (typeof body.isCompleted !== 'boolean') return { ok: false, error: '実施状況を確認してください' }

  return {
    ok: true,
    value: {
      castIds,
      scheduleDate,
      category,
      topic,
      memo,
      assignedStaffId,
      isCompleted: body.isCompleted,
    },
  }
}

export function parseCastTrainingScheduleDeleteInput(input: unknown):
  | { ok: true; value: { castIds: string[]; scheduleDate: string } }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: '削除対象を確認してください' }
  }
  const body = input as Record<string, unknown>
  const rawCastIds = Array.isArray(body.castIds) ? body.castIds : []
  const castIds = [...new Set(rawCastIds.map(normalizeSingleLine).filter(Boolean))]
  const scheduleDate = normalizeSingleLine(body.scheduleDate)
  if (castIds.length === 0 || castIds.length > CAST_TRAINING_BULK_MAX || castIds.some(id => !UUID_PATTERN.test(id))) {
    return { ok: false, error: '削除するキャストを選び直してください' }
  }
  if (!isRealDateOnly(scheduleDate)) return { ok: false, error: '削除する日付を選び直してください' }
  return { ok: true, value: { castIds, scheduleDate } }
}
