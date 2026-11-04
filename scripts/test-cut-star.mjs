// 本番に接続せず、既存migrationと同じ隔離PostgreSQLでトリガー・RPC・RLSを検証する。
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const migrationPath = 'supabase/migrations/20261104142525_v03150_cut_customer_star.sql'
const migration = fs.readFileSync(migrationPath, 'utf8')
const verification = fs.readFileSync('supabase/verification/20261104_v03150_cut_customer_star_verify.sql', 'utf8')
const fingerprintSql = verification.slice(verification.indexOf('select md5('))
const ids = Object.fromEntries(['owner', 'cast', 'other', 'read', 'edit', 'inactive', 'old'].map(key => [key, randomUUID()]))
let db, nextId = 1, today, legacyBefore, legacyAfter, securityBefore

before(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    create table profiles(id uuid primary key,cast_name text,display_name text,cast_tier text,role text,is_active boolean,is_owner boolean);
    create table staff_permissions(staff_id uuid,permission text,enabled boolean);
    create function public.current_role() returns text language sql stable security definer as $$select role from profiles where id=auth.uid() and is_active$$;
    create function public.current_cast_name() returns text language sql stable security definer as $$select cast_name from profiles where id=auth.uid() and is_active$$;
    create function public.staff_has_permission(text) returns boolean language sql stable security definer as $$select exists(select 1 from profiles p where p.id=auth.uid() and p.is_active and (p.is_owner or exists(select 1 from staff_permissions s where s.staff_id=p.id and s.permission=$1 and s.enabled)))$$;
    create table customers(id bigint primary key,customer_name text,cast_name text,nomination_status text default '本指名',first_visit_date date,customer_rank text,is_starred boolean default false,last_contact_date date);
    alter table customers enable row level security;
    create policy customer_scope on customers for all to authenticated
      using (public.current_role()='admin' or cast_name=public.current_cast_name())
      with check (public.current_role()='admin' or cast_name=public.current_cast_name());
    grant usage on schema public,auth to authenticated,service_role;
    grant select on profiles,staff_permissions to authenticated,service_role;
    grant select,insert,update on customers to authenticated; grant all on customers to service_role;
    create table customer_visits(id bigint primary key,customer_id bigint references customers(id),visit_date date,amount_spent numeric,is_planned boolean,has_douhan boolean,has_after boolean);
    create table rank_criteria(id bigint primary key,scope_type text,scope_id text,rank_rules jsonb,monthly_period_months int);
    create view customer_search_metrics with (security_invoker=true) as select c.*,v.last_visit_date as metric_last_visit_date from customers c left join (select customer_id,max(visit_date) as last_visit_date from customer_visits group by customer_id) v on v.customer_id=c.id;
    grant select on customer_visits,rank_criteria,customer_search_metrics to authenticated,service_role;`)
  for (const [key, id] of Object.entries(ids)) {
    const isCast = ['cast', 'other', 'old'].includes(key)
    await db.query('insert into profiles values($1,$2,$3,$4,$5,$6,$7)', [id, isCast ? key : null, key, 'BC', isCast ? 'cast' : 'admin', key !== 'inactive', key === 'owner'])
  }
  await db.query("insert into staff_permissions values($1,'顧客.閲覧',true),($2,'顧客.編集',true)", [ids.read, ids.edit])
  for (const name of ['20261015050000_v03125_rank_origin_recovery.sql', '20261015060000_v03127_explicit_cut_recalculation.sql',
    '20261015133000_v03133_star_logs.sql', '20261024040000_v03137_star_log_edits.sql',
    '20261103131445_v03138_customer_monthly_goals.sql', '20261103134803_v03138_goal_rls_initplan.sql',
    '20261103183109_v03144_admin_customer_goal_history.sql']) await db.exec(fs.readFileSync('supabase/migrations/' + name, 'utf8'))
  today = (await db.query("select ((now() at time zone 'Asia/Tokyo')::date)::text as day")).rows[0].day
  await db.exec("insert into customers(id,customer_name,cast_name,customer_rank,is_starred) values(90,'既存切れた','cast','切れた',true),(91,'既存A','cast','A',true),(92,'既存解除済み','cast','切れた',false)")
  await addGoal(90, 'cast', '既存の月別備考 ⭐️')
  await addGoal(90, 'old', '過去担当の備考')
  await addCheck(90, '既存の確認ログ')
  legacyBefore = await preserved(90)
  securityBefore = await fingerprints()
  await db.exec(migration)
  legacyAfter = await preserved(90)
})
after(async () => { await db?.close() })

async function as(actor, fn, role = 'authenticated') {
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: ids[actor] || null, role })])
  await db.exec('set role ' + role)
  try { return await fn() } finally { await db.exec('reset role') }
}
const customer = async id => (await db.query('select * from customers where id=$1', [id])).rows[0]
const cycles = async id => (await db.query('select * from customer_star_cycles where customer_id=$1 order by opened_at,id', [id])).rows
const logs = async id => (await db.query('select l.* from customer_star_logs l join customer_star_cycles c on c.id=l.cycle_id where c.customer_id=$1 order by l.recorded_at,l.id', [id])).rows
const fingerprints = async () => (await db.exec(fingerprintSql)).map(result => result.rows)
async function createCustomer({ rank = 'B', star = true, cast = 'cast' } = {}) {
  const id = nextId++
  await db.query('insert into customers(id,customer_name,cast_name,customer_rank,is_starred) values($1,$2,$3,$4,$5)', [id, 'お客様' + id, cast, rank, star])
  return id
}
async function addGoal(id, cast, note) {
  await db.query("insert into customer_monthly_goals(cast_id,month,customer_id,target_sales,target_visits,note) values($1,'2026-11-01',$2,350000,3,$3)", [ids[cast], id, note])
}
async function addCheck(id, note) {
  const active = (await cycles(id)).find(cycle => !cycle.ended_at)
  await as('cast', () => db.query('select record_customer_star_log($1,$2,$3,$3,$4,$5,$6,$7)', [id, active.id, active.started_on, today, '返信待ち', note, randomUUID()]))
}
async function preserved(id) {
  return {
    customer: await customer(id),
    goals: (await db.query('select * from customer_monthly_goals where customer_id=$1 order by cast_id,month', [id])).rows,
    rankHistory: (await db.query('select * from customer_rank_history where customer_id=$1 order by revision', [id])).rows,
    logs: await logs(id), cycles: await cycles(id),
  }
}
const mark = (id, value, actor = 'cast') => as(actor, () => db.query('update customers set is_starred=$1 where id=$2 returning *', [value, id]))
const rank = (id, value, actor = 'cast') => as(actor, () => db.query('update customers set customer_rank=$1 where id=$2 returning *', [value, id]))
const snapshot = async id => (await as('owner', () => db.query('select customer_rank_snapshot($1) as value', [id]), 'service_role')).rows[0].value
async function apply(id, value, operation = 'auto') {
  const expected = await snapshot(id)
  return as('owner', () => db.query('select apply_customer_rank($1,$2,$3,$4,$5) as value', [id, JSON.stringify(expected), value, operation, ids.owner]), 'service_role')
}

test('既存の切れた⭐️だけを解除し期間を終了。目標・備考・確認記録・ランク情報を保持', async () => {
  assert.deepEqual(legacyAfter.customer, { ...legacyBefore.customer, is_starred: false })
  assert.deepEqual(legacyAfter.goals, legacyBefore.goals)
  assert.deepEqual(legacyAfter.rankHistory, legacyBefore.rankHistory)
  assert.equal(legacyAfter.cycles.length, 1)
  assert.ok(legacyAfter.cycles[0].ended_at)
  assert.deepEqual(legacyAfter.cycles[0], { ...legacyBefore.cycles[0], ended_at: legacyAfter.cycles[0].ended_at })
  assert.deepEqual(legacyAfter.logs.filter(log => log.kind !== 'ended'), legacyBefore.logs)
  assert.equal(legacyAfter.logs.filter(log => log.kind === 'ended').length, 1)
  assert.equal((await customer(91)).is_starred, true)
  assert.equal((await cycles(91)).filter(cycle => !cycle.ended_at).length, 1)
  assert.equal((await cycles(92)).length, 0)
})

test('キャストのランク単独更新で同じ行の⭐️を解除し、担当者の終了ログを1件だけ残す', async () => {
  const id = await createCustomer()
  await addGoal(id, 'cast', '目標は保持する')
  await addCheck(id, '切れる前の大切なメモ')
  const previous = await preserved(id)
  const result = await rank(id, '切れた')
  assert.equal(result.rows[0].is_starred, false)
  assert.equal(result.rows[0].customer_rank_origin, 'manual')
  assert.equal(result.rows[0].customer_rank_revision, previous.customer.customer_rank_revision + 1)
  const after = await preserved(id)
  assert.deepEqual(after.goals, previous.goals)
  assert.deepEqual(after.logs.filter(log => log.kind !== 'ended'), previous.logs)
  assert.equal(after.cycles.length, 1); assert.ok(after.cycles[0].ended_at)
  const ended = after.logs.filter(log => log.kind === 'ended')
  assert.equal(ended.length, 1); assert.equal(ended[0].actor_id, ids.cast); assert.equal(ended[0].actor_name, 'cast')
  assert.equal(after.rankHistory.at(-1).to_rank, '切れた')
  await rank(id, '切れた')
  await mark(id, false)
  assert.deepEqual(await preserved(id), after)
})

test('移行前からの切れた⭐️は無関係の更新でも解除し、ランク履歴と目標は変更しない', async () => {
  // 移行直前の旧行を隔離DB内だけで再現する。
  await db.exec('alter table customers disable trigger enforce_cut_customer_star')
  const id = await createCustomer({ rank: '切れた' })
  await db.exec('alter table customers enable trigger enforce_cut_customer_star')
  await addGoal(id, 'cast', '旧行の備考')
  const previous = await preserved(id)
  await as('cast', () => db.query('update customers set last_contact_date=$1 where id=$2', [today, id]))
  const after = await preserved(id)
  assert.equal(after.customer.is_starred, false)
  assert.equal(after.customer.customer_rank_revision, previous.customer.customer_rank_revision)
  assert.equal(after.customer.customer_rank_origin, previous.customer.customer_rank_origin)
  assert.deepEqual(after.rankHistory, previous.rankHistory); assert.deepEqual(after.goals, previous.goals)
  assert.ok(after.cycles[0].ended_at); assert.equal(after.logs.filter(log => log.kind === 'ended').length, 1)
})

test('自動ランクRPCと管理者一括再評価も解除し、既存の由来・revision・履歴を正しく更新', async () => {
  const autoId = await createCustomer()
  await apply(autoId, '切れた')
  const auto = await preserved(autoId)
  assert.equal(auto.customer.is_starred, false); assert.equal(auto.customer.customer_rank_origin, 'auto')
  assert.equal(auto.customer.customer_rank_revision, 1)
  assert.equal(auto.rankHistory.at(-1).operation, 'auto'); assert.equal(auto.rankHistory.at(-1).actor_id, ids.owner)
  assert.ok(auto.cycles[0].ended_at); assert.equal(auto.logs.filter(log => log.kind === 'ended').length, 1)
  const batchIds = [await createCustomer(), await createCustomer()]
  const changes = []
  for (const id of batchIds) changes.push({ p_id: id, p_expected: await snapshot(id), p_next_rank: '切れた', p_operation: 'recalculate' })
  const result = await as('owner', () => db.query('select apply_customer_rank_batch($1,$2) as value', [JSON.stringify(changes), ids.owner]), 'service_role')
  assert.ok(result.rows[0].value.every(row => row.ok))
  for (const id of batchIds) {
    const state = await preserved(id)
    assert.equal(state.customer.is_starred, false); assert.equal(state.customer.customer_rank_origin, 'auto')
    assert.equal(state.customer.customer_rank_revision, 1); assert.ok(state.cycles[0].ended_at)
    assert.equal(state.rankHistory.at(-1).operation, 'recalculate')
  }
})

test('切れたへの同時⭐️指定と新規INSERTは解除。既に切れたへの再付与と再開RPCは23514で失敗', async () => {
  const inserted = await createCustomer({ rank: '切れた' })
  assert.equal((await customer(inserted)).is_starred, false); assert.equal((await cycles(inserted)).length, 0)
  const id = await createCustomer({ star: false })
  await as('cast', () => db.query("update customers set customer_rank='切れた',is_starred=true where id=$1", [id]))
  assert.equal((await customer(id)).is_starred, false); assert.equal((await cycles(id)).length, 0)
  const archived = await createCustomer()
  await rank(archived, '切れた')
  const state = await preserved(archived), ended = state.cycles[0]
  for (const actor of ['cast', 'owner']) {
    await assert.rejects(mark(archived, true, actor), error => error.code === '23514' && error.message.includes('CUT_CUSTOMER_CANNOT_BE_STARRED'))
    const request = randomUUID()
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(as(actor, () => db.query('select restart_customer_star($1,$2,$3)', [archived, ended.id, request])), error => error.code === '23514')
    }
    assert.deepEqual(await preserved(archived), state)
  }
  // 古い画面から届く「⭐️を付ける」要求も、最新の切れた行に対して失敗する。
  await assert.rejects(mark(id, true), error => error.code === '23514')
})

test('ランク復帰で⭐️を自動復元せず、明示的な再付与で新期間を開始。古い備考・記録は継続保持', async () => {
  const id = await createCustomer()
  await addGoal(id, 'cast', '復帰後も残る月別備考')
  await addCheck(id, '前期間の確認メモ')
  await rank(id, '切れた')
  const archived = await preserved(id)
  await rank(id, 'A')
  assert.equal((await customer(id)).is_starred, false)
  assert.deepEqual(await cycles(id), archived.cycles)
  assert.deepEqual(await logs(id), archived.logs)
  await mark(id, true)
  const restored = await preserved(id)
  assert.equal(restored.customer.is_starred, true)
  assert.equal(restored.cycles.length, 2)
  assert.equal(restored.cycles.filter(cycle => !cycle.ended_at).length, 1)
  assert.ok(restored.cycles.some(cycle => cycle.id === archived.cycles[0].id && cycle.ended_at))
  for (const oldLog of archived.logs) assert.deepEqual(restored.logs.find(log => log.id === oldLog.id), oldLog)
  assert.deepEqual(restored.goals, archived.goals)
  assert.equal(restored.logs.filter(log => log.kind === 'started').length, 2)
})

test('自動復帰RPCとUndoもランクだけを復元し、⭐️・終了済み期間・月別目標を復元しない', async () => {
  for (const operation of ['review_restore', 'undo']) {
    const id = await createCustomer()
    await addGoal(id, 'cast', operation + 'の備考')
    await apply(id, '切れた')
    const archived = await preserved(id), expected = await snapshot(id)
    await as('owner', () => db.query('select apply_customer_rank($1,$2,$3,$4,$5,$6)', [id, JSON.stringify(expected), 'B', operation, ids.owner, operation === 'undo' ? 'manual' : null]), 'service_role')
    const restored = await preserved(id)
    assert.equal(restored.customer.is_starred, false)
    assert.deepEqual(restored.cycles, archived.cycles); assert.deepEqual(restored.logs, archived.logs)
    assert.deepEqual(restored.goals, archived.goals)
  }
})

test('RLSと既存の権限範囲を維持。本人だけ更新でき、他担当・匿名・無効アカウントは更新できない', async () => {
  const id = await createCustomer()
  assert.equal((await rank(id, '切れた', 'other')).rows.length, 0)
  assert.equal((await rank(id, '切れた', 'inactive')).rows.length, 0)
  await assert.rejects(as('', () => db.query("update customers set customer_rank='切れた' where id=$1", [id]), 'anon'), /permission denied/)
  assert.equal((await customer(id)).is_starred, true)
  await rank(id, '切れた')
  assert.equal((await customer(id)).is_starred, false)
  assert.equal((await as('other', () => db.query('select * from customer_star_cycles where customer_id=$1', [id]))).rows.length, 0)
  assert.equal((await as('cast', () => db.query('select * from customer_star_cycles where customer_id=$1', [id]))).rows.length, 1)
  const ended = (await cycles(id))[0]
  for (const actor of ['other', 'read', 'inactive']) await assert.rejects(as(actor, () => db.query('select restart_customer_star($1,$2,$3)', [id, ended.id, randomUUID()])), error => error.code === '42501')
  await assert.rejects(as('cast', () => db.query('select customer_rank_snapshot($1)', [id])), /permission denied/)
  for (const actor of ['cast', 'owner']) await assert.rejects(as(actor, () => db.query('select enforce_cut_customer_star()')), /permission denied/)
  assert.deepEqual(await fingerprints(), securityBefore)
})

test('解除後の目標は読めるが既存の書込ガードは維持し、過去担当の目標は管理者だけが読める', async () => {
  const id = await createCustomer()
  await addGoal(id, 'cast', '現在の備考'); await addGoal(id, 'old', '過去の備考')
  const before = await preserved(id)
  await rank(id, '切れた')
  const own = await as('cast', () => db.query('select note from customer_monthly_goals where customer_id=$1', [id]))
  assert.deepEqual(own.rows.map(row => row.note), ['現在の備考'])
  assert.equal((await as('read', () => db.query('select * from customer_monthly_goals where customer_id=$1', [id]))).rows.length, 2)
  assert.equal((await as('other', () => db.query('select * from customer_monthly_goals where customer_id=$1', [id]))).rows.length, 0)
  assert.equal((await as('cast', () => db.query("update customer_monthly_goals set note='変更不可' where customer_id=$1 returning *", [id]))).rows.length, 0)
  await assert.rejects(as('cast', () => db.query("insert into customer_monthly_goals(cast_id,month,customer_id,note) values($1,'2026-12-01',$2,'追加不可')", [ids.cast, id])), /row-level security/)
  assert.deepEqual((await preserved(id)).goals, before.goals)
})

test('移行の再実行は終了ログを増やさず、読取専用verificationとRLS・ACL・既存関数指紋を検証できる', async () => {
  const before = await preserved(90)
  await db.exec(migration)
  assert.deepEqual(await preserved(90), before)
  assert.deepEqual(await fingerprints(), securityBefore)
  assert.doesNotMatch(verification, /\b(?:insert into|update public|delete from|create table|alter table)\b/i)
  for (const result of await db.exec(verification)) for (const row of result.rows) for (const [key, value] of Object.entries(row)) {
    if (key.endsWith('_must_be_zero')) assert.equal(String(value), '0', key)
    else if (key.endsWith('_must_be_true')) assert.equal(value, true, key)
    else assert.match(value, /^[a-f0-9]{32}$/, key)
  }
})
