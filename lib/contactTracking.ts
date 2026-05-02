// 連絡履歴の追跡ヘルパー
//   - 「自分から送信したのに返信なしN日経過」を判定する
//   - 平均返信時間を集計する
//
//   contact_logs (customer_contacts) スキーマ:
//     direction: 'sent' | 'received'
//     channel:   'LINE' | '電話' | 'メール' | '来店中' | 'その他'
//     contact_date: ISO

export type ContactRow = {
  contact_date: string  // YYYY-MM-DD or ISO
  direction: 'sent' | 'received'
}

export type UnrepliedStatus = {
  /** 未返信か（最後に sent して、それ以降 received が無い） */
  unreplied: boolean
  /** 経過日数。null なら最初から sent ログ無し */
  daysSinceSent: number | null
  /** 最後に送った日（ISO） */
  lastSentDate: string | null
}

/**
 * 連絡履歴から「未返信状態」を判定する。
 * @param contacts 顧客 1人分の連絡ログ（時系列順問わず）
 */
export function evaluateUnreplied(
  contacts: ContactRow[],
  thresholdDays = 3,
  now: Date = new Date()
): UnrepliedStatus {
  if (contacts.length === 0) {
    return { unreplied: false, daysSinceSent: null, lastSentDate: null }
  }
  // 時系列降順でソート
  const sorted = [...contacts].sort((a, b) =>
    a.contact_date < b.contact_date ? 1 : -1
  )
  // 最新が received なら未返信ではない
  if (sorted[0].direction === 'received') {
    return { unreplied: false, daysSinceSent: null, lastSentDate: null }
  }
  // 最後に sent した日付を取る
  const lastSent = sorted.find(c => c.direction === 'sent')
  if (!lastSent) {
    return { unreplied: false, daysSinceSent: null, lastSentDate: null }
  }
  const sentTime = new Date(lastSent.contact_date + (lastSent.contact_date.length === 10 ? 'T00:00:00' : '')).getTime()
  const days = Math.floor((now.getTime() - sentTime) / (1000 * 60 * 60 * 24))
  return {
    unreplied: days >= thresholdDays,
    daysSinceSent: days,
    lastSentDate: lastSent.contact_date,
  }
}

/**
 * 平均返信時間（時間単位）を計算する。
 * sent → 直後の received までの間隔の平均。
 */
export function calcAvgReplyHours(contacts: ContactRow[]): number | null {
  const sorted = [...contacts].sort((a, b) =>
    a.contact_date < b.contact_date ? -1 : 1
  )
  const intervals: number[] = []
  let pendingSentTime: number | null = null
  for (const c of sorted) {
    const t = new Date(c.contact_date + (c.contact_date.length === 10 ? 'T00:00:00' : '')).getTime()
    if (c.direction === 'sent') {
      pendingSentTime = t
    } else if (c.direction === 'received' && pendingSentTime != null) {
      const hrs = (t - pendingSentTime) / (1000 * 60 * 60)
      if (hrs >= 0) intervals.push(hrs)
      pendingSentTime = null
    }
  }
  if (intervals.length === 0) return null
  return Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length)
}
