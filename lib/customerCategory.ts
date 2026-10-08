// ============================================================
// 顧客分類の共通モジュール (v0.3.53-A)
// ============================================================
// v0.3.107: 県内顧客へ名称統一。地域未設定はKPIで県外、顧客一覧ではその他。
// ランクC・切れたなど、その他の分類・ランク条件は従来を維持。

/** KPI・分類で「上位ランク」とみなすランク */
export const SAB_RANKS = ['S', 'A', 'B'] as const

/**
 * 分類に必要な最小限の顧客属性 (構造的部分型)。
 * Customer 型のオブジェクトも、API 内の meta オブジェクトもそのまま渡せる。
 */
export type CustomerCategoryInput = {
  nomination_status?: string | null
  customer_rank?: string | null
  region?: string | null
}

/** CUSTOMERS タブのカテゴリ。null = どのグループにも表示しない (不正な指名状況の既存挙動) */
export type CustomersTabCategory =
  | '切れた'
  | '県内顧客'
  | '県外顧客'
  | 'ランクC'
  | 'その他'
  | '場内'
  | 'フリー'

/** SALES タブのカテゴリ (切れた独立分類なし = 現行仕様) */
export type SalesTabCategory = '県内顧客' | '県外顧客' | 'ランクC' | 'その他' | '場内' | 'フリー'

const isSAB = (rank: string | null | undefined): boolean =>
  !!rank && (SAB_RANKS as readonly string[]).includes(rank)

/** 本指名か */
export function isHonshimei(c: CustomerCategoryInput): boolean {
  return c.nomination_status === '本指名'
}

/**
 * KPI「顧客数」(v0.3.17 定義): 本指名 + 福岡県 + ランクS/A/B。
 * 地域未設定 (null / 空文字 / 空白のみ) は含めない。
 * 「切れた」は customer_rank='切れた' が S/A/B でないため自然に除外される。
 */
export function isKpiKokyaku(c: CustomerCategoryInput): boolean {
  return isHonshimei(c) && c.region === '福岡県' && isSAB(c.customer_rank)
}

/**
 * KPI「県外顧客」: 本指名 + ランクS/A/B + 福岡県以外（地域未設定も含む）。
 * v0.3.112: 県内と同じランク条件に統一。C・切れた・ランク未設定などは除外。
 * 地域未設定を含む点だけは、CUSTOMERS タブ（その他に分類）と意図的に異なる。
 */
export function isKpiKengai(c: CustomerCategoryInput): boolean {
  return isHonshimei(c) && isSAB(c.customer_rank) && c.region !== '福岡県'
}

/**
 * CUSTOMERS タブの分類 (v0.3.52-A 時点の挙動を固定)。
 *
 *   1. 切れた (customer_rank='切れた')       → '切れた' (指名状況に関係なく最優先)
 *   2. 本指名 × S/A/B × 福岡県               → '県内顧客'
 *   3. 本指名 × S/A/B × 福岡県以外 (入力有)  → '県外顧客'
 *   4. 本指名 × 地域未設定（ランク問わず）   → 'その他'
 *   5. 本指名 × C                            → 'ランクC'
 *   6. 本指名 × 上記以外のランク             → 'その他'
 *   7. 場内 (ランク不問)                     → '場内'
 *   8. フリー / 指名状況未設定 (ランク不問)  → 'フリー'
 *   9. 不正な指名状況 (上記のどれでもない)   → null (どのグループにも表示しない = 既存挙動)
 */
export function classifyCustomersTab(c: CustomerCategoryInput): CustomersTabCategory | null {
  if (c.customer_rank === '切れた') return '切れた'
  if (c.nomination_status === '本指名') {
    if (!c.region?.trim()) return 'その他'
    if (isSAB(c.customer_rank)) {
      if (c.region === '福岡県') return '県内顧客'
      if (c.region && c.region !== '福岡県') return '県外顧客'
      return 'その他'
    }
    if (c.customer_rank === 'C') return 'ランクC'
    return 'その他'
  }
  if (c.nomination_status === '場内') return '場内'
  if (!c.nomination_status || c.nomination_status === 'フリー') return 'フリー'
  return null
}

/**
 * SALES タブの分類 (従来の getCategory と同一挙動)。
 * CUSTOMERS タブとの意図的な差:
 *   - 地域未設定の本指名 S/A/B は「県外顧客」扱い
 *   - 「切れた」の独立分類なし (切れた本指名は 'その他' 等に落ちる)
 *   - 場内・フリー以外の指名状況 (不正値含む) はランク判定へ落ちる (歴史的挙動)
 */
export function classifySalesTab(c: CustomerCategoryInput): SalesTabCategory {
  const ns = c.nomination_status ?? ''
  const rk = c.customer_rank ?? ''
  const rg = c.region ?? ''
  if (ns === '場内') return '場内'
  if (ns === 'フリー' || !ns) return 'フリー'
  if (rk === 'C') return 'ランクC'
  if (isSAB(rk)) {
    if (rg !== '福岡県') return '県外顧客'
    return '県内顧客' // 福岡県
  }
  return 'その他'
}
