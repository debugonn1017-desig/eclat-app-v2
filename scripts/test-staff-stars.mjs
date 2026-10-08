// 実際の検索APIを読み込み、認可→担当範囲→⭐️条件→ページングをモックDBで検証。
// DB・ネットワーク・秘密情報は使わない。
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
const root = fileURLToPath(new URL('..', import.meta.url))

function loadFile(file, mocks) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  vm.runInThisContext(`(function(require, exports) { ${code}\n})`, { filename: file })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    throw new Error('Unexpected import: ' + name)
  }, exports)
  return exports
}

const scope = loadFile('lib/customerQueryScope.ts', {})
const patterns = loadFile('lib/customerVisitPattern.ts', {})
const starred = loadFile('lib/starredCustomers.ts', {})
const pagination = loadFile('lib/supabaseHelpers.ts', {})
const rows = Array.from({ length: 130 }, (_, index) => ({
  id: String(index + 1), is_starred: index < 105,
  cast_name: index % 2 ? 'りな' : 'あかり', customer_name: `お客様${index}`,
  metric_last_visit_date: null, metric_first_visit_date: null,
}))
function setup({ role = 'admin', owner = false, allowed = true, castName = null, authenticated = true, fixtures = rows, castOptions = ['りな', 'あかり'], castOptionsError = null } = {}) {
  const calls = []
  let adminReads = 0
  const makeQuery = () => ({
    filters: [],
    sorts: [],
    select(...args) { calls.push(['select', ...args]); return this },
    eq(key, value) { calls.push(['eq', key, value]); this.filters.push(row => row[key] === value); return this },
    or(expression) {
      calls.push(['or', expression])
      assert.equal(expression, starred.starredBanaiVisitFilter('2026-10-09'))
      const dates = starred.getStarredBanaiVisitDates('2026-10-09')
      this.filters.push(row => row.nomination_status !== '場内' || dates.includes(row.metric_last_visit_date))
      return this
    },
    order(key, options) { calls.push(['order', key, options]); this.sorts.push([key, options]); return this },
    range(from, to) {
      calls.push(['range', from, to])
      const filtered = fixtures.filter(row => this.filters.every(filter => filter(row))).sort((a, b) => {
        for (const [key, { ascending, nullsFirst = false }] of this.sorts) {
          const av = a[key], bv = b[key]
          if (av == null && bv == null) continue
          if (av == null) return nullsFirst ? -1 : 1
          if (bv == null) return nullsFirst ? 1 : -1
          const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
          if (cmp) return ascending ? cmp : -cmp
        }
        return 0
      })
      return Promise.resolve({ data: filtered.slice(from, to + 1), count: filtered.length, error: null })
    },
  })
  const profileQuery = {
    select() { return this }, eq() { return this }, not() { return this }, order() { return this },
    range(from, to) { calls.push(['profiles-range', from, to]); return Promise.resolve({ data: castOptions.slice(from, to + 1).map(cast_name => ({ cast_name })), error: castOptionsError }) },
  }
  const route = loadFile('app/api/customers/search/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
    '@/lib/auth': { getCurrentProfile: async () => ({ role, is_owner: owner, cast_name: castName }), checkPermission: async () => allowed },
    '@/lib/customerQueryScope': scope,
    '@/lib/starredCustomers': starred,
    '@/lib/supabaseHelpers': pagination,
    '@/lib/followUpWorkflow': { getJstDateString: () => '2026-10-09' },
    '@/lib/supabase/admin': { createAdminClient: () => { adminReads++; return { from: () => makeQuery() } } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user' } : null } }) }, from: () => profileQuery }) },
    '@/lib/customerVisitPattern': patterns,
  })
  return { calls, reads: () => adminReads, get: params => route.GET(new Request('https://example.test/api/customers/search?' + params)) }
}

