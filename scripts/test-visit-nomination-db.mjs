// Isolated PostgreSQL authorization, atomicity and financial preservation checks.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const migrationName = fs.readdirSync('supabase/migrations').find(name => name.endsWith('_v03158_visit_nomination_corrections.sql'))
const migration = fs.readFileSync('supabase/migrations/' + migrationName, 'utf8')
const ids = Object.fromEntries(['owner', 'edit', 'read', 'cast', 'other', 'inactive'].map(name => [name, randomUUID()]))
let db, beforeMigration, afterMigration, catalogChecks, functionHash
before(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create table profiles(id uuid primary key,cast_name text,display_name text,role text,is_active boolean,is_owner boolean);
    create table staff_permissions(staff_id uuid,permission text,enabled boolean);
    create table customers(id bigint primary key,customer_name text,cast_name text,nomination_status text,customer_rank text,customer_rank_origin text default 'unknown',customer_rank_revision bigint default 0,phase text,phase_shoshimei_at timestamptz,is_starred boolean default true,no_reply boolean default false,memo text);
    create table customer_visits(id bigint primary key,customer_id bigint references customers(id),visit_date date,visit_time time,created_at timestamptz default now(),is_planned boolean,nomination_status_at_visit text,amount_spent integer,party_size integer default 1,memo text);
    create table nomination_history(id bigint generated always as identity primary key,customer_id bigint,cast_id uuid,old_status text,new_status text,changed_at timestamptz default now());
    create table customer_rank_history(id bigint generated always as identity primary key,customer_id bigint,revision bigint,from_rank text,to_rank text,from_origin text,to_origin text,operation text,actor_id uuid,created_at timestamptz default now());
    create table customer_meeting_records(id uuid primary key);
    create table cast_extension_sales(id bigint primary key,amount_spent integer);insert into cast_extension_sales values(1,90000);
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant all on all tables in schema public to service_role;
    grant usage,select on all sequences in schema public to service_role;
    grant select on profiles,staff_permissions,customers,customer_visits,nomination_history,customer_rank_history,cast_extension_sales to authenticated;
    grant update on customers,customer_visits to authenticated;
  `)
  const ranks = fs.readFileSync('supabase/migrations/20261015050000_v03125_rank_origin_recovery.sql', 'utf8')
  await db.exec(ranks.slice(ranks.indexOf('CREATE FUNCTION public.customer_rank_guard()'), ranks.indexOf('-- JSONB')))
  const accessFile = fs.readFileSync('supabase/migrations/20261015133000_v03133_star_logs.sql', 'utf8')
  await db.exec(accessFile.slice(accessFile.indexOf('create or replace function public.star_log_access'), accessFile.indexOf('alter table public.customer_star_cycles')))
  await db.exec(`revoke all on function public.star_log_access(bigint,boolean) from public,anon;grant execute on function public.star_log_access(bigint,boolean) to authenticated,service_role;`)
  await db.exec(fs.readFileSync('supabase/migrations/20260904_v0399_visit_nomination_snapshot_save_time.sql', 'utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/20260912_v03105_visit_nomination_consistency.sql', 'utf8'))
  for (const [name, id] of Object.entries(ids)) await db.query('insert into profiles values($1,$2,$3,$4,$5,$6)', [id, name === 'cast' ? 'りな' : name === 'other' ? 'なみ' : null, name, ['cast', 'other'].includes(name) ? 'cast' : 'admin', name !== 'inactive', name === 'owner'])
  await db.query("insert into staff_permissions values($1,'顧客.編集',true),($2,'顧客.閲覧',true)", [ids.edit, ids.read])
  for (let id = 1; id <= 20; id++) await db.query("insert into customers(id,customer_name,cast_name,nomination_status,customer_rank,memo) values($1,$2,$3,'場内','B','元の顧客メモ')", [id, 'お客様' + id, id === 2 ? 'なみ' : 'りな'])
  for (let id = 1; id <= 20; id++) {
    await db.query("insert into customer_visits(id,customer_id,visit_date,visit_time,created_at,is_planned,nomination_status_at_visit,amount_spent,memo) values($1,$2,'2026-10-02','20:00','2026-10-03T00:00Z',false,'場内',12345,'過去記録')", [id * 10, id])
    await db.query("insert into customer_visits(id,customer_id,visit_date,visit_time,created_at,is_planned,nomination_status_at_visit,amount_spent,memo) values($1,$2,'2026-11-05','23:00','2026-11-05T16:55Z',false,'場内',50000,'対象記録')", [id * 10 + 1, id])
  }
  beforeMigration = await sourceSnapshot()
  await db.exec(migration)
  afterMigration = await sourceSnapshot()
  const verification = await db.exec(fs.readFileSync('supabase/verification/20261106_v03158_visit_nomination_corrections_verify.sql', 'utf8'))
  catalogChecks = verification[0].rows
  functionHash = verification[1].rows[0]
  await db.exec(fs.readFileSync('supabase/verification/20261106_v03158_visit_nomination_corrections_snapshot.sql', 'utf8'))
})
after(async () => {
  fs.mkdirSync('.test-dist', { recursive: true })
  fs.writeFileSync('.test-dist/v158-visit-nomination-db-verification.json', JSON.stringify({ catalogChecks, functionHash }, null, 2) + '\n')
  await db?.close()
})

async function sourceSnapshot() {
  return (await db.query(`select jsonb_build_object('customers',(select jsonb_agg(to_jsonb(c) order by id) from customers c),'visits',(select jsonb_agg(to_jsonb(v) order by id) from customer_visits v),'history',(select jsonb_agg(to_jsonb(h) order by id) from nomination_history h),'ranks',(select jsonb_agg(to_jsonb(h) order by id) from customer_rank_history h),'extensions',(select jsonb_agg(to_jsonb(x) order by id) from cast_extension_sales x)) value`)).rows[0].value
}
const input = (customerId = 1, overrides = {}) => ({ actorId: ids.cast, customerId, customerPatch: {}, expectedCustomerStatus: null, visitId: customerId * 10 + 1, expectedVisitDate: '2026-11-05', expectedVisitStatus: '場内', newVisitStatus: '本指名', expectedRevision: 0, requestId: randomUUID(), requireLatest: false, ...overrides })
async function save(value, role = 'service_role') {
  await db.exec('set role ' + role)
  try {
    return (await db.query('select public.correct_customer_visit_nomination($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) value', [value.actorId, value.customerId, value.customerPatch, value.expectedCustomerStatus, value.visitId, value.expectedVisitDate, value.expectedVisitStatus, value.newVisitStatus, value.expectedRevision, value.requestId, value.requireLatest])).rows[0].value
  } finally { await db.exec('reset role') }
}
async function asActor(actor, query, params = [], role = 'authenticated') {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[actor] || ''])
  await db.exec('set role ' + role)
  try { return (await db.query(query, params)).rows } finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)") }
}
async function fails(promise, code) { await assert.rejects(promise, error => error.code === code) }

test('migration changes no past data and disables only the old time-window synchronization trigger', async () => {
  assert.deepEqual(afterMigration, beforeMigration)
  const triggers = (await db.query("select tgname from pg_trigger where not tgisinternal order by tgname")).rows.map(row => row.tgname)
  assert(!triggers.includes('nomination_history_sync_recent_visit_nomination'))
  assert(triggers.includes('customer_visits_snapshot_nomination_status'))
  await db.query("insert into nomination_history(customer_id,cast_id,old_status,new_status,changed_at) values(20,$1,'場内','本指名','2026-11-05T17:00Z')", [ids.cast])
  assert.equal((await db.query('select nomination_status_at_visit from customer_visits where id=201')).rows[0].nomination_status_at_visit, '場内')
})
test('production read-only verification SQL has thirteen passing checks and reviewed function hash', () => {
  assert.equal(catalogChecks.length, 13)
  assert(catalogChecks.every(check => check.ok), JSON.stringify(catalogChecks))
  assert.match(functionHash.body_hash, /^[a-f0-9]{32}$/)
})
test('correction changes one visit field, stamps actor and revision, keeps money, other visits and current customer', async () => {
  const before = await sourceSnapshot(), result = await save(input())
  assert.equal(result.visit.nomination_status_at_visit, '本指名')
  assert.equal(result.correction.actor_id, ids.cast)
  assert.equal(result.correction.actor_name, 'cast')
  assert.equal(result.correction.old_status, '場内');assert.equal(result.correction.new_status, '本指名');assert.equal(result.correction.revision, 1)
  assert.equal(result.correction.request_fingerprint, undefined)
  const after = await sourceSnapshot()
  const expected = structuredClone(before);expected.visits.find(row => row.id === 11).nomination_status_at_visit = '本指名'
  assert.deepEqual(after, expected)
})
test('same request is idempotent and changed replay inputs are rejected', async () => {
  const request = input(3), first = await save(request), before = await sourceSnapshot()
  const second = await save(request)
  assert.deepEqual(second, first)
  assert.deepEqual(await sourceSnapshot(), before)
  await fails(save({ ...request, newVisitStatus: 'フリー' }), '22023')
  await fails(save({ ...request, actorId: ids.owner }), '22023')
  const count = (await db.query('select count(*)::int count from customer_visit_nomination_corrections where visit_id=31')).rows[0].count
  assert.equal(count, 1)
})
test('an older successful request replay conflicts after a subsequent correction without overwriting it', async () => {
  const request = input(12)
  await save(request)
  await save(input(12, { expectedVisitStatus: '本指名', expectedRevision: 1, newVisitStatus: '場内' }))
  const before = await sourceSnapshot()
  await fails(save(request), '40001')
  assert.deepEqual(await sourceSnapshot(), before)
})
test('combined customer save and latest visit correction are atomic with one nomination history and rank actor', async () => {
  const result = await save(input(4, { expectedCustomerStatus: '場内', requireLatest: true, customerPatch: { customer_name: '変更後', nomination_status: '本指名', customer_rank: 'A', phase: '初指名' } }))
  assert.equal(result.customer.nomination_status, '本指名');assert.equal(result.customer.customer_name, '変更後');assert.equal(result.visit.nomination_status_at_visit, '本指名')
  assert(result.customer.phase_shoshimei_at)
  const nh = (await db.query('select * from nomination_history where customer_id=4')).rows
  assert.equal(nh.length, 1);assert.equal(nh[0].old_status, '場内');assert.equal(nh[0].new_status, '本指名');assert.equal(nh[0].cast_id, ids.cast)
  const rank = (await db.query('select * from customer_rank_history where customer_id=4')).rows
  assert.equal(rank.length, 1);assert.equal(rank[0].actor_id, ids.cast);assert.equal(rank[0].operation, 'manual')
  assert.equal((await db.query("select current_setting('request.jwt.claim.sub',true) value")).rows[0].value, '')
})
test('stale visit date/status/revision and newest visit conflicts roll back the whole customer patch', async () => {
  const before = await sourceSnapshot()
  for (const patch of [{ expectedVisitDate: '2026-11-04' }, { expectedVisitStatus: '本指名' }, { expectedRevision: 1 }, { expectedCustomerStatus: '本指名' }, { visitId: 50, expectedVisitDate: '2026-10-02' }]) {
    await fails(save(input(5, { expectedCustomerStatus: '場内', requireLatest: true, customerPatch: { customer_name: '失敗で残さない', nomination_status: '本指名', customer_rank: 'S' }, ...patch })), '40001')
    assert.deepEqual(await sourceSnapshot(), before)
  }
  assert.equal((await db.query('select count(*)::int count from customer_visit_nomination_corrections where customer_id=5')).rows[0].count, 0)
})
test('unknown snapshot can be corrected without guessing, and repeated ABA status changes conflict by revision', async () => {
  await db.query('alter table customer_visits disable trigger customer_visits_snapshot_nomination_status')
  await db.query('update customer_visits set nomination_status_at_visit=null where id=61')
  await db.query('alter table customer_visits enable trigger customer_visits_snapshot_nomination_status')
  const first = await save(input(6, { expectedVisitStatus: null, newVisitStatus: 'フリー' }))
  assert.equal(first.correction.old_status, null)
  await save(input(6, { expectedVisitStatus: 'フリー', expectedRevision: 1, newVisitStatus: '場内' }))
  await fails(save(input(6, { expectedVisitStatus: '場内', expectedRevision: 0 })), '40001')
})
test('owner, customer editor and current assigned cast can correct; other, inactive, viewer and missing actor cannot', async () => {
  for (const actor of ['owner', 'edit']) assert.equal((await save(input(actor === 'owner' ? 7 : 8, { actorId: ids[actor] }))).correction.actor_id, ids[actor])
  for (const actor of ['read', 'inactive', 'other']) await fails(save(input(9, { actorId: ids[actor] })), '42501')
  await fails(save(input(9, { actorId: randomUUID() })), '42501')
  await fails(save(input(2)), '42501')
  await fails(save(input(9, { requireLatest: true, expectedCustomerStatus: '場内', customerPatch: { cast_name: 'なみ', nomination_status: '本指名' } })), '42501')
})
test('NULL current assignment or owner flag fails closed instead of bypassing the permission expression', async () => {
  await db.query('update customers set cast_name=null where id=13')
  await fails(save(input(13)), '42501')
  await db.query('update profiles set is_owner=null where id=$1', [ids.read])
  await fails(save(input(13, { actorId: ids.read })), '42501')
  await db.query('update profiles set is_owner=false where id=$1', [ids.read])
})
test('anon and authenticated cannot call privileged RPC or insert/update/delete audit, viewers read only their scope', async () => {
  await fails(save(input(10), 'authenticated'), '42501')
  await fails(save(input(10), 'anon'), '42501')
  for (const sql of ["insert into customer_visit_nomination_corrections(customer_id) values(1)", "update customer_visit_nomination_corrections set actor_name='forged'", 'delete from customer_visit_nomination_corrections']) await fails(asActor('owner', sql), '42501')
  const allowed = await asActor('cast', 'select id,customer_id,visit_id,old_status,new_status,revision,actor_name,created_at from customer_visit_nomination_corrections')
  assert(allowed.length > 0);assert(allowed.every(row => row.customer_id !== 2))
  assert.equal((await asActor('other', 'select id from customer_visit_nomination_corrections')).length, 0)
  assert((await asActor('read', 'select id from customer_visit_nomination_corrections')).length > 0)
  await fails(asActor('owner', 'select request_fingerprint from customer_visit_nomination_corrections'), '42501')
})
test('invalid keys, money mutation, invalid statuses, malformed booleans and no-op are rejected without writes', async () => {
  const before = await sourceSnapshot()
  for (const patch of [{ newVisitStatus: 'bad' }, { newVisitStatus: null }, { expectedRevision: -1 }, { requireLatest: null }, { requestId: null }, { newVisitStatus: '場内' }, { expectedCustomerStatus: '場内', requireLatest: true, customerPatch: { nomination_status: '本指名', amount_spent: 1 } }, { expectedCustomerStatus: '場内', requireLatest: true, customerPatch: { nomination_status: '本指名', is_starred: 'true' } }, { expectedCustomerStatus: '場内', requireLatest: true, customerPatch: { nomination_status: '本指名', customer_rank_revision: 99 } }]) await fails(save(input(10, patch)), '22023')
  assert.deepEqual(await sourceSnapshot(), before)
})
test('planned/future/customer-mismatched and non-latest visits cannot be submitted as a latest real visit', async () => {
  await db.query("insert into customer_visits(id,customer_id,visit_date,is_planned,nomination_status_at_visit,amount_spent) values(112,11,'2099-01-01',false,'場内',9),(113,11,'2026-11-05',true,'場内',9)")
  for (const patch of [{ visitId: 112, expectedVisitDate: '2099-01-01' }, { visitId: 113 }, { visitId: 121 }]) await fails(save(input(11, patch)), '40001')
  assert.equal((await save(input(11, { requireLatest: true }))).visit.id, 111)
})
