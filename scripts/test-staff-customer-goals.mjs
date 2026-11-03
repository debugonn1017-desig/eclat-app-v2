import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const load = (file, mocks = {}, globals = {}) => {
  const exports = {}
  vm.runInThisContext(`(function(require,exports,${Object.keys(globals).join(',')}){${compile(file)}\n})`)(name => { if (!Object.hasOwn(mocks, name)) throw new Error(name); return mocks[name] }, exports, ...Object.values(globals))
  return exports
}
const logic = load('lib/starCustomerGoals.ts')
const helpers = load('lib/supabaseHelpers.ts')
const casts = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']
const goal = (customer = 1, cast = casts[0], targetSales = 300000) => ({ cast_id: cast, customer_id: customer, month: '2026-11-01', target_sales: targetSales, target_visits: 3, note: '月別備考', revision: 1, updated_at: '2026-11-03T00:00:00Z' })
function apiFixture({ role = 'admin', signedIn = true, canEdit = true, failTable = '' } = {}) {
  const calls = []
  const tables = {
    customers: [
      { id: 1, cast_name: 'りな', is_starred: true }, { id: 2, cast_name: 'あかり', is_starred: true },
      { id: 3, cast_name: '退店', is_starred: true }, { id: 4, cast_name: null, is_starred: true },
      { id: 5, cast_name: 'りな', is_starred: false }, { id: 6, cast_name: '重複', is_starred: true },
    ],
    profiles: [
      { id: casts[0], cast_name: 'りな', role: 'cast', is_active: true },
      { id: casts[1], cast_name: 'あかり', role: 'cast', is_active: true },
      { id: casts[2], cast_name: '退店', role: 'cast', is_active: false },
      { id: casts[3], cast_name: '重複', role: 'cast', is_active: true },
      { id: casts[4], cast_name: '重複', role: 'cast', is_active: true },
    ],
    customer_monthly_goals: [goal(), goal(1, casts[1], 999999), goal(2, casts[0], 777777), goal(2, casts[1], 0)],
    customer_visits: [
      ...Array.from({ length: 1005 }, (_, i) => ({ id: i + 1, customer_id: 1, visit_date: '2026-11-02', amount_spent: 100, is_planned: false })),
      { id: 1100, customer_id: 2, visit_date: '2026-11-03', amount_spent: 0, is_planned: null },
      { id: 1101, customer_id: 1, visit_date: '2026-11-04', amount_spent: 99999, is_planned: false },
      { id: 1102, customer_id: 1, visit_date: '2026-10-31', amount_spent: 99999, is_planned: false },
      { id: 1103, customer_id: 1, visit_date: '2026-11-02', amount_spent: 99999, is_planned: true },
    ],
  }
  const client = { from(table) {
    const filters = [], orders = []
    return {
      select(columns) { calls.push({ table, columns }); return this },
      eq(k, value) { filters.push(row => row[k] === value); return this },
      in(k, values) { filters.push(row => values.map(String).includes(String(row[k]))); return this },
      gte(k, value) { filters.push(row => row[k] >= value); return this },
      lt(k, value) { filters.push(row => row[k] < value); return this },
      lte(k, value) { filters.push(row => row[k] <= value); return this },
      or(value) { assert.equal(value, 'is_planned.is.null,is_planned.eq.false'); filters.push(row => row.is_planned == null || row.is_planned === false); return this },
      order(k) { orders.push(k); return this },
      async range(from, to) {
        calls.push({ table, from, to })
        if (table === failTable) return { data: null, error: { message: 'fixture failure' } }
        const data = (tables[table] || []).filter(row => filters.every(fn => fn(row))).sort((a, b) => {
          for (const key of orders) { if (a[key] < b[key]) return -1; if (a[key] > b[key]) return 1 }
          return 0
        })
        return { data: data.slice(from, to + 1), error: null }
      },
    }
  } }
  class StarLogError extends Error { constructor(message, status) { super(message); this.status = status } }
  return { ...load('app/api/customer-goals/staff/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/starLogServer': { StarLogError, starLogSession: async write => { assert.equal(write, undefined); if (!signedIn) throw new StarLogError('ログインしてください', 401); return { client, profile: { role }, canEdit } } },
    '@/lib/supabaseHelpers': helpers, '@/lib/dateUtils': { todayJST: () => '2026-11-03' }, '@/lib/starCustomerGoals': logic,
  }), calls, tables }
}
const get = (fixture, ids = '1,2,3,4,5,6,999', month = '2026-11') => fixture.GET(new Request('https://example.test/api/customer-goals/staff?' + new URLSearchParams({ month, customerIds: ids })))

