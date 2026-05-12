// ─────────────────────────────────────────────────────────────────
//  キャスト評価の判定ロジック (純粋関数)
//   入力: 全キャストの行データ (cast-rankings API レスポンス相当)
//   出力: 各キャストごとの評価点[] / 強化点[] / 主要順位[]
// ─────────────────────────────────────────────────────────────────

export type EvalSeverity = 'high' | 'mid' | 'low'

export type EvalBadge = {
  icon: string
  title: string
  detail: string          // "12回 / 38% / 店内 1 位" のような数値根拠
  rank?: number           // 店内順位 (任意)
}

export type ImprovementBadge = EvalBadge & {
  severity: EvalSeverity  // 表示色 (high=赤, mid=黄, low=ピンク)
}

export type TopRanking = {
  key: string             // 'sales' | 'achievement' | 'douhan' | ...
  label: string           // '売上順位' '達成率' '同伴' ...
  rank: number            // 1-based
  total: number
}

export type CastEvaluation = {
  /** 総合順位 (売上ベース) */
  overallRank: number
  /** 主要 4 指標の店内順位 (TOP 5 以内に入ってる指標を優先) */
  topRankings: TopRanking[]
  /** 評価点 (強み) 最大 8 個 */
  evaluations: EvalBadge[]
  /** 強化点 (改善余地) 最大 6 個 */
  improvements: ImprovementBadge[]
}

// ─── 入力データ型 (cast-rankings API + 補助情報) ────────────────
export type CastRow = {
  castId: string
  castName: string | null
  tier: string | null
  isNew?: boolean            // 入店 60 日以内 etc
  // KPI
  monthlySales: number
  targetSales: number
  achievementRate: number    // %
  prevSales: number          // 前月売上 (前月比計算)
  visitGroups: number        // 来店組数
  avgSpend: number           // 客単価
  douhanCount: number
  afterCount: number
  honshimeiCount: number     // 本指名顧客数
  highRankCount: number      // S+A 顧客数 (派生)
  banaiAcquiredCount: number // 新規場内獲得
  conversionCount: number    // 場内→本指名 転換数
  workDays: number           // 出勤日数
  targetWorkDays: number     // 目標出勤日数
}

// ─── ランキング計算ヘルパ ────────────────────────────────────
function rankByDesc<T>(rows: T[], pick: (r: T) => number): Map<T, number> {
  const sorted = [...rows].sort((a, b) => pick(b) - pick(a))
  const map = new Map<T, number>()
  sorted.forEach((r, i) => map.set(r, i + 1))
  return map
}

function rankByAsc<T>(rows: T[], pick: (r: T) => number): Map<T, number> {
  const sorted = [...rows].sort((a, b) => pick(a) - pick(b))
  const map = new Map<T, number>()
  sorted.forEach((r, i) => map.set(r, i + 1))
  return map
}

