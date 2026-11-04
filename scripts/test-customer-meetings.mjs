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
const ids = Object.fromEntries(['owner', 'cast', 'other', 'read', 'edit', 'inactive'].map(key => [key, randomUUID()]))
const customer = { id: '1', customer_name: '会議のお客様', nickname: '', region: '福岡県', age_group: '40代前半', occupation: '会社員', cast_name: 'りな', nomination_status: '場内', is_starred: true, nomination_route: '紹介' }
const visit = { id: '11', customer_id: '1', visit_date: '2026-11-02', visit_time: '20:30:00', table_number: 'P1', party_size: 2, has_after: true, is_planned: false, amount_spent: 50000 }
const values = logic.defaultMeetingValues(customer, visit)
const input = overrides => ({ customerId: '1', visitId: '11', expectedVisitDate: '2026-11-02', expectedRevision: 0, requestId: randomUUID(), values: { ...values, next_info: '次回の予定を確認' }, ...overrides })
let db, first, sourceBefore
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
  for (const [id, cid, date, planned] of [[11, 1, '2026-11-02', false], [12, 1, '2026-11-02', false], [13, 1, '2026-11-02', false], [21, 2, '2026-11-02', false], [31, 3, '2026-11-02', false], [41, 4, '2026-11-02', false], [51, 5, '2026-11-02', false], [61, 6, '2026-11-02', false], [71, 1, '2026-11-02', true], [81, 1, '2099-11-02', false], [91, 1, '2026-11-01', false]]) await db.query('insert into customer_visits values($1,$2,$3,$4,$5,2,true,$6,50000)', [id, cid, date, '20:30', 'P1', planned])
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
test('同日複数実来店は別visit。予定/未来/顧客不一致/初回非⭐場内を拒否', async () => {
  const otherVisit = await save('cast', input({ visitId: '12' }))
  assert.equal(otherVisit.revision, 1); assert.notEqual(otherVisit.id, first.id)
  for (const patch of [{ visitId: '71' }, { visitId: '81', expectedVisitDate: '2099-11-02' }, { customerId: '2' }, { customerId: '3', visitId: '31' }, { customerId: '4', visitId: '41' }]) await assert.rejects(save('owner', input(patch)))
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
  assert.equal((await read('cast', 5)).length, 1)
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
function apiFixture({ profile = { id: ids.cast, role: 'cast', cast_name: 'りな', is_active: true }, canEdit = true, customers, visits, records = [], failTable = '', rpcError = null } = {}) {
  const datasets = {
    customers: customers || [{ ...customer, id: 1 }, { ...customer, id: 2, cast_name: 'なみ' }, { ...customer, id: 3, is_starred: false }, { ...customer, id: 4, nomination_status: '本指名' }],
    customer_visits: visits || [{ ...visit, id: 11, customer_id: 1 }, { ...visit, id: 12, customer_id: 1 }, { ...visit, id: 15, customer_id: 1, visit_date: '2026-11-04' }, { ...visit, id: 71, customer_id: 1, is_planned: true }, { ...visit, id: 21, customer_id: 2 }, { ...visit, id: 31, customer_id: 3 }, { ...visit, id: 41, customer_id: 4 }],
    customer_meeting_records: records,
  }, calls = []
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status } }
  const allowed = row => profile.role !== 'cast' || datasets.customers.some(c => String(c.id) === String(row.customer_id ?? row.id) && c.cast_name === profile.cast_name)
  function from(table) {
    const filters = [], orders = [], call = { table, columns: '', range: null }; calls.push(call)
    const result = () => {
      if (failTable === table) return { data: null, error: { message: 'fixture DB unavailable' } }
      let rows = (datasets[table] || []).filter(allowed).filter(row => filters.every(filter => filter(row)))
      for (const [key, asc] of orders.slice().reverse()) rows.sort((a, b) => (String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'en', { numeric: true })) * (asc ? 1 : -1))
      if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1)
      return { data: rows, error: null }
    }
    const query = {
      select(columns) { call.columns = columns; return query },
      eq(key, value) { filters.push(row => String(row[key]) === String(value)); return query },
      in(key, values) { filters.push(row => values.map(String).includes(String(row[key]))); return query },
      lte(key, value) { filters.push(row => row[key] <= value); return query },
      or(value) { assert.equal(value, 'is_planned.is.null,is_planned.eq.false'); filters.push(row => row.is_planned == null || row.is_planned === false); return query },
      order(key, { ascending = true } = {}) { orders.push([key, ascending]); return query },
      range(from, to) { call.range = [from, to]; return query },
      async maybeSingle() { const value = result(); return { ...value, data: value.data?.[0] || null } },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
    }
    return query
  }
  const client = { from, async rpc(name, args) { calls.push({ rpc: name, args }); return { error: rpcError, data: rpcError ? null : { id: randomUUID(), customer_id: args.p_customer_id, visit_id: args.p_visit_id, visit_date: args.p_expected_visit_date, revision: args.p_expected_revision + 1, customer_snapshot: { ...customer, id: args.p_customer_id }, values: args.p_values, actor_id: profile.id, actor_name: 'fixture', created_at: new Date().toISOString(), has_after: true, request_id: args.p_request_id } } } }
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

test('一覧APIは指定日の⭐場内実来店だけ・同日2visit・後日の再来店を除外理由にしない', async () => {
  const f = apiFixture(), response = await f.list.GET(new Request('https://example.test/api/customer-meetings?date=2026-11-02'))
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(data.rows.map(row => row.visit.id), ['11', '12'])
  assert(data.rows.every(row => row.customer.id === '1' && row.record === null && row.values.meeting_amount === null))
  assert.match(response.headers.get('cache-control'), /private.*no-store/)
  assert(f.calls.filter(call => call.table === 'customer_visits').every(call => !/amount_spent|cast_name|nomination_status/.test(call.columns)))
  const writes = f.calls.filter(call => call.rpc)
  assert.equal(writes.length, 0)
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
  assert.equal(history.records.length, 1); assert.equal(history.rows.length, 0)
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
