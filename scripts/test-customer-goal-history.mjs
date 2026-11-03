// 隔離PostgreSQLでSET ROLE + JWT claimsを使い、実RLSと実GETを検証。本番へ接続しない。
import test, { before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const migration = '20261103183109_v03144_admin_customer_goal_history.sql'
const ids = Object.fromEntries(['owner', 'read', 'edit', 'noperm', 'inactiveAdmin', 'old', 'current', 'retired'].map(key => [key, randomUUID()]))
let db, originalWrites
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, out = {}
  vm.runInThisContext(`(function(require,exports){${code}\n})`, { filename: file })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    throw new Error('Unexpected import: ' + name)
  }, out)
  return out
}
const pagination = load('lib/supabaseHelpers.ts'), goals = load('lib/starCustomerGoals.ts')
before(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
  `)
  // auth.uidと同じJWTのsubをUUIDとして解釈する。role/metadataの自己申告は認可に使わない。
  await db.exec(`create table profiles(id uuid primary key,cast_name text,display_name text,role text,is_active boolean,is_owner boolean);
    create table staff_permissions(staff_id uuid,permission text,enabled boolean);
    create table customers(id bigint primary key,customer_name text,cast_name text,is_starred boolean default false,last_contact_date date);
    alter table customers enable row level security;
    create function public.current_role() returns text language sql security definer as $$select role from profiles where id=auth.uid() and is_active$$;
    create function public.current_cast_name() returns text language sql security definer as $$select cast_name from profiles where id=auth.uid() and is_active$$;
    create policy customer_scope on customers for all to authenticated using (public.current_role()='admin' or cast_name=public.current_cast_name()) with check (public.current_role()='admin' or cast_name=public.current_cast_name());
    grant usage on schema public,auth to authenticated,service_role;
    grant select on profiles,staff_permissions to authenticated;
    grant select,insert,update on customers to authenticated; grant all on customers to service_role;`)
  for (const [key, id] of Object.entries(ids)) {
    const cast = ['old', 'current', 'retired'].includes(key)
    await db.query('insert into profiles values($1,$2,$3,$4,$5,$6)', [id, cast ? key : null, key === 'retired' ? '退店キャスト' : key === 'old' ? '旧担当' : key, cast ? 'cast' : 'admin', !['retired', 'inactiveAdmin'].includes(key), key === 'owner'])
  }
  await db.query("insert into staff_permissions values($1,'顧客.閲覧',true),($2,'顧客.編集',true),($3,'顧客.閲覧',true)", [ids.read, ids.edit, ids.inactiveAdmin])
  for (const name of ['20261015133000_v03133_star_logs.sql', '20261024040000_v03137_star_log_edits.sql', '20261103131445_v03138_customer_monthly_goals.sql', '20261103134803_v03138_goal_rls_initplan.sql']) await db.exec(fs.readFileSync('supabase/migrations/' + name, 'utf8'))
  originalWrites = (await db.query("select policyname,qual,with_check,roles,cmd from pg_policies where tablename='customer_monthly_goals' and cmd in ('INSERT','UPDATE') order by policyname")).rows
  await db.exec(fs.readFileSync('supabase/migrations/' + migration, 'utf8'))
})
beforeEach(async () => {
  await db.exec("reset role; select set_config('request.jwt.claims','',false); truncate customer_monthly_goals,customer_star_logs,customer_star_cycles,customers cascade;")
  await db.exec("insert into customers values(1,'移動済み','current',true,null),(2,'担当解除',null,false,null),(3,'担当未登録','unknown',true,null),(4,'退店担当のまま','retired',true,null)")
  for (const [customer, cast, month, sales, visits, note] of [[1, 'old', '2026-11-01', 300000, 3, '旧担当の備考'], [1, 'current', '2026-11-01', 500000, 5, '現在担当の備考'], [1, 'retired', '2026-10-01', 0, null, '退店した担当の備考'], [2, 'old', '2026-09-01', null, 0, '担当解除後も保存'], [3, 'old', '2026-08-01', 100000, 1, '担当未登録'], [4, 'retired', '2026-07-01', 80000, 1, '退店担当']]) {
    await db.query('insert into customer_monthly_goals(cast_id,customer_id,month,target_sales,target_visits,note) values($1,$2,$3,$4,$5,$6)', [ids[cast], customer, month, sales, visits, note])
  }
})
after(async () => { await db?.close() })
async function as(actor, fn, role = 'authenticated', extraClaims = {}) {
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: ids[actor] || null, role, ...extraClaims })])
  await db.exec('set role ' + role)
  try { return await fn() } finally { await db.exec('reset role') }
}
const read = actor => as(actor, () => db.query('select cast_id,customer_id,month,note from customer_monthly_goals order by customer_id,month'))

test('有効owner/閲覧/編集スタッフは旧担当・退店担当を読む。現在castは自分の現在行だけ', async () => {
  for (const actor of ['owner', 'read', 'edit']) assert.equal((await read(actor)).rows.length, 6)
  const current = (await read('current')).rows
  assert.equal(current.length, 1); assert.equal(current[0].note, '現在担当の備考')
  assert.equal((await read('old')).rows.length, 0)
  assert.equal((await read('retired')).rows.length, 0)
})
test('権限なし/無効admin/匿名を拒否。JWT metadataのadmin自己申告でも旧castは読めない', async () => {
  for (const actor of ['noperm', 'inactiveAdmin']) assert.equal((await read(actor)).rows.length, 0)
  assert.equal((await as('old', () => db.query('select * from customer_monthly_goals'), 'authenticated', { user_metadata: { role: 'admin' }, app_metadata: { role: 'admin' } })).rows.length, 0)
  await assert.rejects(as('owner', () => db.query('select * from customer_monthly_goals'), 'anon'), /permission denied/)
})
test('INSERT/UPDATEポリシーは同一。旧行のUPDATEとINSERTはadminにも許可しない', async () => {
  const now = (await db.query("select policyname,qual,with_check,roles,cmd from pg_policies where tablename='customer_monthly_goals' and cmd in ('INSERT','UPDATE') order by policyname")).rows
  assert.deepEqual(now, originalWrites)
  for (const actor of ['owner', 'read', 'edit', 'old', 'current']) {
    const updated = await as(actor, () => db.query("update customer_monthly_goals set note='変更不可' where customer_id=1 and cast_id=$1 returning *", [ids.old]))
    assert.equal(updated.rows.length, 0)
    await assert.rejects(as(actor, () => db.query("insert into customer_monthly_goals(cast_id,customer_id,month,note) values($1,1,'2026-12-01','旧担当への不正入力')", [ids.old])), /row-level security/)
  }
  assert.equal((await db.query('select note from customer_monthly_goals where customer_id=1 and cast_id=$1', [ids.old])).rows[0].note, '旧担当の備考')
  assert.equal((await as('edit', () => db.query("update customer_monthly_goals set note='現在行更新' where customer_id=1 and cast_id=$1 returning *", [ids.current]))).rows.length, 1)
})
test('無効旧castは管理者のみ、保存castのrole変更時は管理者にも公開しない', async () => {
  assert.ok((await read('owner')).rows.some(row => row.cast_id === ids.retired))
  await db.query("update profiles set role='admin' where id=$1", [ids.retired])
  assert.equal((await read('owner')).rows.some(row => row.cast_id === ids.retired), false)
  await db.query("update profiles set role='cast' where id=$1", [ids.retired])
})

function api({ failTable = '' } = {}) {
  const calls = []
  const ident = value => { assert.match(value, /^[a-z_]+$/); return '"' + value + '"' }
  const client = { from(table) {
    const params = [], filters = [], sorts = []; let columns = '*'
    const execute = async (from, to) => {
      calls.push({ table, columns, filters: [...filters], from, to })
      if (table === failTable) return { data: null, error: { message: '架空の取得失敗' } }
      const sql = `select ${columns === '*' ? '*' : columns.split(',').map(ident).join(',')} from ${ident(table)}${filters.length ? ' where ' + filters.join(' and ') : ''}${sorts.length ? ' order by ' + sorts.join(',') : ''} limit ${to - from + 1} offset ${from}`
      try { return { data: (await db.query(sql, params)).rows, error: null } } catch (error) { return { data: null, error: { message: error.message } } }
    }
    const builder = {
      select(value) { columns = value; return this },
      eq(key, value) { params.push(value); filters.push(`${ident(key)}=$${params.length}`); return this },
      in(key, values) { const slots = values.map(value => { params.push(value); return '$' + params.length }); filters.push(`${ident(key)} in (${slots.join(',')})`); return this },
      order(key, options) { sorts.push(ident(key) + (options?.ascending === false ? ' desc' : ' asc')); return this },
      range: execute,
      async maybeSingle() { const result = await execute(0, 1); return { data: result.data?.[0] || null, error: result.error } },
    }
    return builder
  } }
  const session = load('lib/starLogServer.ts', {
    '@/lib/auth': {
      getCurrentProfile: async () => (await db.query("select current_user as role")).rows[0].role === 'anon' ? null : (await db.query('select * from profiles where id=auth.uid() and is_active')).rows[0] || null,
      checkPermission: async permission => (await db.query('select 1 from staff_permissions where staff_id=auth.uid() and permission=$1 and enabled', [permission])).rows.length > 0,
    }, '@/lib/supabase/server': { createClient: async () => client },
  })
  const handler = load('app/api/customer-goals/history/route.ts', { 'next/server': { NextResponse: Response }, '@/lib/starLogServer': session, '@/lib/supabaseHelpers': pagination, '@/lib/starCustomerGoals': goals })
  return { calls, get: (id = '1') => handler.GET(new Request('https://fixture.test/api/customer-goals/history?customerId=' + id)) }
}
test('履歴GETも実session/RLSを通し、現担当を除いて旧担当月別目標だけ返す', async () => {
  for (const actor of ['owner', 'read', 'edit']) {
    const env = api(), response = await as(actor, () => env.get()), data = await response.json()
    assert.equal(response.status, 200); assert.equal(data.customerId, '1'); assert.equal(data.items.length, 2)
    assert.deepEqual(data.items.map(row => row.castId), [ids.old, ids.retired])
    assert.equal(data.items[0].castName, '旧担当'); assert.equal(data.items[1].castActive, false)
    assert.equal(data.items[1].targetSales, 0); assert.equal(data.items[1].targetVisits, null)
    assert.ok(data.items.every(row => !Object.hasOwn(row, 'customer_name') && !Object.hasOwn(row, 'actuals')))
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('vary'), 'Cookie')
  }
})
test('担当未割当・未登録名・退店担当のまま・⭐️解除後も管理者が保存済み履歴を読める', async () => {
  for (const id of ['2', '3', '4']) {
    const response = await as('read', () => api().get(id)), data = await response.json()
    assert.equal(response.status, 200); assert.equal(data.items.length, 1)
    if (id === '2') assert.equal(data.items[0].targetSales, null)
    if (id === '4') assert.equal(data.items[0].castActive, false)
  }
})
test('履歴GETは本人/他cast/権限なし/無効/未認証を拒否し、失敗を空履歴にしない', async () => {
  for (const [actor, expected] of [['old', 403], ['current', 403], ['retired', 401], ['noperm', 403], ['inactiveAdmin', 401], ['', 401]]) {
    const env = api(), response = await as(actor, () => env.get())
    assert.equal(response.status, expected); assert.equal(env.calls.length, 0)
  }
  assert.equal((await as('', () => api().get(), 'anon')).status, 401)
  for (const table of ['customers', 'profiles', 'customer_monthly_goals']) {
    const response = await as('owner', () => api({ failTable: table }).get())
    assert.equal(response.status, 503); assert.ok((await response.json()).error)
  }
  for (const id of ['', '0', '-1', '1.5', '9007199254740992']) assert.equal((await as('owner', () => api().get(id))).status, 400)
  assert.equal((await as('owner', () => api().get('999'))).status, 404)
})
test('1000行超の履歴もページングし、対象顧客だけを月順に返す', async () => {
  await db.query("insert into customer_monthly_goals(cast_id,customer_id,month,note) select $1,1,(date '2100-01-01'+n*interval '1 month')::date,'ページング履歴' from generate_series(0,1004) n", [ids.old])
  const env = api(), response = await as('read', () => env.get()), data = await response.json()
  assert.equal(response.status, 200); assert.equal(data.items.length, 1007)
  assert.ok(env.calls.some(call => call.table === 'customer_monthly_goals' && call.from === 1000))
  assert.ok(data.items.every((row, i) => i === 0 || data.items[i - 1].month >= row.month))
})
test('同名の有効担当候補は履歴へ混ぜず、旧行なしは正確な空配列を返す', async () => {
  const duplicate = randomUUID()
  await db.query("insert into profiles values($1,'current','同名担当','cast',true,false)", [duplicate])
  await db.query("insert into customer_monthly_goals(cast_id,customer_id,month,note) values($1,1,'2026-11-01','同名担当の現在行')", [duplicate])
  const first = await (await as('owner', () => api().get())).json()
  assert.deepEqual(new Set(first.items.map(item => item.castId)), new Set([ids.old, ids.retired]))
  await db.query('delete from customer_monthly_goals where customer_id=1 and cast_id in ($1,$2)', [ids.old, ids.retired])
  const empty = await (await as('owner', () => api().get())).json()
  assert.deepEqual(empty, { customerId: '1', items: [] })
  await db.query('delete from customer_monthly_goals where cast_id=$1', [duplicate])
  await db.query('delete from profiles where id=$1', [duplicate])
})
test('公開前verificationは読取カタログ確認だけ。実RLSテストの代替とはしない', async () => {
  const sql = fs.readFileSync('supabase/verification/20261104_admin_customer_goal_history_verify.sql', 'utf8')
  assert.doesNotMatch(sql, /\b(?:insert into|update public|delete from|create table|alter table)\b/i)
  assert.match(sql, /代替ではない/)
  for (const result of await db.exec(sql)) for (const row of result.rows) for (const [key, value] of Object.entries(row)) assert.equal(String(value), key.endsWith('_must_be_zero') ? '0' : 'true', key)
})
