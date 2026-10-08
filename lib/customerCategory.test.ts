// ============================================================
// lib/customerCategory.ts の仕様固定テスト (v0.3.53-A)
// ============================================================
// 実行: npm run test:category
//   (追加パッケージ不要。既存 tsc でコンパイル → Node 22 内蔵の node:test で実行)
//
// 承認された v0.3.107 定義を独立した分類オラクルと全組み合わせで照合。
// 地域未設定は顧客一覧=その他、KPI・売上実績=県外。その他の従来分類は維持。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyCustomersTab,
  classifySalesTab,
  isKpiKokyaku,
  isKpiKengai,
  type CustomerCategoryInput,
  type CustomersTabCategory,
} from './customerCategory'

// ─── テスト用の値域 (NULL / 空文字 / 空白 / 不正値を含む) ───────────
const NOMINATIONS = ['本指名', '場内', 'フリー', '', null, '不正な値'] as const
const RANKS = ['S', 'A', 'B', 'C', '切れた', null, '', 'X'] as const
const REGIONS = ['福岡県', '東京都', null, '', ' '] as const

function* allCombos(): Generator<CustomerCategoryInput> {
  for (const nomination_status of NOMINATIONS) {
    for (const customer_rank of RANKS) {
      for (const region of REGIONS) {
        yield { nomination_status, customer_rank, region }
      }
    }
  }
}

const label = (c: CustomerCategoryInput) =>
  `nomination=${JSON.stringify(c.nomination_status)} rank=${JSON.stringify(c.customer_rank)} region=${JSON.stringify(c.region)}`

// ─── オラクル①: CUSTOMERS タブの旧 filter 条件 (app/casts/[id]/page.tsx v0.3.52-A) ──
//   v0.3.107定義は「8本の独立した filter」だったため、マッチしたグループを全部集める。
//   (排他性 = 配列長が常に 1 以下、であることもここで同時に検証できる)
function legacyCustomersCategories(c: CustomerCategoryInput): CustomersTabCategory[] {
  if (c.customer_rank !== '切れた' && c.nomination_status === '本指名' && !c.region?.trim()) return ['その他']
  const matched: CustomersTabCategory[] = []
  const SAB = ['S', 'A', 'B']
  // severed
  if (c.customer_rank === '切れた') matched.push('切れた')
  // kokyaku
  if (c.customer_rank !== '切れた' &&
    c.nomination_status === '本指名' && c.region === '福岡県' && !!c.customer_rank && SAB.includes(c.customer_rank)) matched.push('県内顧客')
  // kengai
  if (c.customer_rank !== '切れた' &&
    c.nomination_status === '本指名' && !!c.customer_rank && SAB.includes(c.customer_rank) && !!c.region && c.region !== '福岡県') matched.push('県外顧客')
  // rankC
  if (c.customer_rank !== '切れた' &&
    c.nomination_status === '本指名' && c.customer_rank === 'C') matched.push('ランクC')
  // sonota
  if (c.customer_rank !== '切れた' &&
    c.nomination_status === '本指名' && (!c.customer_rank || !['S', 'A', 'B', 'C'].includes(c.customer_rank))) matched.push('その他')
  // banai
  if (c.customer_rank !== '切れた' && c.nomination_status === '場内') matched.push('場内')
  // free
  if (c.customer_rank !== '切れた' && (!c.nomination_status || c.nomination_status === 'フリー')) matched.push('フリー')
  return matched
}

// ─── オラクル②: SALES タブの旧 getCategory (app/casts/[id]/page.tsx) ──
//   v0.3.107定義は Map から '' デフォルトで取り出していたため、同じ正規化を通す。
function legacySalesCategory(c: CustomerCategoryInput): string {
  const ns = c.nomination_status ?? ''
  const rg = c.region ?? ''
  const rk = c.customer_rank ?? ''
  if (ns === '場内') return '場内'
  if (ns === 'フリー' || !ns) return 'フリー'
  if (rk === 'C') return 'ランクC'
  if (['S', 'A', 'B'].includes(rk)) {
    if (rg !== '福岡県') return '県外顧客'
    return '県内顧客'
  }
  return 'その他'
}

// ─── オラクル③: KPI 述語のv0.3.107定義 (hooks/useCasts.ts / app/api/cast-rankings/route.ts) ──
function legacyIsKokyaku(c: CustomerCategoryInput): boolean {
  return c.nomination_status === '本指名' &&
    c.region === '福岡県' && !!c.customer_rank && ['S', 'A', 'B'].includes(c.customer_rank)
}
function legacyIsKengai(c: CustomerCategoryInput): boolean {
  return c.nomination_status === '本指名' && c.region !== '福岡県'
}

// ═══ 1. CUSTOMERS: 全組み合わせでv0.3.107定義と完全一致 + 排他性 ═══════════
test('CUSTOMERS: 全組み合わせ (指名6×ランク8×地域5=240) でv0.3.107定義と一致し、必ず高々1カテゴリ', () => {
  let count = 0
  for (const c of allCombos()) {
    const legacy = legacyCustomersCategories(c)
    assert.ok(legacy.length <= 1, `v0.3.107定義で複数カテゴリに重複: ${label(c)} → ${legacy.join(',')}`)
    const expected = legacy.length === 1 ? legacy[0] : null
    assert.equal(classifyCustomersTab(c), expected, `不一致: ${label(c)}`)
    count++
  }
  assert.equal(count, NOMINATIONS.length * RANKS.length * REGIONS.length)
})

