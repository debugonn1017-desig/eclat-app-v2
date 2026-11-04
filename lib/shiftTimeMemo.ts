import type { CastShift } from '../types'

export const SHIFT_TIME_OPTIONS = ['20:00', '20:30', '21:00', '21:30', '22:00', '22:30'] as const
export type ShiftTime = typeof SHIFT_TIME_OPTIONS[number]
export type ShiftDraft = { status: CastShift['status']; memo: string }

// 既存の自由メモと共存する専用の1行。時刻は勤怠・集計には使用しない。
const PREFIX = '希望出勤時間: '
const TIME_LINE = /^希望出勤時間: (20:00|20:30|21:00|21:30|22:00|22:30)\r?$/

export function getShiftTimeMemo(memo: string | null | undefined): ShiftTime | null {
  for (const line of (memo ?? '').split('\n')) {
    const match = TIME_LINE.exec(line)
    if (match) return match[1] as ShiftTime
  }
  return null
}

/** 専用行だけを更新/削除する。通常のメモ・他の時刻表記を消さない。 */
export function setShiftTimeMemo(memo: string | null | undefined, time: ShiftTime | null): string {
  if (time !== null && !(SHIFT_TIME_OPTIONS as readonly string[]).includes(time)) throw new Error('希望出勤の時間を選んでください')
  const remaining = (memo ?? '').split('\n').filter(line => !TIME_LINE.test(line)).join('\n')
  return time === null ? remaining : `${PREFIX}${time}${remaining ? '\n' + remaining : ''}`
}
