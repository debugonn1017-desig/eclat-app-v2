// プレビューと保存結果は別の契約。保存結果にプレビューの集計/サンプルは含まれない。
export type RankRecalculationPreview = {
  ok: true
  dryRun: true
  targetRanks: string[] | null
  tokens: string[]
  filtered: number
  totalCustomers: number
  v2Resolved: number
  evaluated: number
  changed: number
  bySrcRank: Record<string, number>
  byDstRank: Record<string, number>
  sampleChanges: Array<{
    customerId: string
    customerName: string | null
    castName: string | null
    from: string | null
    to: string
  }>
}

export type RankRecalculationApplied = {
  ok: true
  dryRun: false
  targetRanks: string[] | null
  changed: number
  failed: number
}
