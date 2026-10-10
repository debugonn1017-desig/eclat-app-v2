// 架空の名簿・インメモリDBだけを使用。本番への書き込みはしない。
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const exports = {}
  vm.runInNewContext(`(function(require, exports) { ${code}\n})`, { Request, Response, Error, console, Intl, ...globals }, { filename: file })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    throw new Error(`Unexpected import: ${name}`)
  }, exports)
  return exports
}
const types = load('types/index.ts')
const tenure = load('lib/castTenure.ts', { './dateUtils': load('lib/dateUtils.ts') })
const helpers = load('lib/castManagementOrder.ts', { '../types': types, './castTenure': tenure })
const { groupCastManagementRows: group, castManagementRosterKey: key, moveCastWithinGroup: move, validCastManagementOrder: valid, isCastManagementOrder: shape } = helpers
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = (n, name, tier = 'AA', active = true) => ({ id: id(n), cast_name: name, display_name: null, cast_tier: tier, is_active: active })
const rows = [row(1, 'りな', 'BB'), row(2, 'みやこ', 'AC'), row(3, 'あやな', 'AC'), row(4, 'ゆい', 'BA'), row(5, 'いるは', 'AC'), row(6, 'なみ', 'AC', false)]
const plain = value => JSON.parse(JSON.stringify(value))
const ids = groups => groups.flatMap(g => [...g.rows].map(r => r.id))

