import { CAST_TIER_GROUPS } from '../types'
import type { CastManagementRow, CastManagementOrder } from '../types'
import { getCastJoinDate } from './castTenure'

const collator = new Intl.Collator('ja', { sensitivity: 'base', numeric: true })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tierOrder = new Map<string, number>(CAST_TIER_GROUPS.map((tier, index) => [tier, index]))

export function castManagementName(row: CastManagementRow): string {
  return row.cast_name?.trim() || row.display_name?.trim() || '名前未設定'
}

function reading(name: string): string {
  return name.normalize('NFKC').replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
}

export function castManagementGroupKey(row: CastManagementRow): string {
  return JSON.stringify([row.is_active, row.cast_tier || '層未設定'])
}

// 名簿が変わった際に古い編集内容を保存しない。元配列の順序には依存しない。
export function castManagementRosterKey(rows: readonly CastManagementRow[]): string {
  return JSON.stringify([...rows].sort((a, b) => a.id.localeCompare(b.id)).map(row => [
    row.id, row.cast_name, row.display_name, row.cast_tier, row.is_active,
    row.joined_at ?? null, row.training_start_date ?? null,
  ]))
}

export function groupCastManagementRows<T extends CastManagementRow>(rows: readonly T[], orderedIds: readonly string[] = []) {
  const positions = new Map<string, number>()
  orderedIds.forEach((id, index) => { if (!positions.has(id)) positions.set(id, index) })
  const sorted = [...rows].sort((a, b) => {
    // 現行と同じく在籍を先に表示。退店・旧層・未設定も消さない。
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    const aTier = a.cast_tier || '層未設定', bTier = b.cast_tier || '層未設定'
    if (aTier !== bTier) {
      const weight = (tier: string) => tier === '層未設定' ? 1000 : tierOrder.get(tier) ?? 999
      return weight(aTier) - weight(bTier) || collator.compare(aTier, bTier)
    }
    const position = (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity)
    if (position && !Number.isNaN(position)) return position
    // 手動保存を優先し、標準・未保存の行は入店が古い順。未設定/不正日付は末尾。
    const aJoined = getCastJoinDate(a), bJoined = getCastJoinDate(b)
    if (aJoined !== bJoined) {
      if (!aJoined) return 1
      if (!bJoined) return -1
      return aJoined < bJoined ? -1 : 1
    }
    return collator.compare(reading(castManagementName(a)), reading(castManagementName(b))) || a.id.localeCompare(b.id)
  })
  const groups: { key: string; tier: string; active: boolean; rows: T[] }[] = []
  for (const row of sorted) {
    const key = castManagementGroupKey(row)
    let group = groups[groups.length - 1]
    if (!group || group.key !== key) {
      group = { key, tier: row.cast_tier || '層未設定', active: row.is_active, rows: [] }
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}

// ドラッグ/上下ボタン共通。層・在籍状態をまたぐ移動は受け付けない。
export function moveCastWithinGroup(rows: readonly CastManagementRow[], ids: readonly string[], fromId: string, toId: string): string[] {
  const ordered = groupCastManagementRows(rows, ids).flatMap(group => group.rows)
  const from = ordered.findIndex(row => row.id === fromId), to = ordered.findIndex(row => row.id === toId)
  if (from < 0 || to < 0 || castManagementGroupKey(ordered[from]) !== castManagementGroupKey(ordered[to])) return ordered.map(row => row.id)
  const [moved] = ordered.splice(from, 1)
  ordered.splice(to, 0, moved)
  return ordered.map(row => row.id)
}

export function isCastManagementOrder(value: unknown): value is CastManagementOrder {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.orderedCastIds) && v.orderedCastIds.length <= 2000 && v.orderedCastIds.every(id => typeof id === 'string' && uuid.test(id))
    && new Set(v.orderedCastIds).size === v.orderedCastIds.length
    && Number.isSafeInteger(v.revision) && (v.revision as number) >= 0 && (v.revision as number) < Number.MAX_SAFE_INTEGER
    && typeof v.rosterKey === 'string' && v.rosterKey.length <= 500000
}

// 空配列は全体を「入店日が古い順」に戻す指定。それ以外は全員を過不足なく含める。
export function validCastManagementOrder(rows: readonly CastManagementRow[], ids: readonly string[]): boolean {
  if (!ids.length) return true
  if (ids.length !== rows.length || new Set(ids).size !== ids.length) return false
  const byId = new Map(rows.map(row => [row.id, row]))
  const expected = groupCastManagementRows(rows).flatMap(group => group.rows.map(row => castManagementGroupKey(row)))
  return ids.every((id, index) => {
    const row = byId.get(id)
    return row !== undefined && castManagementGroupKey(row) === expected[index]
  })
}