test('スタッフは選択なしで全キャストの⭐️のみ。全件を絞ってから50件ページング', async () => {
  const env = setup()
  const response = await env.get('starred=true&page=1&pageSize=50')
  assert.equal(response.status, 200)
  const json = await response.json()
  assert.equal(json.total, 105)
  assert.equal(json.pageCount, 3)
  assert.equal(json.customers.length, 50)
  assert.equal(new Set(json.customers.map(c => c.cast_name)).size, 2)
  assert.ok(json.customers.every(c => c.is_starred))
  assert.ok(!env.calls.some(c => c[0] === 'eq' && c[1] === 'cast_name'))
  assert.ok(env.calls.findIndex(c => c[0] === 'eq' && c[1] === 'is_starred') < env.calls.findIndex(c => c[0] === 'range'))
})
test('3ページ目にも⭐️だけを返し、未⭐️行が混ざらない', async () => {
  const response = await setup().get('starred=true&page=3&pageSize=50')
  const json = await response.json()
  assert.equal(json.customers.length, 5)
  assert.ok(json.customers.every(c => c.is_starred))
})
test('全員⭐️は名簿順に全件を並べてからページング、担当内は選んだ売上順', async () => {
  const fixtures = Array.from({ length: 1205 }, (_, i) => ({
    id: String(i), cast_name: i % 2 ? 'りな' : 'あかり', is_starred: true,
    metric_total_spent: i, nomination_status: '本指名', metric_last_visit_date: '2026-10-01',
  }))
  const env = setup({ fixtures })
  const first = await (await env.get('starred=true&starredCastOrder=true&sort=totalSpent')).json()
  assert.equal(first.total, 1205)
  assert.equal(first.pageCount, 25)
  assert.ok(first.customers.every(c => c.cast_name === 'りな'))
  assert.equal(first.customers[0].metrics.totalSpent, 1203)
  const boundary = await (await env.get('starred=true&starredCastOrder=true&sort=totalSpent&page=13')).json()
  assert.deepEqual(boundary.customers.slice(0, 3).map(c => c.cast_name), ['りな', 'りな', 'あかり'])
  assert.equal(boundary.customers[2].metrics.totalSpent, 1204)
  assert.ok(env.calls.some(c => c[0] === 'range' && c[1] === 1000))
})
test('キャスト順の副次順を保ち、名簿外・担当未設定も失わず、入力配列を変えない', () => {
  const source = [{ cast_name: null, id: 1 }, { cast_name: 'あかり', id: 2 }, { cast_name: 'りな', id: 3 }, { cast_name: '名簿外', id: 4 }, { cast_name: 'りな', id: 5 }]
  const sorted = starred.sortStarredCustomersByCast(source, ['りな', 'あかり', 'りな'])
  assert.deepEqual(sorted.map(c => c.id), [3, 5, 2, 4, 1])
  assert.deepEqual(source.map(c => c.id), [1, 2, 3, 4, 5])
})
test('全員キャスト順はスタッフ⭐️限定。キャスト直叩き・通常検索・個別絞り込み・不正値を拒否', async () => {
  for (const [options, params] of [[{ role: 'cast', castName: 'りな' }, 'starred=true&starredCastOrder=true'], [{}, 'starredCastOrder=true'], [{}, 'starred=true&castName=りな&starredCastOrder=true'], [{}, 'starred=true&starredCastOrder=yes']]) {
    const env = setup(options)
    assert.equal((await env.get(params)).status, 400)
    assert.equal(env.reads(), 0)
  }
})
test('名簿取得失敗は成功扱いの別順序を返さず、500で再取得を案内する', async () => {
  const env = setup({ castOptionsError: { message: 'fixture cast fetch failed' } })
  assert.equal((await env.get('starred=true&starredCastOrder=true')).status, 500)
  assert.ok(!env.calls.some(c => c[0] === 'range'))
})
test('スタッフのキャスト絞り込みもDB全件に適用する', async () => {
  const json = await (await setup().get('starred=true&castName=' + encodeURIComponent('りな'))).json()
  assert.equal(json.total, 52)
  assert.ok(json.customers.every(c => c.cast_name === 'りな'))
})
test('キャストは全員指定でも本人担当のみ。他キャスト指定は0件', async () => {
  const own = await (await setup({ role: 'cast', castName: 'りな' }).get('starred=true')).json()
  assert.equal(own.total, 52)
  const other = await (await setup({ role: 'cast', castName: 'りな' }).get('starred=true&castName=' + encodeURIComponent('あかり'))).json()
  assert.equal(other.total, 0)
})
test('未認証・権限なし・担当名なしは集計クライアント作成前に拒否', async () => {
  for (const [options, status] of [[{ authenticated: false }, 401], [{ allowed: false }, 403], [{ role: 'cast', castName: null }, 403]]) {
    const env = setup(options)
    assert.equal((await env.get('starred=true')).status, status)
    assert.equal(env.reads(), 0)
  }
})
test('オーナーは権限表がfalseでも閲覧可。不正な⭐️条件は400', async () => {
  assert.equal((await setup({ owner: true, allowed: false }).get('starred=true')).status, 200)
  const env = setup()
  assert.equal((await env.get('starred=yes')).status, 400)
  assert.equal(env.reads(), 0)
})
test('⭐️未指定の通常検索は従来どおり。⭐️0人でも最小1ページ', async () => {
  const ordinary = await (await setup().get('pageSize=50')).json()
  assert.equal(ordinary.total, 130)
  const empty = await (await setup({ fixtures: [] }).get('starred=true')).json()
  assert.equal(empty.total, 0)
  assert.equal(empty.pageCount, 1)
})

