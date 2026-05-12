// ─────────────────────────────────────────────────────────────────
//  来店予測の純粋ロジック
//
//  入力: 顧客の visit 配列 (visit_date, amount_spent)
//  出力: { lastVisitDate, avgIntervalDays, predictedDate, overdueDays, ltv, visitCount, sampleQuality }
//
//  アルゴリズム:
//    1. 0 円 visit を除外 (場内チェック等のゼロ円レコード)
//    2. visit_date 昇順で並べ替え
//    3. 直近 6 件の連続間隔の中央値 (median) を採用
//    4. 180 日超のブランクは外れ値として除外（出戻り対応）
//    5. 0 日の重複は除外
//    6. median 日数 を「平均間隔」として保存
//    7. 最終来店日 + median = 予測来店日
//    8. 今日 - 予測来店日 = 超過日数（負なら未到達）
// ─────────────────────────────────────────────────────────────────

export type VisitLike = {
  visit_date: string
  amount_spent: number | null
}

export type PredictionResult = {
  /** 課金 visit の総数（場内チェック等は除く） */
  paidVisitCount: number
  /** 全 visit 数（ゼロ円含む） */
  totalVisitCount: number
  /** 最終来店日 (YYYY-MM-DD)。来店ゼロなら null */
  lastVisitDate: string | null
  /** 平均間隔（日）。サンプル不足なら null */
  avgIntervalDays: number | null
  /** 予測来店日 (YYYY-MM-DD)。サンプル不足なら null */
  predictedDate: string | null
  /** 超過日数（マイナス = 予測日未到達）。予測不可なら null */
  overdueDays: number | null
  /** 累計売上 (LTV) */
  ltv: number
  /** サンプル品質: 'high' (6回以上) / 'mid' (3-5) / 'low' (2) / 'none' (1以下) */
  sampleQuality: 'high' | 'mid' | 'low' | 'none'
}

function ymdToDate(s: string): Date | null {
  if (!s) return null
  // タイムゾーン揺れ防止: ローカル時刻 0:00 とみなす
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function dateToYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function diffDays(a: Date, b: Date): number {
  // 日付の差分（小数なし、ミリ秒 → 日に切り捨て）
  const MS = 1000 * 60 * 60 * 24
  return Math.floor((a.getTime() - b.getTime()) / MS)
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export function predictNextVisit(visits: VisitLike[], today: Date = new Date()): PredictionResult {
  const totalVisitCount = visits.length
  const paid = visits
    .filter(v => (Number(v.amount_spent) || 0) > 0)
    .filter(v => !!v.visit_date)
    .map(v => ({ ...v, _d: ymdToDate(v.visit_date) }))
    .filter(v => v._d != null) as Array<VisitLike & { _d: Date }>
  paid.sort((a, b) => a._d.getTime() - b._d.getTime())

  const paidVisitCount = paid.length
  const ltv = paid.reduce((s, v) => s + (Number(v.amount_spent) || 0), 0)
  const lastVisitDate = paid.length > 0 ? dateToYmd(paid[paid.length - 1]._d) : null

  let sampleQuality: PredictionResult['sampleQuality'] = 'none'
  if (paidVisitCount >= 6) sampleQuality = 'high'
  else if (paidVisitCount >= 3) sampleQuality = 'mid'
  else if (paidVisitCount === 2) sampleQuality = 'low'

  // 予測には最低 2 回必要
  if (paid.length < 2) {
    return {
      paidVisitCount, totalVisitCount, lastVisitDate,
      avgIntervalDays: null, predictedDate: null, overdueDays: null,
      ltv, sampleQuality,
    }
  }

  // 直近 6 件の間隔を採用
  const recent = paid.slice(-6)
  const intervals: number[] = []
  for (let i = 1; i < recent.length; i++) {
    const d = diffDays(recent[i]._d, recent[i - 1]._d)
    if (d > 0 && d <= 180) intervals.push(d) // 0 日重複と 180 日超ブランクを除外
  }
  if (intervals.length === 0) {
    return {
      paidVisitCount, totalVisitCount, lastVisitDate,
      avgIntervalDays: null, predictedDate: null, overdueDays: null,
      ltv, sampleQuality,
    }
  }
  const avgIntervalDays = median(intervals)
  const lastDate = recent[recent.length - 1]._d
  const predicted = new Date(lastDate.getTime())
  predicted.setDate(predicted.getDate() + avgIntervalDays)
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const overdueDays = diffDays(todayLocal, predicted)

  return {
    paidVisitCount, totalVisitCount, lastVisitDate,
    avgIntervalDays, predictedDate: dateToYmd(predicted),
    overdueDays, ltv, sampleQuality,
  }
}
