// 架空データ・セッションRLSのモックのみ。本番の顧客や設定には触れない。
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const exports = {}
  vm.runInNewContext(`(function(require, exports) { ${code}\n})`, { Request, Response, console, ...globals }, { filename: file })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    throw new Error(`Unexpected import: ${name}`)
  }, exports)
  return exports
}
const ranks = load('lib/customerRankChange.ts')
const colors = load('lib/colors.ts')
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
const preview = load('components/CustomerCardPreview.tsx', { react: React, 'react/jsx-runtime': jsx, '@/lib/colors': colors, './CustomerCardPreview.module.css': css })
const dialog = load('components/CustomerRankDialog.tsx', { react: React, 'react/jsx-runtime': jsx, '@/lib/colors': colors, '@/lib/customerRankChange': ranks, './CustomerCardPreview': preview })

function api({ authenticated = true, role = 'admin', owner = false, allowed = true, visible = true, rank = 'B', failure = false } = {}) {
  let current = { id: 1, customer_name: 'テストのお客様', customer_rank: rank, cast_name: '担当キャスト', no_reply: false }
  const calls = []
  const server = { auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'actor' } : null } }) }, from: table => {
    assert.equal(table, 'customers')
    const filters = []
    let payload = null
    const run = async () => {
      if (failure) return { data: null, error: { message: 'fixture write failure' } }
      if (!visible || !filters.every(([key, value]) => current[key] === value)) return { data: null, error: null }
      if (payload) { current = { ...current, ...payload }; calls.push(['committed', payload]) }
      return { data: { ...current }, error: null }
    }
    return {
      select() { return this }, update(value) { payload = value; calls.push(['update', value]); return this },
      eq(key, value) { filters.push([key, value]); calls.push(['eq', key, value]); return this },
      is(key, value) { filters.push([key, value]); calls.push(['is', key, value]); return this },
      single: run, maybeSingle: run,
    }
  } }
  const route = load('app/api/customers/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
    '@/lib/supabase/server': { createClient: async () => server },
    '@/lib/auth': { getCurrentProfile: async () => ({ role, is_owner: owner }), checkPermission: async name => { assert.equal(name, '顧客.編集'); return allowed } },
    '@/lib/customerRankChange': ranks, '@/lib/customerStaff': { parseCustomerStaffIds: () => undefined },
    '@/lib/customerStaffServer': { getCustomerStaffAssignments: async () => [], customerStaffErrorMessage: String },
  })
  return { calls, row: () => current, setRank: value => { current.customer_rank = value },
    patch: body => route.PATCH(new Request('https://example.test/api/customers/1', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: '1' }) }) }
}