test('staff APIは未ログインとキャスト本人を拒否し、閲覧スタッフには読取りだけを許可', async () => {
  const anonymous = apiFixture({ signedIn: false })
  assert.equal((await get(anonymous)).status, 401); assert.equal(anonymous.calls.length, 0)
  const cast = apiFixture({ role: 'cast' })
  assert.equal((await get(cast)).status, 403); assert.equal(cast.calls.length, 0)
  const response = await get(apiFixture({ canEdit: false }))
  assert.equal(response.status, 200); assert.equal((await response.json()).canEdit, false)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store'); assert.equal(response.headers.get('Vary'), 'Cookie')
})

test('staff APIは不正月、空ID、非整数、桁あふれ、201件をDB問合せ前に拒否', async () => {
  for (const [ids, month] of [['1', '2026-13'], ['', '2026-11'], ['01', '2026-11'], ['1.5', '2026-11'], ['9007199254740992', '2026-11'], [Array.from({ length: 201 }, (_, i) => i + 1).join(','), '2026-11']]) {
    const fixture = apiFixture(), response = await get(fixture, ids, month)
    assert.equal(response.status, 400); assert.equal(fixture.calls.length, 0)
  }
})

test('staff APIは現在担当とcast_idの組で月別目標を照合し、旧担当の目標を混ぜない', async () => {
  const fixture = apiFixture(), response = await get(fixture), data = await response.json()
  assert.equal(response.status, 200)
  assert.equal(data.items['1'].castId, casts[0]); assert.equal(data.items['1'].goal.target_sales, 300000)
  assert.equal(data.items['2'].castId, casts[1]); assert.equal(data.items['2'].goal.target_sales, 0)
  assert.equal(data.items['1'].status, 'ready')
  assert.equal(data.items['3'].status, 'unassigned'); assert.equal(data.items['4'].status, 'unassigned')
  for (const id of ['5', '6', '999']) assert.equal(data.items[id].status, 'unavailable')
  for (const id of ['3', '4', '5', '6', '999']) { assert.equal(data.items[id].actual, null); assert.equal(data.items[id].goal, null) }
})

test('staff APIの実績は対象月の実来店だけ、1000件超・ゼロ円来店を正確に集計', async () => {
  const fixture = apiFixture(), response = await get(fixture), data = await response.json()
  assert.deepEqual(data.items['1'].actual, { sales: 100500, visits: 1005 })
  assert.deepEqual(data.items['2'].actual, { sales: 0, visits: 1 })
  assert.equal(fixture.calls.filter(call => call.table === 'customer_visits' && 'from' in call).length, 2)
  fixture.tables.customer_monthly_goals = []
  const unset = await (await get(fixture, '1')).json()
  assert.equal(unset.items['1'].goal, null); assert.equal(unset.items['1'].status, 'ready')
})

test('staff APIは顧客・担当・目標・来店のどれが失敗しても成功や0実績を返さない', async () => {
  for (const failTable of ['customers', 'profiles', 'customer_monthly_goals', 'customer_visits']) {
    const response = await get(apiFixture({ failTable }))
    assert.equal(response.status, 503)
    const data = await response.json(); assert.ok(data.error); assert.equal(data.items, undefined)
  }
})

const responseData = (ids, month = '2026-11', canEdit = true) => ({ month, customerIds: ids, canEdit,
  items: Object.fromEntries(ids.map(customerId => [customerId, { customerId, castId: casts[0], castName: 'りな', status: 'ready', goal: null, actual: { sales: 0, visits: 0 } }])) })
