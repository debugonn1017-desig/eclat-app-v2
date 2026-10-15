/** 閲覧用の候補。入店日・管理用のrevisionなどはブラウザへ返さない。 */
export type CustomerCastOption = {
  id: string
  cast_name: string
  display_name: string | null
  cast_tier: string | null
  is_active: boolean
}

/** サーバーで確定した共通順を保ち、PC一覧とselectを同じ区切りで表示する。 */
export function groupCustomerCastOptions(rows: readonly CustomerCastOption[]) {
  const groups: { key: string; tier: string; active: boolean; rows: CustomerCastOption[] }[] = []
  for (const row of rows) {
    const tier = row.cast_tier || '層未設定'
    const key = JSON.stringify([row.is_active, tier])
    let group = groups.find(item => item.key === key)
    if (!group) {
      group = { key, tier, active: row.is_active, rows: [] }
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}
