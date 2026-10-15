export const STAR_LOG_STATUSES = ['未連絡', '連絡済み', '返信待ち', '返信あり', '来店予定'] as const
export type StarLogStatus = typeof STAR_LOG_STATUSES[number]
export type StarCheckFilter = 'all' | 'unchecked' | 'checked'
export type StarCycle = {
  id: string; customer_id: number; started_on: string | null; opened_at: string
  ended_at: string | null; last_checked_on: string | null; last_status: StarLogStatus | null
}
export type StarLogEvent = {
  id: string; kind: 'started' | 'ended' | 'check' | 'start_date'; event_on: string
  started_on: string | null; status: StarLogStatus | null; note: string | null
  actor_name: string | null; recorded_at: string
}
export type StarLogCustomer = { id: string; name: string; castName?: string | null; cycleId?: string }
export type StarLogDetail = {
  customer: { id: number; customer_name: string; cast_name: string | null; is_starred: boolean }
  cycle: StarCycle | null; logs: StarLogEvent[]; can_edit: boolean; has_more: boolean
  restart_cycle_id?: string | null
}
export type StarHistoryRow = StarCycle & { customer: StarLogDetail['customer'] }

export function validStarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false
  const time = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}
export function parseStarCheckFilter(value: string | null): StarCheckFilter | null {
  return value === null || value === 'all' ? 'all' : value === 'checked' || value === 'unchecked' ? value : null
}
export function matchesStarCheck(cycle: Pick<StarCycle, 'last_checked_on'> | undefined, filter: StarCheckFilter, today: string): boolean {
  return filter === 'all' || (cycle?.last_checked_on === today) === (filter === 'checked')
}
export function validateStarLog(body: unknown, today: string): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '記録の形式が不正です'
  const b = body as Record<string, unknown>
  if (Object.keys(b).some(k => !['cycleId', 'startedOn', 'expectedStartedOn', 'checkedOn', 'status', 'note', 'requestId'].includes(k))) return '記録以外の項目は保存できません'
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (typeof b.cycleId !== 'string' || !uuid.test(b.cycleId) || typeof b.requestId !== 'string' || !uuid.test(b.requestId)) return '対象の記録を開き直してください'
  if (!validStarDate(b.checkedOn) || b.checkedOn > today) return '確認日は今日以前の日付で指定してください'
  if (b.startedOn !== null && (!validStarDate(b.startedOn) || b.startedOn > b.checkedOn)) return '開始日は確認日以前で指定してください'
  if (b.expectedStartedOn !== null && !validStarDate(b.expectedStartedOn)) return '開始日を読み直してください'
  if (b.expectedStartedOn !== null && b.startedOn === null) return '設定した開始日は空に戻せません'
  if (!(STAR_LOG_STATUSES as readonly unknown[]).includes(b.status)) return '状況を選択してください'
  if (typeof b.note !== 'string' || b.note.length > 2000) return '自由メモは2000文字以内で入力してください'
  return null
}