test('場内は1日前と3の倍数のみ。本指名は未記録・期間外も全員残し、全件を絞ってページング', async () => {
  const fixtures = Array.from({ length: 41 }, (_, days) => {
    const date = new Date('2026-10-09T00:00:00Z')
    date.setUTCDate(date.getUTCDate() - days)
    return { id: String(days), cast_name: 'りな', is_starred: true, nomination_status: '場内', metric_last_visit_date: date.toISOString().slice(0, 10) }
  })
  fixtures.push({ id: 'hon-old', cast_name: 'りな', is_starred: true, nomination_status: '本指名', metric_last_visit_date: '2020-01-01' })
  fixtures.push({ id: 'hon-null', cast_name: 'りな', is_starred: true, nomination_status: '本指名', metric_last_visit_date: null })
  fixtures.push({ id: 'ban-null', cast_name: 'りな', is_starred: true, nomination_status: '場内', metric_last_visit_date: null })
  fixtures.push({ id: 'ban-future', cast_name: 'りな', is_starred: true, nomination_status: '場内', metric_last_visit_date: '2026-10-10' })
  const env = setup({ fixtures })
  const json = await (await env.get('starred=true&starredBanaiVisitDays=true&pageSize=5&page=3')).json()
  assert.equal(json.total, 13)
  assert.equal(json.pageCount, 3)
  assert.equal(json.customers.length, 3)
  assert.deepEqual(json.customers.map(c => c.id), ['9', 'hon-null', 'hon-old'])
  assert.equal(json.customers[0].metrics.daysSinceLastVisit, 9)
  assert.ok(env.calls.findIndex(c => c[0] === 'or') < env.calls.findIndex(c => c[0] === 'range'))
  const all = await (await setup({ fixtures }).get('starred=true')).json()
  assert.equal(all.total, 45)
  const castOrdered = await (await setup({ fixtures }).get('starred=true&starredCastOrder=true&starredBanaiVisitDays=true')).json()
  assert.equal(castOrdered.total, 13)
  assert.ok(castOrdered.customers.filter(c => c.nomination_status === '場内').every(c => starred.STARRED_BANAI_VISIT_DAYS.includes(c.metrics.daysSinceLastVisit)))
})
test('場内以外の既存分類は日数条件で除外しない', async () => {
  const fixtures = ['本指名', 'フリー', '', null, 'その他'].map((status, index) => ({ id: String(index), cast_name: 'りな', is_starred: true, nomination_status: status, metric_last_visit_date: null }))
  const json = await (await setup({ fixtures }).get('starred=true&starredBanaiVisitDays=true')).json()
  assert.equal(json.total, 5)
})
test('場内日数条件は⭐️限定時のみ指定可能。キャスト担当範囲も維持', async () => {
  for (const params of ['starredBanaiVisitDays=true', 'starred=true&starredBanaiVisitDays=false', 'starred=true&starredBanaiVisitDays=3']) {
    const env = setup()
    assert.equal((await env.get(params)).status, 400)
    assert.equal(env.reads(), 0)
  }
  const own = setup({ role: 'cast', castName: 'りな' })
  const json = await (await own.get('starred=true&starredBanaiVisitDays=true')).json()
  assert.ok(json.customers.every(c => c.cast_name === 'りな'))
})
test('対象暦日の日付境界（月末・年末・閏日）と11日分の定義', () => {
  assert.deepEqual(starred.STARRED_BANAI_VISIT_DAYS, [1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30])
  assert.deepEqual(starred.getStarredBanaiVisitDates('2026-01-01').slice(0, 2), ['2025-12-31', '2025-12-29'])
  assert.equal(starred.getStarredBanaiVisitDates('2024-03-01')[0], '2024-02-29')
  assert.equal(starred.getStarredBanaiVisitDates('2026-03-01')[0], '2026-02-28')
})
test('本/場の人数は顧客行数。未知分類・担当なしも全体から落とさない', () => {
  const result = starred.countStarredCustomers([
    { cast_name: 'りな', nomination_status: '本指名' }, { cast_name: 'りな', nomination_status: '場内' },
    { cast_name: null, nomination_status: 'フリー' }, { cast_name: '__proto__', nomination_status: '本指名' },
  ])
  assert.deepEqual(result.total, { total: 4, honshimei: 2, banai: 1 })
  assert.deepEqual(result.byCast['りな'], { total: 2, honshimei: 1, banai: 1 })
  assert.deepEqual(result.byCast['__proto__'], { total: 1, honshimei: 1, banai: 0 })
})

