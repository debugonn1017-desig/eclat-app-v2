// 顧客の状態 + 今日 → SituationKey[] 自動判定
import type { Customer } from '@/types'
import type { SituationKey } from './types'
import { todayJST, diffDaysJST } from '@/lib/dateUtils'

/** 誕生日までの日数 (今日 < 誕生日 = 正、今日 > 誕生日 = 負) */
function daysUntilBirthday(birthdayMmDd: string, today: string): number | null {
  // birthday は 'YYYY-MM-DD' or 'MM-DD' or 不正な値の可能性
  const m = /(\d{1,2})-(\d{1,2})$/.exec(birthdayMmDd.trim())
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null
  const [ty, tm, td] = today.split('-').map(Number)
  // 今年の誕生日
  let target = new Date(ty, month - 1, day)
  const todayD = new Date(ty, tm - 1, td)
  // 「今年の誕生日が既に N 日前」の場合、N <= 7 なら誕生日後扱い、それ以上なら来年扱い
  const diffMs = target.getTime() - todayD.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < -7) {
    // 来年の誕生日までの日数を返す
    target = new Date(ty + 1, month - 1, day)
    const nextDiff = Math.round((target.getTime() - todayD.getTime()) / (1000 * 60 * 60 * 24))
    return nextDiff
  }
  return diffDays
}

function isMonthStart(today: string): boolean {
  const day = Number(today.split('-')[2])
  return day >= 1 && day <= 3
}

/**
 * 顧客 + 今日 → 該当する状況 (複数可)。優先度順にソート。
 * フォールバック: 何も該当しなければ s13_daily_care。
 */
export function detectSituations(
  customer: Partial<Customer>,
  today: string = todayJST(),
): SituationKey[] {
  const situations: SituationKey[] = []

  // 誕生日 (最優先)
  if (customer.birthday) {
    const days = daysUntilBirthday(customer.birthday, today)
    if (days != null) {
      if (days === 0) situations.push('s03_birthday_day')
      else if (days > 0 && days <= 14) situations.push('s02_birthday_before')
      else if (days < 0 && days >= -7) situations.push('s04_birthday_after')
    }
  }

  // 初回後フォロー
  if (customer.first_visit_date) {
    try {
      const d = diffDaysJST(today, customer.first_visit_date)
      if (d >= 0 && d <= 7) situations.push('s01_first_followup')
    } catch { /* 日付不正 */ }
  }

  // 未来店経過 (last_contact_date 優先、無ければ first_visit_date)
  const lastDate = customer.last_contact_date || customer.first_visit_date
  if (lastDate) {
    try {
      const d = diffDaysJST(today, lastDate)
      if (d >= 180) situations.push('s08_absent_180d')
      else if (d >= 90) situations.push('s07_absent_90d')
      else if (d >= 60) situations.push('s06_absent_60d')
      else if (d >= 30) situations.push('s05_absent_30d')
    } catch { /* 日付不正 */ }
  }

  // 季節挨拶 (月初 3 日)
  if (isMonthStart(today)) situations.push('s12_season_greet')

  // フォールバック
  if (situations.length === 0) situations.push('s13_daily_care')

  return situations
}
