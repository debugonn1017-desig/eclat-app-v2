import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const logic = {}
vm.runInThisContext(`(function(exports){${compile('lib/customerMeeting.ts')}\n})`)(logic)
const migration = fs.readdirSync('supabase/migrations').find(file => file.endsWith('_v03154_customer_meetings.sql'))
const repeatMigration = fs.readdirSync('supabase/migrations').find(file => file.endsWith('_v03156_customer_meeting_repeat.sql'))
const ids = Object.fromEntries(['owner', 'cast', 'other', 'read', 'edit', 'inactive'].map(key => [key, randomUUID()]))
const customer = { id: '1', customer_name: '会議のお客様', nickname: '', region: '福岡県', age_group: '40代前半', occupation: '会社員', cast_name: 'りな', nomination_status: '場内', is_starred: true, nomination_route: '紹介' }
const visit = { id: '11', customer_id: '1', visit_date: '2026-11-02', visit_time: '20:30:00', table_number: 'P1', party_size: 2, has_after: true, is_planned: false, amount_spent: 50000, nomination_status_at_visit: '場内' }
const values = logic.defaultMeetingValues(customer, visit)
const legacyValues = { ...values }; delete legacyValues.repeat
const schema2Headers = { 'X-Customer-Meeting-Schema': '2' }
const input = overrides => ({ customerId: '1', visitId: '11', expectedVisitDate: '2026-11-02', expectedRevision: 0, requestId: randomUUID(), values: { ...values, next_info: '次回の予定を確認' }, ...overrides })
let db, first, sourceBefore, legacyRecord, recordsBeforeMigration, recordsAfterMigration, securityBeforeMigration, securityAfterMigration
before(async () => {
  db = new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.actor',true),'')::uuid$$;
    create table profiles(id uuid primary key,cast_name text,display_name text,role text,is_active boolean,is_owner boolean);
    create table staff_permissions(staff_id uuid,permission text,enabled boolean);
    create table customers(id bigint primary key,customer_name text,nickname text,region text,age_group text,occupation text,cast_name text,nomination_status text,is_starred boolean,nomination_route text);
    create table customer_visits(id bigint primary key,customer_id bigint references customers(id),visit_date date,visit_time time,table_number text,party_size integer,has_after boolean,is_planned boolean,amount_spent integer);
    create table cast_extension_sales(id bigint primary key,amount integer);insert into cast_extension_sales values(1,90000);
    create table customer_memos(id bigint primary key,customer_id bigint,content text);insert into customer_memos values(1,1,'既存のメモを保持');
    grant usage on schema public,auth to authenticated,service_role;
    grant select on profiles,staff_permissions to authenticated;
    grant select,update,delete on customers,customer_visits to authenticated;
    grant select on cast_extension_sales,customer_memos to authenticated;`)
  for (const [key, id] of Object.entries(ids)) await db.query('insert into profiles values($1,$2,$3,$4,$5,$6)', [id, key === 'cast' ? 'りな' : key === 'other' ? 'なみ' : null, key, ['cast', 'other'].includes(key) ? 'cast' : 'admin', key !== 'inactive', key === 'owner'])
  await db.query("insert into staff_permissions values($1,'顧客.閲覧',true),($2,'顧客.編集',true)", [ids.read, ids.edit])
  for (let id = 1; id <= 6; id++) await db.query('insert into customers values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, 'お客様' + id, '', '福岡県', '40代前半', '会社員', id === 2 ? 'なみ' : 'りな', id === 4 ? '本指名' : '場内', id !== 3, '紹介'])
  for (const [id, cid, date, planned] of [[11, 1, '2026-11-02', false], [12, 1, '2026-11-02', false], [13, 1, '2026-11-02', false], [21, 2, '2026-11-02', false], [31, 3, '2026-11-02', false], [41, 4, '2026-11-02', false], [51, 5, '2026-11-02', false], [52, 5, '2026-11-02', false], [53, 5, '2026-11-02', false], [61, 6, '2026-11-02', false], [71, 1, '2026-11-02', true], [81, 1, '2099-11-02', false], [91, 1, '2026-11-01', false]]) await db.query('insert into customer_visits values($1,$2,$3,$4,$5,2,true,$6,50000)', [id, cid, date, '20:30', 'P1', planned])
  const old = fs.readFileSync('supabase/migrations/20261015133000_v03133_star_logs.sql', 'utf8')
  const access = old.slice(old.indexOf('create or replace function public.star_log_access'), old.indexOf('alter table public.customer_star_cycles'))
  await db.exec(access + `revoke all on function public.star_log_access(bigint,boolean) from public,anon;grant execute on function public.star_log_access(bigint,boolean) to authenticated,service_role;
    alter table customers enable row level security;alter table customer_visits enable row level security;
    create policy customer_read on customers for select to authenticated using(public.star_log_access(id,false));
    create policy customer_write on customers for update to authenticated using(public.star_log_access(id,true)) with check(public.star_log_access(id,true));
    create policy visits_read on customer_visits for select to authenticated using(public.star_log_access(customer_id,false));
    create policy visits_write on customer_visits for update to authenticated using(public.star_log_access(customer_id,true)) with check(public.star_log_access(customer_id,true));
    create policy visits_delete on customer_visits for delete to authenticated using(public.star_log_access(customer_id,true));`)
  await db.exec(fs.readFileSync('supabase/migrations/' + migration, 'utf8'))
  // 実際の移行順で旧17項目の記録を保存してから新migrationを適用する。
  legacyRecord = await save('cast', input({ customerId: '5', visitId: '52', values: { ...legacyValues } }))
  recordsBeforeMigration = await recordSnapshot()
  securityBeforeMigration = await securitySnapshot()
  await db.exec(fs.readFileSync('supabase/migrations/' + repeatMigration, 'utf8'))
  recordsAfterMigration = await recordSnapshot()
  securityAfterMigration = await securitySnapshot()
  sourceBefore = await sourceSnapshot()
})
after(async () => { await db?.close() })
async function as(user, fn, role = 'authenticated') {
  await db.query("select set_config('app.actor',$1,false)", [ids[user] || ''])
  await db.exec('set role ' + role)
  try { return await fn() } finally { await db.exec('reset role') }
}
async function save(user, payload = input()) {
  return (await as(user, () => db.query('select * from save_customer_meeting($1,$2,$3,$4,$5,$6)', [payload.customerId, payload.visitId, payload.expectedVisitDate, payload.expectedRevision, payload.requestId, payload.values]))).rows[0]
}
async function read(user, customerId = 1) { return (await as(user, () => db.query('select * from customer_meeting_records where customer_id=$1 order by created_at desc', [customerId]))).rows }
async function sourceSnapshot() { return (await db.query("select jsonb_build_object('customers',(select jsonb_agg(to_jsonb(c) order by id) from customers c),'visits',(select jsonb_agg(to_jsonb(v) order by id) from customer_visits v),'sales',(select jsonb_agg(to_jsonb(s) order by id) from cast_extension_sales s),'memos',(select jsonb_agg(to_jsonb(m) order by id) from customer_memos m)) as value")).rows[0].value }
async function recordSnapshot() { return (await db.query('select to_jsonb(r) as value from customer_meeting_records r order by id')).rows }
async function securitySnapshot() {
  return (await db.query(`select jsonb_build_object(
    'rls',(select relrowsecurity from pg_class where oid='public.customer_meeting_records'::regclass),
    'table_acl',(select relacl::text from pg_class where oid='public.customer_meeting_records'::regclass),
    'column_acl',(select jsonb_agg(jsonb_build_array(attname,attacl::text) order by attnum) from pg_attribute where attrelid='public.customer_meeting_records'::regclass and attnum>0),
    'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='public' and tablename='customer_meeting_records'),
    'trigger',(select pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.customer_meeting_records'::regclass and tgname='stamp_customer_meeting_record'),
    'guard_functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid) from pg_proc p where p.oid='public.star_log_access(bigint,boolean)'::regprocedure),
    'changed_function_acl',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.proacl::text,p.prosecdef,p.proconfig) order by p.oid) from pg_proc p where p.oid in ('public.customer_meeting_values_valid(jsonb)'::regprocedure,'public.stamp_customer_meeting_record()'::regprocedure,'public.save_customer_meeting(bigint,bigint,date,integer,uuid,jsonb)'::regprocedure))
  ) as value`)).rows[0].value
}

test('入力を厳密検証し会議金額を既存売上から初期化しない', () => {
  assert.equal(values.meeting_amount, null); assert.equal(values.meeting_unit_price, null)
  assert.equal(values.in_time, '20:30'); assert.equal(values.party_size, 2)
  assert.equal(logic.validateMeetingInput(input()), null)
  for (const patch of [{ customerId: '1.1' }, { visitId: '0' }, { expectedVisitDate: '2026-02-30' }, { expectedRevision: -1 }, { requestId: 'wrong' }, { actor_id: ids.owner }, { amount_spent: 10 }]) assert.ok(logic.validateMeetingInput(input(patch)))
  for (const patch of [{ in_time: '25:00' }, { party_size: 0 }, { party_size: 1.5 }, { meeting_amount: '500' }, { meeting_unit_price: -1 }, { next_info: 'あ'.repeat(4001) }, { thank_you: 'true' }, { amount_spent: 0 }]) assert.ok(logic.validateMeetingValues({ ...values, ...patch }))
})
test('本人保存でDBが人物・実来店・記録者・版を生成し、他担当へ漏れない', async () => {
  first = await save('cast')
  assert.equal(first.revision, 1); assert.equal(first.actor_id, ids.cast); assert.equal(first.actor_name, 'cast')
  assert.equal(first.customer_snapshot.customer_name, 'お客様1'); assert.equal(first.has_after, true)
  assert.equal((await read('other')).length, 0)
  await assert.rejects(save('other', input()), /編集できません/)
  await assert.rejects(save('cast', input({ customerId: '2', visitId: '21' })), /編集できません/)
})
test('再送と変更なし保存は重複しない。変更は追記、同版競合は拒否', async () => {
  const replay = input({ requestId: first.request_id, values: first.values })
  assert.equal((await save('cast', replay)).id, first.id)
  assert.equal((await save('cast', input({ expectedRevision: 1, values: first.values }))).id, first.id)
  const second = await save('edit', input({ expectedRevision: 1, values: { ...first.values, thank_you: true, meeting_amount: 999999, meeting_unit_price: 123 } }))
  assert.equal(second.revision, 2); assert.equal(second.actor_id, ids.edit); assert.equal((await read('cast')).length, 2)
  await assert.rejects(save('cast', input({ expectedRevision: 1 })), /変更されています/)
  await assert.rejects(save('cast', { ...replay, values: { ...first.values, rally: true } }), /別の入力/)
})
test('同日複数実来店は別visit。予定/未来/顧客不一致/初回非⭐を拒否', async () => {
  const otherVisit = await save('cast', input({ visitId: '12' }))
  assert.equal(otherVisit.revision, 1); assert.notEqual(otherVisit.id, first.id)
  for (const patch of [{ visitId: '71' }, { visitId: '81', expectedVisitDate: '2099-11-02' }, { customerId: '2' }, { customerId: '3', visitId: '31' }]) await assert.rejects(save('owner', input(patch)))
})
test('閲覧だけのスタッフは読むだけ。匿名/退店/監査列偽装/更新削除は禁止', async () => {
  assert.equal((await read('read')).length, 3)
  await assert.rejects(save('read', input({ visitId: '13' })), /編集できません/)
  assert.equal((await read('inactive')).length, 0)
  await assert.rejects(save('inactive', input({ visitId: '13' })), /編集できません/)
  await assert.rejects(as('', () => db.query('select * from customer_meeting_records'), 'anon'), /permission denied/)
  for (const sql of ['delete from customer_meeting_records', 'update customer_meeting_records set revision=100', "insert into customer_meeting_records(customer_id,visit_id,expected_visit_date,base_revision,request_id,\"values\",actor_name) values(1,13,'2026-11-02',0,gen_random_uuid(),'{}','偽装')"]) await assert.rejects(as('owner', () => db.exec(sql)), /permission denied/)
})
test('直接REST相当INSERTもtriggerで実来店・版・監査情報を検証する', async () => {
  const result = await as('cast', () => db.query('insert into customer_meeting_records(customer_id,visit_id,expected_visit_date,base_revision,request_id,"values") values(1,13,$1,0,$2,$3) returning *', ['2026-11-02', randomUUID(), values]))
  assert.equal(result.rows[0].actor_id, ids.cast); assert.equal(result.rows[0].revision, 1)
  await assert.rejects(as('cast', () => db.query('insert into customer_meeting_records(customer_id,visit_id,expected_visit_date,base_revision,request_id,"values") values(1,13,$1,0,$2,$3)', ['2026-11-02', randomUUID(), values])), /変更されています/)
})
test('会議保存は顧客・実来店・売上・既存メモを1列も書き換えない', async () => {
  assert.deepEqual(await sourceSnapshot(), sourceBefore)
})
test('全テキスト上限を日本語で満たしてもTS/DBの上限は一致する', async () => {
  const max = { ...values }
  for (const [key, limit] of Object.entries(logic.MEETING_TEXT_LIMITS)) max[key] = 'あ'.repeat(limit)
  assert.equal(logic.validateMeetingValues(max), null)
  assert.equal((await as('cast', () => db.query('select customer_meeting_values_valid($1) as ok', [max]))).rows[0].ok, true)
})
test('⭐解除後の初回は不可だが既存会議の訂正・履歴参照を保ち星を戻さない', async () => {
  await db.exec('update customers set is_starred=false where id=1')
  await assert.rejects(save('cast', input({ visitId: '91', expectedVisitDate: '2026-11-01' })), /初回記録/)
  const updated = await save('cast', input({ expectedRevision: 2, values: { ...first.values, contact_content: '解除後の訂正' } }))
  assert.equal(updated.revision, 3)
  assert.equal((await db.query('select is_starred from customers where id=1')).rows[0].is_starred, false)
  assert.equal((await read('read')).length, 5)
})
test('引継ぎ後は旧担当不可・現担当と権限スタッフが履歴を読み訂正できる', async () => {
  await save('cast', input({ customerId: '6', visitId: '61' }))
  await db.exec("update customers set cast_name='なみ' where id=6")
  assert.equal((await read('cast', 6)).length, 0); assert.equal((await read('other', 6)).length, 1); assert.equal((await read('read', 6)).length, 1)
  await assert.rejects(save('cast', input({ customerId: '6', visitId: '61', expectedRevision: 1 })), /編集できません/)
  assert.equal((await save('other', input({ customerId: '6', visitId: '61', expectedRevision: 1, values: { ...values, next_info: '新担当の会議' } }))).revision, 2)
})
test('既存来店削除を妨げず履歴を保持。削除/予定化/日付移動後は同入力を保存しない', async () => {
  await save('cast', input({ customerId: '5', visitId: '51' }))
  await as('cast', () => db.exec('delete from customer_visits where id=51'))
  assert.equal((await read('cast', 5)).filter(record => record.visit_id === 51).length, 1)
  await assert.rejects(save('cast', input({ customerId: '5', visitId: '51', expectedRevision: 1 })), /元の来店情報/)
  await db.exec("update customer_visits set visit_date='2026-11-03' where id=91")
  await assert.rejects(save('cast', input({ visitId: '91', expectedVisitDate: '2026-11-01' })), /元の来店情報/)
  await db.exec('update customer_visits set is_planned=true where id=12')
  await assert.rejects(save('cast', input({ visitId: '12', expectedRevision: 1 })), /元の来店情報/)
  assert.equal((await read('read')).some(record => record.visit_id === 12), true)
})

function load(file, mocks = {}) {
  const exports = {}
  vm.runInThisContext(`(function(require,exports){${compile(file)}\n})`)(name => { if (!(name in mocks)) throw new Error('unexpected import ' + name); return mocks[name] }, exports)
  return exports
}
const helpers = load('lib/supabaseHelpers.ts')
function apiFixture({ profile = { id: ids.cast, role: 'cast', cast_name: 'りな', is_active: true }, canEdit = true, customers, visits, records = [], failTable = '', rpcError = null, rpcImpl } = {}) {
  const datasets = {
    customers: customers || [{ ...customer, id: 1 }, { ...customer, id: 2, cast_name: 'なみ' }, { ...customer, id: 3, is_starred: false }, { ...customer, id: 4, nomination_status: '本指名' }],
    customer_visits: visits || [{ ...visit, id: 11, customer_id: 1 }, { ...visit, id: 12, customer_id: 1 }, { ...visit, id: 15, customer_id: 1, visit_date: '2026-11-04' }, { ...visit, id: 71, customer_id: 1, is_planned: true }, { ...visit, id: 21, customer_id: 2 }, { ...visit, id: 31, customer_id: 3 }, { ...visit, id: 41, customer_id: 4, nomination_status_at_visit: '本指名' }],
    customer_meeting_records: records,
  }, calls = []
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status } }
  const allowed = row => profile.role !== 'cast' || datasets.customers.some(c => String(c.id) === String(row.customer_id ?? row.id) && c.cast_name === profile.cast_name)
  function from(table) {
    const filters = [], orders = [], call = { table, columns: '', range: null, equalities: [] }; calls.push(call)
    const result = () => {
      if (failTable === table) return { data: null, error: { message: 'fixture DB unavailable' } }
      let rows = (datasets[table] || []).filter(allowed).filter(row => filters.every(filter => filter(row)))
      for (const [key, asc] of orders.slice().reverse()) rows.sort((a, b) => (String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'en', { numeric: true })) * (asc ? 1 : -1))
      if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1)
      return { data: rows, error: null }
    }
    const query = {
      select(columns) { call.columns = columns; return query },
      eq(key, value) { call.equalities.push([key, value]); filters.push(row => String(row[key]) === String(value)); return query },
      in(key, values) { filters.push(row => values.map(String).includes(String(row[key]))); return query },
      lte(key, value) { filters.push(row => row[key] <= value); return query },
      gte(key, value) { filters.push(row => row[key] >= value); return query },
      or(value) { assert.equal(value, 'is_planned.is.null,is_planned.eq.false'); filters.push(row => row.is_planned == null || row.is_planned === false); return query },
      order(key, { ascending = true } = {}) { orders.push([key, ascending]); return query },
      range(from, to) { call.range = [from, to]; return query },
      async maybeSingle() { const value = result(); return { ...value, data: value.data?.[0] || null } },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
    }
    return query
  }
  const client = { from, async rpc(name, args) { calls.push({ rpc: name, args }); if (rpcImpl) return rpcImpl(name, args); return { error: rpcError, data: rpcError ? null : { id: randomUUID(), customer_id: args.p_customer_id, visit_id: args.p_visit_id, visit_date: args.p_expected_visit_date, revision: args.p_expected_revision + 1, customer_snapshot: { ...customer, id: args.p_customer_id }, values: args.p_values, actor_id: profile.id, actor_name: 'fixture', created_at: new Date().toISOString(), has_after: true, request_id: args.p_request_id } } } }
  const common = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/starLogServer': { StarLogError: ApiError, starLogSession: async write => { if (write && !canEdit) throw new ApiError('顧客の権限がありません', 403); return { client, profile, canEdit } } },
    '@/lib/supabaseHelpers': helpers, '@/lib/customerMeeting': logic, '@/lib/dateUtils': { todayJST: () => '2026-11-05' },
  }
  const shared = load('app/api/customer-meetings/shared.ts', common)
  const list = load('app/api/customer-meetings/route.ts', { ...common, './shared': shared })
  const history = load('app/api/customer-meetings/history/route.ts', { ...common, '../shared': shared })
  return { list, history, calls, datasets }
}
const historyRecord = (overrides = {}) => ({ id: randomUUID(), customer_id: 1, visit_id: 11, visit_date: '2026-11-02', revision: 1, actor_id: ids.cast, actor_name: 'りな', created_at: '2026-11-03T00:00:00Z', customer_snapshot: { ...customer }, has_after: true, values: { ...values }, request_id: randomUUID(), ...overrides })

test('一覧APIは指定日に場内として記録された⭐実来店だけ・同日2visit・後日の再来店を除外理由にしない', async () => {
  const f = apiFixture(), response = await f.list.GET(new Request('https://example.test/api/customer-meetings?date=2026-11-02'))
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(data.rows.map(row => row.visit.id), ['11', '12'])
  assert.deepEqual(data.rows.map(row => row.customer.id), ['1', '1'])
  assert(data.rows.every(row => row.record === null && row.values.meeting_amount === null))
  assert.match(response.headers.get('cache-control'), /private.*no-store/)
  assert(f.calls.filter(call => call.table === 'customer_visits').every(call => !/amount_spent|cast_name|nomination_status/.test(call.columns)))
  assert(f.calls.filter(call => call.table === 'customer_visits').every(call => call.equalities.some(([key, value]) => key === 'nomination_status_at_visit' && value === '場内')))
  const writes = f.calls.filter(call => call.rpc)
  assert.equal(writes.length, 0)
})
test('会議一覧は当日場内の記録だけを採用し、本指名化後・同日混在・未知の旧行を区別する', async () => {
  const f = apiFixture({
    customers: [{ ...customer, id: 1, nomination_status: '本指名' }, { ...customer, id: 2, nomination_status: '本指名' }, { ...customer, id: 3 }, { ...customer, id: 4 }],
    visits: [
      { ...visit, id: 11, customer_id: 1 },
      { ...visit, id: 12, customer_id: 1, nomination_status_at_visit: '本指名' },
      { ...visit, id: 13, customer_id: 1, visit_date: '2026-11-04', nomination_status_at_visit: '本指名' },
      { ...visit, id: 21, customer_id: 2, nomination_status_at_visit: '本指名' },
      { ...visit, id: 31, customer_id: 3, nomination_status_at_visit: null },
      { ...visit, id: 41, customer_id: 4, nomination_status_at_visit: 'フリー' },
      { ...visit, id: 42, customer_id: 4, is_planned: true },
    ],
    records: [historyRecord({ visit_id: 12 })],
  })
  const before = JSON.stringify(f.datasets)
  const response = await f.list.GET(new Request('https://example.test/api/customer-meetings?date=2026-11-02'))
  assert.equal(response.status, 200)
  const list = await response.json()
  assert.deepEqual(list.rows.map(row => row.visit.id), ['11'])
  assert.equal(list.rows[0].customer.nomination_status, '本指名')
  assert.equal(list.rows[0].canEdit, true)
  // 表示対象外の本指名来店も、通常ログの未記録候補・保存済み履歴では保持する。
  const history = await f.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=1')).then(r => r.json())
  assert.deepEqual(history.rows.map(row => row.visit.id), ['11', '12', '13'])
  assert.deepEqual(history.records.map(record => record.visit_id), ['12'])
  assert.equal(JSON.stringify(f.datasets), before)
  assert.equal(f.calls.filter(call => call.rpc).length, 0)
})
test('一覧APIは1000件超の実来店を省略せず、取得失敗を空として返さない', async () => {
  const f = apiFixture({ visits: Array.from({ length: 1005 }, (_, index) => ({ ...visit, id: 1000 + index, customer_id: 1 })) })
  const response = await f.list.GET(new Request('https://example.test/api/customer-meetings?date=2026-11-02'))
  assert.equal((await response.json()).rows.length, 1005)
  assert.equal(f.calls.filter(call => call.table === 'customer_visits').length, 2)
  const failed = apiFixture({ failTable: 'customer_visits' })
  assert.equal((await failed.list.GET(new Request('https://example.test/api/customer-meetings?date=2026-11-02'))).status, 503)
})
test('履歴APIは⭐解除後・削除済visitも保持し閲覧だけで何も記録しない', async () => {
  const old = historyRecord({ customer_id: 3, visit_id: 99 }), live = historyRecord({ customer_id: 3, visit_id: 31 })
  const f = apiFixture({ records: [old, live] })
  const response = await f.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=3')), data = await response.json()
  assert.equal(response.status, 200); assert.equal(data.records.length, 2)
  assert.deepEqual(data.rows.map(row => row.visit.id), ['31'])
  assert.equal(f.calls.filter(call => call.rpc).length, 0)
  assert.equal((await apiFixture().history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=1')).then(r => r.json())).records.length, 0)
})
test('元来店の日付変更は旧ログを保ち、一覧は新日付行を隠さず編集不可にする', async () => {
  const f = apiFixture({ records: [historyRecord({ visit_date: '2026-11-01' })] })
  const list = await f.list.GET(new Request('https://example.test/api/customer-meetings?date=2026-11-02')).then(r => r.json())
  const row = list.rows.find(row => row.visit.id === '11')
  assert.equal(row.canEdit, false); assert.equal(row.record, null); assert.ok(row.unavailableReason)
  const history = await f.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=1')).then(r => r.json())
  assert.equal(history.records.length, 1)
  assert.deepEqual(history.rows.map(row => row.visit.id), ['12', '15'])
  assert(!history.rows.some(row => row.visit.id === '11'), '日付変更された記録は編集候補へ戻さない')
})
test('APIは顧客/担当/権限/無効profileを再検証し他担当保存や不正日付を拒否', async () => {
  const f = apiFixture()
  assert.equal((await f.list.GET(new Request('https://example.test/api/customer-meetings?date=2026-11-02&castName=なみ'))).status, 403)
  for (const date of ['2026-02-30', '2026-11-06', 'wrong']) assert.equal((await f.list.GET(new Request('https://example.test/api/customer-meetings?date=' + date))).status, 400)
  assert.equal((await f.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=2'))).status, 403)
  assert.equal((await f.list.PUT(new Request('https://example.test/api/customer-meetings', { method: 'PUT', body: JSON.stringify(input({ customerId: '2', visitId: '21' })) }))).status, 403)
  const readonly = apiFixture({ canEdit: false })
  assert.equal((await readonly.list.PUT(new Request('https://example.test/api/customer-meetings', { method: 'PUT', body: JSON.stringify(input()) }))).status, 403)
  const inactive = apiFixture({ profile: { id: ids.inactive, role: 'admin', is_active: false } })
  assert.equal((await inactive.list.GET(new Request('https://example.test/api/customer-meetings?date=2026-11-02'))).status, 401)
})
test('PUTは会議専用RPCだけで1visitを保存しexpectedVisitDate/版を渡す', async () => {
  const f = apiFixture(), payload = input()
  const response = await f.list.PUT(new Request('https://example.test/api/customer-meetings', { method: 'PUT', body: JSON.stringify(payload) }))
  assert.equal(response.status, 200)
  const record = (await response.json()).record
  assert.equal(record.customer_id, '1'); assert.equal(record.visit_id, '11')
  const writes = f.calls.filter(call => call.rpc)
  assert.equal(writes.length, 1); assert.equal(writes[0].rpc, 'save_customer_meeting')
  assert.equal(writes[0].args.p_expected_visit_date, payload.expectedVisitDate)
  assert.equal(writes[0].args.p_expected_revision, 0)
  assert.deepEqual(writes[0].args.p_values, payload.values)
  const conflict = apiFixture({ rpcError: { code: '40001', message: 'source changed' } })
  assert.equal((await conflict.list.PUT(new Request('https://example.test/api/customer-meetings', { method: 'PUT', body: JSON.stringify(payload) }))).status, 409)
})
test('公開前verificationの全項目がtrueで、検証自体にDMLがない', async () => {
  const sql = fs.readFileSync('supabase/verification/20261105_v03154_customer_meetings_verify.sql', 'utf8')
  assert.doesNotMatch(sql, /\b(?:insert into|update public|delete from|create table|alter table)\b/i)
  for (const result of await db.exec(sql)) for (const row of result.rows) assert.equal(row.ok, true, row.check_name)
})

test('repeat導入は旧17項目の履歴・権限・RLS・監査trigger構造を変更しない', () => {
  assert.equal(Object.hasOwn(legacyRecord.values, 'repeat'), false)
  assert.deepEqual(recordsAfterMigration, recordsBeforeMigration)
  assert.deepEqual(securityAfterMigration, securityBeforeMigration)
  const normalised = logic.normaliseMeetingRecord(legacyRecord)
  assert.equal(normalised.values.repeat, false)
  assert.equal(Object.hasOwn(legacyRecord.values, 'repeat'), false, '読取り補完が元のJSONを変更しない')
})
test('repeatは旧17/新18項目をTSとDBで受け入れ、boolean以外・他項目欠落は拒否する', async () => {
  assert.equal(values.repeat, false)
  for (const value of [legacyValues, values, { ...values, repeat: true }]) {
    assert.equal(logic.validateMeetingValues(value), null)
    assert.equal((await db.query('select customer_meeting_values_valid($1) as ok', [value])).rows[0].ok, true)
  }
  const missing = { ...values }; delete missing.action
  for (const value of [missing, { ...legacyValues, unknown: false }, ...[null, 'true', 0, [], {}].map(repeat => ({ ...values, repeat }))]) {
    assert.ok(logic.validateMeetingValues(value))
    assert.equal((await db.query('select customer_meeting_values_valid($1) as ok', [value])).rows[0].ok, false)
  }
})
test('旧UUID再送/新形式への再送とfalse補完だけの保存で新しい版を作らない', async () => {
  const payload = input({ customerId: '5', visitId: '52', requestId: legacyRecord.request_id, values: legacyValues })
  assert.equal((await save('cast', payload)).id, legacyRecord.id)
  assert.equal((await save('cast', { ...payload, values: { ...legacyValues, repeat: false } })).id, legacyRecord.id)
  assert.equal((await save('cast', { ...payload, expectedRevision: 1, requestId: randomUUID(), values: { ...legacyValues, repeat: false } })).id, legacyRecord.id)
  assert.equal((await read('cast', 5)).filter(record => record.visit_id === 52).length, 1)
})
test('repeat trueは追記保存。旧端末の他項目訂正ではtrueを保ち、明示falseの訂正だけで解除する', async () => {
  const sources = await sourceSnapshot()
  const repeated = await save('cast', input({ customerId: '5', visitId: '52', expectedRevision: 1, values: { ...legacyValues, repeat: true } }))
  assert.equal(repeated.revision, 2); assert.equal(repeated.values.repeat, true)
  const oldRequest = input({ customerId: '5', visitId: '52', expectedRevision: 2, values: { ...legacyValues, next_info: '旧端末からの情報訂正' } })
  const edited = await save('cast', oldRequest)
  assert.equal(edited.revision, 3); assert.equal(edited.values.repeat, true)
  assert.equal((await save('cast', oldRequest)).id, edited.id)
  assert.equal((await save('cast', { ...oldRequest, values: { ...oldRequest.values, repeat: true } })).id, edited.id)
  await assert.rejects(save('cast', { ...oldRequest, values: { ...oldRequest.values, repeat: false } }), /別の入力/)
  await assert.rejects(save('other', input({ customerId: '5', visitId: '52', expectedRevision: 3, values: edited.values })), /編集できません/)
  await assert.rejects(save('read', input({ customerId: '5', visitId: '52', expectedRevision: 3, values: edited.values })), /編集できません/)
  const cleared = await save('cast', input({ customerId: '5', visitId: '52', expectedRevision: 3, values: { ...edited.values, repeat: false } }))
  assert.equal(cleared.revision, 4); assert.equal(cleared.values.repeat, false)
  const records = await read('cast', 5)
  assert.deepEqual(records.find(record => record.id === legacyRecord.id), legacyRecord)
  assert.deepEqual(records.find(record => record.id === repeated.id), repeated)
  assert.deepEqual(await sourceSnapshot(), sources, '顧客・実来店・売上・既存メモを変更しない')
})
test('移行後も旧形式の初回保存を受け付け、欠落repeatを過去行へ書き足さない', async () => {
  const saved = await save('cast', input({ customerId: '5', visitId: '53', values: legacyValues }))
  assert.equal(saved.revision, 1); assert.equal(Object.hasOwn(saved.values, 'repeat'), false)
  assert.equal(logic.normaliseMeetingRecord(saved).values.repeat, false)
  assert.equal((await save('cast', input({ customerId: '5', visitId: '53', expectedRevision: 1, values: { ...legacyValues, repeat: false } }))).id, saved.id)
})
test('通常ログAPIは編集可能な現在⭐場内の未記録実来店を全件返し、予定/未来/他顧客/古い不適格日を除く', async () => {
  const f = apiFixture({ visits: [visit, { ...visit, id: '12', visit_date: '2026-11-04' }, { ...visit, id: '71', is_planned: true }, { ...visit, id: '81', visit_date: '2099-11-02' }, { ...visit, id: '91', visit_date: '1999-12-31' }, { ...visit, id: '21', customer_id: '2' }] })
  const response = await f.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=1', { headers: schema2Headers }))
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(data.rows.map(row => row.visit.id), ['11', '12'])
  assert(data.rows.every(row => row.record === null && row.canEdit && row.values.repeat === false))
  assert.equal(data.records.length, 0)
  assert.equal(f.calls.filter(call => call.rpc).length, 0)
  assert(f.calls.filter(call => call.table === 'customer_visits').every(call => !/amount_spent/.test(call.columns)))
})
test('通常ログAPIの新規候補は閲覧専用/非⭐/フリーに返さず、保存済み履歴の訂正だけを維持', async () => {
  const record = historyRecord()
  const readonly = await apiFixture({ canEdit: false, records: [record] }).history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=1')).then(r => r.json())
  assert.equal(readonly.canEdit, false); assert.deepEqual(readonly.rows.map(row => row.visit.id), ['11'])
  assert(readonly.rows.every(row => !row.canEdit))
  for (const patch of [{ is_starred: false }, { nomination_status: 'フリー' }]) {
    const f = apiFixture({ customers: [{ ...customer, id: 1, ...patch }], records: [record] })
    const data = await f.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=1')).then(r => r.json())
    assert.deepEqual(data.rows.map(row => row.visit.id), ['11']); assert.equal(data.rows[0].canEdit, true)
    assert.equal(data.records.length, 1)
  }
})
test('通常ログAPIも1000件超はページ取得し、失敗は部分一覧で成功させない', async () => {
  const visits = Array.from({ length: 1005 }, (_, index) => ({ ...visit, id: 1000 + index }))
  const f = apiFixture({ visits })
  const response = await f.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=1'))
  assert.equal((await response.json()).rows.length, 1005)
  assert.equal(f.calls.filter(call => call.table === 'customer_visits').length, 2)
  const failed = apiFixture({ failTable: 'customer_visits' })
  assert.equal((await failed.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=1'))).status, 503)
})
test('APIの旧履歴はrepeat=falseを補完し、旧保存requestも受理する。元JSONは不変更', async () => {
  const old = historyRecord({ values: { ...legacyValues } }), snapshot = JSON.stringify(old)
  const f = apiFixture({ records: [old] })
  const data = await f.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=1', { headers: schema2Headers })).then(r => r.json())
  assert.equal(data.records[0].values.repeat, false); assert.equal(data.rows.find(row => row.visit.id === '11').values.repeat, false)
  assert.equal(JSON.stringify(old), snapshot)
  const saved = await f.list.PUT(new Request('https://example.test/api/customer-meetings', { method: 'PUT', headers: schema2Headers, body: JSON.stringify(input({ values: { ...legacyValues } })) }))
  assert.equal(saved.status, 200); assert.equal((await saved.json()).record.values.repeat, false)
  assert.equal(Object.hasOwn(f.calls.find(call => call.rpc).args.p_values, 'repeat'), false, 'RPCに旧形式の欠落をそのまま渡し既存trueを保持できるようにする')
})
test('⭐本指名も初回会議を保存でき、場内→本指名変更後の追記でも元顧客・来店・売上は不変', async () => {
  const sources = await sourceSnapshot()
  const saved = await save('cast', input({ customerId: '4', visitId: '41', values: { ...values, repeat: true } }))
  assert.equal(saved.revision, 1); assert.equal(saved.customer_snapshot.nomination_status, '本指名')
  assert.deepEqual(await sourceSnapshot(), sources)
  await db.exec("update customers set nomination_status='本指名' where id=6")
  const afterPromotion = await sourceSnapshot()
  const revised = await save('other', input({ customerId: '6', visitId: '61', expectedRevision: 2, values: { ...values, next_info: '本指名変更後も会議を続ける' } }))
  assert.equal(revised.revision, 3); assert.equal(revised.customer_snapshot.nomination_status, '本指名')
  assert.deepEqual(await sourceSnapshot(), afterPromotion)
  await db.exec("update customers set nomination_status='場内' where id=6")
})
test('⭐本指名の未記録実来店も通常ログへ返すが、同じ来店の非⭐/フリーを一覧へ混ぜない', async () => {
  const f = apiFixture({ customers: [{ ...customer, id: 1, nomination_status: '本指名' }, { ...customer, id: 2, nomination_status: 'フリー' }, { ...customer, id: 3, nomination_status: '本指名', is_starred: false }], visits: [{ ...visit, id: 11, customer_id: 1 }, { ...visit, id: 21, customer_id: 2 }, { ...visit, id: 31, customer_id: 3 }] })
  const history = await f.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=1')).then(r => r.json())
  assert.deepEqual(history.rows.map(row => row.visit.id), ['11']); assert.equal(history.rows[0].canEdit, true)
  const list = await f.list.GET(new Request('https://example.test/api/customer-meetings?date=2026-11-02')).then(r => r.json())
  assert.deepEqual(list.rows.map(row => row.customer.id), ['1']); assert.equal(list.rows[0].customer.nomination_status, '本指名')
})
test('repeat migrationの再適用も履歴を更新せず、認可・監査構造を保持する', async () => {
  const beforeRecords = await recordSnapshot(), beforeSources = await sourceSnapshot(), beforeSecurity = await securitySnapshot()
  await db.exec(fs.readFileSync('supabase/migrations/' + repeatMigration, 'utf8'))
  assert.deepEqual(await recordSnapshot(), beforeRecords)
  assert.deepEqual(await sourceSnapshot(), beforeSources)
  assert.deepEqual(await securitySnapshot(), beforeSecurity)
})
test('repeat verification全11項目と前後snapshotが読取り専用で成功する', async () => {
  const verification = fs.readFileSync('supabase/verification/20261106_v03156_customer_meeting_repeat_verify.sql', 'utf8')
  const snapshot = fs.readFileSync('supabase/verification/20261106_v03156_customer_meeting_repeat_snapshot.sql', 'utf8')
  for (const sql of [verification, snapshot]) assert.doesNotMatch(sql, /\b(?:insert into|update public|delete from|create table|alter table)\b/i)
  let checks = 0
  for (const result of await db.exec(verification)) for (const row of result.rows) { checks++; assert.equal(row.ok, true, row.check_name) }
  assert.equal(checks, 11)
  const before = await db.exec(snapshot)
  await db.exec(fs.readFileSync('supabase/migrations/' + repeatMigration, 'utf8'))
  const after = await db.exec(snapshot)
  assert.deepEqual(after.map(result => result.rows), before.map(result => result.rows))
})
test('旧GET/PUTは全valuesが17項目で旧validatorを通り、旧保存はDBのtrueを消さず、新schemaだけ18項目を返す', async () => {
  const assertLegacy = value => {
    assert.equal(Object.keys(value).length, 17)
    assert.equal(Object.hasOwn(value, 'repeat'), false)
    assert.equal(logic.validateMeetingValues(value), null)
  }
  const current = (await read('cast', 5)).filter(record => record.visit_id === 52).sort((a, b) => b.revision - a.revision)[0]
  const repeated = await save('cast', input({ customerId: '5', visitId: '52', expectedRevision: current.revision, values: { ...current.values, repeat: true } }))
  // PGliteの日付型をPostgRESTと同じdate文字列にしてAPI境界へ渡す。
  const restRecord = record => ({ ...record, visit_date: record.visit_date instanceof Date ? record.visit_date.toISOString().slice(0, 10) : record.visit_date.slice(0, 10) })
  const f = apiFixture({ customers: [{ ...customer, id: 5 }], visits: [{ ...visit, id: 52, customer_id: 5 }], records: (await read('cast', 5)).map(restRecord), rpcImpl: async (name, args) => {
    assert.equal(name, 'save_customer_meeting')
    const result = await as('cast', () => db.query('select * from save_customer_meeting($1,$2,$3,$4,$5,$6)', [args.p_customer_id, args.p_visit_id, args.p_expected_visit_date, args.p_expected_revision, args.p_request_id, args.p_values]))
    return { data: restRecord(result.rows[0]), error: null }
  } })
  const source = JSON.stringify(f.datasets.customer_meeting_records)
  const list = await f.list.GET(new Request('https://example.test/api/customer-meetings?date=2026-11-02')).then(r => r.json())
  assertLegacy(list.rows[0].values); assertLegacy(list.rows[0].record.values)
  const legacyHistory = await f.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=5'))
  assert.match(legacyHistory.headers.get('cache-control'), /private.*no-store/)
  assert.deepEqual(legacyHistory.headers.get('vary').toLowerCase().split(',').map(value => value.trim()).sort(), ['cookie', 'x-customer-meeting-schema'])
  const history = await legacyHistory.json()
  history.records.forEach(record => assertLegacy(record.values))
  history.rows.forEach(row => { assertLegacy(row.values); if (row.record) assertLegacy(row.record.values) })
  const modernList = await f.list.GET(new Request('https://example.test/api/customer-meetings?date=2026-11-02', { headers: schema2Headers })).then(r => r.json())
  assert.equal(modernList.rows[0].values.repeat, true); assert.equal(modernList.rows[0].record.values.repeat, true)
  const modernHistory = await f.history.GET(new Request('https://example.test/api/customer-meetings/history?customerId=5', { headers: schema2Headers })).then(r => r.json())
  assert.equal(modernHistory.records.find(record => record.id === repeated.id).values.repeat, true)
  assert.equal(modernHistory.rows[0].values.repeat, true)
  assert.equal(JSON.stringify(f.datasets.customer_meeting_records), source, '応答変換が保存済みオブジェクトを変更しない')
  const oldPayload = input({ customerId: '5', visitId: '52', expectedRevision: repeated.revision, values: { ...legacyValues, next_info: '旧画面から訂正' } })
  const oldSavedResponse = await f.list.PUT(new Request('https://example.test/api/customer-meetings', { method: 'PUT', body: JSON.stringify(oldPayload) }))
  assert.equal(oldSavedResponse.status, 200)
  const oldSaved = (await oldSavedResponse.json()).record; assertLegacy(oldSaved.values)
  const persisted = (await read('cast', 5)).find(record => record.id === oldSaved.id)
  assert.equal(persisted.values.repeat, true); assert.equal(persisted.values.next_info, '旧画面から訂正')
  assert.equal(Object.hasOwn(f.calls.find(call => call.rpc).args.p_values, 'repeat'), false)
  const modernSavedResponse = await f.list.PUT(new Request('https://example.test/api/customer-meetings', { method: 'PUT', headers: schema2Headers, body: JSON.stringify(input({ customerId: '5', visitId: '52', expectedRevision: persisted.revision, values: { ...persisted.values, repeat: false } })) }))
  assert.equal(modernSavedResponse.status, 200)
  const modernSaved = (await modernSavedResponse.json()).record
  assert.equal(Object.keys(modernSaved.values).length, 18); assert.equal(modernSaved.values.repeat, false)
})
test('新hookはGET/PUTともschema2を要求し、旧形式入力へrepeatを勝手に補完しない', async () => {
  const effects = [], calls = []
  const hooks = load('hooks/useCustomerMeeting.ts', {
    react: { useCallback: fn => fn, useEffect: effect => effects.push(effect), useRef: current => ({ current }), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] },
    '@/lib/customerMeeting': logic,
  })
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window
  globalThis.window = { dispatchEvent: () => true }
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (options.method === 'PUT') {
      const payload = JSON.parse(options.body)
      return Response.json({ record: historyRecord({ customer_id: payload.customerId, visit_id: payload.visitId, values: { ...payload.values, repeat: false } }) })
    }
    return Response.json({ date: '2026-11-02', castName: '', rows: [], canEdit: true })
  }
  try {
    hooks.useCustomerMeetingList({ date: '2026-11-02' })
    effects[0](); const cleanup = effects[1]()
    await new Promise(resolve => setImmediate(resolve)); cleanup()
    await hooks.saveCustomerMeeting(input({ values: { ...legacyValues } }))
    assert.equal(calls.length, 2)
    assert(calls.every(call => new Headers(call.options.headers).get('X-Customer-Meeting-Schema') === '2'))
    assert.equal(calls[1].options.method, 'PUT')
    assert.equal(Object.hasOwn(JSON.parse(calls[1].options.body).values, 'repeat'), false)
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow
  }
})