// ═══ 2. SALES: 全組み合わせで旧 getCategory と完全一致 ═══════════════
test('SALES: 全組み合わせで旧 getCategory と一致 (地域未設定=県外顧客・切れた分類なし)', () => {
  for (const c of allCombos()) {
    assert.equal(classifySalesTab(c), legacySalesCategory(c), `不一致: ${label(c)}`)
  }
})

// ═══ 3. KPI 述語: 全組み合わせでv0.3.107定義と完全一致 ════════════════════
test('KPI: isKpiKokyaku / isKpiKengai がv0.3.107定義 (useCasts/cast-rankings) と一致', () => {
  for (const c of allCombos()) {
    assert.equal(isKpiKokyaku(c), legacyIsKokyaku(c), `kokyaku 不一致: ${label(c)}`)
    assert.equal(isKpiKengai(c), legacyIsKengai(c), `kengai 不一致: ${label(c)}`)
  }
})

// ═══ 4. 固定仕様の明示ケース (回帰の早期検知用に1件ずつ名前付きで固定) ═══
test('固定仕様: 本指名S/A/B の地域別分類 (CUSTOMERS)', () => {
  const base = { nomination_status: '本指名', customer_rank: 'A' }
  assert.equal(classifyCustomersTab({ ...base, region: '福岡県' }), '県内顧客')
  assert.equal(classifyCustomersTab({ ...base, region: '東京都' }), '県外顧客')
  assert.equal(classifyCustomersTab({ ...base, region: null }), 'その他')
  assert.equal(classifyCustomersTab({ ...base, region: '' }), 'その他')
  // 空白のみの地域は truthy なため「県外顧客」になる (現行挙動の固定)。
  // ⚠ 既知課題 (Codex 指摘 2026-07-16): DB の門番トリガーが btrim 正規化するのは
  //   customers.cast_name のみで、region は正規化されない。空白のみの region が入ると
  //   CUSTOMERS/KPI では「県外」扱い・運用SQL (nullif(btrim(region),'')) では「未設定」扱い
  //   という不整合になり得る。是正は挙動変更になるため別バージョンでオーナー判断。
  assert.equal(classifyCustomersTab({ ...base, region: ' ' }), 'その他')
})

test('固定仕様: 切れたは指名状況に関係なく最優先 (CUSTOMERS)', () => {
  assert.equal(classifyCustomersTab({ nomination_status: '本指名', customer_rank: '切れた', region: '福岡県' }), '切れた')
  assert.equal(classifyCustomersTab({ nomination_status: '場内', customer_rank: '切れた', region: null }), '切れた')
  assert.equal(classifyCustomersTab({ nomination_status: null, customer_rank: '切れた', region: null }), '切れた')
})

test('固定仕様: SALES は地域未設定の本指名S/A/Bを「県外顧客」扱い (CUSTOMERS との意図的な非対称)', () => {
  const c = { nomination_status: '本指名', customer_rank: 'B', region: null }
  assert.equal(classifySalesTab(c), '県外顧客')
  assert.equal(classifyCustomersTab(c), 'その他')
})

test('固定仕様: KPI 顧客数は地域未設定を含めない / 県外入力では増えない', () => {
  const sab = { nomination_status: '本指名', customer_rank: 'S' }
  assert.equal(isKpiKokyaku({ ...sab, region: '福岡県' }), true)
  assert.equal(isKpiKokyaku({ ...sab, region: null }), false)   // 地域未設定 → 含めない
  assert.equal(isKpiKokyaku({ ...sab, region: '' }), false)
  assert.equal(isKpiKokyaku({ ...sab, region: '東京都' }), false) // 県外を入力しても顧客数には入らない
  assert.equal(isKpiKengai({ ...sab, region: '東京都' }), true)   // 県外顧客側に入る
})

test('固定仕様: KPI 県外顧客はランク不問 (現行仕様の固定。CUSTOMERSの県外顧客グループとは異なる)', () => {
  assert.equal(isKpiKengai({ nomination_status: '本指名', customer_rank: 'C', region: '東京都' }), true)
  assert.equal(isKpiKengai({ nomination_status: '本指名', customer_rank: null, region: '東京都' }), true)
  // CUSTOMERS タブでは C ランクは「ランクC」グループ (県外顧客ではない)
  assert.equal(classifyCustomersTab({ nomination_status: '本指名', customer_rank: 'C', region: '東京都' }), 'ランクC')
})

test('固定仕様: ランクC / その他 / 場内 / フリー の既存定義 (CUSTOMERS)', () => {
  assert.equal(classifyCustomersTab({ nomination_status: '本指名', customer_rank: 'C', region: '福岡県' }), 'ランクC')
  assert.equal(classifyCustomersTab({ nomination_status: '本指名', customer_rank: null, region: '福岡県' }), 'その他')
  assert.equal(classifyCustomersTab({ nomination_status: '場内', customer_rank: 'S', region: null }), '場内')
  assert.equal(classifyCustomersTab({ nomination_status: 'フリー', customer_rank: null, region: null }), 'フリー')
  assert.equal(classifyCustomersTab({ nomination_status: null, customer_rank: 'A', region: null }), 'フリー')
  // 不正な指名状況はどのグループにも表示しない (既存挙動の固定)
  assert.equal(classifyCustomersTab({ nomination_status: '不正な値', customer_rank: 'A', region: null }), null)
})
