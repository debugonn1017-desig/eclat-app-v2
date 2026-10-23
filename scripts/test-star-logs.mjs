import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

function load(file, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInThisContext(`(function(require,exports){${code}\n})`, { filename: file })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    throw new Error('Unexpected import: ' + name)
  }, exports)
  return exports
}
const logic = load('lib/starLog.ts')
const ids = { owner: randomUUID(), cast: randomUUID(), other: randomUUID(), read: randomUUID(), edit: randomUUID(), inactive: randomUUID() }
const newMigration = fs.readFileSync('supabase/migrations/20261024040000_v03137_star_log_edits.sql', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20261015133000_v03133_star_logs.sql', 'utf8') + '\n' + newMigration
let db, today
before(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.actor',true),'')::uuid$$;
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
  await db.exec("insert into customers values(1,'既存⭐️','りな',true,'2026-01-01'),(2,'他担当','なみ',true,null),(3,'未⭐️','りな',false,null),(4,'競合用','りな',true,null)")
  await db.exec(migration)
  today = (await db.query("select ((now() at time zone 'Asia/Tokyo')::date)::text as day")).rows[0].day
})
after(async () => { await db?.close() })
async function as(user, fn, role = 'authenticated') {
  await db.query("select set_config('app.actor',$1,false)", [ids[user] || ''])
  await db.exec(`set role ${role}`)
  try { return await fn() } finally { await db.exec('reset role') }
}
const cycles = async id => (await db.query('select * from customer_star_cycles where customer_id=$1 order by opened_at,id', [id])).rows.map(row => ({ ...row,
  started_on: row.started_on?.toISOString().slice(0, 10) ?? null, last_checked_on: row.last_checked_on?.toISOString().slice(0, 10) ?? null }))
