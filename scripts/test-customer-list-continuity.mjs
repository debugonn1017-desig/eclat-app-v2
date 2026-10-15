// 架空の名簿・DOM・DBだけで、保存順の認可とスクロール継続を検証する。
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const exports = {}
  vm.runInNewContext(`(function(require, exports) { ${code}\n})`, { Request, Response, Error, console, Intl, ...globals })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    throw new Error('Unexpected import: ' + name)
  }, exports)
  return exports
}
const types = load('types/index.ts')
const tenure = load('lib/castTenure.ts', { './dateUtils': load('lib/dateUtils.ts') })
const order = load('lib/castManagementOrder.ts', { '../types': types, './castTenure': tenure })
const groups = load('lib/customerCastOptions.ts')
const loader = load('lib/customerCastOptionsServer.ts', {
  './castManagementOrder': order, './supabaseHelpers': load('lib/supabaseHelpers.ts'),
})
const row = (id, name, tier = 'AC', active = true, joined = '2024-01-01') => ({
  id, cast_name: name, display_name: name, cast_tier: tier, is_active: active,
  joined_at: joined, training_start_date: null, private_field: 'must not expose',
})
const rows = [row('1', 'あやな', 'AC', true, '2025-01-01'), row('2', 'みやこ'), row('3', 'なみ'), row('4', 'ゆい', 'BA'), row('5', '退店', 'AC', false)]
function database({ roster = rows, ids = ['3', '1', '2', '4', '5'], orderError = false } = {}) {
  const calls = []
  const db = { from(table) {
    assert.equal(table, 'profiles')
    return {
      select(columns) { calls.push(['profiles-select', columns]); return this },
      eq(key, value) { calls.push(['profiles-eq', key, value]); return this },
      not() { return this }, order() { return this },
      async range(from, to) { calls.push(['range', from, to]); return { data: roster.slice(from, to + 1), error: null } },
    }
  } }
  const orderDb = { from(table) {
    assert.equal(table, 'cast_management_order')
    return { select(columns) { assert.equal(columns, 'ordered_cast_ids'); return this },
      eq(key, value) { assert.equal(key, 'id'); assert.equal(value, true); return this },
      async maybeSingle() { calls.push(['order-read']); return { data: orderError ? null : { ordered_cast_ids: ids }, error: orderError ? {} : null } },
    }
  } }
  return { db, orderDb, calls }
}
test('保存順を層内で優先し、PC名簿とスマホselectの層・順番が一致。退店は別', async () => {
  const env = database()
  const options = await loader.loadCustomerCastOptions(env.db, env.orderDb)
  assert.deepEqual([...options.map(c => c.id)], ['3', '1', '2', '4', '5'])
  const grouped = groups.groupCustomerCastOptions(options)
  assert.deepEqual([...grouped.map(g => [g.tier, g.active, [...g.rows.map(c => c.id)]])], [
    ['AC', true, ['3', '1', '2']], ['BA', true, ['4']], ['AC', false, ['5']],
  ])
  for (const option of options) assert.deepEqual(Object.keys(option).sort(), ['cast_name', 'cast_tier', 'display_name', 'id', 'is_active'])
  assert.ok(env.calls.some(c => c[0] === 'profiles-eq' && c[1] === 'role' && c[2] === 'cast'))
})
test('保存順リセット時は層別の入店日順。未知層・層未設定も消さない', async () => {
  const env = database({ ids: [], roster: [...rows, row('6', '未知', '未知'), row('7', '未設定', null)] })
  const options = await loader.loadCustomerCastOptions(env.db, env.orderDb)
  assert.deepEqual([...options.map(c => c.id)], ['3', '2', '1', '4', '6', '7', '5'])
  assert.equal(groups.groupCustomerCastOptions(options).length, 5)
})
test('名簿1000人超でも全件を取得し、保存順の未登録・削除IDは安全に処理', async () => {
  const roster = Array.from({ length: 1011 }, (_, i) => row(String(i), `キャスト${i}`))
  const env = database({ roster, ids: ['1010', '1000', '削除済み'] })
  const options = await loader.loadCustomerCastOptions(env.db, env.orderDb)
  assert.equal(options.length, roster.length)
  assert.deepEqual([...options.slice(0, 2).map(c => c.id)], ['1010', '1000'])
  assert.deepEqual(env.calls.filter(c => c[0] === 'range'), [['range', 0, 999], ['range', 1000, 1999]])
})
test('保存順の取得失敗を名前順で成功扱いにしない', async () => {
  const env = database({ orderError: true })
  await assert.rejects(loader.loadCustomerCastOptions(env.db, env.orderDb), /共通並び順/)
})
function api({ role = 'admin', owner = false, permission = true, authError } = {}) {
  let serviceCreated = 0, profileReads = 0
  const env = database()
  const route = load('app/api/customers/cast-options/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
    '@/lib/auth': { requireUser: async () => { if (authError) throw new Error(authError); return { role, is_owner: owner } },
      checkPermission: async name => { assert.equal(name, '顧客.閲覧'); return permission } },
    '@/lib/supabase/server': { createClient: async () => { profileReads++; return env.db } },
    '@/lib/supabase/admin': { createAdminClient: () => { serviceCreated++; return env.orderDb } },
    '@/lib/customerCastOptionsServer': loader,
  })
  return { get: route.GET, reads: () => [serviceCreated, profileReads] }
}
test('候補APIは顧客閲覧だけのスタッフ・ownerに許可し、非公開入店日や管理情報は返さずno-store', async () => {
  for (const settings of [{}, { owner: true, permission: false }]) {
    const env = api(settings), response = await env.get()
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('vary'), 'Cookie')
    const body = await response.json()
    assert.deepEqual(body.casts.map(c => c.id), ['3', '1', '2', '4', '5'])
    assert.doesNotMatch(JSON.stringify(body), /joined_at|private_field|revision|updated_by/)
    assert.deepEqual(env.reads(), [1, 1])
  }
})
test('未認証・キャスト・閲覧権限なしは名簿やservice-roleを使う前に拒否', async () => {
  for (const [settings, status] of [[{ authError: 'UNAUTHENTICATED' }, 401], [{ role: 'cast' }, 403], [{ permission: false }, 403]]) {
    const env = api(settings)
    assert.equal((await env.get()).status, status)
    assert.deepEqual(env.reads(), [0, 0])
  }
})
function dom() {
  const calls = [], listeners = new Map()
  const container = { isConnected: true, scrollLeft: 5, scrollTop: 720, scrollTo(value) { this.scrollTop = value.top; this.scrollLeft = value.left; calls.push(['container', value]) } }
  const window = { scrollX: 10, scrollY: 1300, scrollTo(value) { this.scrollX = value.left; this.scrollY = value.top; calls.push(['window', value]) },
    addEventListener(name, fn) { listeners.set(name, fn) }, removeEventListener(name) { listeners.delete(name) } }
  const document = { querySelectorAll: selector => { assert.equal(selector, '[data-customer-scroll]'); return [container] } }
  const helper = load('lib/customerListScroll.ts', {}, { window, document })
  return { window, document, container, calls, listeners, helper }
}
test('ページとカレンダー内のスクロール位置を同時保持。切り離された領域へは書き込まない', () => {
  const env = dom(), restore = env.helper.captureCustomerListScroll()
  env.window.scrollY = 0; env.container.scrollTop = 0
  restore()
  assert.equal(env.window.scrollY, 1300); assert.equal(env.container.scrollTop, 720)
  assert.ok(env.calls.every(c => c[1].behavior === 'instant'))
  env.calls.length = 0; env.container.isConnected = false
  restore()
  assert.deepEqual(env.calls.map(c => c[0]), ['window'])
  assert.doesNotThrow(load('lib/customerListScroll.ts').captureCustomerListScroll())
})
test('再取得中は復元せず、データ反映後に一度だけ復元。利用者のスクロール操作は優先', () => {
  const env = dom(), ref = { current: null }
  let layout, effect
  const hook = load('hooks/useCustomerListScroll.ts', { react: {
    useCallback: fn => fn, useRef: () => ref, useLayoutEffect: fn => { layout = fn }, useEffect: fn => { effect = fn },
  }, '@/lib/customerListScroll': env.helper }, { window: env.window })
  const preserve = hook.useCustomerListScroll([], false)
  layout(); const cleanup = effect()
  preserve()
  hook.useCustomerListScroll([], true); layout()
  assert.equal(env.calls.length, 0)
  env.window.scrollY = 0; env.container.scrollTop = 0
  hook.useCustomerListScroll(['updated'], false); layout(); layout()
  assert.equal(env.calls.length, 2)
  assert.equal(env.window.scrollY, 1300); assert.equal(env.container.scrollTop, 720)
  for (const event of ['wheel', 'touchmove', 'keydown']) {
    preserve(); env.calls.length = 0
    env.listeners.get(event)(event === 'keydown' ? { key: 'PageDown' } : {})
    hook.useCustomerListScroll(['changed'], false); layout()
    assert.equal(env.calls.length, 0)
  }
  const otherPage = hook.useCustomerListScroll([], false, 'cast-a')
  otherPage(); env.calls.length = 0
  hook.useCustomerListScroll(['new cast'], false, 'cast-b'); layout()
  assert.equal(env.calls.length, 0)
  cleanup(); assert.equal(env.listeners.size, 0)
})
test('ネイティブ情報/ランクdialogの開閉・フォーカス復帰でも背景と日別一覧の位置を保つ', () => {
  const env = dom()
  let setup
  class Focusable { isConnected = true; focus(options) { assert.equal(options.preventScroll, true); env.window.scrollY = 0 } }
  env.document.body = { style: { overflow: 'auto' } }
  env.document.activeElement = new Focusable()
  const jump = () => { env.window.scrollY = 0; env.container.scrollTop = 0 }
  const preview = load('components/CustomerCardPreview.tsx', {
    react: { useRef: () => ({ current: { showModal: jump, close: jump } }), useEffect: fn => { setup = fn } },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null }, '@/lib/colors': load('lib/colors.ts'),
    './CustomerCardPreview.module.css': { __esModule: true, default: {} }, '@/lib/customerListScroll': env.helper,
  }, { window: env.window, document: env.document, HTMLElement: Focusable })
  preview.default({ name: '架空', onClose() {} })
  const cleanup = setup()
  assert.equal(env.window.scrollY, 1300); assert.equal(env.container.scrollTop, 720)
  cleanup()
  assert.equal(env.window.scrollY, 1300); assert.equal(env.container.scrollTop, 720)
  assert.equal(env.document.body.style.overflow, 'auto')
})
test('実ページは一覧を消さずに再取得し、カテゴリ・日付を閉じない。全員⭐️も共通保存順でページング', () => {
  const cast = fs.readFileSync('components/CastWorkspace.tsx', 'utf8')
  assert.match(cast, /if \(loadedScopeRef.current !== scope\) setLoading\(true\)/)
  assert.match(cast, /setCustExtrasLoaded\(false\)/)
  const loadingCode = cast.slice(cast.indexOf('// データ取得'), cast.indexOf('// v0.3.32: CUSTOMERS'))
  assert.doesNotMatch(loadingCode, /set(?:LastVisitDate|VisitCount|TotalSales|AvgPerVisit)Map\(new Map\(\)\)/)
  const callback = cast.slice(cast.indexOf('const refreshCustomers ='), cast.indexOf('const {', cast.indexOf('const refreshCustomers =')))
  assert.match(callback, /preserveCustomerScroll\(\)/)
  assert.doesNotMatch(callback, /setOpenCategories|setActiveTab|scrollTo/)
  const calendar = fs.readFileSync('app/calendar/page.tsx', 'utf8')
  assert.match(calendar, /data-customer-scroll="calendar-day"/)
  assert.equal((calendar.match(/onSetRank=\{target =>/g) || []).length, 3)
  const search = fs.readFileSync('app/customers/page.tsx', 'utf8')
  assert.match(search, /if \(lastSearchScopeRef.current !== scope\) \{\s*setResults\(\[\]\)/)
  assert.match(search, /data-customer-scroll="search-results"/)
  const api = fs.readFileSync('app/api/customers/search/route.ts', 'utf8')
  assert.match(api, /loadCustomerCastOptions\(supabase, metricsClient\)/)
  assert.ok(api.indexOf('sortStarredCustomersByCast(allRows') < api.indexOf('ordered.slice(from'))
})