function setupCounts({ role = 'admin', owner = false, allowed = true, authenticated = true, failure = false } = {}) {
  let reads = 0
  const calls = []
  const fixtures = Array.from({ length: 1025 }, (_, index) => ({ cast_name: index % 2 ? 'りな' : 'あかり', nomination_status: index % 2 ? '本指名' : '場内' }))
  const route = loadFile('app/api/customers/star-counts/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
    '@/lib/auth': { requireUser: async () => { if (!authenticated) throw new Error('UNAUTHENTICATED'); return { role, is_owner: owner } }, checkPermission: async () => allowed },
    '@/lib/starredCustomers': starred,
    '@/lib/supabase/server': { createClient: async () => {
      reads++
      const query = {
        select(columns) { assert.equal(columns, 'cast_name,nomination_status'); return this },
        eq(key, value) { assert.equal(key, 'is_starred'); assert.equal(value, true); return this },
        order(key, options) { assert.equal(key, 'id'); assert.equal(options.ascending, true); return this },
        range(from, to) { calls.push([from, to]); return Promise.resolve({ data: fixtures.slice(from, to + 1), error: failure ? { message: 'test DB failure' } : null }) },
      }
      return { from: table => { assert.equal(table, 'customers'); return query } }
    } },
  })
  return { get: () => route.GET(), reads: () => reads, calls }
}
test('名簿人数APIは1000件超も全件集計・本と場の人数を区別', async () => {
  const env = setupCounts()
  const response = await env.get()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  const json = await response.json()
  assert.deepEqual(json.total, { total: 1025, honshimei: 512, banai: 513 })
  assert.deepEqual(json.byCast['りな'], { total: 512, honshimei: 512, banai: 0 })
  assert.deepEqual(env.calls, [[0, 999], [1000, 1999]])
})
test('名簿人数APIは未認証/閲覧権限なし/キャストをDB取得前に拒否、ownerは許可', async () => {
  for (const [options, status] of [[{ authenticated: false }, 401], [{ allowed: false }, 403], [{ role: 'cast' }, 403]]) {
    const env = setupCounts(options)
    assert.equal((await env.get()).status, status)
    assert.equal(env.reads(), 0)
  }
  assert.equal((await setupCounts({ owner: true, allowed: false }).get()).status, 200)
})
test('人数取得失敗は0人で成功扱いにせず500を返す', async () => {
  const response = await setupCounts({ failure: true }).get()
  assert.equal(response.status, 500)
  const json = await response.json()
  assert.equal(json.total, undefined)
  assert.match(json.error, /取得できませんでした/)
})

// レイアウト確認用の固定データ。実アカウントや認証を模倣・改変せず、SSRだけ行う。
const cssModule = prefix => ({ __esModule: true, default: new Proxy({}, { get: (_, key) => prefix + '_' + String(key) }) })
const colors = loadFile('lib/colors.ts', {})
const category = loadFile('lib/customerCategory.ts', {})
const indicators = loadFile('components/CustomerCardIndicators.tsx', { 'react/jsx-runtime': jsxRuntime, './CustomerCardIndicators.module.css': cssModule('indicators') })
const gestureLogic = loadFile('lib/customerCardGesture.ts', {})
const gestureHook = loadFile('hooks/useCustomerCardGesture.ts', { react: React, '@/lib/customerCardGesture': gestureLogic })
const shell = loadFile('components/CustomerActionCardShell.tsx', { react: React, 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors, '@/components/CustomerCardIndicators': indicators, '@/hooks/useCustomerCardGesture': gestureHook }).default
const patternSummary = loadFile('components/CustomerVisitPatternSummary.tsx', { 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors, '@/lib/customerVisitPattern': patterns, './CustomerVisitPatternSummary.module.css': cssModule('pattern') }).default
const previewModule = loadFile('components/CustomerCardPreview.tsx', { react: React, 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors, './CustomerCardPreview.module.css': cssModule('preview') })
const compactMocks = { react: React, 'react/jsx-runtime': jsxRuntime, './CustomerActionCardShell': { __esModule: true, default: shell }, './CustomerCardIndicators': indicators, './CustomerCardPreview': previewModule, './CustomerVisitPatternSummary': { __esModule: true, default: patternSummary }, '@/lib/colors': colors, './CompactCustomerCard.module.css': cssModule('compact') }
const compactModule = loadFile('components/CompactCustomerCard.tsx', compactMocks)
const fixtureCasts = [
  { id: 'cast1', cast_name: 'りな', display_name: 'りな', is_active: true },
  { id: 'cast2', cast_name: 'あかり', display_name: 'あかり', is_active: true },
  { id: 'cast3', cast_name: '退店キャスト', display_name: '退店キャスト', is_active: false },
]
const fixtureCustomers = [
  { id: '1', customer_name: 'サンプルのお客様', nickname: 'サンプルさん', cast_name: 'りな', customer_rank: 'A', nomination_status: '本指名', region: '福岡県', age_group: '30代', is_starred: true, no_reply: true },
  { id: '2', customer_name: 'とても長いお名前のお客様の表示テスト', nickname: '長いニックネーム', cast_name: 'あかり', customer_rank: 'B', nomination_status: '本指名', region: '東京都', age_group: '40代', is_starred: true },
  { id: '3', customer_name: '場内のお客様', cast_name: 'あかり', nomination_status: '場内', region: '福岡県', is_starred: true },
].map(c => ({ ...c, metrics: { totalSpent: 1234567, visitCount: 13, avgPerVisit: 94967, lastVisitDate: c.nomination_status === '場内' ? '2026-10-03' : '2026-10-01', daysSinceLastVisit: c.nomination_status === '場内' ? 6 : 8, visitPattern: { sampleVisitCount: 10, weekdayCodes: [5, 6], weekdayStats: { 5: { count: 7, lastVisitDate: '2026-10-01' } }, earlyHour: 20, earlyHourCount: 2, usualHour: 22, usualHourCount: 6 } } }))

