import { checkPermission, getCurrentProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const STAR_CYCLE_COLUMNS = 'id,customer_id,started_on,opened_at,ended_at,last_checked_on,last_status'
export const STAR_EVENT_COLUMNS = 'id,kind,event_on,started_on,status,note,actor_name,recorded_at'
export class StarLogError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function starLogSession(write = false) {
  const profile = await getCurrentProfile()
  if (!profile) throw new StarLogError('ログインしてください', 401)
  if (profile.role === 'cast' && !profile.cast_name) throw new StarLogError('担当が未設定です', 403)
  const canEdit = profile.role === 'cast' || profile.is_owner || await checkPermission('顧客.編集')
  if (write ? !canEdit : !canEdit && !await checkPermission('顧客.閲覧')) throw new StarLogError('顧客の権限がありません', 403)
  return { profile, canEdit, client: await createClient() }
}
export function starCustomerId(id: string): number {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new StarLogError('お客様IDが不正です', 400)
  return Number(id)
}
export function starLogPage(raw: string | null): number {
  if (raw === null) return 1
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 100000) throw new StarLogError('ページが不正です', 400)
  return Number(raw)
}
export function starLogFailure(error: unknown): { error: string; status: number } {
  if (error instanceof StarLogError) return { error: error.message, status: error.status }
  return { error: '⭐️記録を取得・保存できませんでした。時間をおいて再試行してください', status: 503 }
}