test('在籍→層順を維持し、入店日がすべて未設定なら名前順。退店は別、名簿は非破壊', () => {
  const original = plain(rows)
  assert.deepEqual([...ids(group(rows))], [id(3), id(5), id(2), id(4), id(1), id(6)])
  assert.deepEqual(rows, original)
  assert.equal(group(rows).at(-1).active, false)
})
test('標準は層内で入店が古い順。名前順・アカウント作成日より入店日を優先', () => {
  const data = [
    { ...row(1, 'あやな', 'AC'), joined_at: '2025-01-01', created_at: '2020-01-01' },
    { ...row(2, 'みやこ', 'AC'), joined_at: '2023-01-01', created_at: '2026-01-01' },
    { ...row(3, 'いろは', 'AC'), joined_at: '2024-01-01' },
    { ...row(4, 'ゆい', 'BA'), joined_at: '2000-01-01' },
    { ...row(5, 'なみ', 'AC', false), joined_at: '1990-01-01' },
  ]
  const before = plain(data)
  assert.deepEqual([...ids(group(data))], [id(2), id(3), id(1), id(4), id(5)])
  assert.deepEqual(data, before)
})
test('入店日は表示と同じ旧フィールド補完。未設定・不正日付は層内末尾', () => {
  const data = [
    { ...row(1, 'あ'), joined_at: null, created_at: '1900-01-01' },
    { ...row(2, 'い'), joined_at: '2025-02-29', training_start_date: '1900-01-01' },
    { ...row(3, 'う'), joined_at: '2025-01-01', training_start_date: '1900-01-01' },
    { ...row(4, 'え'), joined_at: ' ', training_start_date: '2020-01-01' },
    { ...row(5, 'お'), joined_at: '2024-02-29' },
    { ...row(6, 'か'), joined_at: '2027-01-01' },
  ]
  assert.deepEqual([...ids(group(data))], [id(4), id(5), id(3), id(6), id(1), id(2)])
})
test('同じ入店日は正規化した名前→IDで安定し、手動保存・リセットも維持', () => {
  const data = [
    { ...row(1, 'みやこ'), joined_at: '2020-01-01' },
    { ...row(2, 'ｱﾔﾅ'), joined_at: '2021-01-01' },
    { ...row(3, 'あやな'), joined_at: '2021-01-01' },
  ]
  assert.deepEqual([...ids(group(data))], [id(1), id(2), id(3)])
  assert.deepEqual([...ids(group(data, [id(3), id(2), id(1)]))], [id(3), id(2), id(1)])
  assert.deepEqual([...ids(group(data, []))], [id(1), id(2), id(3)])
  assert.ok(valid(data, [id(3), id(2), id(1)]))
  // 保存後に増えた人は、入店日が古くても手動保存済みの並びを押しのけない。
  assert.deepEqual([...ids(group([...data, { ...row(4, 'え'), joined_at: '1990-01-01' }], [id(3), id(2), id(1)]))], [id(3), id(2), id(1), id(4)])
})
test('ひらがな・カタカナ・半角を揃え、同名の順序はIDで安定', () => {
  const data = [row(4, 'ミヤコ'), row(3, 'ｱﾔﾅ'), row(2, 'あやな'), row(1, 'いるは')]
  assert.deepEqual([...ids(group(data))], [id(2), id(3), id(1), id(4)])
})
test('新旧層・未知層・未設定と名前未設定を一覧から消さない', () => {
  const data = [row(1, null, null), row(2, '旧層', 'A層'), row(3, '旧新人', '新人層'), row(4, '未知', '未知'), row(5, '新人', '新人')]
  data[0].display_name = 'あや'
  assert.equal(helpers.castManagementName(data[0]), 'あや')
  assert.equal(ids(group(data)).length, 5)
  assert.equal(group(data).at(-1).tier, '層未設定')
})
test('手動順は同じ層内のみ。保存後の新規キャストは層内末尾、削除IDは無視', () => {
  const stored = [id(2), id(3), id(5), id(999), id(1), id(4), id(6)]
  assert.deepEqual([...ids(group([...rows, row(7, 'あい', 'AC')], stored))], [id(2), id(3), id(5), id(7), id(4), id(1), id(6)])
  assert.deepEqual([...ids(group(rows, []))], [...ids(group(rows))])
})
test('ドラッグと↑↓は層内移動。層越え・在籍/退店越え・不明IDは無操作', () => {
  const initial = ids(group(rows))
  assert.deepEqual([...move(rows, initial, id(2), id(3))], [id(2), id(3), id(5), id(4), id(1), id(6)])
  for (const target of [id(4), id(6), id(999)]) assert.deepEqual([...move(rows, initial, id(2), target)], [...initial])
  assert.deepEqual([...initial], [...ids(group(rows))])
})
test('名簿キーは元順序に依存せず、名前・層・在籍・入店日・人数変更で変わる', () => {
  assert.equal(key(rows), key([...rows].reverse()))
  for (const changes of [{ cast_name: '別名' }, { display_name: '変更' }, { cast_tier: 'AA' }, { is_active: false }, { joined_at: '2020-01-01' }, { training_start_date: '2021-01-01' }]) {
    assert.notEqual(key(rows), key(rows.map((r, i) => i === 0 ? { ...r, ...changes } : r)))
  }
  assert.notEqual(key(rows), key([...rows, row(99, '追加')]))
  assert.equal(key(rows), key(rows.map(r => ({ ...r, joined_at: null, training_start_date: null }))))
})
test('保存入力は全員・重複なし・層内のみ。空配列は標準リセット', () => {
  const initial = ids(group(rows))
  assert.ok(valid(rows, initial) && valid(rows, []) && valid(rows, move(rows, initial, id(2), id(3))))
  for (const input of [initial.slice(1), [...initial, id(999)], initial.map(() => id(2)), [id(4), ...initial.filter(i => i !== id(4))]]) assert.equal(valid(rows, input), false)
})
test('UUID・revision・名簿キーを検証、巨大/重複/不正データを拒否', () => {
  const good = { orderedCastIds: ids(group(rows)), revision: 0, rosterKey: key(rows) }
  assert.ok(shape(good))
  for (const input of [null, {}, { ...good, orderedCastIds: ['admin'] }, { ...good, orderedCastIds: [id(1), id(1)] }, { ...good, revision: -1 }, { ...good, revision: 0.5 }, { ...good, revision: Number.MAX_SAFE_INTEGER }, { ...good, rosterKey: null }]) assert.equal(shape(input), false)
})

