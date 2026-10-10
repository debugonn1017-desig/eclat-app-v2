import type { Announcement } from '@/types'

// 閲覧済みは端末内・ログイン本人ごと。旧キーは他ユーザーと共有なので引き継がない。
export const ANNOUNCEMENT_READ_EVENT = 'eclat-announcements-read'
export function announcementReadKey(userId: string): string {
  return `eclat_announcement_reads_v2:${userId}`
}
export function announcementReadToken(item: Pick<Announcement, 'id' | 'updated_at'>): string {
  return `${String(item.id)}:${item.updated_at}`
}
export function parseAnnouncementReads(raw: string | null): Set<string> {
  try {
    const values: unknown = JSON.parse(raw ?? '[]')
    return new Set(Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string').slice(-500) : [])
  } catch { return new Set() }
}
