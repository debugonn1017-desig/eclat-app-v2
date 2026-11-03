import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const logic = {}
vm.runInThisContext(`(function(exports){${compile('lib/starCustomerGoals.ts')}\n})`)(logic)
const ids = Object.fromEntries(['owner', 'cast', 'other', 'read', 'edit', 'inactive'].map(k => [k, randomUUID()]))
const month = '2026-11-01'
let db
before(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.actor',true),'')::uuid$$;
    create table profiles(id uuid primary key,cast_name text,display_name text,role text,is_active boolean,is_owner boolean);
    create table staff_permissions(staff_id uuid,permission text,enabled boolean);
    create table customers(id bigint primary key,customer_name text,cast_name text,is_starred boolean default false,last_contact_date date);
    alter table customers enable row level security;
    create function public.current_role() returns text language sql security definer as $$select role from profiles where id=auth.uid() and is_active$$;
    create function public.current_cast_name() returns text language sql security definer as $$select cast_name from profiles where id=auth.uid() and is_active$$;
    create policy customer_scope on customers for all to authenticated using (public.current_role()='admin' or cast_name=public.current_cast_name()) with check (public.current_role()='admin' or cast_name=public.current_cast_name());
    grant usage on schema public,auth to authenticated,service_role; grant select on profiles,staff_permissions to authenticated;
    grant select,insert,update on customers to authenticated; grant all on customers to service_role;`)
  for (const [key, id] of Object.entries(ids)) await db.query('insert into profiles values($1,$2,$3,$4,$5,$6)', [id, key === 'cast' ? 'りな' : key === 'other' ? 'なみ' : null, key, ['cast', 'other'].includes(key) ? 'cast' : 'admin', key !== 'inactive', key === 'owner'])
  await db.query("insert into staff_permissions values($1,'顧客.閲覧',true),($2,'顧客.編集',true)", [ids.read, ids.edit])
  await db.exec("insert into customers values(1,'⭐️本人','りな',true,null),(2,'⭐️他担当','なみ',true,null),(3,'⭐️なし','りな',false,null),(4,'移動用','りな',true,null)")
  for (const file of ['20261015133000_v03133_star_logs.sql', '20261024040000_v03137_star_log_edits.sql', '20261103131445_v03138_customer_monthly_goals.sql', '20261103134803_v03138_goal_rls_initplan.sql']) await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'))
})
after(async () => { await db?.close() })
async function as(user, fn, role = 'authenticated') {
  await db.query("select set_config('app.actor',$1,false)", [ids[user] || ''])
  await db.exec('set role ' + role)
  try { return await fn() } finally { await db.exec('reset role') }
}
const insert = (user, customer = 1, cast = ids.cast, m = month, sales = 300000) => as(user, () => db.query('insert into customer_monthly_goals(cast_id,month,customer_id,target_sales,target_visits,note) values($1,$2,$3,$4,3,$5) returning *', [cast, m, customer, sales, '月別の備考⭐️\n2行目']))
const read = user => as(user, () => db.query('select * from customer_monthly_goals order by customer_id,month'))

test('厳密な入力・月・未設定とゼロ。範囲外/追加フィールド/文字列数字を拒否', () => {
  const b = { castId: ids.cast, customerId: '1', month: '2026-11', targetSales: null, targetVisits: 0, note: '', expectedRevision: 0 }
  assert.equal(logic.validateCustomerGoal(b), null)
  for (const update of [{ month: '2026-13' }, { month: '1999-12' }, { customerId: '1.1' }, { customerId: '9007199254740992' }, { castId: 'wrong' }, { targetSales: -1 }, { targetSales: '0' }, { targetVisits: 1.5 }, { targetVisits: 1000 }, { note: 'a'.repeat(2001) }, { expectedRevision: -1 }, { updated_by: ids.owner }]) assert.ok(logic.validateCustomerGoal({ ...b, ...update }))
  assert.deepEqual(logic.goalMonthBounds('2099-12'), { start: '2099-12-01', end: '2100-01-01' })
})
test('本指名の全ランク・場内を県内外で分類し、切れた/地域未設定/その他も欠落しない', () => {
  for (const rank of ['S', 'A', 'B', 'C', null]) assert.equal(logic.customerGoalCategory({ customer_rank: rank, nomination_status: '本指名', region: '福岡県' }), '県内顧客')
  assert.equal(logic.customerGoalCategory({ nomination_status: '本指名', region: '' }), 'その他・地域未設定')
  assert.equal(logic.customerGoalCategory({ nomination_status: '場内', region: '' }), '県外場内')
  assert.equal(logic.customerGoalCategory({ nomination_status: '場内', region: '福岡県' }), '県内場内')
  assert.equal(logic.customerGoalCategory({ nomination_status: 'フリー', region: '福岡県' }), 'その他・地域未設定')
  assert.equal(logic.customerGoalCategory({ customer_rank: '切れた', nomination_status: '本指名', region: '福岡県' }), '切れたお客様')
})
test('実績は対象月・今日以前の実来店だけ。1000件超、ゼロ円来店、同日複数も正確', () => {
  const visits = Array.from({ length: 1005 }, () => ({ customer_id: 1, visit_date: '2026-11-02', amount_spent: 100, is_planned: null }))
  visits.push({ customer_id: 1, visit_date: '2026-11-03', amount_spent: 0, is_planned: false }, { customer_id: 1, visit_date: '2026-11-04', amount_spent: 999, is_planned: false }, { customer_id: 1, visit_date: '2026-11-03', amount_spent: 999, is_planned: true }, { customer_id: 1, visit_date: '2026-10-31', amount_spent: 999, is_planned: false }, { customer_id: 2, visit_date: '2026-11-02', amount_spent: 999, is_planned: false })
  assert.deepEqual(logic.aggregateGoalVisits(['1', '3'], visits, '2026-11', '2026-11-03'), { 1: { sales: 100500, visits: 1006 }, 3: { sales: 0, visits: 0 } })
  assert.throws(() => logic.aggregateGoalVisits(['1'], [{ ...visits[0], amount_spent: '壊れた金額' }], '2026-11', '2026-11-03'))
})
test('合計は現在⭐️のお客様だけ。未設定と0を区別し、解除/再追加で合計を復元', () => {
  const map = new Map([['1', { target_sales: 100, target_visits: 2 }], ['2', { target_sales: 0, target_visits: 0 }]])
  const actual = { 1: { sales: 40, visits: 1 }, 2: { sales: 10, visits: 1 } }
  assert.deepEqual(logic.sumCustomerGoals(['1', '2', '3'], map, actual), { targetSales: 100, targetVisits: 2, sales: 50, visits: 2, unset: 1 })
  assert.equal(logic.sumCustomerGoals(['2'], map, actual).targetSales, 0)
  assert.equal(logic.sumCustomerGoals(['1', '2'], map, actual).targetSales, 100)
  assert.equal(logic.goalDifference(0, 0).achieved, true)
  assert.equal(logic.goalDifference(null, 100).achieved, false)
})
test('本人が保存。記録者・日時・版はDB側で設定', async () => {
  const goal = (await insert('cast')).rows[0]
  assert.equal(goal.created_by, ids.cast); assert.equal(goal.updated_by, ids.cast); assert.equal(goal.revision, 1)
  assert.equal(goal.note, '月別の備考⭐️\n2行目')
  assert.equal((await read('other')).rows.length, 0)
  await assert.rejects(insert('other', 1), /row-level security/)
  await assert.rejects(insert('cast', 2, ids.other), /row-level security/)
  await assert.rejects(insert('cast', 1, ids.other), /row-level security/)
  await assert.rejects(insert('cast', 3), /row-level security/)
  // 同じキャスト名の別プロフィールがあってもcast_idを偽装できない。
  const duplicateCast = randomUUID()
  await db.query("insert into profiles values($1,'りな','別プロフィール','cast',true,false)", [duplicateCast])
  await assert.rejects(insert('cast', 1, duplicateCast), /row-level security/)
})
test('閲覧スタッフは読むだけ。編集スタッフ/オーナーは許可、無効/匿名は拒否', async () => {
  assert.equal((await read('read')).rows.length, 1)
  assert.equal((await as('read', () => db.query("update customer_monthly_goals set note='不正' returning *"))).rows.length, 0)
  await assert.rejects(insert('read', 4), /row-level security/)
  await assert.rejects(insert('inactive', 4), /row-level security/)
  assert.equal((await read('inactive')).rows.length, 0)
  await assert.rejects(as('', () => db.query('select * from customer_monthly_goals'), 'anon'), /permission denied/)
  const edited = (await as('edit', () => db.query("update customer_monthly_goals set note='スタッフ更新' where customer_id=1 returning *"))).rows[0]
  assert.equal(edited.updated_by, ids.edit); assert.equal(edited.created_by, ids.cast); assert.equal(edited.revision, 2)
  assert.equal((await insert('owner', 4)).rows[0].created_by, ids.owner)
})
test('ID・対象月・監査情報の改ざん、削除を列権限で拒否', async () => {
  for (const assignment of ["cast_id='" + ids.other + "'", "month='2026-12-01'", 'customer_id=2', 'revision=99', 'updated_by=null', 'created_at=now()']) await assert.rejects(as('cast', () => db.query(`update customer_monthly_goals set ${assignment}`)), /permission denied/)
  await assert.rejects(as('edit', () => db.query('delete from customer_monthly_goals')), /permission denied/)
  await assert.rejects(as('cast', () => db.query('insert into customer_monthly_goals(cast_id,month,customer_id,revision) values($1,$2,1,99)', [ids.cast, '2026-12-01'])), /permission denied/)
})
test('競合は同じ版の2回目を書き込まない。月別データは独立', async () => {
  const update = () => as('cast', () => db.query('update customer_monthly_goals set target_sales=0,target_visits=null where customer_id=1 and revision=2 returning *'))
  assert.equal((await update()).rows.length, 1)
  assert.equal((await update()).rows.length, 0)
  await insert('cast', 1, ids.cast, '2026-12-01', null)
  const rows = (await read('cast')).rows.filter(g => g.customer_id === 1)
  assert.equal(rows.length, 2); assert.equal(rows[0].target_sales, 0); assert.equal(rows[1].target_sales, null)
})
test('⭐️解除後も全ての月の目標・備考を保持。再追加で再編集可能', async () => {
  await as('cast', () => db.query('update customers set is_starred=false where id=1'))
  assert.equal((await read('cast')).rows.filter(g => g.customer_id === 1).length, 2)
  assert.equal((await as('edit', () => db.query("update customer_monthly_goals set note='変更不可' where customer_id=1 returning *"))).rows.length, 0)
  await as('cast', () => db.query('update customers set is_starred=true where id=1'))
  assert.equal((await as('cast', () => db.query("update customer_monthly_goals set note='再開' where customer_id=1 returning *"))).rows.length, 2)
})
test('担当移動で旧キャストの目標が他キャストに漏れず、過去レコードは保持', async () => {
  await as('owner', () => db.query("update customers set cast_name='なみ' where id=4"))
  assert.equal((await read('cast')).rows.some(g => g.customer_id === 4), false)
  assert.equal((await read('other')).rows.some(g => g.customer_id === 4), false)
  await insert('other', 4, ids.other)
  assert.equal((await read('other')).rows.length, 1)
  assert.equal((await db.query('select count(*)::int as n from customer_monthly_goals where customer_id=4')).rows[0].n, 2)
})
test('公開前の読取りverificationはすべてtrue/0。DDL・DMLを含まない', async () => {
  const sql = fs.readFileSync('supabase/verification/20261103_v03138_customer_monthly_goals_verify.sql', 'utf8')
  assert.doesNotMatch(sql, /\b(?:insert into|update public|delete from|create table|alter table)\b/i)
  const policies = (await db.query("select qual,with_check from pg_policies where tablename='customer_monthly_goals'")).rows
  for (const policy of policies) for (const expression of [policy.qual, policy.with_check].filter(Boolean)) {
    assert.match(expression, /SELECT auth\.uid\(\)/)
    assert.doesNotMatch(expression.replace(/\(\s*SELECT auth\.uid\(\)\s+AS uid\s*\)/g, 'uid'), /auth\.uid\(\)/)
  }
  const results = await db.exec(sql)
  for (const result of results) for (const row of result.rows) for (const [key, value] of Object.entries(row)) assert.equal(String(value), key.endsWith('_must_be_zero') ? '0' : 'true', key)
})

function apiFixture({ role = 'cast', signedIn = true, canEdit = true, failTable = '', starred = true, conflict = false, customerRows, goalRows } = {}) {
  const calls = [], goal = { cast_id: ids.cast, customer_id: 1, month, target_sales: 100, target_visits: 1, note: '', revision: 1, updated_at: '2026-11-03T00:00:00Z' }
  const tables = { customers: customerRows ?? Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, cast_name: 'りな', is_starred: starred })), customer_monthly_goals: goalRows ?? [goal] }
  const matches = (row, filters) => filters.every(([key, value]) => Array.isArray(value) ? value.map(String).includes(String(row[key])) : String(row[key]) === String(value))
  class StarLogError extends Error { constructor(message, status) { super(message); this.status = status } }
  const client = { from(table) {
    const filters = [], builder = {
      select() { return this }, eq(k, v) { filters.push([k, v]); return this }, in(k, v) { filters.push([k, v]); return this }, gte() { return this }, lt() { return this }, lte() { return this }, or() { return this }, order() { return this },
      insert(v) { calls.push(['insert', table, v]); return this }, update(v) { calls.push(['update', table, v]); return this },
      async maybeSingle() {
        calls.push(['single', table, filters])
        if (table === 'profiles') return { data: { id: ids.cast, cast_name: 'りな', role: 'cast', is_active: true }, error: null }
        if (table === 'customers') return { data: tables.customers.find(row => matches(row, filters)) ?? null, error: null }
        return { data: conflict ? null : goal, error: null }
      },
      async range(from, to) {
        calls.push(['range', table, from, to, filters])
        if (table === failTable) return { data: null, error: { message: 'offline' } }
        if (table in tables) return { data: tables[table].filter(row => matches(row, filters)).slice(from, to + 1), error: null }
        const batchIds = filters.find(([k]) => k === 'customer_id')[1]
        return { data: batchIds.includes('1') ? Array.from({ length: 1005 }, () => ({ customer_id: 1, visit_date: '2026-11-02', amount_spent: 100, is_planned: false })).slice(from, to + 1) : [], error: null }
      },
    }; return builder
  } }
  const mocks = {
    'next/server': { NextResponse: Response },
    '@/lib/starLogServer': { StarLogError, starLogSession: async write => { if (!signedIn) throw new StarLogError('ログインしてください', 401); if (write && !canEdit) throw new StarLogError('権限がありません', 403); return { client, profile: { id: ids.cast, role }, canEdit } } },
    '@/lib/supabaseHelpers': (() => { const e = {}; vm.runInThisContext(`(function(exports){${compile('lib/supabaseHelpers.ts')}\n})`)(e); return e })(),
    '@/lib/dateUtils': { todayJST: () => '2026-11-03' }, '@/lib/starCustomerGoals': logic,
  }
  const exports = {}
  vm.runInThisContext(`(function(require,exports){${compile('app/api/customer-goals/route.ts')}\n})`)(name => mocks[name] ?? (() => { throw new Error(name) })(), exports)
  return { ...exports, calls, tables }
}
const request = (body, method = 'PUT') => new Request('https://example.test/api/customer-goals', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const goalInput = () => ({ castId: ids.cast, customerId: '1', month: '2026-11', targetSales: 100, targetVisits: null, note: '  月別メモ  ', expectedRevision: 2 })
test('APIは顧客1000名超と来店1000件超をページングし、他の月・担当と混ぜない', async () => {
  const api = apiFixture(), response = await api.GET(new Request(`https://example.test/api/customer-goals?castId=${ids.cast}&month=2026-11`)), data = await response.json()
  assert.equal(response.status, 200); assert.equal(data.customerIds.length, 1001)
  assert.deepEqual(data.actuals['1'], { sales: 100500, visits: 1005 })
  assert.equal(data.goals.length, 1)
  assert.ok(api.calls.filter(c => c[0] === 'range' && c[1] === 'customer_monthly_goals').every(c => c[4].some(([key, values]) => key === 'customer_id' && values.length <= 200)))
  assert.ok(api.calls.some(c => c[0] === 'range' && c[1] === 'customer_visits' && c[2] === 1000))
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
})
test('通常GETは現在の⭐️担当だけ。旧担当・未⭐️・別月をadminにも返さず、再⭐️で保存済み目標が復元', async () => {
  const saved = { cast_id: ids.cast, customer_id: 1, month, target_sales: 123456, target_visits: 2, note: '残す月別メモ', revision: 4 }
  const api = apiFixture({ role: 'admin', customerRows: [
    { id: 1, cast_name: 'りな', is_starred: true }, { id: 2, cast_name: 'りな', is_starred: false }, { id: 3, cast_name: 'なみ', is_starred: true },
  ], goalRows: [saved, { ...saved, customer_id: 2 }, { ...saved, customer_id: 3 }, { ...saved, cast_id: ids.other }, { ...saved, month: '2026-12-01' }] })
  const get = async () => (await api.GET(new Request(`https://example.test/api/customer-goals?castId=${ids.cast}&month=2026-11`))).json()
  const current = await get()
  assert.deepEqual(current.customerIds, ['1']); assert.deepEqual(current.goals, [saved]); assert.deepEqual(Object.keys(current.actuals), ['1'])
  api.tables.customers[0].is_starred = false
  const before = api.calls.length, empty = await get()
  assert.deepEqual(empty.goals, []); assert.deepEqual(empty.actuals, {}); assert.deepEqual(empty.customerIds, [])
  assert.ok(api.calls.slice(before).every(c => c[1] !== 'customer_visits' && c[1] !== 'customer_monthly_goals'))
  assert.equal(api.tables.customer_monthly_goals.length, 5)
  api.tables.customers[0].is_starred = true
  assert.deepEqual((await get()).goals, [saved])
  api.tables.customers[0].cast_name = 'なみ'
  assert.deepEqual((await get()).goals, [])
  assert.ok(api.calls.every(c => !['insert', 'update', 'delete'].includes(c[0])))
})
test('APIの権限/取得失敗を成功の0実績として返さない', async () => {
  for (const [options, cast, expected] of [[{ signedIn: false }, ids.cast, 401], [{}, ids.other, 403], [{ failTable: 'customer_visits' }, ids.cast, 503], [{ failTable: 'customer_monthly_goals' }, ids.cast, 503]]) {
    const response = await apiFixture(options).GET(new Request(`https://example.test/api/customer-goals?castId=${cast}&month=2026-11`))
    assert.equal(response.status, expected); assert.ok((await response.json()).error)
  }
})
test('保存APIの版競合・未⭐️・閲覧権限・担当範囲を検証し、更新は目標3列だけ', async () => {
  for (const [options, change, expected] of [[{ canEdit: false }, {}, 403], [{ starred: false }, {}, 409], [{ customerRows: [{ id: 1, cast_name: 'なみ', is_starred: true }] }, {}, 403], [{ conflict: true }, {}, 409], [{}, { castId: ids.other }, 403], [{}, { note: 'a'.repeat(2001) }, 400]]) {
    assert.equal((await apiFixture(options).PUT(request({ ...goalInput(), ...change }))).status, expected)
  }
  const api = apiFixture(), response = await api.PUT(request(goalInput()))
  assert.equal(response.status, 200)
  assert.deepEqual(api.calls.find(c => c[0] === 'update')[2], { target_sales: 100, target_visits: null, note: '月別メモ' })
  assert.ok(api.calls.find(c => c[0] === 'single' && c[1] === 'customer_monthly_goals')[2].some(([k, v]) => k === 'revision' && v === 2))
})