// ─── メイン: 全キャストの評価を一括算出 ──────────────────────
export function evaluateAllCasts(rows: CastRow[]): Map<string, CastEvaluation> {
  const total = rows.length
  const result = new Map<string, CastEvaluation>()
  if (total === 0) return result

  // 各指標で順位を作る
  const salesRank        = rankByDesc(rows, r => r.monthlySales)
  const achievementRank  = rankByDesc(rows, r => r.achievementRate)
  const douhanRank       = rankByDesc(rows, r => r.douhanCount)
  const afterRank        = rankByDesc(rows, r => r.afterCount)
  const avgSpendRank     = rankByDesc(rows, r => r.avgSpend)
  const visitGroupsRank  = rankByDesc(rows, r => r.visitGroups)
  const honshimeiRank    = rankByDesc(rows, r => r.honshimeiCount)
  const highRankCRank    = rankByDesc(rows, r => r.highRankCount)
  const conversionRank   = rankByDesc(rows, r => r.conversionCount)
  const banaiRank        = rankByDesc(rows, r => r.banaiAcquiredCount)
  const lowAvgSpendRank  = rankByAsc(rows, r => r.avgSpend)       // ワースト判定用

  for (const r of rows) {
    const evals: EvalBadge[] = []
    const impr: ImprovementBadge[] = []

    const rankOf = (m: Map<CastRow, number>) => m.get(r) ?? total
    const sRank   = rankOf(salesRank)
    const aRank   = rankOf(achievementRank)
    const dRank   = rankOf(douhanRank)
    const afRank  = rankOf(afterRank)
    const upRank  = rankOf(avgSpendRank)
    const vgRank  = rankOf(visitGroupsRank)
    const hsRank  = rankOf(honshimeiRank)
    const hrRank  = rankOf(highRankCRank)
    const cvRank  = rankOf(conversionRank)
    const bnRank  = rankOf(banaiRank)

    // 前月比 (%)
    const trendPct = r.prevSales > 0
      ? Math.round((r.monthlySales / r.prevSales) * 100)
      : 0

    // douhan率, after率 (visit ベース)
    const douhanRate = r.visitGroups > 0 ? Math.round((r.douhanCount / r.visitGroups) * 100) : 0
    const afterRate  = r.visitGroups > 0 ? Math.round((r.afterCount  / r.visitGroups) * 100) : 0

    // ─── 評価点判定 ──────────────────────────────
    if (r.achievementRate >= 100) {
      evals.push({ icon: '💎', title: 'ノルマ達成', detail: `達成率 ${r.achievementRate}%`, rank: aRank })
    } else if (r.achievementRate >= 70) {
      evals.push({ icon: '🎯', title: 'ノルマ目前', detail: `達成率 ${r.achievementRate}% / あと ¥${Math.round((r.targetSales - r.monthlySales) / 10000)}万`, rank: aRank })
    }

    if (sRank <= 3) {
      evals.push({ icon: '🏆', title: '売上トップ', detail: `店内 ${sRank} 位 / ¥${Math.round(r.monthlySales / 10000)}万`, rank: sRank })
    }

    if (dRank <= 3 && r.douhanCount > 0) {
      evals.push({ icon: '🎯', title: '同伴営業強い', detail: `${r.douhanCount} 回 / ${douhanRate}% / 店内 ${dRank} 位`, rank: dRank })
    } else if (r.douhanCount >= 10) {
      evals.push({ icon: '🎯', title: '同伴回数多い', detail: `${r.douhanCount} 回 / ${douhanRate}%`, rank: dRank })
    }

    if (afRank <= 3 && r.afterCount > 0) {
      evals.push({ icon: '🌙', title: 'アフター強い', detail: `${r.afterCount} 回 / ${afterRate}% / 店内 ${afRank} 位`, rank: afRank })
    } else if (r.afterCount >= 5) {
      evals.push({ icon: '🌙', title: 'アフター実績', detail: `${r.afterCount} 回 / ${afterRate}%`, rank: afRank })
    }

    if (upRank <= 3 && r.avgSpend > 0) {
      evals.push({ icon: '💴', title: '客単価高い', detail: `¥${Math.round(r.avgSpend / 1000)}K / 店内 ${upRank} 位`, rank: upRank })
    }

    if (vgRank <= 3 && r.visitGroups > 0) {
      evals.push({ icon: '👤', title: '集客力高い', detail: `${r.visitGroups} 組来店 / 店内 ${vgRank} 位`, rank: vgRank })
    }

    if (hsRank <= 3 && r.honshimeiCount > 0) {
      evals.push({ icon: '👥', title: '固定客厚い', detail: `本指名 ${r.honshimeiCount} 名 / 店内 ${hsRank} 位`, rank: hsRank })
    }

    if (hrRank <= 3 && r.highRankCount > 0) {
      evals.push({ icon: '🏆', title: '高ランク客多い', detail: `S/A ${r.highRankCount} 名 / 店内 ${hrRank} 位`, rank: hrRank })
    }

    if (cvRank <= 3 && r.conversionCount > 0) {
      evals.push({ icon: '🎉', title: '転換実績', detail: `場内→本指名 ${r.conversionCount} 名 / 店内 ${cvRank} 位`, rank: cvRank })
    } else if (r.conversionCount >= 3) {
      evals.push({ icon: '🎉', title: '転換あり', detail: `場内→本指名 ${r.conversionCount} 名` })
    }

    if (trendPct >= 110 && r.prevSales > 0) {
      evals.push({ icon: '📈', title: '成長中', detail: `前月比 +${trendPct - 100}%` })
    }

    if (bnRank <= 3 && r.banaiAcquiredCount > 0) {
      evals.push({ icon: '🆕', title: '新規場内獲得', detail: `${r.banaiAcquiredCount} 名 / 店内 ${bnRank} 位`, rank: bnRank })
    } else if (r.banaiAcquiredCount >= 3) {
      evals.push({ icon: '🆕', title: '新規獲得実績', detail: `${r.banaiAcquiredCount} 名獲得` })
    }

    if (r.targetWorkDays > 0 && r.workDays >= r.targetWorkDays) {
      const isPerfect = r.workDays >= r.targetWorkDays && r.targetWorkDays === r.workDays
      evals.push({
        icon: isPerfect ? '✨' : '✅',
        title: isPerfect ? '皆勤' : '出勤達成',
        detail: `${r.workDays}/${r.targetWorkDays} 日`
      })
    }

    if (r.isNew) {
      evals.push({ icon: '🆕', title: '新人で育成中', detail: '入店 60 日以内' })
    }

    // ─── 強化点判定 (連絡系は除外) ──────────────
    if (r.targetSales > 0 && r.achievementRate < 50) {
      const remain = Math.max(0, r.targetSales - r.monthlySales)
      impr.push({
        icon: '💸', title: 'ノルマ未達 大',
        detail: `達成率 ${r.achievementRate}% / あと ¥${Math.round(remain / 10000)}万`,
        severity: 'high',
      })
    } else if (r.targetSales > 0 && r.achievementRate < 80) {
      const remain = Math.max(0, r.targetSales - r.monthlySales)
      impr.push({
        icon: '💸', title: 'ノルマ未達',
        detail: `達成率 ${r.achievementRate}% / あと ¥${Math.round(remain / 10000)}万`,
        severity: 'mid',
      })
    }

    if (r.prevSales > 0 && trendPct <= 70) {
      impr.push({
        icon: '📉', title: '売上下降中',
        detail: `前月比 ${trendPct}% (-${100 - trendPct}%)`,
        severity: 'high',
      })
    }

    if (r.targetWorkDays > 0 && r.workDays < r.targetWorkDays * 0.7) {
      impr.push({
        icon: '🌙', title: '出勤不足',
        detail: `${r.workDays}/${r.targetWorkDays} 日 (${Math.round(r.workDays / r.targetWorkDays * 100)}%)`,
        severity: 'high',
      })
    }

    if (r.banaiAcquiredCount === 0) {
      impr.push({
        icon: '🆕', title: '新規場内獲得 0',
        detail: '今月の新規獲得なし',
        severity: 'low',
      })
    }

    if (r.visitGroups > 0 && douhanRate < 5 && r.honshimeiCount >= 5) {
      impr.push({
        icon: '🤝', title: '同伴率低め',
        detail: `${douhanRate}% (店内 ${dRank} 位)`,
        severity: 'low',
      })
    }

    if (r.visitGroups > 0 && r.afterCount === 0 && r.honshimeiCount >= 5) {
      impr.push({
        icon: '🌃', title: 'アフター 0 件',
        detail: '今月アフター実績なし',
        severity: 'low',
      })
    }

    if (rankOf(lowAvgSpendRank) <= 3 && r.avgSpend > 0 && r.visitGroups >= 3) {
      impr.push({
        icon: '💵', title: '客単価低め',
        detail: `¥${Math.round(r.avgSpend / 1000)}K (店内ワースト ${rankOf(lowAvgSpendRank)} 位)`,
        severity: 'low',
      })
    }

    // 上限 — 評価点 8 個 / 強化点 6 個
    const evalsSliced = evals.slice(0, 8)
    const imprSliced = impr.slice(0, 6)

    // ─── 主要 4 指標の TOP ランキング (TOP 5 以内優先、なければ売上系) ──
    const candidates: TopRanking[] = [
      { key: 'sales',       label: '売上順位',  rank: sRank,  total },
      { key: 'achievement', label: '達成率',   rank: aRank,  total },
      { key: 'douhan',      label: '同伴',     rank: dRank,  total },
      { key: 'after',       label: 'アフター', rank: afRank, total },
      { key: 'avgSpend',    label: '客単価',   rank: upRank, total },
      { key: 'visits',      label: '集客',     rank: vgRank, total },
      { key: 'honshimei',   label: '本指名数', rank: hsRank, total },
      { key: 'highRank',    label: '高ランク', rank: hrRank, total },
      { key: 'conversion',  label: '転換',     rank: cvRank, total },
      { key: 'banai',       label: '新規獲得', rank: bnRank, total },
    ]
    // TOP 5 以内 → 上位優先で 4 個ピック。足りなければ売上/達成率を補完
    const tops = candidates
      .filter(c => c.rank <= 5)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 4)
    if (tops.length < 4) {
      // 必須 4: 売上 / 達成率 / 同伴 / 集客 を埋める
      const fallback = ['sales', 'achievement', 'douhan', 'visits']
      for (const k of fallback) {
        if (tops.length >= 4) break
        if (tops.some(t => t.key === k)) continue
        const cand = candidates.find(c => c.key === k)
        if (cand) tops.push(cand)
      }
    }

    result.set(r.castId, {
      overallRank: sRank,
      topRankings: tops,
      evaluations: evalsSliced,
      improvements: imprSliced,
    })
  }

  return result
}
