import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function load(file, mocks = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file)
  const exports = {}; cache.set(file, exports)
  vm.runInThisContext(`(function(require,exports){${compile(file)}\n})`, { filename: file })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    if (name.startsWith('.')) return load(path.join(path.dirname(file), name) + '.ts', mocks, cache)
    throw new Error('Unexpected import: ' + name)
  }, exports)
  return exports
}
const ranking = load('lib/lockerRanking.ts'), pagination = load('lib/supabaseHelpers.ts')
const period = (month = '2026-11', now = '2026-11-04T12:00:00+09:00') => ranking.lockerRankingPeriod(month, new Date(now))
const cast = (id, tier = 'AA') => ({ id, cast_name: id, display_name: `表示${id}`, cast_tier: tier, role: 'cast', is_active: true })
const customer = (id, castName = 'a', status = '本指名', firstVisit = null) => ({ id, cast_name: castName, nomination_status: status, first_visit_date: firstVisit, customer_name: '非公開顧客名' })
const visit = (id, date, amount = 0, status = '本指名', extra = {}) => ({ id, customer_id: 1, visit_date: date, amount_spent: amount, nomination_status_at_visit: status, is_planned: false, has_douhan: false, ...extra })
const shift = (date, status = '出勤', castId = 'a') => ({ cast_id: castId, shift_date: date, status })
const build = overrides => ranking.buildLockerRanking({ period: period(), casts: [cast('a')], customers: [customer(1)], visits: [], extensionSales: [], shifts: [], ...overrides })

