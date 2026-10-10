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
const helpers = load('lib/castManagementOrder.ts', { '../types': types })
const { groupCastManagementRows: group, castManagementRosterKey: key, moveCastWithinGroup: move, validCastManagementOrder: valid, isCastManagementOrder: shape } = helpers
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = (n, name, tier = 'AA', active = true) => ({ id: id(n), cast_name: name, display_name: null, cast_tier: tier, is_active: active })
const rows = [row(1, 'りな', 'BB'), row(2, 'みやこ', 'AC'), row(3, 'あやな', 'AC'), row(4, 'ゆい', 'BA'), row(5, 'いるは', 'AC'), row(6, 'なみ', 'AC', false)]
const plain = value => JSON.parse(JSON.stringify(value))
const ids = groups => groups.flatMap(g => [...g.rows].map(r => r.id))

test('初期は在籍→層順→あいうえお順、退店は別グループ。名簿は変更しない', () => {
  const original = plain(rows)
  assert.deepEqual([...ids(group(rows))], [id(3), id(5), id(2), id(4), id(1), id(6)])
  assert.deepEqual(rows, original)
  assert.equal(group(rows).at(-1).active, false)
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
test('名簿キーは元の配列順に依存せず、名前・層・在籍・人数変更で変わる', () => {
  assert.equal(key(rows), key([...rows].reverse()))
  for (const changes of [{ cast_name: '別名' }, { display_name: '変更' }, { cast_tier: 'AA' }, { is_active: false }]) {
    assert.notEqual(key(rows), key(rows.map((r, i) => i === 0 ? { ...r, ...changes } : r)))
  }
  assert.notEqual(key(rows), key([...rows, row(99, '追加')]))
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
test('あいうえお順リセットは空配列を保存、DB未適用/失敗は成功を返さない', async () => {
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
