// 売上ペース予測ヘルパー
//   月の途中で「このペースなら月末で ¥◯◯」を計算する。
//   ・経過日数ベース（カレンダー基準）
//   ・出勤日ベース（実際に営業した日数を分母にする）
//
//   予測値は あくまで目安。シフトが偏ってる序盤などは誤差大きい。

export type SalesPace = {
  /** 経過日数 (1-31) */
  elapsedDays: number
  /** 月の総日数 */
  totalDaysInMonth: number
  /** 経過率 (0-1) */
  elapsedRate: number
  /** 経過日ベースで算出した月末予測売上 */
  forecastByCalendar: number
  /** 出勤済み日数（営業実績日 = 売上が立った日数 or シフト出勤日数） */
  workedDays: number
  /** 月の予定出勤日数 */
  totalWorkDays: number
  /** 出勤日ベース月末予測 */
  forecastByWorkDays: number
  /** 目標との差分 */
  gapToTarget: number | null
  /** 達成率（実績ベース） */
  achievementRate: number
  /** 月末達成見込み率（予測ベース） */
  forecastAchievementRate: number | null
}

/**
 * 売上ペース予測を計算する。
 *
 * @param currentSales 現時点までの売上
 * @param month "YYYY-MM"
 * @param today  基準日（省略時は今日）
 * @param workedDays 営業実績日数（出勤済み）
 * @param totalWorkDays 予定出勤日数（シフトで出勤希望/出勤になっている日数）
 * @param targetSales 月間目標売上（任意）
 */
export function calcSalesPace({
  currentSales,
  month,
  today = new Date(),
  workedDays = 0,
  totalWorkDays = 0,
  targetSales,
}: {
  currentSales: number
  month: string
  today?: Date
  workedDays?: number
  totalWorkDays?: number
  targetSales?: number | null
}): SalesPace {
  const [y, m] = month.split('-').map(Number)
  const totalDaysInMonth = new Date(y, m, 0).getDate()

  // 月内のどこにいるか
  const isCurrentMonth =
    today.getFullYear() === y && today.getMonth() + 1 === m
  const elapsedDays = isCurrentMonth
    ? Math.min(today.getDate(), totalDaysInMonth)
    : totalDaysInMonth

  const elapsedRate = elapsedDays / totalDaysInMonth

  const forecastByCalendar =
    elapsedDays > 0 ? Math.round(currentSales / elapsedDays * totalDaysInMonth) : 0

  const forecastByWorkDays =
    workedDays > 0 && totalWorkDays > 0
      ? Math.round(currentSales / workedDays * totalWorkDays)
      : forecastByCalendar

  const gapToTarget = targetSales && targetSales > 0 ? targetSales - currentSales : null
  const achievementRate =
    targetSales && targetSales > 0 ? Math.round(currentSales / targetSales * 100) : 0
  const forecastAchievementRate =
    targetSales && targetSales > 0
      ? Math.round(forecastByWorkDays / targetSales * 100)
      : null

  return {
    elapsedDays,
    totalDaysInMonth,
    elapsedRate,
    forecastByCalendar,
    workedDays,
    totalWorkDays,
    forecastByWorkDays,
    gapToTarget,
    achievementRate,
    forecastAchievementRate,
  }
}

/** YYYY-MM の月末日付を返す */
export function getMonthEndDate(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}
