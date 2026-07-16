// ============================================================
// lib/customerCategory.ts の仕様固定テスト (v0.3.53-A)
// ============================================================
// 実行: npm run test:category
//   (追加パッケージ不要。既存 tsc でコンパイル → Node 22 内蔵の node:test で実行)
//
// 戦略:
//   共通化前の旧実装 (v0.3.52-A 時点の inline 条件) をこのファイル内に
//   「オラクル」として意味的に同値な形で転記し (truthy 判定の `!!` 明示化のみ。
//   対象の型では完全に同値)、指名状況 × ランク × 地域の全組み合わせで
//   新モジュールとの完全一致を機械的に検証する。
//   → 「共通化で既存挙動が1ケースも変わっていない」ことの証明になる。

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
//   旧実装は「8本の独立した filter」だったため、マッチしたグループを全部集める。
//   (排他性 = 配列長が常に 1 以下、であることもここで同時に検証できる)
function legacyCustomersCategories(c: CustomerCategoryInput): CustomersTabCategory[] {
  const matched: CustomersTabCategory[] = []
  const SAB = ['S', 'A', 'B']
  // severed
  if (c.customer_rank === '切れた') matched.push('切れた')
  // kokyaku
  if (c.customer_rank !== '切れた' &&
    c.nomination_status === '本指名' && c.region === '福岡県' && !!c.customer_rank && SAB.includes(c.customer_rank)) matched.push('顧客')
  // kengai
  if (c.customer_rank !== '切れた' &&
    c.nomination_status === '本指名' && !!c.customer_rank && SAB.includes(c.customer_rank) && !!c.region && c.region !== '福岡県') matched.push('県外顧客')
  // regionMissing (v0.3.52-A)
  if (c.customer_rank !== '切れた' &&
    c.nomination_status === '本指名' && !!c.customer_rank && SAB.includes(c.customer_rank) && !c.region) matched.push('地域未設定')
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
//   旧実装は Map から '' デフォルトで取り出していたため、同じ正規化を通す。
function legacySalesCategory(c: CustomerCategoryInput): string {
  const ns = c.nomination_status ?? ''
  const rg = c.region ?? ''
  const rk = c.customer_rank ?? ''
  if (ns === '場内') return '場内'
  if (ns === 'フリー' || !ns) return 'フリー'
  if (rk === 'C') return 'ランクC'
  if (['S', 'A', 'B'].includes(rk)) {
    if (rg && rg !== '福岡県') return '県外顧客'
    return '顧客'
  }
  return 'その他'
}

// ─── オラクル③: KPI 述語の旧実装 (hooks/useCasts.ts / app/api/cast-rankings/route.ts) ──
function legacyIsKokyaku(c: CustomerCategoryInput): boolean {
  return c.nomination_status === '本指名' &&
    c.region === '福岡県' && !!c.customer_rank && ['S', 'A', 'B'].includes(c.customer_rank)
}
function legacyIsKengai(c: CustomerCategoryInput): boolean {
  return c.nomination_status === '本指名' && !!c.region && c.region !== '福岡県'
}

// ═══ 1. CUSTOMERS: 全組み合わせで旧実装と完全一致 + 排他性 ═══════════
test('CUSTOMERS: 全組み合わせ (指名6×ランク8×地域5=240) で旧実装と一致し、必ず高々1カテゴリ', () => {
  let count = 0
  for (const c of allCombos()) {
    const legacy = legacyCustomersCategories(c)
    assert.ok(legacy.length <= 1, `旧実装で複数カテゴリに重複: ${label(c)} → ${legacy.join(',')}`)
    const expected = legacy.length === 1 ? legacy[0] : null
    assert.equal(classifyCustomersTab(c), expected, `不一致: ${label(c)}`)
    count++
  }
  assert.equal(count, NOMINATIONS.length * RANKS.length * REGIONS.length)
})

// ═══ 2. SALES: 全組み合わせで旧 getCategory と完全一致 ═══════════════
test('SALES: 全組み合わせで旧 getCategory と一致 (地域未設定=顧客扱い・切れた分類なし)', () => {
  for (const c of allCombos()) {
    assert.equal(classifySalesTab(c), legacySalesCategory(c), `不一致: ${label(c)}`)
  }
})

// ═══ 3. KPI 述語: 全組み合わせで旧実装と完全一致 ════════════════════
test('KPI: isKpiKokyaku / isKpiKengai が旧実装 (useCasts/cast-rankings) と一致', () => {
  for (const c of allCombos()) {
    assert.equal(isKpiKokyaku(c), legacyIsKokyaku(c), `kokyaku 不一致: ${label(c)}`)
    assert.equal(isKpiKengai(c), legacyIsKengai(c), `kengai 不一致: ${label(c)}`)
  }
})

// ═══ 4. 固定仕様の明示ケース (回帰の早期検知用に1件ずつ名前付きで固定) ═══
test('固定仕様: 本指名S/A/B の地域別分類 (CUSTOMERS)', () => {
  const base = { nomination_status: '本指名', customer_rank: 'A' }
  assert.equal(classifyCustomersTab({ ...base, region: '福岡県' }), '顧客')
  assert.equal(classifyCustomersTab({ ...base, region: '東京都' }), '県外顧客')
  assert.equal(classifyCustomersTab({ ...base, region: null }), '地域未設定')
  assert.equal(classifyCustomersTab({ ...base, region: '' }), '地域未設定')
  // 空白のみの地域は truthy なため「県外顧客」になる (現行挙動の固定)。
  // ⚠ 既知課題 (Codex 指摘 2026-07-16): DB の門番トリガーが btrim 正規化するのは
  //   customers.cast_name のみで、region は正規化されない。空白のみの region が入ると
  //   CUSTOMERS/KPI では「県外」扱い・運用SQL (nullif(btrim(region),'')) では「未設定」扱い
  //   という不整合になり得る。是正は挙動変更になるため別バージョンでオーナー判断。
  assert.equal(classifyCustomersTab({ ...base, region: ' ' }), '県外顧客')
})

test('固定仕様: 切れたは指名状況に関係なく最優先 (CUSTOMERS)', () => {
  assert.equal(classifyCustomersTab({ nomination_status: '本指名', customer_rank: '切れた', region: '福岡県' }), '切れた')
  assert.equal(classifyCustomersTab({ nomination_status: '場内', customer_rank: '切れた', region: null }), '切れた')
  assert.equal(classifyCustomersTab({ nomination_status: null, customer_rank: '切れた', region: null }), '切れた')
})

test('固定仕様: SALES は地域未設定の本指名S/A/Bを「顧客」扱い (CUSTOMERS との意図的な非対称)', () => {
  const c = { nomination_status: '本指名', customer_rank: 'B', region: null }
  assert.equal(classifySalesTab(c), '顧客')
  assert.equal(classifyCustomersTab(c), '地域未設定')
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
