export const CORE_CUSTOMER_FIELDS = [
  { key: 'customer_name', label: 'お客様名' },
  { key: 'nickname', label: 'ニックネーム' },
  { key: 'age_group', label: '年代' },
  { key: 'region', label: '地域' },
  { key: 'spouse_status', label: '既婚' },
  { key: 'occupation', label: '職業' },
  { key: 'nomination_status', label: '指名状況' },
] as const

export type CoreCustomerFieldKey = typeof CORE_CUSTOMER_FIELDS[number]['key']

export type CoreCustomerInput = Partial<Record<CoreCustomerFieldKey, unknown>>

function isMissing(value: unknown): boolean {
  return value === null
    || value === undefined
    || (typeof value === 'string' && value.trim() === '')
}

export function getMissingCoreCustomerFields(
  customer: CoreCustomerInput,
): Array<{ key: CoreCustomerFieldKey; label: string }> {
  return CORE_CUSTOMER_FIELDS.filter(field => isMissing(customer[field.key]))
}
