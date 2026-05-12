// プレースホルダ {name} {hobby} 展開
import type { Customer } from '@/types'

/**
 * テンプレ内の {name} と {hobby} を顧客データで置換。
 *   - name は nickname > customer_name > 'あなた' の優先順
 *   - hobby が空でテンプレが {hobby} を含む → 空文字を返す (呼び出し側でフィルタ)
 */
export function applyTokens(template: string, customer: Partial<Customer>): string {
  const nickname = (customer.nickname ?? '').trim()
  const fullName = (customer.customer_name ?? '').trim()
  const name = nickname || fullName || 'あなた'
  const hobby = (customer.hobby ?? '').trim()

  let out = template
  // 厳密に置換 (グローバル)
  out = out.split('{name}').join(name)

  if (out.includes('{hobby}')) {
    if (!hobby) return ''  // hobby 必須のテンプレで hobby なし → 採用不可
    out = out.split('{hobby}').join(hobby)
  }

  return out
}