function renderCompactFixture(overrides = {}) {
  return renderToStaticMarkup(React.createElement(compactModule.default, {
    customerId: 'compact-fixture', customerName: 'サンプルのお客様', customerRank: 'A',
    nomination: '本指名', averageSpend: 94967, totalSales: 1234567, daysSinceLast: 8,
    isFollowUp: true, noReply: false, selectionMode: false, selected: false, actionsOpen: false, canManage: true,
    onOpen() {}, onToggleSelected() {}, onToggleActions() {}, onAddFollowUp() {}, onRemoveFollowUp() {}, onMoveToSevered() {},
    ...overrides,
  }))
}

// 実際のワークスペースのJSXをSSRで確認。認証・DB・業務フックは実行しない。
function renderWorkspaceChrome(pc = false) {
  const dateUtils = loadFile('lib/dateUtils.ts', {})
  const tenure = loadFile('lib/castTenure.ts', { './dateUtils': dateUtils })
  const tenureBadge = loadFile('components/CastTenureBadge.tsx', { 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors, '@/lib/castTenure': tenure }).default
  const tier = loadFile('components/CastTierProgress.tsx', { 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors,
    '@/components/CastTenureBadge': { __esModule: true, default: tenureBadge }, '@/hooks/useJstToday': { useJstToday: () => '2026-10-09' } }).default
  const source = fs.readFileSync(path.join(root, 'components/CastWorkspace.tsx'), 'utf8')
  const header = source.slice(source.indexOf('{/* ─── ヘッダー ─── */}'), source.indexOf('{/* ─── コンテンツ（スワイプ対応） ─── */}'))
  const toolbar = source.slice(source.indexOf('{/* ヘッダー: 顧客数 + ランク再評価 + 新規追加ボタン */}'), source.indexOf('{customers.length === 0 ? ('))
  const noop = () => {}
  const bindings = { C: colors.C, isViewPC: pc, isEmbedded: false, isAdmin: true,
    activeTab: 'CUSTOMERS', cast: { cast_name: 'サンプル', display_name: 'サンプル', cast_tier: 'AC', target_cast_tier: 'AA', joined_at: '2025-02-15', is_active: true },
    NotificationBell: () => null, CastTierProgress: tier, goBack: noop, toggleView: noop, changeMonth: noop,
    monthLabel: '2026年10月', tabs: ['KPI', 'CUSTOMERS', 'SALES', 'SHIFT', 'SETTING', 'RANKING', 'EXPORTS'],
    TAB_LABELS: { KPI: '成績', CUSTOMERS: '顧客', SALES: '売上・実績', SHIFT: 'シフト', SETTING: '設定', RANKING: 'ランキング', EXPORTS: '出力リスト' },
    setActiveTab: noop, starsOnly: false, scopedCustomers: { length: 225 }, canManageCustomers: true,
    bulkSelectMode: false, setBulkSelectMode: noop, setSelectedCustomerIds: noop, setOpenCustomerActionsId: noop,
    customers: [{ nomination_status: '本指名' }], setShowRankRecalc: noop, setShowNewCustomerForm: noop,
  }
  const code = ts.transpileModule(`function Fixture({${Object.keys(bindings).join(',')}}) { return <>${header}<div style={{padding:'0 16px'}}>${toolbar}</div></> }`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const fixture = vm.runInThisContext(`(function(require, exports) { ${code}; return Fixture; })`)(() => jsxRuntime, {})
  return renderToStaticMarkup(React.createElement(fixture, bindings))
}
test('スマホバナー・タブ・3操作は小型、nowrap。PCの既存サイズは維持', () => {
  const mobile = renderWorkspaceChrome()
  assert.match(mobile, /padding:6px 10px/)
  assert.match(mobile, /font-size:14px/)
  assert.match(mobile, /font-size:11px/)
  assert.match(mobile, /white-space:nowrap;min-height:32px/)
  for (const text of ['複数選択', 'ランク再評価', '+ 新規追加', '現在：', '目標：', '入店から']) assert.ok(mobile.includes(text))
  const pc = renderWorkspaceChrome(true)
  assert.match(pc, /padding:14px 18px/)
  assert.match(pc, /font-size:18px/)
  assert.match(pc, /min-height:46px/)
})

test('薄型カードは必須3数値・ランク・左の星を保持し、0円/未記録/返信なし/選択/保存中も安全', () => {
  for (const rank of ['S', 'A', 'B', 'C', '切れた', null]) {
    const html = renderCompactFixture({ customerRank: rank, averageSpend: 0, totalSales: 0, daysSinceLast: null, noReply: true })
    assert.match(html, /客単価/)
    assert.match(html, /累計売上/)
    assert.match(html, /来店未記録/)
    assert.equal((html.match(/<strong>¥0<\/strong>/g) || []).length, 2)
    assert.match(html, /data-rank="/)
    assert.match(html, /返信なし/)
    assert.equal((html.match(/aria-label="星付きのお客様"/g) || []).length, 1)
    assert.doesNotMatch(html, /来店傾向|お連れ様|最終連絡|年代未設定/)
  }
  assert.doesNotMatch(renderCompactFixture({ selectionMode: true }), /のカード情報を表示/)
  assert.match(renderCompactFixture({ busy: true }), /disabled="" aria-label="サンプルのお客様のカード情報を表示"/)
  for (const [input, expected] of [[0, '¥0'], [9999, '¥9,999'], [10000, '1万円'], [123000, '12.3万円'], [999950, '100万円'], [1250000, '125万円'], [NaN, '¥0']]) {
    assert.equal(compactModule.formatCompactCustomerYen(input), expected)
  }
})

test('長押しと情報ボタンはプレビューだけ。短いタップ・個人ページボタンのみ既存詳細経路', () => {
  let openCalls = 0
  const stateCalls = []
  const compactUnderTest = loadFile('components/CompactCustomerCard.tsx', { ...compactMocks,
    react: { ...React, useState: () => [false, value => stateCalls.push(value)] },
  })
  const tree = compactUnderTest.default({ customerName: 'テスト', customerRank: 'A', onOpen: () => { openCalls++ } })
  const cardShell = tree.props.children[0]
  cardShell.props.onPreview()
  const infoButton = cardShell.props.children.props.children[0].props.children[1]
  infoButton.props.onClick({ stopPropagation() {} })
  assert.deepEqual(stateCalls, [true, true])
  assert.equal(openCalls, 0)
  cardShell.props.onOpen()
  assert.equal(openCalls, 1)
  assert.match(renderToStaticMarkup(React.createElement(previewModule.default, {
    name: 'テスト', onClose() {}, onOpenCustomer() {},
  }, 'カードの補足データ')), /<dialog[^>]*aria-label="テストのカード情報"/)
})
test('プレビューは既存の担当・回数・曜日・時間帯を表示。選択中や保存中には出さない', () => {
  const compactUnderTest = loadFile('components/CompactCustomerCard.tsx', { ...compactMocks,
    react: { ...React, useState: () => [true, () => {}] },
  })
  const props = { customerName: 'テスト', nomination: '本指名', customerRank: 'A', averageSpend: 10000,
    totalSales: 30000, daysSinceLast: 5, onOpen() {}, preview: { ...fixtureCustomers[0].metrics,
      visitCount: 13, visitPattern: fixtureCustomers[0].metrics.visitPattern,
      assignedCast: 'りな', companion: '場:あかり', staffNames: '黒服サンプル' } }
  const html = renderToStaticMarkup(React.createElement(compactUnderTest.default, props))
  assert.match(html, /個人ページを見る/)
  assert.match(html, /曜日別の来店実績/)
  assert.match(html, /来店時間帯/)
  assert.match(html, /13回/)
  assert.match(html, /場:あかり/)
  assert.match(html, /黒服サンプル/)
  for (const state of [{ selectionMode: true }, { busy: true }]) {
    assert.doesNotMatch(renderToStaticMarkup(React.createElement(compactUnderTest.default, { ...props, ...state })), /<dialog/)
  }
})

function renderStaffFixture({ pc = true, selectedCast = '', allowed = true, selection = false } = {}) {
  let stateIndex = 0
  const fixtures = fixtureCustomers.filter(c => !selectedCast || c.cast_name === selectedCast)
  const state = [fixtureCasts, false, 0, selectedCast, '', '', 'starred', 1, 0, { customers: fixtures, total: fixtures.length, pageCount: 1, page: 1 }, false, null, { 1: '本:りな' }, false, null, null, selection, new Set(), starred.countStarredCustomers(fixtureCustomers), false, 0, true]
  const component = loadFile('components/StaffStarsPage.tsx', {
    react: { ...React, useState: value => [state[stateIndex++] ?? value, () => {}], useEffect: () => {} },
    'react/jsx-runtime': jsxRuntime,
    'next/dynamic': { __esModule: true, default: () => () => null },
    '@/lib/colors': colors, '@/lib/customerCategory': category, '@/lib/customerVisitPattern': patterns,
    '@/lib/starredCustomers': starred,
    '@/hooks/useJstToday': { useJstToday: () => '2026-10-09' },
    '@/lib/supabase/client': { createClient: () => { throw new Error('SSR must not query DB') } },
    '@/lib/supabaseHelpers': { fetchAllPaginated: () => { throw new Error('SSR must not query DB') } },
    '@/hooks/useViewMode': { useViewMode: () => ({ isPC: pc }) },
    '@/hooks/useCustomerListActions': { useCustomerListActions: () => ({ busy: false, ToastView: null }) },
    '@/components/PageHeader': { __esModule: true, default: () => React.createElement('header', { style: { height: 70, padding: '16px', boxSizing: 'border-box', background: '#fff8fa' } }, 'Éclat　⭐️のお客様（レイアウト検証データ）') },
    '@/components/BottomNav': { __esModule: true, default: () => React.createElement('footer', { style: { position: 'fixed', bottom: 0, padding: 16, width: '100%', background: '#fff8fa' } }, 'ホーム　　検索　　⭐️　　接客　　管理') },
    '@/components/CustomerActionCardShell': { __esModule: true, default: shell },
    '@/components/CompactCustomerCard': compactModule,
    '@/components/CustomerCardIndicators': indicators,
    '@/components/CustomerVisitPatternSummary': { __esModule: true, default: patternSummary },
    '@/app/casts/[id]/customer-cards.module.css': cssModule('card'),
    './StaffStarsPage.module.css': cssModule('staff'),
  }).default
  return renderToStaticMarkup(React.createElement(component, { profile: { role: 'admin', is_owner: false, permissions: { '顧客.閲覧': allowed, '顧客.編集': allowed } } }))
}

test('スタッフ初期UI：全キャスト選択済み、PC左名簿・モバイルプルダウン・担当名', () => {
  const pc = renderStaffFixture()
  assert.match(pc, /aria-label="キャストで絞り込み"/)
  assert.match(pc, /aria-pressed="true"[^>]*><span>⭐️ 全キャスト/)
  assert.match(pc, /本2名・場1名/)
  assert.match(pc, /本1名・場1名/)
  assert.match(pc, /aria-pressed="true"[^>]*>日数対象のみ/)
  assert.match(pc, /1・3・6・9・12・15・18・21・24・27・30日前/)
  assert.match(pc, /全キャストの⭐️のお客様/)
  assert.match(pc, /担当：りな/)
  assert.match(pc, /担当：あかり/)
  assert.match(pc, /りな ／ 県内顧客/)
  assert.match(pc, /あかり ／ 県外顧客/)
  assert.ok(pc.indexOf('りな ／ 県内顧客') < pc.indexOf('あかり ／ 県外顧客'))
  assert.ok(pc.indexOf('あかり ／ 県外顧客') < pc.indexOf('あかり ／ 場内'))
  assert.doesNotMatch(pc, /退店キャスト/)
  assert.match(pc, /aria-label="来店から6日"/)
  assert.equal((pc.match(/aria-label="星付きのお客様"/g) || []).length, 3)
  assert.match(pc, /class="indicators_starMarker">⭐️<\/span><div style="flex:1;min-width:0"/)
  assert.match(pc, /返信なし/)
  const mobile = renderStaffFixture({ pc: false })
  assert.match(mobile, /class="staff_mobile"/)
  assert.match(mobile, /<option value="" selected="">全キャスト/)
  assert.match(mobile, /あかり（本1名・場1名）/)
  assert.match(mobile, /data-compact-customer="true"/)
  assert.match(mobile, /客単価/)
  assert.match(mobile, /累計売上/)
  assert.doesNotMatch(mobile, /曜日別の来店実績|お連れ様：|年代未設定/)
  assert.doesNotMatch(mobile, /退店キャスト/)
  assert.match(mobile, /aria-label="来店から6日"/)
})
test('経過日数は数値を強調し、本日/未記録/未来日も誤表示しない', () => {
  const render = days => renderToStaticMarkup(React.createElement(indicators.CustomerRecencyBadge, { days }))
  assert.match(render(6), /<strong>6<\/strong>/)
  assert.match(render(0), /本日来店/)
  assert.match(render(null), /来店未記録/)
  assert.match(render(NaN), /来店未記録/)
  assert.match(render(-1), /来店予定/)
  assert.doesNotMatch(render(-1), /-1/)
})
test('共通カードの⭐️は星付きだけに1つ表示し、複数選択中も本文の左側に残す', () => {
  const render = (isFollowUp, selectionMode) => renderToStaticMarkup(React.createElement(shell, {
    customerId: 'customer1', customerName: 'サンプル', customerRank: 'A',
    isFollowUp, selectionMode, selected: false, actionsOpen: false, canManage: true,
    onOpen() {}, onToggleSelected() {}, onToggleActions() {}, onAddFollowUp() {},
    onRemoveFollowUp() {}, onMoveToSevered() {},
  }, React.createElement('span', null, 'カード本文')))
  for (const selectionMode of [false, true]) {
    const marked = render(true, selectionMode)
    assert.equal((marked.match(/aria-label="星付きのお客様"/g) || []).length, 1)
    assert.match(marked, /class="indicators_starMarker">⭐️<\/span><div style="flex:1;min-width:0"/)
    assert.doesNotMatch(render(false, selectionMode), /aria-label="星付きのお客様"/)
  }
})
test('選択キャストUI・権限なしUI・複数選択バーを検証', () => {
  const selected = renderStaffFixture({ selectedCast: 'りな' })
  assert.match(selected, /りなの⭐️のお客様/)
  assert.doesNotMatch(selected, /りな ／ 県内顧客/)
  assert.doesNotMatch(selected, /担当：あかり/)
  const denied = renderStaffFixture({ allowed: false })
  assert.match(denied, /権限が必要です/)
  assert.doesNotMatch(denied, /サンプルのお客様/)
  assert.match(renderStaffFixture({ selection: true }), /⭐️解除/)
})

// ローカルで固定データのPC/スマホレイアウトだけを目視確認する任意モード。
if (process.argv.includes('--preview')) {
  const { createServer } = await import('node:http')
  const css = [
    ['app/casts/[id]/customer-cards.module.css', 'card'],
    ['components/StaffStarsPage.module.css', 'staff'],
    ['components/CustomerVisitPatternSummary.module.css', 'pattern'],
    ['components/CustomerCardIndicators.module.css', 'indicators'],
    ['components/CompactCustomerCard.module.css', 'compact'],
    ['components/CustomerCardPreview.module.css', 'preview'],
  ].map(([file, prefix]) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => '.' + prefix + '_' + name)).join('\n')
  createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost')
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    const compactList = [
      { customerName: 'サンプルのお客様', customerRank: 'S', averageSpend: 122000, totalSales: 1220000, daysSinceLast: 44 },
      { customerName: 'とても長いお名前のお客様の表示テスト', customerRank: 'A', averageSpend: 116000, totalSales: 3140000, daysSinceLast: 15, noReply: true },
      { customerName: '場内のお客様', customerRank: 'B', nomination: '場内', averageSpend: 0, totalSales: 0, daysSinceLast: 6 },
      { customerName: '県外のお客様', customerRank: 'A', averageSpend: 77000, totalSales: 1160000, daysSinceLast: 70, isFollowUp: false },
      { customerName: '今日のお客様', customerRank: 'B', averageSpend: 113000, totalSales: 790000, daysSinceLast: 0 },
      { customerName: '未登録のお客様', customerRank: null, averageSpend: 0, totalSales: 0, daysSinceLast: null, isFollowUp: false },
    ].map(renderCompactFixture).join('')
    const content = url.searchParams.has('workspace')
      ? `${renderWorkspaceChrome()}<main style="padding:4px 16px 90px;background:#fff9fa"><p style="font-size:10px;color:#6b5060">固定テストデータ · 長押しはカード情報のみ</p><p style="font-size:11px;color:#e8879a">▼ 県内顧客 — 17人</p><div style="display:grid;gap:5px">${compactList}</div></main>`
      : url.searchParams.has('cards')
      ? `<main style="padding:18px 12px;background:#fff8fa;min-height:100vh"><h1 style="font-size:18px;margin:0 0 8px">スマホのお客様一覧</h1><p style="font-size:11px;color:#6e4c59;margin:0 0 16px">固定テストデータ · 長押し・「情報」でカード情報を表示</p><div style="display:grid;gap:5px">${compactList}</div></main>`
      : renderStaffFixture({ pc: !url.searchParams.has('mobile'), selectedCast: url.searchParams.get('cast') || '' })
    response.end(`<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><title>スタッフ⭐️ UI検証（固定データ）</title><style>body{margin:0;font-family:system-ui,sans-serif}*{box-sizing:border-box}${css}</style>${content}</html>`)
  }).listen(6113, '127.0.0.1', () => { process.stdout.write('Layout fixture: http://127.0.0.1:6113 (mobile: ?mobile)\n') })
}