const until = async predicate => { for (let i = 0; i < 60; i++) { if (predicate()) return; await new Promise(setImmediate) } throw new Error('hook state did not settle') }
function hookFixture(fetcher) {
  const slots = [], effects = [], pending = [], timers = new Map(), listeners = { window: new Map(), document: new Map() }
  let cursor = 0, args, output, queued = false, timerId = 0, unmounted = false
  const equal = (a, b) => !!a && !!b && a.length === b.length && a.every((v, index) => Object.is(v, b[index]))
  const schedule = () => { if (!queued && !unmounted) { queued = true; queueMicrotask(() => { queued = false; if (!unmounted) render(args) }) } }
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; schedule() }] },
    useRef(value) { const index = cursor++; if (!(index in slots)) slots[index] = { current: value }; return slots[index] },
    useCallback(fn, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = { fn, deps }; return slots[index].fn },
    useEffect(fn, deps) { const index = cursor++; if (!effects[index] || !equal(effects[index].deps, deps)) { pending.push(() => { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: fn() } }) } },
  }
  const target = name => ({ addEventListener(event, callback) { const set = listeners[name].get(event) || new Set(); set.add(callback); listeners[name].set(event, set) }, removeEventListener(event, callback) { listeners[name].get(event)?.delete(callback) } })
  const window = { ...target('window'), setInterval(callback, delay) { assert.equal(delay, 30000); timers.set(++timerId, callback); return timerId }, clearInterval(id) { timers.delete(id) } }
  const document = { ...target('document'), visibilityState: 'visible' }
  const hookModule = load('hooks/useStaffCustomerGoals.ts', { react, '@/lib/starCustomerGoals': logic }, { fetch: fetcher, window, document })
  function render(nextArgs) { args = nextArgs; cursor = 0; output = hookModule.useStaffCustomerGoals(...args); while (pending.length) pending.shift()(); return output }
  return { module: hookModule, render, current: () => output, timers, fire(name, event) { for (const callback of listeners[name].get(event) || []) callback() }, unmount() { unmounted = true; for (const effect of effects) effect?.cleanup?.() } }
}

test('staff hookは200件単位・最大同時3件で取得し、全バッチ完了後だけデータを公開', async () => {
  let active = 0, maximum = 0
  const batches = []
  const fixture = hookFixture(async url => {
    const p = new URL(url, 'https://example.test').searchParams, ids = p.get('customerIds').split(',')
    batches.push(ids); active++; maximum = Math.max(maximum, active)
    await new Promise(setImmediate); active--
    return Response.json(responseData(ids, p.get('month')))
  })
  const ids = Array.from({ length: 801 }, (_, i) => String(i + 1))
  const data = await fixture.module.loadStaffCustomerGoals(ids, '2026-11', new AbortController().signal)
  assert.equal(maximum, 3); assert.deepEqual(batches.map(batch => batch.length), [200, 200, 200, 200, 1]); assert.equal(Object.keys(data.items).length, 801)
  fixture.unmount()
})

test('staff hookは部分失敗・別月・担当不整合・実績欠落を成功として扱わない', async () => {
  for (const kind of ['http', 'month', 'cast', 'actual']) {
    const fixture = hookFixture(async url => {
      const ids = new URL(url, 'https://example.test').searchParams.get('customerIds').split(',')
      if (kind === 'http') return Response.json({ error: '取得失敗' }, { status: 503 })
      const data = responseData(ids)
      if (kind === 'month') data.month = '2026-12'
      if (kind === 'cast') data.items[ids[0]].goal = goal(Number(ids[0]), casts[1])
      if (kind === 'actual') data.items[ids[0]].actual = null
      return Response.json(data)
    })
    await assert.rejects(fixture.module.loadStaffCustomerGoals(['1'], '2026-11', new AbortController().signal))
    fixture.unmount()
  }
})