function api({ authError = null, rosterRows = rows, database = { ordered_cast_ids: [], revision: 0 }, dbError = false, readDenied = false } = {}) {
  const calls = []
  let state = plain(database), adminCreated = 0
  const query = (table, admin = false) => {
    let update = null
    const filters = []
    return {
      select(...args) { calls.push(['select', table, ...args]); return this },
      eq(...args) { calls.push(['eq', table, ...args]); filters.push(args); return this },
      update(value) { update = value; calls.push(['update', table, value]); return this },
      then(resolve, reject) { return Promise.resolve({ data: rosterRows, error: dbError ? { message: 'private detail' } : null }).then(resolve, reject) },
      async maybeSingle() {
        if (dbError) return { data: null, error: { message: 'private detail' } }
        if (readDenied && !admin) return { data: null, error: null }
        if (update) {
          if (!admin) throw new Error('Unauthorized database update')
          const revision = filters.find(f => f[0] === 'revision')?.[1]
          assert.ok(filters.some(f => f[0] === 'id' && f[1] === true))
          if (!state || revision !== state.revision) return { data: null, error: null }
          state = { ...state, ...update }
        }
        return { data: state, error: null }
      },
    }
  }
  const result = load('app/api/admin/casts/order/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
    '@/lib/auth': { requirePermission: async permission => { calls.push(['permission', permission]); if (authError) throw new Error(authError); return { id: id(80) } } },
    '@/lib/supabase/server': { createClient: async () => ({ from: table => query(table) }) },
    '@/lib/supabase/admin': { createAdminClient: () => { adminCreated++; return { from: table => query(table, true) } } },
    '@/lib/castManagementOrder': helpers,
  }, { console: { ...console, error() {} } })
  return { get: result.GET, put: body => result.PUT(new Request('https://example.test/api/admin/casts/order', { method: 'PUT', body: JSON.stringify(body) })),
    calls, adminCreated: () => adminCreated, state: () => state }
}
const body = () => ({ orderedCastIds: ids(group(rows)), revision: 0, rosterKey: key(rows) })

