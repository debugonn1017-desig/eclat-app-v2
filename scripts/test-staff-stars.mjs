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
const rows = Array.from({ length: 130 }, (_, index) => ({
  id: String(index + 1), is_starred: index < 105,
  cast_name: index % 2 ? 'りな' : 'あかり', customer_name: `お客様${index}`,
  metric_last_visit_date: null, metric_first_visit_date: null,
}))
function setup({ role = 'admin', owner = false, allowed = true, castName = null, authenticated = true, fixtures = rows } = {}) {
  const calls = []
  let adminReads = 0
  const query = {
    filters: [],
    select(...args) { calls.push(['select', ...args]); return this },
    eq(key, value) { calls.push(['eq', key, value]); this.filters.push(row => row[key] === value); return this },
    order(...args) { calls.push(['order', ...args]); return this },
    range(from, to) {
      calls.push(['range', from, to])
      const filtered = fixtures.filter(row => this.filters.every(filter => filter(row)))
      return Promise.resolve({ data: filtered.slice(from, to + 1), count: filtered.length, error: null })
    },
  }
  const route = loadFile('app/api/customers/search/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
    '@/lib/auth': { getCurrentProfile: async () => ({ role, is_owner: owner, cast_name: castName }), checkPermission: async () => allowed },
    '@/lib/customerQueryScope': scope,
    '@/lib/followUpWorkflow': { getJstDateString: () => '2026-10-09' },
    '@/lib/supabase/admin': { createAdminClient: () => { adminReads++; return { from: () => query } } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user' } : null } }) } }) },
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

// レイアウト確認用の固定データ。実アカウントや認証を模倣・改変せず、SSRだけ行う。
const cssModule = prefix => ({ __esModule: true, default: new Proxy({}, { get: (_, key) => prefix + '_' + String(key) }) })
const colors = loadFile('lib/colors.ts', {})
const category = loadFile('lib/customerCategory.ts', {})
const shell = loadFile('components/CustomerActionCardShell.tsx', { react: React, 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors }).default
const patternSummary = loadFile('components/CustomerVisitPatternSummary.tsx', { 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors, '@/lib/customerVisitPattern': patterns, './CustomerVisitPatternSummary.module.css': cssModule('pattern') }).default
const fixtureCasts = [
  { id: 'cast1', cast_name: 'りな', display_name: 'りな', is_active: true },
  { id: 'cast2', cast_name: 'あかり', display_name: 'あかり', is_active: true },
  { id: 'cast3', cast_name: '退店キャスト', display_name: '退店キャスト', is_active: false },
]
const fixtureCustomers = [
  { id: '1', customer_name: 'サンプルのお客様', nickname: 'サンプルさん', cast_name: 'りな', customer_rank: 'A', nomination_status: '本指名', region: '福岡県', age_group: '30代', is_starred: true, no_reply: true },
  { id: '2', customer_name: 'とても長いお名前のお客様の表示テスト', nickname: '長いニックネーム', cast_name: 'あかり', customer_rank: 'B', nomination_status: '本指名', region: '東京都', age_group: '40代', is_starred: true },
  { id: '3', customer_name: '場内のお客様', cast_name: 'あかり', nomination_status: '場内', region: '福岡県', is_starred: true },
].map(c => ({ ...c, metrics: { totalSpent: 1234567, visitCount: 13, avgPerVisit: 94967, lastVisitDate: '2026-10-01', daysSinceLastVisit: 8, visitPattern: { sampleVisitCount: 10, weekdayCodes: [5, 6], weekdayStats: { 5: { count: 7, lastVisitDate: '2026-10-01' } }, earlyHour: 20, earlyHourCount: 2, usualHour: 22, usualHourCount: 6 } } }))

function renderStaffFixture({ pc = true, selectedCast = '', allowed = true, selection = false } = {}) {
  let stateIndex = 0
  const fixtures = fixtureCustomers.filter(c => !selectedCast || c.cast_name === selectedCast)
  const state = [fixtureCasts, false, 0, selectedCast, '', '', 'starred', 1, 0, { customers: fixtures, total: fixtures.length, pageCount: 1, page: 1 }, false, null, { 1: '本:りな' }, false, null, null, selection, new Set()]
  const component = loadFile('components/StaffStarsPage.tsx', {
    react: { ...React, useState: value => [state[stateIndex++] ?? value, () => {}], useEffect: () => {} },
    'react/jsx-runtime': jsxRuntime,
    'next/dynamic': { __esModule: true, default: () => () => null },
    '@/lib/colors': colors, '@/lib/customerCategory': category, '@/lib/customerVisitPattern': patterns,
    '@/lib/supabase/client': { createClient: () => { throw new Error('SSR must not query DB') } },
    '@/lib/supabaseHelpers': { fetchAllPaginated: () => { throw new Error('SSR must not query DB') } },
    '@/hooks/useViewMode': { useViewMode: () => ({ isPC: pc }) },
    '@/hooks/useCustomerListActions': { useCustomerListActions: () => ({ busy: false, ToastView: null }) },
    '@/components/PageHeader': { __esModule: true, default: () => React.createElement('header', { style: { height: 70, padding: '16px', boxSizing: 'border-box', background: '#fff8fa' } }, 'Éclat　⭐️のお客様（レイアウト検証データ）') },
    '@/components/BottomNav': { __esModule: true, default: () => React.createElement('footer', { style: { position: 'fixed', bottom: 0, padding: 16, width: '100%', background: '#fff8fa' } }, 'ホーム　　検索　　⭐️　　接客　　管理') },
    '@/components/CustomerActionCardShell': { __esModule: true, default: shell },
    '@/components/CustomerVisitPatternSummary': { __esModule: true, default: patternSummary },
    '@/app/casts/[id]/customer-cards.module.css': cssModule('card'),
    './StaffStarsPage.module.css': cssModule('staff'),
  }).default
  return renderToStaticMarkup(React.createElement(component, { profile: { role: 'admin', is_owner: false, permissions: { '顧客.閲覧': allowed, '顧客.編集': allowed } } }))
}

test('スタッフ初期UI：全キャスト選択済み、PC左名簿・モバイルプルダウン・担当名', () => {
  const pc = renderStaffFixture()
  assert.match(pc, /aria-label="キャストで絞り込み"/)
  assert.match(pc, /aria-pressed="true"[^>]*>⭐️ 全キャスト/)
  assert.match(pc, /全キャストの⭐️のお客様/)
  assert.match(pc, /担当：りな/)
  assert.match(pc, /担当：あかり/)
  assert.match(pc, /退店キャスト/)
  assert.match(pc, /返信なし/)
  const mobile = renderStaffFixture({ pc: false })
  assert.match(mobile, /class="staff_mobile"/)
  assert.match(mobile, /<option value="" selected="">全キャスト/)
  assert.match(mobile, /card_mobileCard/)
})
test('選択キャストUI・権限なしUI・複数選択バーを検証', () => {
  const selected = renderStaffFixture({ selectedCast: 'りな' })
  assert.match(selected, /りなの⭐️のお客様/)
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
  ].map(([file, prefix]) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => '.' + prefix + '_' + name)).join('\n')
  createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost')
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(`<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><title>スタッフ⭐️ UI検証（固定データ）</title><style>body{margin:0;font-family:system-ui,sans-serif}*{box-sizing:border-box}${css}</style>${renderStaffFixture({ pc: !url.searchParams.has('mobile'), selectedCast: url.searchParams.get('cast') || '' })}</html>`)
  }).listen(6113, '127.0.0.1', () => { process.stdout.write('Layout fixture: http://127.0.0.1:6113 (mobile: ?mobile)\n') })
}