test('staff hookは対象IDと月の変更時に旧データを隠し、編集中はpoll/focus再取得しない', async () => {
  let calls = 0
  const fixture = hookFixture(async url => { calls++; const p = new URL(url, 'https://example.test').searchParams; return Response.json(responseData(p.get('customerIds').split(','), p.get('month'))) })
  fixture.render([['1'], '2026-11', 0, false]); await until(() => fixture.current().ready)
  assert.equal(calls, 1); assert.equal(fixture.timers.size, 1)
  fixture.render([['1'], '2026-11', 0, true]); assert.equal(fixture.timers.size, 0)
  fixture.fire('window', 'focus'); fixture.fire('document', 'visibilitychange'); await new Promise(setImmediate); assert.equal(calls, 1)
  fixture.render([['2'], '2026-12', 0, false]); assert.equal(fixture.current().data, null); assert.equal(fixture.current().ready, false)
  await until(() => fixture.current().ready)
  assert.deepEqual(fixture.current().data.customerIds, ['2']); assert.equal(fixture.current().data.month, '2026-12')
  const before = calls; [...fixture.timers.values()][0](); await until(() => calls > before && fixture.current().ready)
  fixture.unmount()
})

test('staff hookは保存競合時に取得済みデータを維持、成功時は当該担当の目標だけ更新', async () => {
  let conflict = true, writes = 0
  const fixture = hookFixture(async (url, options) => {
    if (options?.method === 'PUT') {
      writes++; const input = JSON.parse(options.body)
      if (conflict) return Response.json({ error: '競合・入力内容を控えてください' }, { status: 409 })
      return Response.json({ goal: { ...goal(Number(input.customerId), input.castId, input.targetSales), revision: input.expectedRevision + 1 } })
    }
    const p = new URL(url, 'https://example.test').searchParams
    return Response.json(responseData(p.get('customerIds').split(','), p.get('month')))
  })
  fixture.render([['1'], '2026-11', 0, false]); await until(() => fixture.current().ready)
  const input = { castId: casts[0], customerId: '1', month: '2026-11', targetSales: 0, targetVisits: null, note: '下書きを保持', expectedRevision: 0 }
  await assert.rejects(fixture.current().save(input), /競合/)
  await until(() => !fixture.current().saving)
  assert.equal(input.note, '下書きを保持'); assert.equal(fixture.current().data.items['1'].goal, null)
  conflict = false
  await fixture.current().save(input); await until(() => !fixture.current().saving)
  assert.equal(fixture.current().data.items['1'].goal.target_sales, 0); assert.equal(writes, 2)
  await assert.rejects(fixture.current().save({ ...input, castId: casts[1] }), /担当/); assert.equal(writes, 2)
  fixture.unmount()
})

test('staff hookは保存中の重複送信を防ぎ、別月へ遷移した後へ保存結果を混ぜない', async () => {
  let resolveSave, writes = 0
  const fixture = hookFixture(async (url, options) => {
    if (options?.method === 'PUT') { writes++; return await new Promise(resolve => { resolveSave = resolve }) }
    const p = new URL(url, 'https://example.test').searchParams
    return Response.json(responseData(p.get('customerIds').split(','), p.get('month')))
  })
  fixture.render([['1'], '2026-11', 0, false]); await until(() => fixture.current().ready)
  const input = { castId: casts[0], customerId: '1', month: '2026-11', targetSales: 100, targetVisits: null, note: '', expectedRevision: 0 }
  const saved = fixture.current().save(input)
  await assert.rejects(fixture.current().save(input), /保存中/); assert.equal(writes, 1)
  fixture.render([['1'], '2026-12', 0, false])
  resolveSave(Response.json({ goal: goal() })); await saved
  await until(() => fixture.current().ready)
  assert.equal(fixture.current().data.month, '2026-12'); assert.equal(fixture.current().data.items['1'].goal, null)
  fixture.unmount()
})