test('選択肢はS/A/B/C/切れた/未設定、無効な値を受け付けない', () => {
  assert.deepEqual([...ranks.CUSTOMER_RANK_CHOICES], ['S', 'A', 'B', 'C', '切れた', null])
  for (const value of ranks.CUSTOMER_RANK_CHOICES) assert.equal(ranks.isCustomerRankValue(value), true)
  for (const value of [undefined, '', '未設定', 'D', 1, {}, []]) assert.equal(ranks.isCustomerRankValue(value), false)
})
test('切れたからの復帰・昇格・降格・未設定への変更は、ランク列だけを更新', async () => {
  for (const previous of ranks.CUSTOMER_RANK_CHOICES) for (const next of ranks.CUSTOMER_RANK_CHOICES) {
    const env = api({ rank: previous })
    assert.equal((await env.patch({ customer_rank: next, expected_customer_rank: previous })).status, 200)
    assert.equal(env.row().customer_rank, next)
    assert.deepEqual(JSON.parse(JSON.stringify(env.calls.find(call => call[0] === 'update')[1])), { customer_rank: next })
    assert.ok(env.calls.some(call => call[0] === (previous === null ? 'is' : 'eq') && call[1] === 'customer_rank' && call[2] === previous))
    assert.equal(env.row().cast_name, '担当キャスト')
  }
})
test('未認証と編集権限なしはDB更新前に拒否、オーナーと自分の担当キャストは許可', async () => {
  for (const [options, status] of [[{ authenticated: false }, 401], [{ allowed: false }, 403]]) {
    const env = api(options)
    assert.equal((await env.patch({ customer_rank: 'S', expected_customer_rank: 'B' })).status, status)
    assert.equal(env.calls.length, 0)
  }
  for (const options of [{ owner: true, allowed: false }, { role: 'cast', allowed: false }]) {
    assert.equal((await api(options).patch({ customer_rank: 'S', expected_customer_rank: 'B' })).status, 200)
  }
})
test('セッションRLSで見えない他キャストの顧客は更新せず、詳細を返さない', async () => {
  const env = api({ role: 'cast', visible: false })
  const response = await env.patch({ customer_rank: 'S', expected_customer_rank: 'B' })
  assert.equal(response.status, 409)
  assert.equal(env.row().customer_rank, 'B')
  assert.equal(env.calls.filter(call => call[0] === 'committed').length, 0)
  assert.equal((await response.json()).customer_name, undefined)
})
test('不正なランク・期待値・他項目混在は更新前に拒否', async () => {
  for (const body of [{ customer_rank: 'D', expected_customer_rank: 'B' }, { customer_rank: 'S', expected_customer_rank: '' },
    { customer_rank: 'S', expected_customer_rank: 'B', no_reply: true }, { expected_customer_rank: 'B' }]) {
    const env = api()
    assert.equal((await env.patch(body)).status, 400)
    assert.equal(env.calls.length, 0)
  }
})
test('同時編集・古い画面・別操作後のUndoは409で上書きしない', async () => {
  const env = api()
  const responses = await Promise.all([env.patch({ customer_rank: 'S', expected_customer_rank: 'B' }), env.patch({ customer_rank: 'C', expected_customer_rank: 'B' })])
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409])
  assert.equal(env.calls.filter(call => call[0] === 'committed').length, 1)
  env.setRank('A')
  assert.equal((await env.patch({ customer_rank: 'B', expected_customer_rank: 'S' })).status, 409)
  assert.equal(env.row().customer_rank, 'A')
})
test('既存のマーク更新は条件付きランク変更へ巻き込まない', async () => {
  const env = api()
  assert.equal((await env.patch({ no_reply: true })).status, 200)
  assert.equal(env.row().no_reply, true)
  assert.equal(env.row().customer_rank, 'B')
})