test('営業日の04:00切替・月年境界・閏年末日と厳密な月入力を扱う', () => {
  assert.deepEqual(period(undefined, '2026-12-01T03:59:59+09:00'), { month: '2026-11', periodStart: '2026-11-01', periodEnd: '2026-11-30', businessDate: '2026-11-30', previousBusinessDate: '2026-11-29' })
  assert.equal(period(undefined, '2026-12-01T04:00:00+09:00').previousBusinessDate, '2026-11-30')
  assert.equal(period(undefined, '2027-01-01T04:00:00+09:00').previousBusinessDate, '2026-12-31')
  assert.equal(period('2024-02').periodEnd, '2024-02-29')
  assert.equal(period('2000-01').periodEnd, '2000-01-31')
  for (const month of ['', '1999-12', '2200-01', '2026-00', '2026-13', '2026-1', '2026-11-01', '2026-12', ' 2026-11', '2026-11 ']) assert.throws(() => period(month), /対象月/)
})
test('売上は実来店＋延長。本/場/同伴は来店時スナップショット、0円も実績、予定と未来営業日は除外', () => {
  const result = build({ customers: [customer(1), customer(2, 'a', '場内', '2026-11-02'), customer(3, 'a', '場内', '2026-11-05'), customer(4, 'a', '場内', '2026-11-01')], visits: [
    visit(1, '2026-11-01', 10000, '場内', { has_douhan: true }), visit(2, '2026-11-02', 0, '本指名'),
    visit(3, '2026-11-03', 100, null), visit(4, '2026-11-03', 77777, '本指名', { is_planned: true, has_douhan: true }),
    visit(5, '2026-11-05', 88888, '本指名', { has_douhan: true }), visit(6, '2026-10-31', 99999),
    visit(7, '2026-11-01', 0, '場内', { customer_id: 4 }),
  ], extensionSales: [{ cast_id: 'a', sale_date: '2026-11-03', amount_spent: 5000, has_douhan: true }, { cast_id: 'a', sale_date: '2026-11-05', amount_spent: 99999 }, { cast_id: 'other', sale_date: '2026-11-01', amount_spent: 77777 }] })
  assert.deepEqual(result.rows[0], { castId: 'a', castName: '表示a', rank: 1, sales: 15100, honshimei: 2, banai: 3, douhan: 1, bowzuDays: 0, bowzuStreak: 0 })
})
test('坊主は実出勤＋本指名実来店なし。月跨ぎで休み/希望出勤を飛ばし、当日は確定しない', () => {
  const result = build({ shifts: [shift('2026-10-29'), shift('2026-10-30'), shift('2026-10-31', '休み'), shift('2026-11-01', '来客出勤'), shift('2026-11-02', '希望出勤'), shift('2026-11-03'), shift('2026-11-04')],
    visits: [visit(1, '2026-10-29', 0), visit(2, '2026-11-01', 99999, '場内'), visit(3, '2026-11-03', 100, '本指名', { is_planned: true })] })
  assert.equal(result.rows[0].bowzuDays, 2); assert.equal(result.rows[0].bowzuStreak, 3)
  assert.deepEqual(result.previousDayBowzu, [{ castId: 'a', castName: '表示a', streak: 3 }])
  const withZeroHon = build({ shifts: [shift('2026-11-03')], visits: [visit(1, '2026-11-03', 0)] })
  assert.equal(withZeroHon.rows[0].bowzuDays, 0); assert.deepEqual(withZeroHon.previousDayBowzu, [])
})
test('過去月の連続は月末時点、前日カードは現在営業日の前日。前日休みの過去連続はカードに出さない', () => {
  const result = build({ period: period('2026-10'), shifts: [shift('2026-10-29'), shift('2026-10-30'), shift('2026-10-31'), shift('2026-11-02'), shift('2026-11-03')], visits: [visit(1, '2026-10-29'), visit(2, '2026-11-02')] })
  assert.equal(result.rows[0].bowzuDays, 2); assert.equal(result.rows[0].bowzuStreak, 2)
  assert.equal(result.previousDayBowzu[0].streak, 1)
  assert.deepEqual(build({ shifts: [shift('2026-11-01'), shift('2026-11-03', '休み')] }).previousDayBowzu, [])
})
test('新人/Cと旧層はカードのみ除外。順位は同額castId固定順の連番でメダル候補は最大5名', () => {
  const casts = [cast('z', '新人'), cast('a', '新人層'), cast('c', 'C'), cast('b', 'C層'), cast('e', 'AA'), cast('d', null)]
  const result = build({ casts, customers: [], shifts: casts.map(c => shift('2026-11-03', '出勤', c.id)) })
  assert.deepEqual(result.rows.map(row => [row.castId, row.rank]), [['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5], ['z', 6]])
  assert.equal(result.rows.filter(row => row.rank <= 5).length, 5)
  assert.deepEqual(result.previousDayBowzu.map(row => row.castId), ['d', 'e'])
  assert.ok(result.rows.every(row => !('cast_tier' in row) && !('tier' in row)))
})
test('空の担当名は未割当顧客を拾わず、別担当・不正売上・重複担当を誤集計しない', () => {
  const result = build({ casts: [{ ...cast('empty'), cast_name: '' }, { ...cast('spaces'), cast_name: '   ' }, cast('a')], customers: [customer(1, ''), customer(2, null), customer(3, 'b')], visits: [visit(1, '2026-11-01', 99999), visit(2, '2026-11-01', 99999, '本指名', { customer_id: 2 }), visit(3, '2026-11-01', 99999, '本指名', { customer_id: 3 })] })
  assert.ok(result.rows.every(row => row.sales === 0 && row.honshimei === 0))
  assert.throws(() => build({ casts: [cast('a'), { ...cast('b'), cast_name: 'a' }] }), /同名/)
  assert.throws(() => build({ visits: [visit(1, '2026-11-01', '壊れた金額')] }), /売上/)
  const args = { period: period(), casts: [cast('a')], customers: [customer(1)], visits: [visit(1, '2026-11-01', 100)], shifts: [shift('2026-11-03')], extensionSales: [] }, original = structuredClone(args)
  ranking.buildLockerRanking(args); assert.deepEqual(args, original)
})

/** 実lib/auth requireAdminを実行。AuthネットワークとDBだけ隔離fixtureに差し替える。 */
function apiFixture({ role = 'admin', active = true, signedIn = true, owner = false, failTable = '', failFrom = 0, tables: overrides = {}, overflow = false } = {}) {
  const calls = [], tables = {
    profiles: [cast('a'), { ...cast('retired'), is_active: false }, { ...cast('staff'), role: 'admin' }],
    customers: [customer(1)], customer_visits: [visit(1, '2026-11-02', 100)], cast_extension_sales: [], cast_shifts: [shift('2026-11-03')], ...overrides,
  }
  let clientCreations = 0, concurrent = 0, maxConcurrent = 0
  const sessionClient = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'viewer' } : null } }) },
    from: table => { assert.equal(table, 'profiles'); return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: { id: 'viewer', role, is_active: active, is_owner: owner }, error: null }) } },
  }
  const auth = load('lib/auth.ts', { '@/lib/supabase/server': { createClient: async () => sessionClient } })
  const admin = { from(table) {
    const filters = [], filterLog = [], orders = []; let columns = ''
    return {
      select(value) { columns = value; return this },
      eq(key, value) { filters.push(row => row[key] === value); filterLog.push(['eq', key, value]); return this },
      in(key, values) { assert.ok(values.length <= 200); filters.push(row => values.map(String).includes(String(row[key]))); filterLog.push(['in', key, values]); return this },
      gte(key, value) { filters.push(row => row[key] >= value); filterLog.push(['gte', key, value]); return this },
      lte(key, value) { filters.push(row => row[key] <= value); filterLog.push(['lte', key, value]); return this },
      or(value) { assert.equal(value, 'is_planned.is.null,is_planned.eq.false'); filters.push(row => row.is_planned == null || row.is_planned === false); return this },
      order(key) { orders.push(key); return this },
      async range(from, to) {
        assert.equal(to - from + 1, 1000); calls.push({ table, columns, from, to, filters: filterLog })
        concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent)
        try {
          await new Promise(resolve => setTimeout(resolve, 0))
          if (table === failTable && from >= failFrom) return { data: null, error: { message: '架空の取得失敗' } }
          if (overflow && table === 'profiles') return { data: Array.from({ length: 1000 }, (_, i) => cast('overflow-' + (from + i))), error: null }
          const data = tables[table].filter(row => filters.every(fn => fn(row))).sort((a, b) => {
            for (const key of orders) { if (a[key] < b[key]) return -1; if (a[key] > b[key]) return 1 }
            return 0
          }).slice(from, to + 1).map(row => Object.fromEntries(columns.split(',').map(column => [column, row[column]])))
          return { data, error: null }
        } finally { concurrent-- }
      },
    }
  } }
  const api = load('app/api/admin/locker-ranking/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/auth': auth,
    '@/lib/supabase/admin': { createAdminClient: () => { clientCreations++; return admin } }, '@/lib/supabaseHelpers': pagination,
    '@/lib/lockerRanking': { ...ranking, lockerRankingPeriod: month => period(month) },
  })
  return { calls, tables, clientCreations: () => clientCreations, maxConcurrent: () => maxConcurrent, get: (month = '2026-11') => api.GET(new Request('https://fixture.test/api/admin/locker-ranking' + (month === null ? '' : '?month=' + encodeURIComponent(month)))) }
}
test('実requireAdminは未認証・無効・castをservice client生成前に拒否、有効admin/ownerは許可', async () => {
  for (const [options, status] of [[{ signedIn: false }, 401], [{ active: false }, 401], [{ role: 'cast' }, 403], [{ role: 'cast', owner: true }, 403]]) {
    const fixture = apiFixture(options), response = await fixture.get()
    assert.equal(response.status, status); assert.equal(fixture.clientCreations(), 0); assert.equal(fixture.calls.length, 0)
  }
  for (const owner of [false, true]) assert.equal((await apiFixture({ owner }).get()).status, 200)
})
test('APIは厳密月・未来月をclient生成前に拒否し、既定は現在営業月', async () => {
  for (const month of ['', '2026-13', '2026-1', '1999-12', '2200-01', '2026-12', '2026-11-01']) {
    const fixture = apiFixture(); assert.equal((await fixture.get(month)).status, 400); assert.equal(fixture.clientCreations(), 0)
  }
  assert.equal((await (await apiFixture().get(null)).json()).month, '2026-11')
})
test('API正常応答は集計値だけ。退店/他roleを除き、PII・tier・service keyを返さない', async () => {
  const fixture = apiFixture(), response = await fixture.get(), data = await response.json()
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('vary'), 'Cookie')
  assert.equal(data.rows.length, 1); assert.equal(data.rows[0].sales, 100); assert.equal(data.previousDayBowzu[0].streak, 1)
  assert.deepEqual(Object.keys(data).sort(), ['businessDate', 'month', 'periodEnd', 'periodStart', 'previousBusinessDate', 'previousDayBowzu', 'rows'].sort())
  assert.deepEqual(Object.keys(data.rows[0]).sort(), ['castId', 'castName', 'rank', 'sales', 'honshimei', 'banai', 'douhan', 'bowzuDays', 'bowzuStreak'].sort())
  assert.deepEqual(Object.keys(data.previousDayBowzu[0]).sort(), ['castId', 'castName', 'streak'].sort())
  assert.doesNotMatch(JSON.stringify(data), /customer_name|非公開顧客名|cast_tier|created_at|target_sales|service_role|SUPABASE|has_douhan/)
  assert.ok(fixture.calls.every(call => call.columns !== '*' && !call.columns.includes('customer_name')))
})
test('1000件超の顧客・来店・profileを切り捨てず、ID200件・同時最大3件で全件集計', async () => {
  const fixture = apiFixture({ tables: {
    customers: Array.from({ length: 1001 }, (_, i) => customer(i + 1)),
    customer_visits: Array.from({ length: 1005 }, (_, i) => visit(i + 1, '2026-11-02', 100)),
  } }), response = await fixture.get(), data = await response.json()
  assert.equal(response.status, 200); assert.equal(data.rows[0].sales, 100500); assert.equal(data.rows[0].honshimei, 1005)
  assert.ok(fixture.calls.some(call => call.table === 'customers' && call.from === 1000))
  assert.ok(fixture.calls.some(call => call.table === 'customer_visits' && call.from === 1000))
  assert.ok(fixture.maxConcurrent() <= 3); assert.equal(fixture.maxConcurrent(), 3)
  const manyCasts = apiFixture({ tables: { profiles: Array.from({ length: 1001 }, (_, i) => cast('cast-' + String(i).padStart(4, '0'))), customers: [], customer_visits: [], cast_shifts: [] } })
  const many = await (await manyCasts.get()).json(); assert.equal(many.rows.length, 1001)
  assert.ok(manyCasts.calls.some(call => call.table === 'profiles' && call.from === 1000)); assert.ok(manyCasts.maxConcurrent() <= 3)
})
test('空名profileは未割当顧客の売上を取らず、cast0人は正確な空、同名有効castは503', async () => {
  const blank = apiFixture({ tables: { profiles: [{ ...cast('blank'), cast_name: null }], customers: [customer(1, null)] } })
  const result = await (await blank.get()).json(); assert.equal(result.rows[0].sales, 0); assert.ok(blank.calls.every(call => call.table !== 'customers' && call.table !== 'customer_visits'))
  const empty = await (await apiFixture({ tables: { profiles: [] } }).get()).json(); assert.deepEqual(empty.rows, []); assert.deepEqual(empty.previousDayBowzu, [])
  const duplicate = apiFixture({ tables: { profiles: [cast('a'), { ...cast('b'), cast_name: 'a' }] } })
  assert.equal((await duplicate.get()).status, 503)
})
test('各照会失敗・途中ページ失敗・取得上限は503。部分値や0円成功へ落とさない', async () => {
  for (const table of ['profiles', 'customers', 'customer_visits', 'cast_extension_sales', 'cast_shifts']) {
    const response = await apiFixture({ failTable: table }).get(); assert.equal(response.status, 503); assert.deepEqual(Object.keys(await response.json()), ['error'])
  }
  const failedPage = apiFixture({ failTable: 'customer_visits', failFrom: 1000, tables: { customer_visits: Array.from({ length: 1005 }, (_, i) => visit(i + 1, '2026-11-02', 100)) } })
  assert.equal((await failedPage.get()).status, 503)
  const capped = apiFixture({ overflow: true }); assert.equal((await capped.get()).status, 503); assert.equal(capped.calls.length, 100)
})