const current = async id => (await cycles(id)).find(c => !c.ended_at)
const mark = (id, value, user = 'cast') => as(user, () => db.query('update customers set is_starred=$1 where id=$2', [value, id]))
async function record(id, cycle, { user = 'cast', start = cycle.started_on, expected = cycle.started_on, checked = today, status = '返信待ち', note = '架空の自由メモ\n次回連絡の確認', request = randomUUID() } = {}) {
  const args = [id, cycle.id, start, expected, checked, status, note, request]
  return as(user, () => db.query('select record_customer_star_log($1,$2,$3,$4,$5,$6,$7,$8) as result', args))
}
const dayAgo = days => new Date(Date.parse(today + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10)
const entry = async id => (await db.query('select * from customer_star_logs where id=$1', [id])).rows[0]
async function modify(id, log, { user = 'edit', action = 'edit', day = today, status = '返信あり', note = '修正メモ', request = randomUUID(), expected = log.revision } = {}) {
  return as(user, () => db.query('select modify_customer_star_log($1,$2,$3,$4,$5,$6,$7,$8) as result', [id, log.id, expected, action, action === 'edit' ? day : null, action === 'edit' ? status : null, action === 'edit' ? note : null, request]))
}

test('日付・状況・自由メモ・UUIDを厳密検証。確認日は連絡日と独立', () => {
  const body = { cycleId: randomUUID(), startedOn: '2026-10-01', expectedStartedOn: null, checkedOn: '2026-10-15', status: '返信待ち', note: '自由な内容\n改行も保存', requestId: randomUUID() }
  assert.equal(logic.validateStarLog(body, '2026-10-15'), null)
  for (const change of [{ checkedOn: '2026-10-16' }, { checkedOn: '2026-02-30' }, { startedOn: '2026-10-16' }, { checkedOn: '0000-01-01' }, { expectedStartedOn: '2026-10-01', startedOn: null }, { note: 'a'.repeat(2001) }, { status: '不明' }, { actor_name: '偽名' }, { last_contact_date: '2026-10-15' }, { requestId: 'bad' }, { expectedStartedOn: undefined }]) assert.ok(logic.validateStarLog({ ...body, ...change }, '2026-10-15'))
  for (const value of [null, [], false, '文字']) assert.ok(logic.validateStarLog(value, '2026-10-15'))
  assert.equal(logic.matchesStarCheck({ last_checked_on: '2026-10-15' }, 'checked', '2026-10-15'), true)
  assert.equal(logic.matchesStarCheck({ last_checked_on: '2026-10-14' }, 'checked', '2026-10-15'), false)
  assert.equal(logic.matchesStarCheck(undefined, 'unchecked', '2026-10-15'), true)
})
test('既存⭐️は開始日を推測せずnull。旧追いかけデータや最終連絡には触らない', async () => {
  const cy = await current(1)
  assert.equal(cy.started_on, null)
  assert.equal((await db.query('select count(*)::int as count from customer_star_logs')).rows[0].count, 0)
  assert.equal((await cycles(3)).length, 0)
  await db.exec(migration)
  assert.equal((await cycles(1)).length, 1)
})
test('本人は自分の開始日/確認日/メモを保存でき、過去の確認でも最新状況を巻き戻さない', async () => {
  let cy = await current(1)
  await record(1, cy, { start: dayAgo(20), checked: today, note: '自由メモ\n改行と絵文字⭐️' })
  cy = await current(1)
  assert.equal(cy.started_on, dayAgo(20)); assert.equal(cy.last_checked_on, today)
  await record(1, cy, { checked: dayAgo(5), status: '未連絡', note: '過去の確認' })
  cy = await current(1)
  assert.equal(cy.last_checked_on, today); assert.equal(cy.last_status, '返信待ち')
  const log = (await db.query("select * from customer_star_logs where cycle_id=$1 and kind='check' and event_on=$2", [cy.id, today])).rows[0]
  assert.equal(log.note, '自由メモ\n改行と絵文字⭐️'); assert.equal(log.actor_id, ids.cast); assert.equal(log.actor_name, 'cast')
  assert.equal((await db.query('select last_contact_date::text from customers where id=1')).rows[0].last_contact_date, '2026-01-01')
  await assert.rejects(record(1, cy, { start: dayAgo(2) }), /開始日は最初の確認日以前/)
})
test('通信再試行は同一内容なら1件。別内容・他人の同じ記録IDは拒否', async () => {
  const cy = await current(1), request = randomUUID()
  await record(1, cy, { request, note: '再試行' })
  const replay = await record(1, cy, { request, note: '再試行' })
  assert.equal(replay.rows[0].result.replayed, true)
  assert.equal((await db.query('select count(*)::int as count from customer_star_logs where request_id=$1', [request])).rows[0].count, 1)
  await assert.rejects(record(1, cy, { request, note: '別内容' }), /異なる内容/)
  await assert.rejects(record(1, cy, { request, note: '再試行', user: 'edit' }), /異なる内容/)
})
test('⭐️解除は同じトランザクションで期間を閉じ、何度解除しても終了ログは1つ', async () => {
  const cy = await current(1)
  await mark(1, false); await mark(1, false)
  assert.ok((await cycles(1))[0].ended_at)
  assert.equal((await db.query("select count(*)::int as count from customer_star_logs where cycle_id=$1 and kind='ended'", [cy.id])).rows[0].count, 1)
  await assert.rejects(record(1, cy), /解除されています/)
  assert.ok((await as('cast', () => db.query('select * from customer_star_logs where cycle_id=$1', [cy.id]))).rows.length > 0)
})
test('終了履歴からの再開は新しい期間。古い記録・開始日は残り、再送で二重再開しない', async () => {
  const previous = (await cycles(1))[0], request = randomUUID()
  const restart = () => as('cast', () => db.query('select restart_customer_star($1,$2,$3) as result', [1, previous.id, request]))
  await restart(); await restart()
  const all = await cycles(1), cy = await current(1)
  assert.equal(all.length, 2); assert.notEqual(cy.id, previous.id); assert.equal(cy.started_on, today)
  assert.equal(all[0].started_on, dayAgo(20)); assert.ok(all[0].ended_at)
  await mark(1, false)
  await restart() // 遅れて到着した同じリクエストは⭐️を再度付けない。
  assert.equal(await current(1), undefined)
  await assert.rejects(as('cast', () => db.query('select restart_customer_star($1,$2,$3)', [1, previous.id, randomUUID()])), /状態が変更/)
})
test('新規⭐️・一括/他画面の通常UPDATEでも開始終了を記録。失敗時はマークも原子的に戻る', async () => {
  await mark(3, true)
  assert.equal((await current(3)).started_on, today)
  await mark(3, true); assert.equal((await cycles(3)).length, 1)
  await db.exec('begin')
  await mark(3, false)
  await db.exec('rollback')
  assert.ok(await current(3))
  assert.equal((await db.query('select is_starred from customers where id=3')).rows[0].is_starred, true)
})
test('RLSは本人担当のみ。閲覧専用スタッフ・無効アカウント・匿名の書込みをDBでも拒否', async () => {
  const cy = await current(3), other = await current(2)
  assert.equal((await as('cast', () => db.query('select * from customer_star_cycles where customer_id=2'))).rows.length, 0)
  assert.equal((await as('read', () => db.query('select * from customer_star_cycles where customer_id=2'))).rows.length, 1)
  for (const user of ['other', 'read', 'inactive']) await assert.rejects(record(3, cy, { user }), /編集できません/)
  await assert.rejects(record(2, other), /編集できません/)
  await assert.rejects(as('cast', () => db.query("update customer_star_cycles set started_on=null where id=$1", [cy.id])), /permission denied/)
  await assert.rejects(as('cast', () => db.query('delete from customer_star_logs where cycle_id=$1', [cy.id])), /permission denied/)
  await assert.rejects(as(null, () => db.query('select * from customer_star_logs'), 'anon'), /permission denied/)
  await record(3, cy, { user: 'edit', note: '編集権限あり' })
})
test('担当移動・開始日の同時編集・終了済み期間への追記を拒否し、既存ログは消さない', async () => {
  const cy = await current(4)
  await record(4, cy, { start: dayAgo(3) })
  await assert.rejects(record(4, cy, { start: dayAgo(2) }), /開始日が変更/)
  await db.exec("update customers set cast_name='なみ' where id=4")
  await assert.rejects(record(4, await current(4)), /編集できません/)
  assert.equal((await as('cast', () => db.query('select * from customer_star_cycles where customer_id=4'))).rows.length, 0)
  assert.ok((await as('other', () => db.query('select * from customer_star_cycles where customer_id=4'))).rows.length)
})

let nextCustomer = 10
async function checkedCustomer() {
  const id = nextCustomer++
  await db.query("insert into customers values($1,'ログ変更テスト','りな',true,'2026-01-01')", [id])
  await record(id, await current(id), { start: dayAgo(20), checked: dayAgo(5), note: '前回確認', user: 'cast' })
  await record(id, await current(id), { checked: today, note: '今回確認', user: 'edit' })
  const logs = (await db.query("select * from customer_star_logs where cycle_id=$1 and kind='check' order by event_on desc", [(await current(id)).id])).rows
  return { id, newest: logs[0], older: logs[1] }
}
test('共有の最終確認者は実際の記録者。編集しても元の確認者と記録日時を維持し修正者を別記録', async () => {
  const { id, newest } = await checkedCustomer()
  assert.equal((await current(id)).last_checked_by, 'edit')
  await modify(id, newest, { user: 'owner', note: '確認の補足\n自由なメモ' })
  const changed = await entry(newest.id)
  assert.equal(changed.note, '確認の補足\n自由なメモ'); assert.equal(changed.actor_name, 'edit'); assert.equal(changed.edited_by_name, 'owner')
  assert.equal(String(changed.recorded_at), String(newest.recorded_at)); assert.equal(changed.revision, 1)
  assert.equal((await current(id)).last_checked_by, 'edit')
  const audit = (await db.query('select * from customer_star_log_changes where log_id=$1', [newest.id])).rows[0]
  assert.equal(audit.before_snapshot.note, '今回確認'); assert.equal(audit.actor_name, 'owner'); assert.equal(audit.action, 'edit')
  assert.equal((await db.query('select is_starred,last_contact_date::text from customers where id=$1', [id])).rows[0].last_contact_date, '2026-01-01')
})
test('確認日の修正・削除・復元で最新日/状況/確認者を再計算。全削除は未確認へ戻る', async () => {
  const { id, newest, older } = await checkedCustomer()
  await modify(id, newest, { day: dayAgo(10) })
  assert.equal((await current(id)).last_checked_on, dayAgo(5)); assert.equal((await current(id)).last_checked_by, 'cast')
  await modify(id, older, { action: 'delete' })
  assert.equal((await current(id)).last_checked_on, dayAgo(10))
  await modify(id, await entry(newest.id), { action: 'delete' })
  assert.equal((await current(id)).last_checked_on, null); assert.equal((await current(id)).last_status, null); assert.equal((await current(id)).last_checked_by, null)
  await modify(id, await entry(newest.id), { action: 'restore' })
  assert.equal((await current(id)).last_checked_on, dayAgo(10)); assert.equal((await current(id)).last_status, '返信あり')
  assert.equal((await entry(newest.id)).deleted_at, null)
})
test('訂正の再送は同一内容/同一記録者なら冪等。古い版・別内容・他人のID流用は拒否', async () => {
  const { id, newest } = await checkedCustomer(), request = randomUUID()
  await modify(id, newest, { request })
  assert.equal((await modify(id, newest, { request })).rows[0].result.replayed, true)
  assert.equal((await entry(newest.id)).revision, 1)
  await assert.rejects(modify(id, newest), /別の人が記録を変更/)
  await assert.rejects(modify(id, newest, { request, note: '別内容' }), /異なる内容/)
  await assert.rejects(modify(id, newest, { request, user: 'owner' }), /異なる内容/)
})
test('自動の開始/終了ログ・未来日・開始日前・長文・不正な操作は書き換えず拒否', async () => {
  const { id, newest } = await checkedCustomer()
  for (const change of [{ day: dayAgo(-1) }, { day: dayAgo(21) }, { status: '不明' }, { note: 'x'.repeat(2001) }, { expected: -1 }, { action: 'bad' }]) await assert.rejects(modify(id, newest, change))
  const auto = (await db.query("select * from customer_star_logs where cycle_id=$1 and kind='started'", [(await current(id)).id])).rows[0]
  await assert.rejects(modify(id, auto), /確認ログだけ/)
  assert.equal((await entry(newest.id)).revision, 0)
  assert.equal((await db.query('select count(*)::int as n from customer_star_log_changes where log_id=$1', [newest.id])).rows[0].n, 0)
})
test('終了期間でも手入力ログを訂正できるが、星の再開や現在の期間の確認状態は変えない', async () => {
  const { id, newest } = await checkedCustomer(), old = await current(id)
  await mark(id, false)
  await modify(id, newest, { action: 'delete' })
  assert.equal((await db.query('select is_starred from customers where id=$1', [id])).rows[0].is_starred, false)
  await mark(id, true)
  await modify(id, await entry(newest.id), { action: 'restore' })
  assert.equal((await current(id)).last_checked_on, null)
  assert.equal((await cycles(id)).find(c => c.id === old.id).last_checked_on, today)
})
test('削除された確認より後へ開始日を変えた場合、そのままの復元は拒否。通常確認は削除ログを無視', async () => {
  const id = nextCustomer++
  await db.query("insert into customers values($1,'復元日付境界','りな',true,null)", [id])
  await record(id, await current(id), { start: dayAgo(20), checked: dayAgo(10) })
  const log = (await db.query("select * from customer_star_logs where cycle_id=$1 and kind='check'", [(await current(id)).id])).rows[0]
  await modify(id, log, { action: 'delete' })
  await record(id, await current(id), { start: dayAgo(5), checked: dayAgo(2), status: '来店予定' })
  await assert.rejects(modify(id, await entry(log.id), { action: 'restore' }), /開始日より前/)
  assert.equal((await current(id)).last_checked_on, dayAgo(2)); assert.equal((await current(id)).last_status, '来店予定')
})
test('DBで他担当/閲覧専用/無効/匿名の変更を拒否。削除本文は編集者だけ、監査本文はservice専用', async () => {
  const { id, newest } = await checkedCustomer()
  for (const user of ['other', 'read', 'inactive']) await assert.rejects(modify(id, newest, { user }), /編集できません/)
  await assert.rejects(modify(2, newest), /対象の記録がありません/)
  await assert.rejects(as('cast', () => db.query("update customer_star_logs set note='直接変更' where id=$1", [newest.id])), /permission denied/)
  await assert.rejects(as(null, () => db.query('select modify_customer_star_log($1,$2,0,$3,null,null,null,$4)', [id, newest.id, 'delete', randomUUID()]), 'anon'), /permission denied/)
  await modify(id, newest, { action: 'delete' })
  assert.equal((await as('read', () => db.query('select * from customer_star_logs where id=$1', [newest.id]))).rows.length, 0)
  assert.equal((await as('edit', () => db.query('select * from customer_star_logs where id=$1', [newest.id]))).rows.length, 1)
  await assert.rejects(as('owner', () => db.query('select * from customer_star_log_changes')), /permission denied/)
  assert.ok((await as(null, () => db.query('select * from customer_star_log_changes'), 'service_role')).rows.length)
  await assert.rejects(as('owner', () => db.query('select refresh_star_cycle_check($1)', [newest.cycle_id])), /permission denied/)
})
test('再実行可能な移行は顧客データ・確認日/状況を変えず実記録者だけ補完する', async () => {
  const { id } = await checkedCustomer(), cy = await current(id)
  await db.query('update customer_star_cycles set last_checked_by=null where id=$1', [cy.id])
  const before = (await db.query('select md5(string_agg(to_jsonb(c)::text,\'\' order by id)) as hash from customers c')).rows[0].hash
  await db.exec(newMigration)
  assert.equal((await current(id)).last_checked_by, 'edit'); assert.equal((await current(id)).last_checked_on, cy.last_checked_on)
  assert.equal((await db.query('select md5(string_agg(to_jsonb(c)::text,\'\' order by id)) as hash from customers c')).rows[0].hash, before)
})
test('移行後の読取り専用verificationでRLS・RPC/監査権限・トリガー・要約整合を確認', async () => {
  const results = await db.exec(fs.readFileSync('supabase/verification/20261024_v03137_star_log_edits_verify.sql', 'utf8'))
  for (const result of results) for (const row of result.rows) for (const [key, value] of Object.entries(row)) {
    if (key.endsWith('must_be_zero')) assert.equal(Number(value), 0, key)
    if (key.endsWith('must_be_one')) assert.equal(Number(value), 1, key)
    if (key.endsWith('must_be_true') || key === 'relrowsecurity' || key === 'prosecdef') assert.equal(value, true, key)
    if (key.endsWith('must_be_false')) assert.equal(value, false, key)
    if (key === 'proconfig') assert.ok(value.includes('search_path=public, pg_temp'))
  }
})

function apiFixture({ profile = { id: ids.owner, role: 'admin', is_owner: true }, allowed = true, editable = allowed, rpcError = null, clientOverride } = {}) {
  const calls = []
  const client = clientOverride || { rpc: async (name, args) => { calls.push([name, args]); return { data: { ok: true }, error: rpcError } }, from() { calls.push(['from']); throw new Error('unneeded read') } }
  const auth = { getCurrentProfile: async () => profile, checkPermission: async permission => permission === '顧客.編集' ? editable : allowed }
  const server = load('lib/starLogServer.ts', { '@/lib/auth': auth, '@/lib/supabase/server': { createClient: async () => client } })
  const route = load('app/api/star-logs/[id]/route.ts', { 'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } }, '@/lib/starLogServer': server, '@/lib/starLog': logic, '@/lib/followUpWorkflow': { getJstDateString: () => '2026-10-15' } })
  const list = load('app/api/star-logs/route.ts', { 'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } }, '@/lib/starLogServer': server, '@/lib/supabaseHelpers': load('lib/supabaseHelpers.ts') })
  return { calls, post: (body, id = '1') => route.POST(new Request('https://example.test/api/star-logs/' + id, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) }),
    patch: (body, id = '1') => route.PATCH(new Request('https://example.test/api/star-logs/' + id, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) }),
    get: (id = '1', query = '') => route.GET(new Request('https://example.test/api/star-logs/' + id + '?' + query), { params: Promise.resolve({ id }) }),
    list: query => list.GET(new Request('https://example.test/api/star-logs?' + query)) }
}
test('APIは未認証・編集不可をDBより前に拒否し、記録以外の値や偽の記録者を送らせない', async () => {
  const body = { cycleId: randomUUID(), startedOn: null, expectedStartedOn: null, checkedOn: '2026-10-15', status: '返信あり', note: '自由メモ', requestId: randomUUID() }
  for (const [options, status] of [[{ profile: null }, 401], [{ profile: { role: 'admin', is_owner: false }, allowed: false }, 403], [{ profile: { role: 'cast', cast_name: null } }, 403]]) {
    const f = apiFixture(options); assert.equal((await f.post(body)).status, status); assert.equal(f.calls.length, 0)
  }
  const f = apiFixture()
  for (const change of [{ actor_name: '偽名' }, { is_starred: false }, { note: 'x'.repeat(2001) }, { checkedOn: '2026-10-16' }]) assert.equal((await f.post({ ...body, ...change })).status, 400)
  assert.equal(f.calls.length, 0)
  assert.equal((await f.post(body)).status, 200)
  assert.equal(f.calls[0][0], 'record_customer_star_log')
  assert.equal(f.calls[0][1].p_note, '自由メモ')
  assert.equal((await f.post({ action: 'restart', cycleId: body.cycleId, requestId: randomUUID() })).status, 200)
  assert.equal((await f.post(body, '../1')).status, 400)
})
test('APIは競合/権限/不正日付/未導入DBを区別し、DBの内部エラーを公開しない', async () => {
  const body = { cycleId: randomUUID(), startedOn: null, expectedStartedOn: null, checkedOn: '2026-10-15', status: '返信あり', note: '', requestId: randomUUID() }
  for (const [code, status] of [['40001', 409], ['42501', 403], ['22023', 400], ['42P01', 503]]) {
    const f = apiFixture({ rpcError: { code, message: 'private SQL details' } }), response = await f.post(body)
    assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /private SQL/)
  }
})
test('訂正APIは権限・版・日付・2000文字・操作別の列を厳密検証し、確認者の偽装を拒否', async () => {
  const body = { action: 'edit', logId: randomUUID(), expectedRevision: 0, checkedOn: '2026-10-15', status: '返信あり', note: '修正メモ', requestId: randomUUID() }
  const f = apiFixture()
  for (const change of [{ actor_name: '偽名' }, { is_starred: true }, { checkedOn: '2026-02-30' }, { checkedOn: '2026-10-16' }, { expectedRevision: -1 }, { expectedRevision: 1.5 }, { status: '不明' }, { note: 'x'.repeat(2001) }, { logId: 'bad' }, { action: 'erase' }]) assert.equal((await f.patch({ ...body, ...change })).status, 400)
  assert.equal(f.calls.length, 0)
  for (const action of ['delete', 'restore']) {
    assert.equal((await f.patch({ ...body, action })).status, 400)
    assert.equal((await f.patch({ action, logId: body.logId, expectedRevision: 0, requestId: randomUUID() })).status, 200)
    assert.equal(f.calls.at(-1)[0], 'modify_customer_star_log'); assert.equal(f.calls.at(-1)[1].p_note, null)
  }
  assert.equal((await f.patch(body)).status, 200); assert.equal(f.calls.at(-1)[1].p_note, '修正メモ')
  for (const [options, status] of [[{ profile: null }, 401], [{ profile: { role: 'admin' }, allowed: false }, 403]]) {
    const denied = apiFixture(options); assert.equal((await denied.patch(body)).status, status); assert.equal(denied.calls.length, 0)
  }
  for (const [code, expected] of [['40001', 409], ['42501', 403], ['P0002', 403], ['23505', 409], ['22023', 400], ['42P01', 503]]) {
    const response = await apiFixture({ rpcError: { code, message: 'private SQL' } }).patch(body)
    assert.equal(response.status, expected); assert.doesNotMatch(await response.text(), /private SQL/)
  }
})

function readFixture({ role = 'admin', allowed = true, editable = true, failure = false } = {}) {
  const customers = Array.from({ length: 1105 }, (_, i) => ({ id: i + 1, customer_name: '架空' + (i + 1), cast_name: i === 1 ? 'なみ' : 'りな', is_starred: true }))
  const cycles = customers.map(c => ({ id: randomUUID(), customer_id: c.id, started_on: '2026-10-01', opened_at: '2026-10-01T12:00:00Z', ended_at: null, last_checked_on: null, last_status: null, private_internal: 'secret' }))
  const old = { ...cycles[0], id: randomUUID(), opened_at: '2026-09-01T12:00:00Z', ended_at: '2026-09-30T12:00:00Z' }
  cycles.push(old)
  const logs = Array.from({ length: 55 }, (_, i) => ({ id: String(i), cycle_id: cycles[0].id, kind: 'check', event_on: '2026-10-15', status: '返信あり', note: '自由メモ' + i, recorded_at: '2026-10-15T12:00:00Z', actor_name: 'テスト確認者', request_payload: { secret: 'not for client' } }))
  const calls = []
  const client = { from(table) {
    let filters = [], sorts = [], columns = '', max = Infinity
    const field = (row, key) => key.split('.').reduce((v, k) => v?.[k], row)
    const run = (start = 0, end = Infinity) => {
      let source = table === 'customers' ? customers : table === 'customer_star_cycles' ? cycles.map(c => ({ ...c, customer: customers.find(x => x.id === c.customer_id) })) : logs
      if (role === 'cast' && table !== 'customer_star_logs') source = source.filter(c => (table === 'customers' ? c.cast_name : c.customer.cast_name) === 'りな')
      const rows = source.filter(r => filters.every(f => f(r))).sort((a, b) => {
        for (const [k, ascending] of sorts) { const av = field(a, k), bv = field(b, k); if (av !== bv) return (av < bv ? -1 : 1) * (ascending ? 1 : -1) }
        return 0
      })
      const keys = columns.split(',customer:')[0].split(',')
      const data = rows.slice(start, Math.min(end + 1, max)).map(row => Object.fromEntries([...keys.map(k => [k, row[k]]), ...(columns.includes('customer:') ? [['customer', row.customer]] : [])]))
      return { data, error: failure ? { message: 'private SQL' } : null, count: rows.length }
    }
    return {
      select(c) { columns = c; calls.push([table, 'select', c]); return this },
      eq(k, v) { filters.push(r => field(r, k) === v); return this }, is(k, v) { filters.push(r => (field(r, k) ?? null) === v); return this },
      not(k) { filters.push(r => field(r, k) != null); return this },
      ilike(k, v) { filters.push(r => String(field(r, k)).includes(v.slice(1, -1))); return this },
      order(k, { ascending = true } = {}) { sorts.push([k, ascending]); return this },
      limit(n) { max = n; return this },
      async maybeSingle() { const r = run(); return { ...r, data: r.data[0] || null } },
      async range(a, b) { calls.push([table, 'range', a, b]); return run(a, b) },
    }
  } }
  return { ...apiFixture({ profile: { id: ids.read, role, cast_name: role === 'cast' ? 'りな' : null, is_owner: false }, allowed, editable, clientOverride: client }), calls, cycles, old, logs }
}
test('削除済み本文は通常GETに出さず、編集者の明示指定だけ返す。監査内部列は返さない', async () => {
  const f = readFixture()
  f.logs.unshift({ ...f.logs[0], id: 'deleted', event_on: '2026-10-16', deleted_at: '2026-10-16T10:00:00Z', deleted_by_name: '削除者', edited_at: '2026-10-15T10:00:00Z', edited_by_name: '修正者', revision: 2 })
  const normal = await (await f.get()).json()
  assert.equal(normal.logs.some(l => l.id === 'deleted'), false)
  const withDeleted = await (await f.get('1', 'includeDeleted=true')).json()
  assert.equal(withDeleted.logs[0].id, 'deleted'); assert.equal(withDeleted.logs[0].revision, 2); assert.equal(withDeleted.logs[0].deleted_by_name, '削除者')
  assert.doesNotMatch(JSON.stringify(withDeleted), /request_payload|before_snapshot|actor_id/)
  assert.equal((await readFixture({ editable: false }).get('1', 'includeDeleted=true')).status, 403)
  assert.equal((await f.get('1', 'includeDeleted=yes')).status, 400)
})
test('記録GETは本文履歴を50件ずつ返し、開始/終了サイクルと秘密の内部列を混ぜない', async () => {
  const f = readFixture(), response = await f.get()
  const data = await response.json()
  assert.equal(response.status, 200); assert.match(response.headers.get('Cache-Control'), /no-store/)
  assert.equal(data.logs.length, 50); assert.equal(data.has_more, true)
  assert.equal(data.cycle.id, f.cycles[0].id); assert.equal(data.logs[0].actor_name, 'テスト確認者')
  assert.equal((await (await f.get('1', 'page=2')).json()).logs.length, 5)
  assert.doesNotMatch(JSON.stringify(data), /request_payload|private_internal|secret/)
  const old = await (await f.get('1', 'cycleId=' + f.old.id)).json()
  assert.equal(old.cycle.id, f.old.id); assert.equal(old.restart_cycle_id, f.cycles[0].id); assert.equal(old.logs.length, 0)
  assert.equal((await f.get('1', 'cycleId=' + f.cycles[1].id)).status, 404)
})
test('一覧GETは1000人超の全記録を読み、終了履歴では検索/キャスト/ページングを適用', async () => {
  const f = readFixture()
  const response = await f.list('view=active')
  assert.equal(response.status, 200); assert.equal((await response.json()).items.length, 1105)
  assert.ok(f.calls.some(c => c[0] === 'customer_star_cycles' && c[1] === 'range' && c[2] === 1000))
  const ended = await (await f.list('view=ended&castName=' + encodeURIComponent('りな') + '&q=' + encodeURIComponent('架空1'))).json()
  assert.equal(ended.total, 1); assert.equal(ended.items[0].id, f.old.id)
  assert.equal((await f.list('view=ended&page=0')).status, 400)
  assert.equal((await f.list('view=bad')).status, 400)
})
test('閲覧専用は閲覧のみ。キャストの他担当ID/期間・指定キャストは情報を返さず拒否', async () => {
  const read = readFixture({ editable: false })
  assert.equal((await (await read.get()).json()).can_edit, false)
  const own = readFixture({ role: 'cast' })
  assert.equal((await own.get('2')).status, 404)
  assert.equal((await own.list('view=ended&castName=' + encodeURIComponent('なみ'))).status, 403)
  const denied = readFixture({ allowed: false, editable: false })
  assert.equal((await denied.get()).status, 403); assert.equal(denied.calls.length, 0)
  const failed = await readFixture({ failure: true }).get()
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private SQL/)
})

test('記録パネルは自由メモを安全に表示し、閲覧専用/終了済みでは追記を出さない', () => {
  const source = fs.readFileSync('components/StarLogPanel.tsx', 'utf8')
  const ast = ts.createSourceFile('panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const component = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'StarLogPanel')
  const names = component.body.statements.filter(ts.isVariableStatement).flatMap(n => [...n.declarationList.declarations])
    .filter(n => n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(ast) === 'useState').map(n => n.name.elements[0].name.text)
  const colors = load('lib/colors.ts'), css = { __esModule: true, default: {} }
  const summary = load('components/StarLogSummary.tsx', { 'react/jsx-runtime': jsx, '@/lib/colors': colors, './StarLog.module.css': css })
  const cycle = { id: randomUUID(), customer_id: 1, started_on: '2026-10-01', ended_at: null, last_checked_on: '2026-10-15' }
  const render = (can_edit, ended, starred) => {
    let index = 0
    const state = { loading: false, startedOn: '2026-10-01', status: '返信あり', data: {
      customer: { id: 1, customer_name: '架空のお客様', cast_name: 'りな', is_starred: starred }, cycle: { ...cycle, ended_at: ended }, can_edit, has_more: false,
      logs: [{ id: 'safe', kind: 'check', event_on: '2026-10-15', status: '返信あり', note: '<script>bad()</script>\n改行メモ', actor_name: '確認者', recorded_at: '2026-10-15T12:00:00Z' }],
    } }
    const Panel = load('components/StarLogPanel.tsx', {
      react: { ...React, useEffect() {}, useRef: value => ({ current: value }), useState: initial => { const name = names[index++]; return [Object.hasOwn(state, name) ? state[name] : initial, () => {}] } },
      'react/jsx-runtime': jsx, '@/lib/starLog': logic, '@/hooks/useJstToday': { useJstToday: () => '2026-10-15' },
      '@/components/CustomerCardPreview': { __esModule: true, default: ({ children, footer }) => React.createElement('div', null, children, footer) },
      '@/components/StarLogSummary': summary, './StarLog.module.css': css,
    }).default
    return renderToStaticMarkup(React.createElement(Panel, { target: { id: '1', name: '架空のお客様' }, onClose() {}, onSaved() {}, onNext() {}, onRestart() {}, onBusyChange() {} }))
  }
  const editable = render(true, null, true)
  assert.match(editable, /自由メモ/); assert.match(editable, /maxLength="2000"/i); assert.match(editable, /保存して次へ/)
  assert.match(editable, /&lt;script&gt;bad/); assert.doesNotMatch(editable, /<script>/)
  assert.doesNotMatch(render(false, null, true), /<form|記録を保存|新しい期間で再開/)
  assert.doesNotMatch(render(false, null, true), /記録を編集|記録を削除|削除済みも表示/)
  assert.match(editable, /記録を編集/); assert.match(editable, /記録を削除/); assert.match(editable, /削除済みも表示/)
  const ended = render(true, '2026-10-15T12:00:00Z', false)
  assert.doesNotMatch(ended, /<form|記録を保存/); assert.match(ended, /⭐️を付けて新しい期間で再開/)
  assert.match(render(true, '2026-10-15T12:00:00Z', true), /現在の⭐️の記録を見る/)
  assert.match(ended, /記録を編集/)
  assert.doesNotMatch(editable, /個人ページを見る/)
})

test('緑のマークはJST今日だけ。確認者名を明示し、日付変更/削除/未取得/終了では表示しない', () => {
  const colors = load('lib/colors.ts'), css = { __esModule: true, default: { checkedBadge: 'checked' } }
  const { StarCheckedBadge } = load('components/StarLogSummary.tsx', { 'react/jsx-runtime': jsx, '@/lib/colors': colors, './StarLog.module.css': css })
  const cycle = { last_checked_on: '2026-10-24', last_checked_by: '確認者<架空>', ended_at: null }
  const render = props => renderToStaticMarkup(React.createElement(StarCheckedBadge, { cycle, today: '2026-10-24', ...props }))
  assert.match(render({}), /✅ 本日確認済み · 確認者&lt;架空&gt;/)
  for (const props of [{ today: '2026-10-25' }, { today: null }, { cycle: null }, { loading: true }, { cycle: { ...cycle, ended_at: '2026-10-24' } }, { cycle: { ...cycle, last_checked_on: null } }]) assert.equal(render(props), '')
  assert.doesNotMatch(render({ cycle: { ...cycle, last_checked_by: null } }), /未設定|undefined|null/)
})

test('編集日付のinputイベントも状態へ反映し、削除の確認をキャンセルすれば通信しない', async () => {
  const source = fs.readFileSync('components/StarLogPanel.tsx', 'utf8')
  const ast = ts.createSourceFile('panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'StarLogPanel')
  const names = fn.body.statements.filter(ts.isVariableStatement).flatMap(n => [...n.declarationList.declarations])
    .filter(n => n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(ast) === 'useState').map(n => n.name.elements[0].name.text)
  const log = { id: randomUUID(), kind: 'check', event_on: '2026-10-15', status: '返信あり', note: '元メモ', actor_name: '記録者', recorded_at: '2026-10-15T12:00:00Z', revision: 0 }
  const state = { loading: false, data: { customer: { id: 1, cast_name: 'りな', is_starred: true }, cycle: { id: randomUUID(), started_on: '2026-10-01', ended_at: null }, can_edit: true, logs: [log] }, editing: null }
  let index = 0
  const Panel = load('components/StarLogPanel.tsx', {
    react: { ...React, useEffect() {}, useRef: value => ({ current: value }), useState: initial => { const name = names[index++]; return [Object.hasOwn(state, name) ? state[name] : initial, value => { state[name] = value }] } },
    'react/jsx-runtime': jsx, '@/lib/starLog': logic, '@/hooks/useJstToday': { useJstToday: () => '2026-10-15' },
    '@/components/CustomerCardPreview': { default() {} }, '@/components/StarLogSummary': { starLogColors: {}, StarCheckedBadge() {} }, './StarLog.module.css': { default: {} },
  }).default
  const elements = value => Array.isArray(value) ? value.flatMap(elements) : React.isValidElement(value) ? [value, ...elements(value.props.children)] : []
  const tree = () => { index = 0; return elements(Panel({ target: { id: '1', name: '架空' }, onClose() {}, onSaved() {}, onRestart() {}, onBusyChange() {} })) }
  state.editing = { log, day: '2026-10-15', status: '返信あり', note: '元メモ' }
  const date = tree().find(node => node.type === 'input' && node.props.type === 'date')
  assert.equal(typeof date.props.onInput, 'function')
  date.props.onInput({ currentTarget: { value: '2026-10-14' } }); assert.equal(state.editing.day, '2026-10-14')
  state.editing = null
  const saved = { window: globalThis.window, fetch: globalThis.fetch }; let calls = 0, confirmed = 0
  globalThis.window = { confirm() { confirmed++; return false } }; globalThis.fetch = async () => { calls++; throw new Error('呼ばれない') }
  try {
    const button = tree().find(node => node.type === 'button' && node.props.children === '削除')
    button.props.onClick(); await new Promise(resolve => setImmediate(resolve))
    assert.equal(confirmed, 1); assert.equal(calls, 0)
  } finally { Object.assign(globalThis, saved) }
})

test('共有記録は画面表示中30秒/フォーカス復帰で再取得し、差分時だけ位置保持の親を更新', async () => {
  const effects = [], timers = [], listeners = {}, removed = [], updates = []
  const savedGlobals = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document }
  let changed = 0, cycle = { id: 'cycle', customer_id: 1, last_checked_on: null, last_checked_by: null }
  globalThis.fetch = async () => new Response(JSON.stringify({ items: [cycle] }))
  globalThis.window = { setInterval(fn, ms) { timers.push([fn, ms]); return 10 }, clearInterval(id) { removed.push(id) }, addEventListener(name, fn) { listeners[name] = fn }, removeEventListener(name) { removed.push(name) } }
  globalThis.document = { visibilityState: 'visible', addEventListener(name, fn) { listeners[name] = fn }, removeEventListener(name) { removed.push(name) } }
  try {
    const { useStarLog } = load('hooks/useStarLog.tsx', {
      react: { useCallback: fn => fn, useEffect: fn => effects.push(fn), useMemo: fn => fn(), useRef: value => ({ current: value }), useState: value => [value, update => updates.push(update)] },
      'react/jsx-runtime': jsx, '@/lib/cache': { invalidateCustomerDetail() {}, invalidateAllCastsKPI() {} },
      '@/components/StarLogPanel': { default: () => null }, '@/components/StarLogHistory': { default: () => null }, '@/components/StarLogSummary': { starLogColors: {} }, '@/components/StarLog.module.css': { default: {} },
    })
    useStarLog({ enabled: true, scopeKey: 'staff1', revision: 0, onChanged: () => { changed++ } })
    effects[0](); const cleanRequest = effects[1](); const cleanTimer = effects[2]()
    await new Promise(resolve => setImmediate(resolve)); assert.equal(changed, 0)
    assert.equal(timers[0][1], 30000)
    const count = updates.length
    globalThis.document.visibilityState = 'hidden'; timers[0][0](); assert.equal(updates.length, count)
    globalThis.document.visibilityState = 'visible'; listeners.focus(); listeners.visibilitychange(); assert.equal(updates.length, count + 2)
    cleanRequest(); cycle = { ...cycle, last_checked_on: '2026-10-24', last_checked_by: '別スタッフ' }
    const cleanSecond = effects[1](); await new Promise(resolve => setImmediate(resolve)); assert.equal(changed, 1)
    cleanSecond(); const cleanThird = effects[1](); await new Promise(resolve => setImmediate(resolve)); assert.equal(changed, 1)
    cleanThird(); cleanTimer(); assert.deepEqual(removed, [10, 'focus', 'visibilitychange'])
  } finally { Object.assign(globalThis, savedGlobals) }
})