function actionHarness(env) {
  const slots = [], invalidated = [], notices = []
  let cursor = 0, undo = null, refreshed = 0, fetchCount = 0
  const react = { useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }] },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index] }, useCallback: fn => fn, useEffect() {} }
  const RankDialog = () => null
  const hook = load('hooks/useCustomerListActions.tsx', {
    react, 'react/jsx-runtime': jsx, '@/lib/customerRankChange': ranks,
    '@/components/CustomerRankDialog': { __esModule: true, default: RankDialog },
    '@/hooks/useToast': { useToast: () => ({ toast: (...args) => notices.push(args), ToastView: null }) },
    '@/hooks/useUndoToast': { useUndoToast: () => ({ show: (message, fn) => { undo = { message, fn } }, ToastView: null }) },
    '@/lib/cache': { invalidateCustomerDetail: id => invalidated.push(id), invalidateAllCastsKPI: () => invalidated.push('KPI') },
  }, { fetch: async (url, options) => { assert.equal(url, '/api/customers/1'); fetchCount++; return env.patch(JSON.parse(options.body)) } })
  const render = () => { cursor = 0; return hook.useCustomerListActions({ onRanksChanged: async () => { refreshed++ } }) }
  const getDialog = () => React.Children.toArray(render().ToastView.props.children).find(child => child.type === RankDialog)
  return { render, dialog: getDialog, undo: () => undo, fetchCount: () => fetchCount, refreshed: () => refreshed, invalidated, notices }
}
test('保存成功後だけ閉じる/再取得/キャッシュ破棄/Undo。Undoで元の切れたへ戻せる', async () => {
  const env = api({ rank: '切れた' }), harness = actionHarness(env)
  harness.render().openRankEditor({ id: '1', name: 'テスト', previousRank: '切れた' })
  await harness.dialog().props.onSave('A')
  assert.equal(env.row().customer_rank, 'A')
  assert.equal(harness.dialog(), undefined)
  assert.equal(harness.refreshed(), 1)
  assert.deepEqual(harness.invalidated, ['1', 'KPI'])
  assert.match(harness.undo().message, /Aランク/)
  await harness.undo().fn()
  assert.equal(env.row().customer_rank, '切れた')
  assert.equal(harness.refreshed(), 2)
  assert.equal(harness.render().busy, false)
})
test('保存失敗・権限拒否・競合では成功表示/Undoなし、ダイアログを残しbusyを解除', async () => {
  for (const env of [api({ failure: true }), api({ allowed: false }), api({ rank: 'A' })]) {
    const harness = actionHarness(env)
    harness.render().openRankEditor({ id: '1', name: 'テスト', previousRank: 'B' })
    await assert.rejects(harness.dialog().props.onSave('S'))
    assert.ok(harness.dialog())
    assert.equal(harness.undo(), null)
    assert.equal(harness.refreshed(), 0)
    assert.deepEqual(harness.invalidated, [])
    assert.equal(harness.render().busy, false)
  }
})
test('同じ値は通信なし、連打は1回だけ保存し、別操作後のUndoは拒否', async () => {
  const env = api(), harness = actionHarness(env)
  harness.render().openRankEditor({ id: '1', name: 'テスト', previousRank: 'B' })
  const save = harness.dialog().props.onSave
  await save('B')
  assert.equal(harness.fetchCount(), 0)
  await Promise.all([save('S'), save('C')])
  assert.equal(harness.fetchCount(), 1)
  env.setRank('A')
  await assert.rejects(harness.undo().fn())
  assert.equal(env.row().customer_rank, 'A')
  assert.equal(harness.render().busy, false)
})
test('ランク画面は6択、現在値を明示し、未変更/保存中は保存不可。自動再評価の注意を表示', () => {
  for (const rank of ranks.CUSTOMER_RANK_CHOICES) {
    const view = renderToStaticMarkup(React.createElement(dialog.default, { target: { id: '1', name: 'テスト', previousRank: rank }, busy: false, onClose() {}, onSave() {} }))
    assert.match(view, /aria-label="テストのランク変更"/)
    assert.equal((view.match(/aria-pressed=/g) || []).length, 6)
    assert.equal((view.match(/aria-pressed="true"/g) || []).length, 1)
    assert.match(view, /disabled=""[^>]*>このランクで保存/)
    assert.match(view, /次の自動再評価で変わる場合があります/)
  }
  const busy = renderToStaticMarkup(React.createElement(dialog.default, { target: { id: '1', name: 'テスト', previousRank: 'B' }, busy: true, onClose() {}, onSave() {} }))
  assert.equal((busy.match(/disabled=""/g) || []).length, 9)
  assert.match(busy, /保存中…/)
})
test('3一覧のPC/スマホと長押し情報パネルから、同じランク変更を開く', () => {
  for (const file of ['components/CastWorkspace.tsx', 'app/customers/page.tsx', 'components/StaffStarsPage.tsx']) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /openRankEditor/)
    assert.match(source, /onSetRank=/)
  }
  const compact = fs.readFileSync('components/CompactCustomerCard.tsx', 'utf8')
  assert.match(compact, /shell.canManage && shell.onSetRank/)
  assert.match(compact, /setPreviewOpen\(false\); shell.onSetRank\?\.\(\)/)
  const shell = fs.readFileSync('components/CustomerActionCardShell.tsx', 'utf8')
  assert.match(shell, /onSetRank \? 288 : 240/)
  assert.match(shell, /inert=\{!actionsOpen \|\| selectionMode \|\| busy\}/)
})
test('比較記号は意味を併記。逆向きの切れた日数を警告し、保存値は変更しない', () => {
  const logic = load('lib/rankCalculatorV2.ts')
  const rules = logic.makeDefaultRankRules()
  const condition = rules.切れた.conditions.find(c => c.field === 'days_since_last_visit')
  condition.enabled = true; condition.op = 'lte'; condition.value = 180
  const before = JSON.stringify(rules)
  const Editor = load('components/RankRulesEditor.tsx', { react: React, 'react/jsx-runtime': jsx,
    '@/lib/colors': colors, '@/lib/supabase/client': { createClient: () => ({}) }, '@/lib/cache': { invalidateAllCache() {} },
    '@/lib/rankCalculatorV2': logic, '@/types': load('types/index.ts'),
  }).default
  const view = renderToStaticMarkup(React.createElement(Editor, { scope: { type: 'default', id: null }, criteriaId: 'fixture', initialRules: rules, onSaved() {} }))
  for (const label of ['≥ 以上', '≤ 以下', '&gt; 超', '&lt; 未満', '入力値を含みます', '180日']) assert.ok(view.includes(label))
  assert.match(view, /role="alert"/)
  assert.match(view, /最近来店したお客様も対象になります/)
  assert.equal(JSON.stringify(rules), before)
})
