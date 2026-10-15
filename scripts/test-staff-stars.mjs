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
const starLogLogic = loadFile('lib/starLog.ts', {})
const pagination = loadFile('lib/supabaseHelpers.ts', {})
function matchesStarExpression(row, expression) {
  if (expression === starred.starredBanaiVisitFilter('2026-10-09')) return row.nomination_status !== '場内' || starred.getStarredBanaiVisitDates('2026-10-09').includes(row.metric_last_visit_date)
  if (expression === 'nomination_status.eq.本指名') return row.nomination_status === '本指名'
  assert.match(expression, /^and\(nomination_status.eq.場内,metric_last_visit_date.in\.\([\d,-]+\)\)$/)
  const dates = expression.match(/\.in\.\(([^)]+)\)/)[1].split(',')
  return row.nomination_status === '場内' && dates.includes(row.metric_last_visit_date)
}
const rows = Array.from({ length: 130 }, (_, index) => ({
  id: String(index + 1), is_starred: index < 105,
  cast_name: index % 2 ? 'りな' : 'あかり', customer_name: `お客様${index}`,
  metric_last_visit_date: null, metric_first_visit_date: null,
}))
function setup({ role = 'admin', owner = false, allowed = true, castName = null, authenticated = true, fixtures = rows, checkedFixtures = [], castOptions = ['りな', 'あかり'], castOptionsError = null } = {}) {
  const calls = []
  let adminReads = 0
  const makeQuery = (sourceRows = fixtures) => ({
    filters: [],
    sorts: [],
    select(...args) { calls.push(['select', ...args]); return this },
    eq(key, value) { calls.push(['eq', key, value]); this.filters.push(row => row[key] === value); return this },
    is(key, value) { this.filters.push(row => (row[key] ?? null) === value); return this },
    or(expression) {
      calls.push(['or', expression])
      this.filters.push(row => matchesStarExpression(row, expression))
      return this
    },
    ilike(key, value) { calls.push(['ilike', key, value]); this.filters.push(row => String(row[key] ?? '').includes(value.slice(1, -1))); return this },
    order(key, options = { ascending: true }) { calls.push(['order', key, options]); this.sorts.push([key, options]); return this },
    range(from, to) {
      calls.push(['range', from, to])
      const filtered = sourceRows.filter(row => this.filters.every(filter => filter(row))).sort((a, b) => {
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
    '@/lib/customerCastOptionsServer': { loadCustomerCastOptions: async () => {
      if (castOptionsError) throw new Error('fixture cast fetch failed')
      return castOptions.map(cast_name => ({ cast_name }))
    } },
    '@/lib/starredCustomers': starred, '@/lib/starLog': starLogLogic,
    '@/lib/supabaseHelpers': pagination,
    '@/lib/followUpWorkflow': { getJstDateString: () => '2026-10-09' },
    '@/lib/supabase/admin': { createAdminClient: () => { adminReads++; return { from: table => makeQuery(table === 'customer_star_cycles' ? checkedFixtures : fixtures) } } },
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
test('今日の確認状況は全件を絞ってからページングし、⭐️以外/キャストには新条件を許可しない', async () => {
  const fixtures = Array.from({ length: 1205 }, (_, i) => ({ id: String(i + 1), cast_name: i % 2 ? 'りな' : 'あかり', is_starred: true }))
  const checkedFixtures = fixtures.filter((_, i) => i % 2 === 0).map(c => ({ id: c.id, customer_id: c.id, ended_at: null, last_checked_on: '2026-10-09' }))
  checkedFixtures.push({ id: 'ended', customer_id: '2', ended_at: '2026-10-08', last_checked_on: '2026-10-09' })
  for (const [filter, total, parity] of [['checked', 603, 1], ['unchecked', 602, 0]]) {
    const env = setup({ fixtures, checkedFixtures })
    const response = await env.get(`starred=true&starredView=all&starredCastOrder=true&starCheck=${filter}&page=12&pageSize=50`)
    const data = await response.json()
    assert.equal(response.status, 200); assert.equal(data.total, total); assert.equal(data.pageCount, 13)
    assert.ok(data.customers.every(c => Number(c.id) % 2 === parity))
  }
  for (const options of [{}, { role: 'cast', castName: 'りな' }]) {
    const env = setup(options)
    assert.equal((await env.get('starCheck=checked')).status, 400)
  }
  assert.equal((await setup({ role: 'cast', castName: 'りな' }).get('starred=true&starCheck=unchecked')).status, 400)
  assert.equal((await setup().get('starred=true&starCheck=invalid')).status, 400)
})
test('検索用ボトルビューには追加後のorigin/revisionを要求せず、ランク保存側の検証は維持する', async () => {
  for (const params of ['', 'starred=true', 'starred=true&starredCastOrder=true']) {
    const env = setup(), response = await env.get(params)
    assert.equal(response.status, 200)
    const selects = env.calls.filter(call => call[0] === 'select')
    assert.ok(selects.length > 0)
    for (const [, columns] of selects) {
      const requested = columns.split(',')
      assert.ok(requested.includes('customer_rank'))
      assert.ok(!requested.includes('customer_rank_origin') && !requested.includes('customer_rank_revision'))
    }
  }
  const customerApi = fs.readFileSync(path.join(root, 'app/api/customers/[id]/route.ts'), 'utf8')
  assert.match(customerApi, /select\('customer_rank, customer_rank_origin, customer_rank_revision'\)/)
  assert.match(customerApi, /eq\('customer_rank_revision',rankPrevious.customer_rank_revision\)/)
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
test('スタッフの場内表示は正確な11日だけ、キャスト順→日数順を全件に適用してページング', async () => {
  const fixtures = ['あかり', 'りな'].flatMap(cast_name => Array.from({ length: 42 }, (_, index) => {
    const days = index - 1, date = new Date('2026-10-09T00:00:00Z')
    date.setUTCDate(date.getUTCDate() - days)
    return { id: `${cast_name}-${days}`, cast_name, is_starred: true, nomination_status: '場内', metric_last_visit_date: date.toISOString().slice(0, 10), metric_total_spent: days }
  }))
  fixtures.push({ id: 'hon', cast_name: 'りな', is_starred: true, nomination_status: '本指名', metric_last_visit_date: '2026-10-08' })
  fixtures.push({ id: 'no-star', cast_name: 'りな', is_starred: false, nomination_status: '場内', metric_last_visit_date: '2026-10-08' })
  fixtures.push({ id: 'null-date', cast_name: 'りな', is_starred: true, nomination_status: '場内', metric_last_visit_date: null })
  const env = setup({ fixtures })
  const params = 'starred=true&starredView=banai&starredCastOrder=true&sort=lastVisitNewest&pageSize=5'
  const first = await (await env.get(params)).json()
  assert.equal(first.total, 22)
  assert.equal(first.pageCount, 5)
  assert.deepEqual(first.customers.map(c => c.metrics.daysSinceLastVisit), [1, 3, 6, 9, 12])
  assert.ok(first.customers.every(c => c.cast_name === 'りな' && c.nomination_status === '場内'))
  const boundary = await (await env.get(params + '&page=3')).json()
  assert.deepEqual(boundary.customers.map(c => c.id), ['りな-30', 'あかり-1', 'あかり-3', 'あかり-6', 'あかり-9'])
  const single = await (await env.get(params + '&starredVisitDay=6')).json()
  assert.equal(single.total, 2)
  assert.ok(single.customers.every(c => c.metrics.daysSinceLastVisit === 6))
  const cast = await (await env.get('starred=true&starredView=banai&castName=あかり&sort=lastVisitOldest')).json()
  assert.deepEqual(cast.customers.map(c => c.metrics.daysSinceLastVisit), [...starred.STARRED_BANAI_VISIT_DAYS].reverse())
  const spent = await (await env.get('starred=true&starredView=banai&castName=あかり&sort=totalSpent')).json()
  assert.equal(spent.customers[0].metrics.totalSpent, 30)
  assert.ok(env.calls.findIndex(c => c[0] === 'or') < env.calls.findIndex(c => c[0] === 'range'))
})
test('本指名タブは期間外・来店なしも含め本指名のみ、全員タブは他分類も含む⭐️全員', async () => {
  const fixtures = ['本指名', '場内', 'フリー', null].map((nomination_status, index) => ({ id: String(index), is_starred: true, nomination_status, cast_name: 'りな', metric_last_visit_date: null }))
  fixtures.push({ id: 'hon-old', is_starred: true, nomination_status: '本指名', cast_name: 'りな', metric_last_visit_date: '2020-01-01' })
  assert.equal((await (await setup({ fixtures }).get('starred=true&starredView=honshimei')).json()).total, 2)
  assert.equal((await (await setup({ fixtures }).get('starred=true&starredView=all')).json()).total, 5)
})
test('新しい表示条件はスタッフ⭐️専用、任意日・式・矛盾する旧条件を集計前に拒否', async () => {
  for (const params of ['starredView=banai', 'starred=true&starredView=no', 'starred=true&starredView=', 'starred=true&starredVisitDay=3', 'starred=true&starredView=all&starredVisitDay=3', 'starred=true&starredView=honshimei&starredVisitDay=3', 'starred=true&starredView=banai&starredBanaiVisitDays=true', ...['0', '2', '4', '5', '31', '03', '3,6', '-3', '3.0', ''].map(day => `starred=true&starredView=banai&starredVisitDay=${day}`)]) {
    const env = setup()
    assert.equal((await env.get(params)).status, 400, params)
    assert.equal(env.reads(), 0)
  }
  const cast = setup({ role: 'cast', castName: 'りな' })
  assert.equal((await cast.get('starred=true&starredView=banai')).status, 400)
  assert.equal(cast.reads(), 0)
})
test('互換の日数別APIは全件で確定し、ページの境界も同じ順', async () => {
  const fixtures = Array.from({ length: 1205 }, (_, i) => ({ id: String(i), is_starred: true, nomination_status: '場内', cast_name: i % 2 ? 'りな' : 'あかり', metric_last_visit_date: i % 3 ? '2026-10-06' : '2026-10-08', metric_total_spent: i }))
  const env = setup({ fixtures })
  const params = 'starred=true&starredView=banai&starredDayOrder=true&sort=totalSpent'
  const first = await (await env.get(params)).json()
  assert.equal(first.total, 1205)
  assert.ok(first.customers.every(c => c.metrics.daysSinceLastVisit === 1 && c.cast_name === 'りな'))
  assert.equal(first.customers[0].metrics.totalSpent, 1203)
  const all = []
  for (let page = 1; page <= 13; page++) all.push(...(await (await env.get(params + '&pageSize=100&page=' + page)).json()).customers)
  assert.equal(new Set(all.map(c => c.id)).size, 1205)
  const expected = starred.sortStarredCustomersByVisitDay([...fixtures].sort((a, b) => b.metric_total_spent - a.metric_total_spent), ['りな', 'あかり'])
  assert.deepEqual(all.map(c => c.id), expected.map(c => c.id))
  const older = await (await env.get('starred=true&starredView=banai&starredDayOrder=true&sort=lastVisitOldest')).json()
  assert.equal(older.customers[0].metrics.daysSinceLastVisit, 3)
})
test('本日確認のキャスト別順は日数が混在しても全件で確定し、1000人超とページ境界を維持', async () => {
  const fixtures = Array.from({ length: 1205 }, (_, i) => ({ id: String(i), is_starred: true, nomination_status: '場内', cast_name: i % 2 ? 'りな' : 'あかり', metric_last_visit_date: i % 3 ? '2026-10-06' : '2026-10-08', metric_total_spent: i }))
  const env = setup({ fixtures })
  const params = 'starred=true&starredView=banai&starredCastOrder=true&sort=totalSpent'
  const all = []
  for (let page = 1; page <= 13; page++) {
    const result = await (await env.get(params + '&pageSize=100&page=' + page)).json()
    assert.equal(result.total, 1205)
    all.push(...result.customers)
  }
  assert.equal(new Set(all.map(c => c.id)).size, 1205)
  const expected = starred.sortStarredCustomersByCast([...fixtures].sort((a, b) => b.metric_total_spent - a.metric_total_spent), ['りな', 'あかり'])
  assert.deepEqual(all.map(c => c.id), expected.map(c => c.id))
  assert.equal(all[0].cast_name, 'りな')
  assert.equal(new Set(all.slice(0, 602).map(c => c.cast_name)).size, 1)
  assert.deepEqual([...new Set(all.slice(0, 602).map(c => c.metrics.daysSinceLastVisit))].sort(), [1, 3])
  for (const [sort, firstDay] of [['lastVisitNewest', 1], ['lastVisitOldest', 3]]) {
    const result = await (await env.get('starred=true&starredView=banai&starredCastOrder=true&sort=' + sort)).json()
    assert.ok(result.customers.every(c => c.cast_name === 'りな'))
    assert.equal(result.customers[0].metrics.daysSinceLastVisit, firstDay)
  }
})
test('日数別表示はスタッフ⭐️全キャスト専用。通常/キャスト/矛盾条件は集計前に拒否', async () => {
  for (const params of ['starredDayOrder=true', 'starred=true&starredDayOrder=true', 'starred=true&starredView=banai&starredDayOrder=false', 'starred=true&starredView=banai&starredDayOrder=true&castName=りな', 'starred=true&starredView=all&starredDayOrder=true&starredCastOrder=true']) {
    const env = setup()
    assert.equal((await env.get(params)).status, 400)
    assert.equal(env.reads(), 0)
  }
  const cast = setup({ role: 'cast', castName: 'りな' })
  assert.equal((await cast.get('starred=true&starredView=banai&starredDayOrder=true')).status, 400)
  assert.equal(cast.reads(), 0)
})
test('本日連絡は⭐️本指名の3の倍数を上限なし、場内は1と3の倍数30日まで', () => {
  for (let days = -1; days <= 1002; days++) {
    const hon = { is_starred: true, nomination_status: '本指名', customer_rank: 'A' }
    const ban = { ...hon, nomination_status: '場内' }
    assert.equal(starred.isStarredContactDue(hon, days), days > 0 && days % 3 === 0, `本指名 ${days}`)
    assert.equal(starred.isStarredContactDue(ban, days), starred.STARRED_BANAI_VISIT_DAYS.includes(days), `場内 ${days}`)
    assert.equal(starred.isStarredContactDue({ ...hon, is_starred: false }, days), false)
    assert.equal(starred.isStarredContactDue({ ...hon, customer_rank: '切れた' }, days), false)
  }
  for (const days of [null, NaN, Infinity, 3.1]) assert.equal(starred.isStarredContactDue({ is_starred: true, nomination_status: '本指名' }, days), false)
  for (const nomination_status of ['フリー', null, 'その他']) assert.equal(starred.isStarredContactDue({ is_starred: true, nomination_status }, 3), false)
})
test('本日連絡の日付はJST暦日。閏日/年末/1000日超・不正日/未記録/未来を区別', () => {
  assert.equal(starred.starredElapsedDays('2026-01-01', '2025-12-31'), 1)
  assert.equal(starred.starredElapsedDays('2024-03-01', '2024-02-29'), 1)
  assert.equal(starred.starredElapsedDays('2026-10-15', '2026-10-15'), 0)
  assert.equal(starred.starredElapsedDays('2026-10-15', '2026-10-16'), -1)
  for (const date of [null, '', '2026-02-30', 'invalid']) assert.equal(starred.starredElapsedDays('2026-10-15', date), null)
  assert.equal(starred.starredElapsedDays(null, '2026-10-15'), null)
  assert.ok(starred.starredElapsedDays('2026-10-15', '2020-01-01') > 1000)
})
test('本日連絡は場内2分類と本指名3分類。地域未設定も落とさず、指名間では混ざらない', () => {
  assert.deepEqual(starred.STARRED_CONTACT_CATEGORIES, ['場内・対象日（県内）', '場内・対象日（県外）', '本指名（県内顧客）', '本指名（県外顧客）', '本指名（その他）'])
  for (const [region, area] of [['福岡県', '県内'], [' 福岡県 ', '県内'], ['東京都', '県外'], ['海外', '県外'], [null, null], ['', null], ['  ', null]]) {
    for (const customer_rank of ['S', 'A', 'B', 'C', null]) {
      assert.equal(starred.starredContactCategory({ nomination_status: '場内', region, customer_rank }), `場内・対象日（${area ?? '県外'}）`)
      assert.equal(starred.starredContactCategory({ nomination_status: '本指名', region, customer_rank }), area ? `本指名（${area}顧客）` : '本指名（その他）')
    }
  }
  for (const nomination_status of ['フリー', 'その他', '', null, undefined]) assert.equal(starred.starredContactCategory({ nomination_status, region: '福岡県' }), null)
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

function setupCounts({ role = 'admin', owner = false, allowed = true, authenticated = true, failure = false, matchedFailure = false, matchedFixtures = [], checkedFixtures = [] } = {}) {
  let reads = 0
  let adminReads = 0
  const calls = []
  const fixtures = Array.from({ length: 1025 }, (_, index) => ({ cast_name: index % 2 ? 'りな' : 'あかり', nomination_status: index % 2 ? '本指名' : '場内' }))
  const route = loadFile('app/api/customers/star-counts/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
    '@/lib/auth': { requireUser: async () => { if (!authenticated) throw new Error('UNAUTHENTICATED'); return { role, is_owner: owner } }, checkPermission: async () => allowed },
    '@/lib/starredCustomers': starred, '@/lib/starLog': starLogLogic,
    '@/lib/supabaseHelpers': pagination,
    '@/lib/followUpWorkflow': { getJstDateString: () => '2026-10-09' },
    '@/lib/supabase/admin': { createAdminClient: () => { adminReads++; return { from: table => {
      assert.ok(['customer_search_metrics_with_bottles', 'customer_star_cycles'].includes(table))
      return {
        filters: [],
        select(columns) { assert.equal(columns, table === 'customer_star_cycles' ? 'customer_id' : 'id,cast_name,nomination_status'); return this },
        eq(key, value) { this.filters.push(row => row[key] === value); return this },
        is(key, value) { this.filters.push(row => (row[key] ?? null) === value); return this },
        or(expression) { this.filters.push(row => matchesStarExpression(row, expression)); return this },
        ilike(key, value) { calls.push(['ilike', key, value]); this.filters.push(row => String(row[key] ?? '').includes(value.slice(1, -1))); return this },
        order() { return this },
        range(from, to) { calls.push(['matched', from, to]); return Promise.resolve({ data: (table === 'customer_star_cycles' ? checkedFixtures : matchedFixtures).filter(row => this.filters.every(filter => filter(row))).slice(from, to + 1), error: matchedFailure ? { message: 'fixture matched failure' } : null }) },
      }
    } } } },
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
  return { get: (params = '') => route.GET(new Request('https://example.test/api/customers/star-counts?' + params)), reads: () => reads, adminReads: () => adminReads, calls }
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
test('確認状況の対象人数も全件で集計し、終了した期間の確認を混ぜない', async () => {
  const matchedFixtures = Array.from({ length: 1105 }, (_, i) => ({ id: String(i + 1), is_starred: true, cast_name: i % 2 ? 'りな' : 'なみ', nomination_status: '場内' }))
  const checkedFixtures = matchedFixtures.filter((_, i) => i % 2 === 0).map(c => ({ id: c.id, customer_id: c.id, ended_at: null, last_checked_on: '2026-10-09' }))
  checkedFixtures.push({ id: 'ended', customer_id: '2', ended_at: '2026-10-09', last_checked_on: '2026-10-09' })
  for (const [filter, expected] of [['checked', 553], ['unchecked', 552]]) {
    const env = setupCounts({ matchedFixtures, checkedFixtures })
    const response = await env.get(`starredView=all&starCheck=${filter}`)
    assert.equal(response.status, 200)
    const json = await response.json()
    assert.equal(json.matched.total.total, expected); assert.equal(json.total.total, 1025)
  }
})
test('対象人数は1000件超も表示条件/検索で集計。⭐️全員分とは分離して返す', async () => {
  const matchedFixtures = Array.from({ length: 1105 }, (_, i) => ({ id: String(i), cast_name: i % 2 ? 'りな' : 'あかり', nomination_status: '場内', is_starred: true, metric_last_visit_date: '2026-10-03', search_text_with_bottles: 'テストボトル' }))
  matchedFixtures.push({ id: 'other-day', cast_name: 'りな', nomination_status: '場内', is_starred: true, metric_last_visit_date: '2026-10-07', search_text_with_bottles: 'テストボトル' })
  matchedFixtures.push({ id: 'hon', cast_name: 'りな', nomination_status: '本指名', is_starred: true, metric_last_visit_date: null, search_text_with_bottles: 'テストボトル' })
  const env = setupCounts({ matchedFixtures })
  const result = await (await env.get('starredView=banai&starredVisitDay=6&keyword=ボトル')).json()
  assert.equal(result.total.total, 1025)
  assert.equal(result.matched.total.total, 1105)
  assert.equal(result.matched.byCast['りな'].total, 552)
  assert.equal(result.matched.byCast['あかり'].total, 553)
  assert.ok(env.calls.some(call => call[0] === 'matched' && call[1] === 1000))
  const none = await (await env.get('starredView=banai&starredVisitDay=1')).json()
  assert.equal(none.matched.total.total, 0)
  assert.equal((await (await env.get('starredView=honshimei')).json()).matched.total.total, 1)
  assert.equal((await (await env.get('starredView=all')).json()).matched.total.total, 1107)
  assert.equal((await (await env.get('starredView=all&keyword=見つからない')).json()).matched.total.total, 0)
})
test('対象人数の認可/入力エラーはservice client作成前に拒否、取得失敗は500', async () => {
  for (const [options, status] of [[{ authenticated: false }, 401], [{ allowed: false }, 403], [{ role: 'cast' }, 403]]) {
    const env = setupCounts(options)
    assert.equal((await env.get('starredView=banai')).status, status)
    assert.equal(env.adminReads(), 0)
  }
  for (const params of ['starredView=no', 'starredView=banai&starredVisitDay=2', 'starredView=all&starredVisitDay=3', 'starredView=banai&keyword=' + 'a'.repeat(101)]) {
    const env = setupCounts()
    assert.equal((await env.get(params)).status, 400)
    assert.equal(env.adminReads(), 0)
  }
  assert.equal((await setupCounts({ matchedFailure: true }).get('starredView=banai')).status, 500)
})

// レイアウト確認用の固定データ。実アカウントや認証を模倣・改変せず、SSRだけ行う。
const cssModule = prefix => ({ __esModule: true, default: new Proxy({}, { get: (_, key) => prefix + '_' + String(key) }) })
const colors = loadFile('lib/colors.ts', {})
const category = loadFile('lib/customerCategory.ts', {})
const indicators = loadFile('components/CustomerCardIndicators.tsx', { 'react/jsx-runtime': jsxRuntime, './CustomerCardIndicators.module.css': cssModule('indicators') })
const gestureLogic = loadFile('lib/customerCardGesture.ts', {})
const gestureHook = loadFile('hooks/useCustomerCardGesture.ts', { react: React, '@/lib/customerCardGesture': gestureLogic })
const shell = loadFile('components/CustomerActionCardShell.tsx', { react: React, 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors, '@/components/CustomerCardIndicators': indicators, '@/hooks/useCustomerCardGesture': gestureHook, './CustomerActionCardShell.module.css': cssModule('shell') }).default
const compactField = loadFile('components/CompactListField.tsx', { 'react/jsx-runtime': jsxRuntime, './CompactListField.module.css': cssModule('field') }).default
const patternSummary = loadFile('components/CustomerVisitPatternSummary.tsx', { 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors, '@/lib/customerVisitPattern': patterns, './CustomerVisitPatternSummary.module.css': cssModule('pattern') }).default
const previewModule = loadFile('components/CustomerCardPreview.tsx', { react: React, 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors, '@/lib/customerListScroll': loadFile('lib/customerListScroll.ts', {}), './CustomerCardPreview.module.css': cssModule('preview') })
const castOptionsHelper = loadFile('lib/customerCastOptions.ts', {})
const staffMenu = loadFile('components/StaffStarsMenu.tsx', { 'react/jsx-runtime': jsxRuntime, '@/lib/customerCastOptions': castOptionsHelper, './StaffStarsPage.module.css': cssModule('staff') })
const castStarSwitch = loadFile('components/CastStarViewSwitch.tsx', { 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors })
const starSummary = loadFile('components/StarLogSummary.tsx', { 'react/jsx-runtime': jsxRuntime, '@/lib/colors': colors, './StarLog.module.css': cssModule('log') })
const emptyStarLogs = () => ({ summaries: new Map(), ready: false, error: '', filter: 'all', open() {}, busy: false, Toolbar: null, Overlays: null, HistoryButton: null })
const compactMocks = { react: React, 'react/jsx-runtime': jsxRuntime, './CustomerActionCardShell': { __esModule: true, default: shell }, './CustomerCardIndicators': indicators, './CustomerCardPreview': previewModule, './CustomerVisitPatternSummary': { __esModule: true, default: patternSummary }, './StarLogSummary': starSummary, '@/lib/colors': colors, './CompactCustomerCard.module.css': cssModule('compact') }
const compactModule = loadFile('components/CompactCustomerCard.tsx', compactMocks)
const fixtureCasts = [
  { id: 'cast1', cast_name: 'りな', display_name: 'りな', cast_tier: 'AC', is_active: true },
  { id: 'cast2', cast_name: 'あかり', display_name: 'あかり', cast_tier: 'AC', is_active: true },
  { id: 'cast3', cast_name: '退店キャスト', display_name: '退店キャスト', cast_tier: 'AC', is_active: false },
  { id: 'cast4', cast_name: 'ゆい', display_name: 'ゆい', cast_tier: 'BA', is_active: true },
]
const fixtureCustomers = [
  { id: '1', customer_name: 'サンプルのお客様', nickname: 'サンプルさん', cast_name: 'りな', customer_rank: 'A', nomination_status: '本指名', region: '福岡県', age_group: '30代', is_starred: true, no_reply: true },
  { id: '2', customer_name: 'とても長いお名前のお客様の表示テスト', nickname: '長いニックネーム', cast_name: 'あかり', customer_rank: 'B', nomination_status: '本指名', region: '東京都', age_group: '40代', is_starred: true },
  { id: '3', customer_name: '場内のお客様', cast_name: 'あかり', nomination_status: '場内', region: '福岡県', is_starred: true },
].map(c => ({ ...c, metrics: { totalSpent: 1234567, visitCount: 13, avgPerVisit: 94967, lastVisitDate: c.nomination_status === '場内' ? '2026-10-03' : '2026-10-01', daysSinceLastVisit: c.nomination_status === '場内' ? 6 : 8, visitPattern: { sampleVisitCount: 10, weekdayCodes: [5, 6], weekdayStats: { 5: { count: 7, lastVisitDate: '2026-10-01' } }, earlyHour: 20, earlyHourCount: 2, usualHour: 22, usualHourCount: 6 } } }))

// 実CastWorkspaceを架空の取得済みstateでSSRし、スタッフ埋込/本人の同一JSXを比較する。
function renderActualCastStars({ pc = true, embedded = true, starView = 'today', canManage = true, stateOverrides = {} } = {}) {
  const source = fs.readFileSync(path.join(root, 'components/CastWorkspace.tsx'), 'utf8')
  const ast = ts.createSourceFile('CastWorkspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CastWorkspace')
  const stateNames = component.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .filter(node => node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useState')
    .map(node => node.name.elements[0].name?.text ?? 'unused')
  let stateIndex = 0
  const own = [
    { id: '101', customer_name: '本指名6日前', nomination_status: '本指名', customer_rank: 'A', region: '福岡県', days: 6, is_starred: true },
    { id: '102', customer_name: '本指名33日前', nomination_status: '本指名', customer_rank: 'C', region: '東京都', days: 33, is_starred: true },
    { id: '103', customer_name: '場内1日前', nomination_status: '場内', region: '東京都', days: 1, is_starred: true },
    { id: '104', customer_name: '切れた', nomination_status: '本指名', customer_rank: '切れた', region: null, days: 3, is_starred: true },
    { id: '105', customer_name: '⭐️なし場内', nomination_status: '場内', region: '福岡県', days: 3, is_starred: false },
    { id: '106', customer_name: '場内2日前', nomination_status: '場内', region: '福岡県', days: 2, is_starred: true },
    { id: '107', customer_name: '本指名180日前', nomination_status: '本指名', customer_rank: 'B', region: null, days: 180, is_starred: true },
    { id: '108', customer_name: '県内場内30日前', nomination_status: '場内', region: '福岡県', days: 30, is_starred: true },
    { id: '109', customer_name: '地域未設定場内3日前', nomination_status: '場内', region: null, days: 3, is_starred: true },
  ].map(c => ({ ...c, cast_name: 'りな', created_at: '2025-01-01' }))
  const date = days => { const value = new Date('2026-10-15T00:00:00Z'); value.setUTCDate(value.getUTCDate() - days); return value.toISOString().slice(0, 10) }
  const state = { cast: { id: 'cast1', cast_name: 'りな', display_name: 'りな', cast_tier: 'BB', is_active: true }, customers: own,
    loading: false, isAdmin: embedded, viewerUserId: embedded ? 'staff' : 'cast1', canManageCustomers: canManage, starView,
    custMetaCastId: 'cast1', custExtrasLoaded: true, lastVisitDateMap: new Map(own.map(c => [c.id, date(c.days)])), ...stateOverrides }
  const noop = () => {}
  const Component = loadFile('components/CastWorkspace.tsx', {
    react: { ...React, useEffect: noop, useState: value => { const name = stateNames[stateIndex++]; return [Object.hasOwn(state, name) ? state[name] : typeof value === 'function' ? value() : value, noop] } },
    'react/jsx-runtime': jsxRuntime,
    'next/navigation': { useParams: () => ({}), useRouter: () => ({ push: noop }), useSearchParams: () => new URLSearchParams() },
    'next/dynamic': { __esModule: true, default: () => () => null },
    'next/link': { __esModule: true, default: props => React.createElement('a', props) },
    '@/hooks/useCasts': { useCasts: () => ({}) }, '@/hooks/useCustomers': { useCustomerActions: () => ({ ToastView: null }) },
    '@/hooks/useViewMode': { useViewMode: () => ({ isPC: pc, toggle: noop }) }, '@/hooks/useUndoToast': { useUndoToast: () => ({}) },
    '@/hooks/useBackOrHome': { useBackOrHome: () => noop }, '@/hooks/useScrollTopOnMount': { useScrollTopOnMount: noop },
    '@/hooks/useCustomerListScroll': { useCustomerListScroll: () => noop }, '@/hooks/useJstToday': { useJstToday: () => '2026-10-15' }, '@/hooks/useStarLog': { useStarLog: emptyStarLogs },
    '@/lib/starLog': starLogLogic, '@/components/StarLogSummary': starSummary,
    '@/hooks/useCustomerListActions': { useCustomerListActions: () => ({ activeFollowUpIds: new Set(own.filter(c => c.is_starred).map(c => c.id)), noReplyIds: new Set(), busy: false, ToastView: null }) },
    '@/lib/colors': colors, '@/types': { CAST_TIER_GROUPS: [] }, '@/lib/cache': {}, '@/lib/excelExport': {}, '@/lib/targetResolver': {},
    '@/lib/supabase/client': { createClient: () => ({}) }, '@/lib/supabaseHelpers': pagination, '@/lib/authCache': {},
    '@/lib/customerCategory': category, '@/lib/customerMarks': loadFile('lib/customerMarks.ts', {}),
    '@/lib/castSettingPermissions': {}, '@/lib/castWorkspaceTabs': { getCastDetailTabs: () => ['CUSTOMERS'] },
    '@/lib/starredCustomers': starred, '@/lib/customerVisitPattern': patterns, '@/lib/castIssueVisibility': {},
    '@/components/BottomNav': { __esModule: true, default: () => React.createElement('nav', null, '本人の下ナビ') },
    '@/components/ClearableInput': { __esModule: true, default: () => null }, '@/components/ui/Spinner': { __esModule: true, default: () => null },
    '@/components/ui/EmptyState': { __esModule: true, default: () => null }, '@/components/NotificationBell': { __esModule: true, default: () => null },
    '@/components/PushSubscriptionButton': { __esModule: true, default: () => null }, '@/components/CastTierProgress': { __esModule: true, default: () => null },
    '@/components/CastStarViewSwitch': castStarSwitch, '@/components/CompactCustomerCard': compactModule,
    '@/components/CompactListField': { __esModule: true, default: compactField }, '@/components/CustomerCardIndicators': indicators,
    '@/components/CustomerVisitPatternSummary': { __esModule: true, default: patternSummary }, '@/app/casts/[id]/customer-cards.module.css': cssModule('card'),
  }).default
  return renderToStaticMarkup(React.createElement(Component, { castIdOverride: 'cast1', starsOnly: true, starsListOnly: embedded }))
}

test('実共通ワークスペースの本人/スタッフ埋込は同じ本日連絡と⭐️全員。権限だけスタッフに従う', () => {
  for (const pc of [true, false]) for (const starView of ['today', 'all']) {
    const staff = renderActualCastStars({ pc, starView })
    const cast = renderActualCastStars({ pc, starView, embedded: false })
    const ids = html => [['101', '本指名6日前'], ['102', '本指名33日前'], ['103', '場内1日前'], ['104', '切れた'], ['105', '⭐️なし場内'], ['106', '場内2日前'], ['107', '本指名180日前'], ['108', '県内場内30日前'], ['109', '地域未設定場内3日前']]
      .filter(([, name]) => html.includes(`>${name}<`)).map(([id]) => id)
    assert.deepEqual(ids(staff), ids(cast))
    assert.match(staff, /本日連絡のお客様（6名）/)
    assert.match(staff, /⭐️全員表示（8名）/)
    assert.doesNotMatch(staff, /本人の下ナビ|入店から/)
    assert.match(cast, /本人の下ナビ/)
    if (starView === 'today') {
      assert.deepEqual([...ids(staff)].sort(), ['101', '102', '103', '107', '108', '109'])
      assert.match(staff, /場3名・本3名を指名別・地域別に表示/)
      const groups = [...staff.matchAll(/role="group" aria-label="([^"]+のお客様)"/g)]
      assert.deepEqual(groups.map(group => group[1]), starred.STARRED_CONTACT_CATEGORIES.map(label => `${label}のお客様`))
      const expected = [['108'], ['103', '109'], ['101'], ['102'], ['107']]
      groups.forEach((group, index) => {
        const section = staff.slice(group.index, groups[index + 1]?.index ?? staff.length)
        assert.deepEqual(ids(section).sort(), expected[index])
        assert.match(section, new RegExp(`— ${expected[index].length}人`))
      })
    } else {
      assert.deepEqual([...ids(staff)].sort(), ['101', '102', '103', '104', '106', '107', '108', '109'])
      assert.doesNotMatch(staff, /aria-label="(?:場内・対象日|本指名（)/)
      for (const label of ['県内顧客', 'ランクC', 'その他', '場内', '切れたお客様']) assert.ok(staff.includes(label))
    }
  }
  const readonly = renderActualCastStars({ canManage: false })
  assert.match(readonly, /aria-label="⭐️のお客様の表示"/)
  assert.doesNotMatch(readonly, /aria-label="本指名6日前の操作を表示"/)
})
test('指名別の本日連絡でも分類内の並び・検索・全閉じを維持し、人数は減らさない', () => {
  for (const pc of [true, false]) {
    const newest = renderActualCastStars({ pc })
    const oldest = renderActualCastStars({ pc, stateOverrides: { customerSortKey: 'lastVisitOldest' } })
    assert.ok(newest.indexOf('>場内1日前<') < newest.indexOf('>地域未設定場内3日前<'))
    assert.ok(oldest.indexOf('>場内1日前<') > oldest.indexOf('>地域未設定場内3日前<'))
    const closed = renderActualCastStars({ pc, stateOverrides: { openCategories: new Set() } })
    assert.match(closed, /本日連絡のお客様（6名）/)
    assert.equal((closed.match(/role="group" aria-label="[^"]+のお客様"/g) || []).length, 5)
    assert.doesNotMatch(closed, /aria-label="[^"]+のカード情報を表示"/)
    const searched = renderActualCastStars({ pc, stateOverrides: { customerSearchOpen: true, customerSearchQuery: '本指名33', openCategories: new Set() } })
    assert.match(searched, /本日連絡のお客様（6名）/)
    assert.match(searched, /検索結果 1人/)
    assert.match(searched, /role="group" aria-label="本指名（県外顧客）のお客様"/)
    assert.match(searched, />本指名33日前</)
    assert.doesNotMatch(searched, /role="group" aria-label="場内・対象日|>本指名6日前</)
  }
})

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
  const bindings = { C: colors.C, isViewPC: pc, isEmbedded: false, isStarsListEmbed: false, isAdmin: true,
    activeTab: 'CUSTOMERS', cast: { cast_name: 'サンプル', display_name: 'サンプル', cast_tier: 'AC', target_cast_tier: 'AA', joined_at: '2025-02-15', is_active: true },
    NotificationBell: () => null, CastTierProgress: tier, goBack: noop, toggleView: noop, changeMonth: noop,
    monthLabel: '2026年10月', tabs: ['KPI', 'CUSTOMERS', 'SALES', 'SHIFT', 'SETTING', 'RANKING', 'EXPORTS'],
    TAB_LABELS: { KPI: '成績', CUSTOMERS: '顧客', SALES: '売上・実績', SHIFT: 'シフト', SETTING: '設定', RANKING: 'ランキング', EXPORTS: '出力リスト' },
    setActiveTab: noop, starsOnly: false, dailyStars: false, contactReady: true, scopedCustomers: { length: 225 }, canManageCustomers: true,
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
  assert.match(mobile, /font-size:10\.5px/)
  assert.match(mobile, /white-space:nowrap;min-height:32px/)
  for (const text of ['複数選択', 'ランク再評価', '+ 新規追加', '現在：', '目標：', '入店から']) assert.ok(mobile.includes(text))
  const pc = renderWorkspaceChrome(true)
  assert.match(pc, /padding:14px 18px/)
  assert.match(pc, /font-size:18px/)
  assert.match(pc, /min-height:46px/)
})

test('キャスト上部のスマホタブは全項目80pxで統一、PCは従来どおり均等幅', () => {
  const mobile = renderWorkspaceChrome()
  assert.equal((mobile.match(/flex:0 0 80px/g) || []).length, 7)
  assert.equal((mobile.match(/padding:6px;min-height:32px/g) || []).length, 7)
  assert.equal((mobile.match(/font-size:10\.5px/g) || []).length, 7)
  assert.doesNotMatch(renderWorkspaceChrome(true), /flex:0 0 80px/)
})

function renderRosterModes(pc = false) {
  const source = fs.readFileSync(path.join(root, 'app/casts/page.tsx'), 'utf8')
  const markup = source.slice(source.indexOf('{/* 黒服・オーナー限定:'), source.indexOf('{/* ─── 層タブ'))
  const bindings = { C: colors.C, isPC: pc, meLink: { isAdmin: true },
    casts: { length: 31 }, retiredLoaded: true, retiredCasts: { length: 12 },
    customerStaffLoaded: true, customerStaff: { length: 4 }, listMode: 'active', setListMode() {} }
  const code = ts.transpileModule(`function Fixture({${Object.keys(bindings).join(',')}}) { return <>${markup}</>; }`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const fixture = vm.runInThisContext(`(function(require, exports) { ${code}; return Fixture; })`)(() => jsxRuntime, {})
  return renderToStaticMarkup(React.createElement(fixture, bindings))
}

test('在籍・退店・お客様担当は3等分の同じ高さで、ラベルと人数を1行に維持', () => {
  const mobile = renderRosterModes()
  const buttons = mobile.match(/<button[^]*?<\/button>/g) || []
  assert.equal(buttons.length, 3)
  assert.match(mobile, /grid-template-columns:repeat\(3, minmax\(0, 1fr\)\)/)
  for (const button of buttons) {
    assert.match(button, /min-height:38px;min-width:0;padding:8px 2px/)
    assert.match(button, /display:inline-flex;align-items:center;justify-content:center;gap:2px;white-space:nowrap/)
    assert.match(button, /font-size:10px/)
    assert.match(button, /white-space:nowrap;flex-shrink:0/)
  }
  for (const text of ['在籍キャスト', '31人', '退店キャスト', '12人', 'お客様担当', '4人']) assert.ok(mobile.includes(text))
  const pc = renderRosterModes(true)
  assert.match(pc, /padding:8px 12px/)
  assert.match(pc, /font-size:11px/)
})

function renderSearchPanel(pc = false) {
  const source = fs.readFileSync(path.join(root, 'app/customers/page.tsx'), 'utf8')
  const panel = source.slice(source.indexOf('const searchPanel = ('), source.indexOf('// ─── 顧客カード（PC用'))
  const noop = () => {}
  const bindings = { C: colors.C, isPC: pc, CompactListField: compactField,
    selectBase: { width: '100%', border: `1px solid ${colors.C.border}`, borderRadius: 12, background: '#fff', color: colors.C.dark, fontFamily: 'inherit' },
    srvKeyword: '', setSrvKeyword: noop, runSearchWith: noop, currentFormCond: noop,
    SEARCH_PRESETS: [{ key: 'hon30', label: '本指名×30日来店なし' }, { key: 'rankSA', label: 'S・Aランク' }],
    applyPreset: noop, searching: false, srvArea: '', setSrvArea: noop, srvNomination: '', setSrvNomination: noop,
    srvCastName: '', setSrvCastName: noop, castOptionGroups: castOptionsHelper.groupCustomerCastOptions(fixtureCasts.filter(c => c.is_active)),
    srvMinDays: '', setSrvMinDays: noop, srvMinAvgSpend: '', setSrvMinAvgSpend: noop, srvMinTotalSpent: '', setSrvMinTotalSpent: noop,
    srvRanks: [], toggleSrvRank: noop, showAllCustomers: noop, searchError: null,
  }
  const code = ts.transpileModule(`function Fixture({${Object.keys(bindings).join(',')}}) { ${panel} return searchPanel; }`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const fixture = vm.runInThisContext(`(function(require, exports) { ${code}; return Fixture; })`)(() => jsxRuntime, {})
  return renderToStaticMarkup(React.createElement(fixture, bindings))
}

function renderWorkspaceSort() {
  const source = fs.readFileSync(path.join(root, 'components/CastWorkspace.tsx'), 'utf8')
  const start = source.lastIndexOf('<label', source.indexOf('カテゴリ内の並び'))
  const markup = source.slice(start, source.indexOf('</label>', start) + '</label>'.length)
  const bindings = { C: colors.C, isViewPC: false, CompactListField: compactField,
    customerSortKey: 'standard', setCustomerSortKey() {}, CUSTOMER_SORT_OPTIONS: patterns.CUSTOMER_SORT_OPTIONS }
  const code = ts.transpileModule(`function Fixture({${Object.keys(bindings).join(',')}}) { return (${markup}); }`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const fixture = vm.runInThisContext(`(function(require, exports) { ${code}; return Fixture; })`)(() => jsxRuntime, {})
  return renderToStaticMarkup(React.createElement(fixture, bindings))
}

test('薄型カードは個別の枠、PCは従来の枠。長押し・選択用の構造を維持', () => {
  assert.match(renderCompactFixture(), /class="shell_compactFrame"/)
  const css = fs.readFileSync(path.join(root, 'components/CustomerActionCardShell.module.css'), 'utf8')
  assert.match(css, /margin: 0 0 6px/)
  assert.match(css, /border: 1px solid/)
})

test('一覧の7入力はネイティブのまま小型化し、iOS16px・PC・ズーム許可を維持', () => {
  const mobile = renderSearchPanel()
  assert.equal((mobile.match(/field_compact/g) || []).length, 7)
  assert.equal((mobile.match(/<select/g) || []).length, 4)
  assert.equal((mobile.match(/<input/g) || []).length, 3)
  assert.match(mobile, /aria-label="客単価の下限（円）"/)
  assert.doesNotMatch(renderSearchPanel(true), /field_compact/)
  assert.match(renderWorkspaceSort(), /field_compact/)
  const css = fs.readFileSync(path.join(root, 'components/CompactListField.module.css'), 'utf8')
  assert.match(css, /max-width: 767px/)
  assert.match(css, /font-size: 16px !important/)
  assert.match(css, /height: 38px/)
  assert.match(css, /transform: scale\(\.8125\)/)
  assert.match(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8'), /font-size: 16px !important/)
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8'), /userScalable:\s*false|maximumScale:\s*1/)
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

test('薄型カードは既存バッジ行に累計来店回数を表示し、0回・多数回も同じデータで表示', () => {
  for (const count of [0, 1, 13, 12345]) {
    const html = renderCompactFixture({ preview: { visitCount: count }, noReply: true })
    assert.match(html, new RegExp(`aria-label="来店回数 ${count}回"`))
    assert.ok(html.includes(`来店 <strong>${count.toLocaleString('ja-JP')}</strong>回`))
    assert.match(html, /class="compact_badges">[^]*class="compact_visitCount"[^]*<div class="compact_metrics">/)
  }
  assert.match(renderCompactFixture(), /aria-label="来店回数 0回"/)
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

function renderStaffFixture({ pc = true, selectedCast = '', allowed = true, selection = false, view = 'banai', screen = selectedCast ? 'cast' : 'today', customerRows = fixtureCustomers, workspaceBusy = false } = {}) {
  let stateIndex = 0
  const matching = customerRows.filter(c => view === 'all' || c.nomination_status === (view === 'banai' ? '場内' : '本指名'))
  const fixtures = matching.filter(c => !selectedCast || c.cast_name === selectedCast)
  const state = [fixtureCasts, false, 0, selectedCast, '', '', 'lastVisitNewest', 1, 0, { customers: fixtures, total: fixtures.length, pageCount: 1, page: 1 }, false, null, { 1: '本:りな' }, false, null, null, selection, new Set(), { ...starred.countStarredCustomers(fixtureCustomers), matched: starred.countStarredCustomers(matching) }, false, 0, view, '', screen, workspaceBusy]
  const component = loadFile('components/StaffStarsPage.tsx', {
    react: { ...React, useState: value => [state[stateIndex++] ?? value, () => {}], useEffect: () => {} },
    'react/jsx-runtime': jsxRuntime,
    'next/dynamic': { __esModule: true, default: loader => String(loader).includes('CastWorkspace')
      ? props => React.createElement('div', { 'data-cast-workspace': props.castIdOverride, 'data-stars-only': String(props.starsOnly), 'data-stars-list-only': String(props.starsListOnly) }, '共通キャスト⭐️リスト')
      : () => null },
    '@/lib/colors': colors, '@/lib/customerCategory': category, '@/lib/customerVisitPattern': patterns,
    '@/lib/starredCustomers': starred, '@/lib/starLog': starLogLogic,
    '@/lib/customerCastOptions': castOptionsHelper,
    '@/hooks/useCustomerListScroll': { useCustomerListScroll: () => () => {} },
    '@/hooks/useJstToday': { useJstToday: () => '2026-10-09' }, '@/hooks/useStarLog': { useStarLog: emptyStarLogs }, '@/components/StarLogSummary': starSummary,
    '@/lib/supabase/client': { createClient: () => { throw new Error('SSR must not query DB') } },
    '@/lib/supabaseHelpers': { fetchAllPaginated: () => { throw new Error('SSR must not query DB') } },
    '@/hooks/useViewMode': { useViewMode: () => ({ isPC: pc }) },
    '@/hooks/useCustomerListActions': { useCustomerListActions: () => ({ busy: false, ToastView: null }) },
    '@/components/PageHeader': { __esModule: true, default: () => React.createElement('header', { style: { height: 70, padding: '16px', boxSizing: 'border-box', background: '#fff8fa' } }, 'Éclat　⭐️のお客様（レイアウト検証データ）') },
    '@/components/BottomNav': { __esModule: true, default: () => React.createElement('footer', { style: { position: 'fixed', bottom: 0, padding: 16, width: '100%', background: '#fff8fa' } }, 'ホーム　　検索　　⭐️　　接客　　管理') },
    '@/components/CustomerActionCardShell': { __esModule: true, default: shell },
    '@/components/CompactCustomerCard': compactModule,
    '@/components/CompactListField': { __esModule: true, default: compactField },
    '@/components/StaffStarsMenu': staffMenu,
    '@/components/CustomerCardIndicators': indicators,
    '@/components/CustomerVisitPatternSummary': { __esModule: true, default: patternSummary },
    '@/app/casts/[id]/customer-cards.module.css': cssModule('card'),
    './StaffStarsPage.module.css': cssModule('staff'),
  }).default
  return renderToStaticMarkup(React.createElement(component, { profile: { role: 'admin', is_owner: false, permissions: { '顧客.閲覧': allowed, '顧客.編集': allowed } } }))
}

test('本日確認UI：キャスト別、PC左名簿・モバイルプルダウン・担当名', () => {
  const pc = renderStaffFixture()
  assert.match(pc, /aria-label="キャストで絞り込み"/)
  assert.match(pc, /aria-pressed="true"[^>]*><span>本日確認/)
  assert.match(pc, /本2名・場1名/)
  assert.match(pc, /本1名・場1名/)
  assert.match(pc, /aria-pressed="true"[^>]*>場内・対象日/)
  assert.match(pc, /aria-label="場内の経過日数"/)
  assert.match(pc, /value="lastVisitNewest" selected="">経過日数が少ない順/)
  assert.match(pc, /対象1名/)
  assert.match(pc, /1・3・6・9・12・15・18・21・24・27・30日前/)
  assert.match(pc, /<details class="staff_help"><summary>表示条件・使い方<\/summary>/)
  assert.match(pc, /本日確認（全キャスト）/)
  assert.match(pc, /担当：あかり/)
  assert.doesNotMatch(pc, /サンプルのお客様|とても長いお名前のお客様の表示テスト/)
  assert.match(pc, /あかり ／ 場内・対象日/)
  assert.doesNotMatch(pc, /6日前 ／ 場内・対象日/)
  assert.doesNotMatch(pc, /退店キャスト/)
  assert.match(pc, /aria-label="来店から6日"/)
  assert.equal((pc.match(/aria-label="星付きのお客様"/g) || []).length, 1)
  assert.match(pc, /class="indicators_starMarker">⭐️<\/span><div style="flex:1;min-width:0"/)
  const mobile = renderStaffFixture({ pc: false })
  assert.match(mobile, /class="staff_mobile"/)
  assert.match(mobile, /<option value="" selected="">本日確認・全キャスト/)
  assert.match(mobile, /あかり（対象1名）/)
  assert.match(mobile, /data-compact-customer="true"/)
  assert.match(mobile, /客単価/)
  assert.match(mobile, /累計売上/)
  assert.equal((mobile.match(/aria-label="来店回数 13回"/g) || []).length, 1)
  assert.doesNotMatch(mobile, /曜日別の来店実績|お連れ様：|年代未設定/)
  assert.doesNotMatch(mobile, /退店キャスト/)
  assert.match(mobile, /aria-label="来店から6日"/)
  for (const view of [pc, mobile]) {
    assert.match(view, /aria-label="ACのキャスト"/)
    assert.match(view, /<optgroup label="AC（2人）">/)
    assert.match(view, /<optgroup label="BA（1人）">/)
    const dropdown = view.slice(view.indexOf('aria-label="⭐️を表示するキャスト"'), view.indexOf('</select>'))
    assert.ok(dropdown.indexOf('value="りな"') < dropdown.indexOf('value="あかり"'))
    assert.ok(dropdown.indexOf('value="あかり"') < dropdown.indexOf('value="ゆい"'))
  }
})
test('本日確認は同じ担当の複数日数を一つの見出しにまとめ、対象切替でもキャスト別を維持', () => {
  for (const pc of [true, false]) for (const view of ['banai', 'honshimei', 'all']) {
    const base = fixtureCustomers[2]
    const nomination_status = view === 'honshimei' ? '本指名' : '場内'
    const customerRows = [
      { ...base, id: 'mixed6', nomination_status, cast_name: 'りな', metrics: { ...base.metrics, daysSinceLastVisit: 6 } },
      { ...base, id: 'mixed1', nomination_status, cast_name: 'りな', metrics: { ...base.metrics, daysSinceLastVisit: 1 } },
      { ...base, id: 'other6', nomination_status, cast_name: 'あかり' },
      { ...base, id: 'unassigned', nomination_status, cast_name: null },
    ]
    const html = renderStaffFixture({ pc, view, customerRows })
    const headings = [...html.matchAll(/<h2 class="staff_category">([^]*?)<\/h2>/g)].map(match => match[1])
    assert.equal(headings.length, 3)
    assert.match(headings[0], /^りな ／ .* · 2人$/)
    assert.match(headings[1], /^あかり ／ .* · 1人$/)
    assert.match(headings[2], /^担当未設定 ／ .* · 1人$/)
    assert.deepEqual([...html.matchAll(/data-customer-id="([^"]+)"/g)].map(match => match[1]), ['mixed6', 'mixed1', 'other6', 'unassigned'])
  }
})
test('検索ページの担当プルダウンも層別で保存順を維持する', () => {
  for (const pc of [true, false]) {
    const view = renderSearchPanel(pc)
    assert.match(view, /<optgroup label="在籍 AC">/)
    assert.match(view, /<optgroup label="在籍 BA">/)
    assert.ok(view.indexOf('value="りな"') < view.indexOf('value="あかり"'))
    assert.ok(view.indexOf('value="あかり"') < view.indexOf('value="ゆい"'))
  }
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
test('共通カードは星付きだけに⭐️を表示し、星なしも同じ左欄を確保。複数選択中も揃える', () => {
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
    const unmarked = render(false, selectionMode)
    assert.doesNotMatch(unmarked, /aria-label="星付きのお客様"/)
    assert.equal((unmarked.match(/class="indicators_starMarker"/g) || []).length, 1)
    assert.match(unmarked, /aria-hidden="true" class="indicators_starMarker"><\/span><div style="flex:1;min-width:0"/)
  }
  const workspace = fs.readFileSync(path.join(root, 'components/CastWorkspace.tsx'), 'utf8')
  assert.match(workspace, /<CustomerStarMarker starred=\{isFollowUp\}\/>/)
  assert.doesNotMatch(workspace, /isFollowUp && <CustomerStarMarker/)
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
test('本指名と全員には日数プルダウンを出さず、担当内の取得順を分類で崩さない', () => {
  for (const view of ['honshimei', 'all']) {
    const html = renderStaffFixture({ view })
    assert.doesNotMatch(html, /aria-label="場内の経過日数"/)
    assert.match(html, new RegExp(`aria-pressed="true"[^>]*>${view === 'all' ? '⭐️全員' : '本指名'}`))
  }
  const all = renderStaffFixture({ view: 'all' })
  assert.equal((all.match(/aria-label="星付きのお客様"/g) || []).length, 3)
  assert.match(all, /りな ／ ⭐️全員/)
  assert.match(all, /あかり ／ ⭐️全員/)
  const source = fs.readFileSync(path.join(root, 'components/StaffStarsPage.tsx'), 'utf8')
  assert.match(source, /useState<StaffStarView>\('banai'\)/)
  assert.match(source, /useState<CustomerSortKey>\('lastVisitNewest'\)/)
  assert.doesNotMatch(source, /classifyCustomersTab|banaiVisitDaysOnly/)
  assert.match(source, /setView\(option.value\); setVisitDay\(''\)/)
})
test('スタッフの入口は本日確認→層別の保存順キャスト一覧、名前横は⭐️全員の人数', () => {
  for (const pc of [true, false]) {
    const menu = renderStaffFixture({ pc, screen: 'menu' })
    assert.match(menu, /1\. 本日確認/)
    assert.match(menu, /2\. キャスト別/)
    assert.ok(menu.indexOf('1. 本日確認') < menu.indexOf('AC'))
    assert.ok(menu.indexOf('AC') < menu.indexOf('りな'))
    assert.ok(menu.indexOf('りな') < menu.indexOf('あかり'))
    assert.ok(menu.indexOf('あかり') < menu.indexOf('BA'))
    assert.match(menu, /本1名・場1名/)
    assert.doesNotMatch(menu, /data-customer-id|退店キャスト|aria-label="場内の経過日数"/)
  }
  const source = fs.readFileSync(path.join(root, 'components/StaffStarsPage.tsx'), 'utf8')
  assert.match(source, /useState<'menu' \| 'today' \| 'cast'>\('menu'\)/)
  assert.match(source, /if \(!canRead \|\| screen !== 'today'\) return/)
  assert.match(source, /params.set\('starredCastOrder', 'true'\)/)
  assert.doesNotMatch(source, /params.set\('starredDayOrder'/)
  assert.match(source, /setView\(name \? 'all' : 'banai'\)/)
})
test('スタッフの個人表示は本人と同じCastWorkspaceを選択したIDで再利用し、旧3切替と全体検索を使わない', () => {
  for (const pc of [true, false]) {
    const html = renderStaffFixture({ pc, selectedCast: 'りな' })
    assert.match(html, /data-cast-workspace="cast1" data-stars-only="true" data-stars-list-only="true"/)
    assert.match(html, /りなの⭐️のお客様/)
    assert.doesNotMatch(html, /aria-label="⭐️の表示対象"|aria-label="場内の経過日数"|この条件に合う⭐️/)
    assert.match(html, /人数は⭐️全員分/)
    assert.doesNotMatch(renderStaffFixture({ pc, selectedCast: 'りな', allowed: false }), /data-cast-workspace/)
    const missing = renderStaffFixture({ pc, selectedCast: '存在しないキャスト' })
    assert.match(missing, /キャストを選び直してください/)
    assert.doesNotMatch(missing, /data-cast-workspace/)
  }
  const staff = fs.readFileSync(path.join(root, 'components/StaffStarsPage.tsx'), 'utf8')
  const home = fs.readFileSync(path.join(root, 'components/CastHomePage.tsx'), 'utf8')
  assert.match(staff, /import\('@\/components\/CastWorkspace'\)/)
  assert.match(staff, /key=\{selectedCast.id\} castIdOverride=\{selectedCast.id\} starsOnly starsListOnly/)
  assert.match(home, /<CastWorkspace key=\{me.id\} castIdOverride=\{me.id\} starsOnly=\{starsOnly\}/)
  assert.match(staff, /if \(!canRead \|\| screen !== 'today'\) return/)
})
test('個人リストの保存中はPC名簿・スマホプルダウン・入口へ戻る操作を止め、保存後は人数を更新', () => {
  for (const pc of [true, false]) {
    const html = renderStaffFixture({ pc, selectedCast: 'りな', workspaceBusy: true })
    assert.match(html, /class="staff_backToMenu" disabled=""/)
    assert.match(html, /aria-label="⭐️を表示するキャスト" disabled=""/)
    assert.match(html, /aria-pressed="true" disabled=""[^>]*><span>りな/)
  }
  const staff = fs.readFileSync(path.join(root, 'components/StaffStarsPage.tsx'), 'utf8')
  const cast = fs.readFileSync(path.join(root, 'components/CastWorkspace.tsx'), 'utf8')
  assert.match(staff, /onCustomerListChanged=\{refreshStaffCounts\} onBusyChange=\{setWorkspaceBusy\}/)
  assert.match(staff, /const refreshStaffCounts = useCallback\(\(\) => setCountRevision/)
  assert.match(cast, /onCustomerListChanged\?\.\(\)/)
  assert.match(cast, /onBusyChange\?\.\(bulkActionBusy\)/)
  assert.match(cast, /viewer.role === 'cast' && viewer.id !== castId/)
  assert.match(cast, /setCanManageCustomers\(viewer.role === 'cast' \|\| viewer.is_owner === true \|\| viewer.permissions\?\.\['顧客.編集'\] === true\)/)
  assert.match(cast, /\.eq\('cast_name', castData.cast_name\)/)
  assert.match(cast, /const isStarsListEmbed = starsOnly && starsListOnly/)
  assert.match(cast, /!isStarsListEmbed && <>/)
})
test('キャスト本日連絡と全員の切替UIは人数付き。⭐️なし/切れたは本日連絡に入らない', () => {
  for (const value of ['today', 'all']) {
    const html = renderToStaticMarkup(React.createElement(castStarSwitch.default, { value, todayCount: 3, todayBreakdown: { honshimei: 1, banai: 2 }, totalCount: 9, disabled: false, onChange() {} }))
    assert.match(html, /本日連絡のお客様（3名）/)
    assert.match(html, /⭐️全員表示（9名）/)
    assert.match(html, /上限なし/)
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1)
    if (value === 'today') assert.match(html, /場2名・本1名を指名別・地域別に表示（⭐️付きのみ）/)
    else assert.doesNotMatch(html, /aria-label="本日連絡の内訳"/)
  }
  const source = fs.readFileSync(path.join(root, 'components/CastWorkspace.tsx'), 'utf8')
  const start = source.indexOf('const customerSearchNeedle =')
  const scope = source.slice(start, source.indexOf('const sourceOrder =', start))
  const date = days => { const value = new Date('2026-10-15T00:00:00Z'); value.setUTCDate(value.getUTCDate() - days); return value.toISOString().slice(0, 10) }
  const customers = [
    { id: '1', nomination_status: '本指名', region: '福岡県', customer_rank: 'C' },
    { id: '2', nomination_status: '場内', region: '東京都' },
    { id: '3', nomination_status: '本指名', region: null },
    { id: '4', nomination_status: '本指名', region: '福岡県', customer_rank: '切れた' },
    { id: '5', nomination_status: '本指名', region: '福岡県' },
    { id: '6', nomination_status: '本指名', region: '福岡県' },
    { id: '7', nomination_status: '場内', region: '福岡県' },
    { id: '8', nomination_status: '場内', region: '福岡県' },
    { id: '9', nomination_status: '場内', region: '福岡県' },
    { id: '10', nomination_status: '場内', region: '福岡県' },
  ]
  const bindings = { customers, followUpCustomerIds: new Set(['1', '2', '3', '4', '6', '8', '9', '10']), lastVisitDateMap: new Map([['1', date(33)], ['2', date(1)], ['3', date(999)], ['4', date(3)], ['5', date(3)], ['6', date(32)], ['7', date(30)], ['8', date(30)], ['9', date(33)], ['10', date(2)]]), customerSearchQuery: '', normalizeCustomerSearchText: value => (value ?? '').toLowerCase(), bottleSearchTextMap: new Map(), starsOnly: true, starView: 'today', castId: 'own', custMetaCastId: 'own', custExtrasLoaded: true, custExtrasError: false, starToday: '2026-10-15', ...starred, classifyCustomersTab: category.classifyCustomersTab }
  bindings.starLogs = emptyStarLogs()
  bindings.matchesStarCheck = starLogLogic.matchesStarCheck
  const code = ts.transpileModule(`function Fixture({${Object.keys(bindings).join(',')}}){${scope}; return {scopedCustomers,contactReady,byCategory,todayContactCounts};}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const fixture = vm.runInThisContext(`(function(){${code};return Fixture;})`)()
  const daily = fixture(bindings)
  assert.deepEqual(daily.scopedCustomers.map(c => c.id), ['1', '2', '3', '8'])
  assert.deepEqual(daily.todayContactCounts, { honshimei: 2, banai: 2 })
  assert.deepEqual([...daily.byCategory.keys()], ['本指名（県内顧客）', '場内・対象日（県外）', '本指名（その他）', '場内・対象日（県内）'])
  assert.deepEqual([...daily.byCategory.values()].flat().map(c => c.id).sort(), ['1', '2', '3', '8'])
  assert.deepEqual(fixture({ ...bindings, starView: 'all' }).scopedCustomers.map(c => c.id), ['1', '2', '3', '4', '6', '8', '9', '10'])
  assert.equal(fixture({ ...bindings, custExtrasError: true, custMetaCastId: null }).contactReady, false)
  assert.equal(fixture({ ...bindings, custMetaCastId: null }).scopedCustomers.length, 0)
  assert.equal(fixture({ ...bindings, custExtrasLoaded: false }).scopedCustomers.length, 4)
  assert.equal(fixture({ ...bindings, custExtrasError: true }).scopedCustomers.length, 4)
  assert.equal(fixture({ ...bindings, custMetaCastId: null }).todayContactCounts, null)
  assert.equal(fixture({ ...bindings, castId: 'other' }).scopedCustomers.length, 0)
  assert.equal(fixture({ ...bindings, starsOnly: false }).scopedCustomers.length, customers.length)
  assert.match(source, /来店日数を確認中/)
  assert.match(source, /来店情報を取得できませんでした/)
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
    ['components/CustomerActionCardShell.module.css', 'shell'],
    ['components/CompactListField.module.css', 'field'],
  ].map(([file, prefix]) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => '.' + prefix + '_' + name)).join('\n')
  createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost')
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    const compactList = [
      { customerName: 'サンプルのお客様', customerRank: 'S', averageSpend: 122000, totalSales: 1220000, daysSinceLast: 44, preview: { visitCount: 10 } },
      { customerName: 'とても長いお名前のお客様の表示テスト', customerRank: 'A', averageSpend: 116000, totalSales: 3140000, daysSinceLast: 15, noReply: true, preview: { visitCount: 27 } },
      { customerName: '場内のお客様', customerRank: 'B', nomination: '場内', averageSpend: 0, totalSales: 0, daysSinceLast: 6, preview: { visitCount: 1 } },
      { customerName: '県外のお客様', customerRank: 'A', averageSpend: 77000, totalSales: 1160000, daysSinceLast: 70, isFollowUp: false, preview: { visitCount: 15 } },
      { customerName: '今日のお客様', customerRank: 'B', averageSpend: 113000, totalSales: 790000, daysSinceLast: 0, preview: { visitCount: 7 } },
      { customerName: '未登録のお客様', customerRank: null, averageSpend: 0, totalSales: 0, daysSinceLast: null, isFollowUp: false, preview: { visitCount: 0 } },
    ].map(renderCompactFixture).join('')
    const content = url.searchParams.has('same-cast')
      ? `<main style="padding:12px;max-width:1100px;margin:auto"><header style="font-size:12px;padding-bottom:12px">${url.searchParams.has('self') ? 'キャスト本人' : 'スタッフの個人表示'}・同じ実コンポーネント（架空データ）</header>${renderActualCastStars({ pc: !url.searchParams.has('mobile'), embedded: !url.searchParams.has('self'), starView: url.searchParams.has('all') ? 'all' : 'today', canManage: !url.searchParams.has('readonly') })}</main>`
      : url.searchParams.has('navigation')
      ? `<main style="background:#fff9fa;min-height:100vh"><p style="padding:0 16px;font-size:11px">キャスト一覧の切替（固定テストデータ）</p>${renderRosterModes(url.searchParams.has('pc'))}<p style="padding:24px 16px 0;font-size:11px">キャストページの上部（固定テストデータ）</p>${renderWorkspaceChrome(url.searchParams.has('pc'))}</main>`
      : url.searchParams.has('workspace')
      ? `${renderWorkspaceChrome()}<main style="padding:4px 16px 90px;background:#fff9fa">${renderWorkspaceSort()}<p style="font-size:10px;color:#6b5060">固定テストデータ · 長押しはカード情報のみ</p><p style="font-size:11px;color:#e8879a">▼ 県内顧客 — 17人</p><div>${compactList}</div></main>`
      : url.searchParams.has('search')
      ? `<main style="max-width:420px;margin:auto;padding:12px;background:#fff8fa"><header style="height:50px;font-size:14px">Éclat · 検索（固定データ）</header><section style="border:1px solid #f0dde2;border-radius:16px;padding:10px 12px;background:#fff">${renderSearchPanel()}</section><div style="margin-top:12px">${compactList}</div></main>`
      : url.searchParams.has('cards')
      ? `<main style="padding:18px 12px;background:#fff8fa;min-height:100vh"><h1 style="font-size:18px;margin:0 0 8px">スマホのお客様一覧</h1><p style="font-size:11px;color:#6e4c59;margin:0 0 16px">固定テストデータ · 長押し・「情報」でカード情報を表示</p><div style="display:grid;gap:5px">${compactList}</div></main>`
      : renderStaffFixture({ pc: !url.searchParams.has('mobile'), selectedCast: url.searchParams.get('cast') || '' })
    response.end(`<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><title>スタッフ⭐️ UI検証（固定データ）</title><style>body{margin:0;font-family:system-ui,sans-serif}*{box-sizing:border-box}@media(max-width:767px){input,textarea,select{font-size:16px!important}}${css}</style>${content}</html>`)
  }).listen(6113, '127.0.0.1', () => { process.stdout.write('Layout fixture: http://127.0.0.1:6113 (mobile: ?mobile)\n') })
}
