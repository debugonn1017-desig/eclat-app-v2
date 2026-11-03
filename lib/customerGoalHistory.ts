export type CustomerGoalHistoryItem = {
  castId: string
  castName: string
  castActive: boolean
  month: string
  targetSales: number | null
  targetVisits: number | null
  note: string
  updatedAt: string
}
export type CustomerGoalHistoryData = { customerId: string; items: CustomerGoalHistoryItem[] }