test('staff hookはpaused編集中にrevisionが増えても同scopeの下書きを元の版で保存できる', async () => {
  let reads = 0
  const writes = []
  const fixture = hookFixture(async (url, options) => {
    if (options?.method === 'PUT') {
      const input = JSON.parse(options.body); writes.push(input)
      return Response.json({ goal: { ...goal(Number(input.customerId), input.castId, input.targetSales), note: input.note, revision: input.expectedRevision + 1 } })
    }
    reads++
    const p = new URL(url, 'https://example.test').searchParams, data = responseData(p.get('customerIds').split(','), p.get('month'))
    data.items['1'].goal = { ...goal(), revision: 7 }
    return Response.json(data)
  })
  fixture.render([['1'], '2026-11', 0, false]); await until(() => fixture.current().ready)
  fixture.render([['1'], '2026-11', 1, true])
  assert.equal(fixture.current().ready, false); assert.equal(fixture.timers.size, 0)
  const input = { castId: casts[0], customerId: '1', month: '2026-11', targetSales: 123456, targetVisits: 3, note: '編集中の備考を保持', expectedRevision: 7 }
  const saved = await fixture.current().save(input)
  await until(() => !fixture.current().saving)
  assert.equal(reads, 1); assert.equal(writes.length, 1); assert.equal(writes[0].expectedRevision, 7)
  assert.equal(saved.revision, 8); assert.equal(fixture.current().data.items['1'].goal.note, input.note)
  assert.equal(fixture.current().data.items['1'].goal.target_sales, 123456)
  fixture.unmount()
})

test('staff hookはpausedの再取得待ちでも別担当・別月・古いscopeの保存を送信しない', async () => {
  let writes = 0
  const fixture = hookFixture(async (url, options) => {
    if (options?.method === 'PUT') { writes++; throw new Error('must not write') }
    const p = new URL(url, 'https://example.test').searchParams
    return Response.json(responseData(p.get('customerIds').split(','), p.get('month')))
  })
  fixture.render([['1'], '2026-11', 0, false]); await until(() => fixture.current().ready)
  fixture.render([['1'], '2026-11', 1, true])
  const input = { castId: casts[0], customerId: '1', month: '2026-11', targetSales: 100, targetVisits: null, note: '', expectedRevision: 0 }
  await assert.rejects(fixture.current().save({ ...input, castId: casts[1] }), /担当/)
  await assert.rejects(fixture.current().save({ ...input, month: '2026-12' }), /担当/)
  const staleSave = fixture.current().save
  fixture.render([['1'], '2026-12', 1, true])
  assert.equal(fixture.current().data, null)
  await assert.rejects(fixture.current().save(input), /担当/)
  await assert.rejects(staleSave(input), /担当/)
  assert.equal(writes, 0)
  fixture.unmount()
})

test('staff hookは閲覧専用・担当未設定の編集を送信前に止め、取得完了の未設定と区別する', async () => {
  for (const mode of ['readOnly', 'unassigned']) {
    let writes = 0
    const fixture = hookFixture(async (url, options) => {
      if (options?.method === 'PUT') { writes++; throw new Error('must not write') }
      const p = new URL(url, 'https://example.test').searchParams
      const data = responseData(p.get('customerIds').split(','), p.get('month'), mode !== 'readOnly')
      if (mode === 'unassigned') data.items['1'] = { customerId: '1', castId: null, castName: null, status: 'unassigned', goal: null, actual: null }
      return Response.json(data)
    })
    fixture.render([['1'], '2026-11', 0, false]); await until(() => fixture.current().ready)
    await assert.rejects(fixture.current().save({ castId: casts[0], customerId: '1', month: '2026-11', targetSales: 0, targetVisits: null, note: '', expectedRevision: 0 }), /担当/)
    assert.equal(writes, 0)
    fixture.unmount()
  }
})

test('staff hookは中止済みの取得を成功させず、レスポンスの余分な顧客を結合しない', async () => {
  let calls = 0
  const fixture = hookFixture(async url => {
    calls++
    const p = new URL(url, 'https://example.test').searchParams, data = responseData(p.get('customerIds').split(','))
    data.items['999'] = responseData(['999']).items['999']
    return Response.json(data)
  })
  const controller = new AbortController(); controller.abort()
  await assert.rejects(fixture.module.loadStaffCustomerGoals(['1'], '2026-11', controller.signal), { name: 'AbortError' })
  assert.equal(calls, 0)
  const data = await fixture.module.loadStaffCustomerGoals(['1'], '2026-11', new AbortController().signal)
  assert.deepEqual(Object.keys(data.items), ['1'])
  fixture.unmount()
})
