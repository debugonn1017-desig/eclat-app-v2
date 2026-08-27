export const CUSTOMER_STAFF_PERMISSION = '顧客.担当' as const
export const MAX_CUSTOMER_STAFF_ASSIGNMENTS = 20

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type CustomerStaffOption = {
  id: string
  display_name: string
}

export function parseCustomerStaffIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error('CUSTOMER_STAFF_IDS_INVALID')

  const unique: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== 'string' || !UUID_PATTERN.test(raw)) {
      throw new Error('CUSTOMER_STAFF_IDS_INVALID')
    }
    if (!seen.has(raw)) {
      seen.add(raw)
      unique.push(raw)
    }
  }
  if (unique.length > MAX_CUSTOMER_STAFF_ASSIGNMENTS) {
    throw new Error('CUSTOMER_STAFF_IDS_TOO_MANY')
  }
  return unique
}

export function formatCustomerStaffNames(names: string[] | null | undefined): string {
  const cleaned = (names ?? []).map(name => name.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned.join('・') : '未割り当て'
}
