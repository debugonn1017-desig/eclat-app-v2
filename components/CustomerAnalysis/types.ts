// お客様分析ページの 4 タブで共有する派生データ型
import type { Customer, CastProfile, CustomerVisit } from '@/types'
import type { PredictionResult } from '@/lib/visitPrediction'

export type CustomerWithDerived = {
  customer: Customer
  prediction: PredictionResult
  /** 担当キャスト（cast_name で resolve）。null = 担当未設定 */
  cast: CastProfile | null
}

export type AnalyticsData = {
  customers: Customer[]
  visitsByCustomer: Record<string, CustomerVisit[]>
  extSalesByCustomer: Record<string, number>
  casts: CastProfile[]
}

export type TabProps = {
  rows: CustomerWithDerived[]
  isPC: boolean
  onCustomerClick: (id: string) => void
}