test('GETは閲覧権限・セッションRLS・no-store。全スタッフは同じ保存データを読む', async () => {
  const db = { ordered_cast_ids: [id(2), id(3)], revision: 9 }
  const env = api({ database: db })
  const response = await env.get()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('vary'), 'Cookie')
  assert.deepEqual(await response.json(), { orderedCastIds: db.ordered_cast_ids, revision: 9, rosterKey: key(rows) })
  assert.equal(env.calls[0][1], 'キャスト.閲覧')
  assert.ok(env.calls.some(c => c[0] === 'eq' && c[1] === 'profiles' && c[2] === 'role' && c[3] === 'cast'))
  assert.ok(env.calls.some(c => c[0] === 'select' && c[1] === 'profiles' && c[2].includes('joined_at') && c[2].includes('training_start_date')))
  assert.equal(env.adminCreated(), 0)
  assert.equal((await api({ readDenied: true }).get()).status, 503)
})
test('未認証/キャスト/権限なしは401/403。service-roleを作らない', async () => {
  for (const [authError, status] of [['UNAUTHENTICATED', 401], ['FORBIDDEN', 403]]) {
    const env = api({ authError })
    assert.equal((await env.get()).status, status)
    assert.equal((await env.put(body())).status, status)
    assert.equal(env.adminCreated(), 0)
    assert.ok(!env.calls.some(c => c[0] === 'select'))
  }
})
test('PUTはアカウント管理権限、認証者ID固定、revision比較で共有テーブル1行だけ更新', async () => {
  const env = api()
  const response = await env.put({ ...body(), updated_by: id(999), user_id: id(999) })
  assert.equal(response.status, 200)
  assert.equal(env.calls[0][1], 'キャスト.アカウント管理')
  assert.equal(env.state().updated_by, id(80))
  assert.equal(env.state().revision, 1)
  assert.ok(!env.calls.some(c => c[0] === 'update' && c[1] === 'profiles'))
  assert.deepEqual((await response.json()).orderedCastIds, [...body().orderedCastIds])
})
test('同時編集は片方のみ成功、後から古いrevisionで保存しても上書きしない', async () => {
  const env = api()
  const first = body(), second = { ...body(), orderedCastIds: [] }
  const responses = await Promise.all([env.put(first), env.put(second)])
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409])
  assert.equal(env.state().revision, 1)
})
test('追加・退店・層/名前変更後の古い名簿キーは409、管理者や別層のID混入は400', async () => {
  const changed = api({ rosterRows: [...rows, row(100, '新規')] })
  assert.equal((await changed.put(body())).status, 409)
  assert.equal(changed.adminCreated(), 0)
  for (const orderedCastIds of [[id(999)], [id(4), ...body().orderedCastIds.filter(i => i !== id(4))], [...body().orderedCastIds, id(999)]]) {
    const env = api()
    assert.equal((await env.put({ ...body(), orderedCastIds })).status, 400)
    assert.equal(env.adminCreated(), 0)
  }
})
test('入店日が編集された後の古い名簿キーは409、保存順やプロフィールを上書きしない', async () => {
  for (const changes of [{ joined_at: '2020-01-01' }, { training_start_date: '2021-01-01' }]) {
    const env = api({ rosterRows: rows.map((r, i) => i === 0 ? { ...r, ...changes } : r) })
    assert.equal((await env.put(body())).status, 409)
    assert.equal(env.adminCreated(), 0)
    assert.equal(env.state().revision, 0)
  }
})
test('入店日順リセットは空配列を保存、DB未適用/失敗は成功を返さない', async () => {
  const env = api()
  assert.equal((await env.put({ ...body(), orderedCastIds: [] })).status, 200)
  assert.deepEqual(env.state().ordered_cast_ids, [])
  for (const options of [{ database: null }, { dbError: true }]) {
    assert.equal((await api(options).get()).status, 503)
    const response = await api(options).put(body())
    assert.ok([409, 503].includes(response.status))
    assert.ok(!JSON.stringify(await response.json()).includes('private detail'))
  }
})
test('不正なリクエストはDB書き込み前に拒否', async () => {
  for (const input of [null, { ...body(), revision: -1 }, { ...body(), orderedCastIds: [id(1), id(1)] }]) {
    const env = api()
    assert.equal((await env.put(input)).status, 400)
    assert.equal(env.adminCreated(), 0)
  }
})
test('PC/スマホとも層別で全員表示、閲覧専用には並び替えボタンなし', () => {
  const { default: List } = load('components/CastManagementList.tsx', {
    'react': React, 'react/jsx-runtime': jsxRuntime, '@/lib/colors': load('lib/colors.ts'), '@/lib/castManagementOrder': helpers,
  })
  for (const isPC of [true, false]) {
    const props = { casts: rows, isPC, onReload: async () => {}, renderCast: r => React.createElement('span', null, r.cast_name) }
    const view = renderToStaticMarkup(React.createElement(List, { ...props, canReorder: false }))
    assert.ok(view.includes('在籍 AC') && view.includes('退店 AC'))
    assert.ok(view.indexOf('あやな') < view.indexOf('いるは') && view.indexOf('いるは') < view.indexOf('みやこ'))
    assert.ok(!view.includes('>並び替え<'))
    assert.ok(renderToStaticMarkup(React.createElement(List, { ...props, canReorder: true })).includes('>並び替え<'))
    const dated = rows.map(r => ({ ...r, joined_at: r.id === id(2) ? '2010-01-01' : r.id === id(5) ? '2020-01-01' : null }))
    const datedView = renderToStaticMarkup(React.createElement(List, { ...props, casts: dated, canReorder: true }))
    assert.ok(datedView.indexOf('みやこ') < datedView.indexOf('いるは') && datedView.indexOf('いるは') < datedView.indexOf('あやな'))
    assert.ok(datedView.includes('標準は入店日順'))
  }
})
test('個人宛キャスト選択・日次売上PC/スマホ・初期選択・次のキャストは同じ層別入店日順', () => {
  const admin = fs.readFileSync('app/admin/casts/page.tsx', 'utf8')
  assert.match(admin, /announcementCasts = useMemo\(\(\) => groupCastManagementRows\(casts\.filter\(c => c\.is_active\)\)\.flatMap\(group => group\.rows\), \[casts\]\)/)
  assert.match(admin, /announcementCasts\.map\(c =>/)
  const daily = fs.readFileSync('app/admin/daily-sales/page.tsx', 'utf8')
  assert.match(daily, /sortedCasts = useMemo\(\(\) => groupCastManagementRows\(casts\)\.flatMap\(group => group\.rows\), \[casts\]\)/)
  assert.match(daily, /setSelectedCastId\(sortedCasts\[0\]\.id\)/)
  assert.match(daily, /sortedCasts\.map\(c =>/)
  assert.match(daily, /sortedCasts\.filter\(c => tier/)
  assert.match(daily, /nextCast = sortedCasts\.find\(/)
  assert.doesNotMatch(daily, /const notWorking|const working = casts\.filter/)
  const managementAPI = fs.readFileSync('app/api/admin/casts/route.ts', 'utf8')
  assert.match(managementAPI, /select\('id, role, cast_name, display_name, cast_tier, joined_at, training_start_date,/)
  const list = fs.readFileSync('components/CastManagementList.tsx', 'utf8')
  assert.ok(list.includes('入店日順に戻す') && !list.includes('あいうえお順に戻す'))
})
test('シフト管理はPC/スマホ共通の層別入店日順。旧層・未設定・出勤状態と元名簿を維持', () => {
  const source = fs.readFileSync('app/admin/shifts/page.tsx', 'utf8')
  assert.match(source, /sortedCasts = useMemo\(\(\) => groupCastManagementRows\(casts\)\.flatMap\(group => group\.rows\), \[casts\]\)/)
  assert.match(source, /tierCasts = sortedCasts\.filter\(/)
  const casts = [
    { ...row(1, 'あやな', 'AC'), joined_at: '2025-01-01' },
    { ...row(2, 'みやこ', 'AC'), joined_at: '2023-01-01' },
    { ...row(3, 'いろは', 'AC'), joined_at: null, training_start_date: '2024-01-01' },
    { ...row(4, 'ゆい', 'BA'), joined_at: '2000-01-01' },
    { ...row(5, '日付未登録', 'AC'), joined_at: null },
    { ...row(6, '旧層キャスト', 'A層'), joined_at: '2010-01-01' },
    { ...row(7, '層未登録', null), joined_at: '1990-01-01' },
  ]
  const before = plain(casts)
  const empty = () => null
  for (const isPC of [true, false]) {
    let stateIndex = 0
    const { default: Page } = load('app/admin/shifts/page.tsx', {
      'react': { ...React, useState: initial => React.useState(++stateIndex === 1 ? true : stateIndex === 2 ? '2026-10' : stateIndex === 3 ? new Map([[`${id(2)}:2026-10-01`, '出勤'], [`${id(1)}:2026-10-01`, '休み']]) : initial) },
      'react/jsx-runtime': jsxRuntime, 'next/navigation': { useRouter: () => ({ push: empty }) },
      '@/lib/supabase/client': { createClient: () => ({}) }, '@/hooks/useCasts': { useCasts: () => ({ casts, isLoaded: true }) },
      '@/hooks/useToast': { useToast: () => ({ toast: empty, ToastView: null }) }, '@/hooks/useBackOrHome': { useBackOrHome: () => empty },
      '@/hooks/useScrollTopOnMount': { useScrollTopOnMount: empty }, '@/hooks/useViewMode': { useViewMode: () => ({ isPC }) },
      '@/lib/colors': load('lib/colors.ts'), '@/types': types, '@/lib/castManagementOrder': helpers,
      '@/lib/dateUtils': load('lib/dateUtils.ts'), '@/lib/supabaseHelpers': { fetchAllPaginated: empty }, '@/lib/authCache': { fetchMe: empty },
      '@/components/BottomNav': { default: empty }, '@/components/ShiftSuggestionCard': { default: empty },
      '@/components/ViewModeToggle': { default: empty }, '@/components/ui/Spinner': { default: empty }, '@/components/ui/EmptyState': { default: empty },
      '@/components/PageHeader': { default: ({ title, actions }) => React.createElement('header', null, title, actions) },
    })
    const view = renderToStaticMarkup(React.createElement(Page))
    const names = ['みやこ', 'いろは', 'あやな', '日付未登録', 'ゆい', '旧層キャスト', '層未登録']
    const positions = names.map(name => view.indexOf(`>${name}</td>`))
    assert.ok(positions.every(position => position >= 0))
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
    assert.match(view, /みやこ<\/td><td[^>]*>出<\/td>/)
    assert.match(view, /あやな<\/td><td[^>]*>休<\/td>/)
    assert.deepEqual(casts, before)
  }
})
test('migrationはactive admin閲覧のみ、ブラウザ書き込み不可。旧migration・プロフィールを変更しない', () => {
  const sql = fs.readFileSync('supabase/migrations/20261010180000_v03121_cast_management_order.sql', 'utf8')
  assert.match(sql, /public\.current_role\(\) = 'admin'/)
  assert.match(sql, /staff_has_permission\('キャスト\.閲覧'\)/)
  assert.match(sql, /staff_has_permission\('キャスト\.アカウント管理'\)/)
  assert.match(sql, /REVOKE ALL .* FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /GRANT SELECT .* TO authenticated/)
  assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/)
  assert.doesNotMatch(sql, /UPDATE public\.profiles|DELETE FROM public\.profiles|FOR ALL|GRANT UPDATE .*authenticated/)
  const page = fs.readFileSync('app/admin/casts/page.tsx', 'utf8')
  assert.match(page, /canReorder=\{hasPerm\('キャスト\.アカウント管理'\)\}/)
  assert.match(page, /hasPerm\('キャスト\.閲覧'\) \|\| hasPerm/)
})
