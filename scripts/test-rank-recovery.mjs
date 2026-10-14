// 隔離されたインメモリPostgreSQL・固定データのみ。本番キー/通信は使わない。
import test, {before,after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import {renderToStaticMarkup} from 'react-dom/server'
import {PGlite} from '@electric-sql/pglite'

function load(file,mocks={}) {
  const exports={}
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
  vm.runInNewContext(`(function(require,exports){${code}\n})`,{Request,Response,console,Buffer,Date,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'fixed-fixture-secret-not-a-real-key'}}}, {filename:file})(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name]
    throw new Error('Unexpected import '+name)
  },exports)
  return exports
}
const dates=load('lib/dateUtils.ts'), calculator=load('lib/rankCalculatorV2.ts',{'./dateUtils':dates})
const recovery=load('lib/rankRecovery.ts',{'./rankCalculatorV2':calculator})
const ranks=load('lib/customerRankChange.ts')
const actor='00000000-0000-4000-8000-000000000001',castActor='00000000-0000-4000-8000-000000000002'
const today=new Date('2026-10-15T12:00:00+09:00')
const visit=(days,amount=1000,planned=false)=>({id:days+100,visit_date:dates.toJSTDateString(new Date(today.getTime()-days*86400000)),amount_spent:amount,is_planned:planned,has_douhan:false,has_after:false})
const rules=calculator.normalizeRankRules(null)
for(const rank of ['S','A','B','C','切れた'])rules[rank].conditions=rules[rank].conditions.map(c=>({...c,enabled:false}))
rules.B.conditions.push({field:'days_since_last_visit',op:'lte',value:60,enabled:true})
rules.C.conditions.push({field:'days_since_last_visit',op:'gte',value:90,enabled:true})
rules.切れた.conditions.push({field:'days_since_last_visit',op:'gte',value:180,enabled:true})
const snapshot=(origin='unknown',visits=[visit(18,0)])=>({customer:{id:1,customer_name:'テストのお客様',cast_name:'テストキャスト',nomination_status:'本指名',customer_rank:'切れた',customer_rank_origin:origin,customer_rank_revision:0,first_visit_date:null},visits,criteria:[{id:1,scope_type:'default',scope_id:null,rank_rules:rules,monthly_period_months:3}],cast:{id:castActor,cast_tier:'BC'}})
let db
before(async()=>{
  db=new PGlite()
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('app.test_actor',true),'')::uuid$$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,cast_name text,cast_tier text,role text,is_active boolean,is_owner boolean);
    INSERT INTO profiles VALUES ('${actor}',NULL,NULL,'admin',true,true),('${castActor}','テストキャスト','BC','cast',true,false);
    CREATE FUNCTION public.current_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT role FROM profiles WHERE id=auth.uid()$$;
    CREATE FUNCTION public.staff_has_permission(text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT coalesce((SELECT is_owner FROM profiles WHERE id=auth.uid()),false)$$;
    CREATE TABLE public.customers(id bigint PRIMARY KEY,customer_name text,cast_name text,nomination_status text,first_visit_date date,customer_rank text);
    INSERT INTO customers VALUES(1,'旧切れた','テストキャスト','本指名',NULL,'切れた'),(2,'自動候補','テストキャスト','本指名',NULL,'B'),(3,'他担当','他のキャスト','本指名',NULL,'B');
    ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY customer_scope ON customers FOR ALL TO authenticated USING (public.current_role()='admin' OR cast_name=(SELECT cast_name FROM profiles WHERE id=auth.uid())) WITH CHECK (public.current_role()='admin' OR cast_name=(SELECT cast_name FROM profiles WHERE id=auth.uid()));
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    GRANT SELECT ON profiles TO authenticated,service_role;
    GRANT SELECT,UPDATE ON customers TO authenticated;GRANT ALL ON customers TO service_role;
    CREATE TABLE customer_visits(id bigint PRIMARY KEY,customer_id bigint REFERENCES customers(id),visit_date date,amount_spent numeric,is_planned boolean,has_douhan boolean,has_after boolean);
    INSERT INTO customer_visits VALUES(1,1,(now() AT TIME ZONE 'Asia/Tokyo')::date-18,0,false,false,false),(2,2,(now() AT TIME ZONE 'Asia/Tokyo')::date-200,1000,false,false,false);
    CREATE TABLE rank_criteria(id bigint PRIMARY KEY,scope_type text,scope_id text,rank_rules jsonb,monthly_period_months int);
    CREATE VIEW customer_search_metrics WITH (security_invoker=true) AS SELECT c.*,v.last_visit_date AS metric_last_visit_date FROM customers c LEFT JOIN (SELECT customer_id,max(visit_date) AS last_visit_date FROM customer_visits GROUP BY customer_id) v ON v.customer_id=c.id;
    GRANT SELECT ON customer_visits,rank_criteria,customer_search_metrics TO authenticated,service_role;
  `)
  await db.query('INSERT INTO rank_criteria VALUES(1,$1,NULL,$2,3)',['default',JSON.stringify(rules)])
  await db.exec(fs.readFileSync('supabase/migrations/20261015050000_v03125_rank_origin_recovery.sql','utf8'))
  await db.exec(fs.readFileSync('supabase/migrations/20261015060000_v03127_explicit_cut_recalculation.sql','utf8'))
})
after(async()=>{await db?.close()})
async function asRole(role,fn,user=actor){
  await db.exec(`SELECT set_config('app.test_actor','${user}',false); SET ROLE ${role};`)
  try{return await fn()}finally{await db.exec('RESET ROLE;')}
}
const pgSnapshot=async id=>(await asRole('service_role',()=>db.query('SELECT customer_rank_snapshot($1) AS snapshot',[id]))).rows[0].snapshot
const pgApply=async(id,expected,next,operation,origin=null)=>asRole('service_role',()=>db.query('SELECT apply_customer_rank($1,$2,$3,$4,$5,$6) AS result',[id,JSON.stringify(expected),next,operation,actor,origin]))

test('90/180境界は以上。0円18日前でB、予定・未来は除外し有料売上の定義は維持',()=>{
  for(const [days,expected] of [[18,'B'],[89,'B'],[90,'C'],[179,'C'],[180,'切れた']]){
    const r=calculator.calculateRankByRules({customer_rank:'B'},[visit(days)],rules,{monthly_period_months:3},today)
    assert.equal(r.recommended,expected)
  }
  const r=calculator.computeMetrics({},[visit(200,10000),visit(18,0),visit(1,900000,true),visit(-3,900000)],{monthly_period_months:3},today)
  assert.equal(r.days_since_last_visit,18);assert.equal(r.cumulative_sales,10000);assert.equal(r.cumulative_visits,1)
})
test('0円来店だけでも9999日にはならない。予定/未来/不正日付だけなら未記録',()=>{
  assert.equal(calculator.computeMetrics({},[visit(18,0)],{monthly_period_months:3},today).days_since_last_visit,18)
  assert.equal(calculator.rankLastActualVisitDate([visit(1,10,true),visit(-1),{...visit(1),visit_date:'2026-02-30'}],today),null)
})
test('手動・unknown切れたは保護、自動切れたは18日の実来店でBへ復帰できる',()=>{
  for(const origin of ['manual','unknown',undefined]){
    const c={...snapshot().customer,customer_rank_origin:origin}
    assert.equal(calculator.isAutoRankEligible(c),false)
    assert.equal(calculator.calculateRankByRules(c,[visit(18,0)],rules,{monthly_period_months:3},today).recommended,'切れた')
  }
  assert.equal(calculator.isAutoRankEligible(snapshot('auto').customer),true)
  assert.equal(calculator.calculateRankByRules(snapshot('auto').customer,[visit(18,0)],rules,{monthly_period_months:3},today).recommended,'B')
})
test('復帰候補は明示レビューでのみ計算。手動・場内・180日・未記録は復帰不可',()=>{
  assert.equal(recovery.evaluateRankSnapshot(snapshot(),true,today).canRestore,true)
  for(const s of [snapshot('manual'),snapshot('unknown',[visit(180)]),snapshot('unknown',[]),{...snapshot(),customer:{...snapshot().customer,nomination_status:'場内'}}]) assert.equal(recovery.evaluateRankSnapshot(s,true,today).canRestore,false)
})
test('JST日付境界は実行環境のタイムゾーンに依存しない',()=>{
  const r=calculator.computeMetrics({},[{...visit(1),visit_date:'2026-10-14'}],{monthly_period_months:3},new Date('2026-10-14T15:01:00Z'))
  assert.equal(r.days_since_last_visit,1)
})
test('migrationは既存ランクを変更せずunknown/0で保護する',async()=>{
  const rows=(await db.query('SELECT customer_rank,customer_rank_origin,customer_rank_revision FROM customers ORDER BY id')).rows
  assert.deepEqual(rows.map(r=>r.customer_rank),['切れた','B','B']);assert.ok(rows.every(r=>r.customer_rank_origin==='unknown'&&r.customer_rank_revision===0))
})
test('手動更新は出所・操作者・前後値を同一トランザクションで記録する',async()=>{
  await asRole('authenticated',()=>db.query("UPDATE customers SET customer_rank='A' WHERE id=3"))
  const rows=(await db.query('SELECT * FROM customer_rank_history WHERE customer_id=3')).rows
  assert.equal(rows.length,1);assert.equal(rows[0].operation,'manual');assert.equal(rows[0].actor_id,actor);assert.equal(rows[0].from_rank,'B');assert.equal(rows[0].to_rank,'A')
  assert.equal((await db.query('SELECT customer_rank_origin FROM customers WHERE id=3')).rows[0].customer_rank_origin,'manual')
})
test('キャストは他担当を変更不可。出所改ざん・GUC偽装・RPC直接呼出・履歴捏造を拒否',async()=>{
  const changed=await asRole('authenticated',()=>db.query("UPDATE customers SET customer_rank='S' WHERE id=3 RETURNING id"),castActor)
  assert.equal(changed.rows.length,0)
  await assert.rejects(asRole('authenticated',()=>db.query("UPDATE customers SET customer_rank_origin='auto' WHERE id=1"),castActor),/RANK_METADATA_PROTECTED/)
  await assert.rejects(asRole('authenticated',()=>db.exec("SELECT set_config('app.rank_operation','auto',true);UPDATE customers SET customer_rank='A' WHERE id=1"),castActor),/RANK_METADATA_PROTECTED/)
  await assert.rejects(asRole('authenticated',()=>db.query('SELECT customer_rank_snapshot(1)'),castActor),/permission denied/)
  await assert.rejects(asRole('authenticated',()=>db.query("INSERT INTO customer_rank_history(customer_id,revision,from_origin,to_origin,operation) VALUES(1,999,'unknown','auto','auto')")),/permission denied/)
})
test('旧auto操作ではunknown切れたを戻せない。既存の復帰確認操作も維持',async()=>{
  const before=await pgSnapshot(1)
  await assert.rejects(pgApply(1,before,'B','auto'),/RANK_PROTECTED/)
  await pgApply(1,before,'B','review_restore')
  const after=await pgSnapshot(1)
  assert.equal(after.customer.customer_rank,'B');assert.equal(after.customer.customer_rank_origin,'auto');assert.equal(after.customer.customer_rank_revision,1)
  assert.equal((await db.query('SELECT operation FROM customer_rank_history WHERE customer_id=1')).rows[0].operation,'review_restore')
})
test('自動切れたはautoと記録し、再評価で復帰。Undoは元の出所も戻す',async()=>{
  let s=await pgSnapshot(2);await pgApply(2,s,'切れた','auto');s=await pgSnapshot(2)
  assert.equal(s.customer.customer_rank_origin,'auto')
  await pgApply(2,s,'B','auto');s=await pgSnapshot(2)
  await pgApply(2,s,'切れた','undo','auto');s=await pgSnapshot(2)
  assert.equal(s.customer.customer_rank_origin,'auto')
})
test('ランク同値でも手動として残す確認はrevision/履歴を記録し、自動復帰を拒否',async()=>{
  const s=await pgSnapshot(2);await pgApply(2,s,'切れた','review_keep')
  const manual=await pgSnapshot(2)
  assert.equal(manual.customer.customer_rank_origin,'manual');assert.equal(manual.customer.customer_rank_revision,s.customer.customer_rank_revision+1)
  await assert.rejects(pgApply(2,manual,'B','review_restore'),/RANK_PROTECTED/)
})
test('プレビュー後の来店・ルール・担当/ランク変更をDBが検出し、履歴も増やさない',async()=>{
  let s=await pgSnapshot(1)
  await db.query("INSERT INTO customer_visits VALUES(9,1,'2026-10-14',1000,false,false,false)")
  await assert.rejects(pgApply(1,s,'A','auto'),/RANK_CONFLICT/)
  s=await pgSnapshot(1);await db.query('UPDATE rank_criteria SET monthly_period_months=4 WHERE id=1')
  await assert.rejects(pgApply(1,s,'A','auto'),/RANK_CONFLICT/)
  s=await pgSnapshot(1);await db.query("UPDATE customers SET cast_name='変更担当' WHERE id=1")
  await assert.rejects(pgApply(1,s,'A','auto'),/RANK_CONFLICT/)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM customer_rank_history WHERE customer_id=1')).rows[0].n,1)
})
test('同時/ABAランク変更は古いsnapshotを拒否し、例外時に業務データを壊さない',async()=>{
  const s=await pgSnapshot(3)
  await db.exec("UPDATE customers SET customer_rank='B' WHERE id=3;UPDATE customers SET customer_rank='A' WHERE id=3")
  await assert.rejects(pgApply(3,s,'S','auto'),/RANK_CONFLICT/)
})
test('一括RPCは競合した人だけ失敗、成功した人だけ履歴へ記録',async()=>{
  const one=await pgSnapshot(1),three=await pgSnapshot(3)
  const out=await asRole('service_role',()=>db.query('SELECT apply_customer_rank_batch($1,$2) AS result',[JSON.stringify([
    {p_id:1,p_expected:one,p_next_rank:'A',p_operation:'auto'},
    {p_id:3,p_expected:{...three,customer:{...three.customer,customer_rank_revision:-1}},p_next_rank:'S',p_operation:'auto'},
  ]),actor]))
  assert.deepEqual(out.rows[0].result.map(r=>r.ok),[true,false])
})
test('カード表示の最終来店は0円を含み、予定と未来を除外。ビュー列順を維持',async()=>{
  await db.query("INSERT INTO customer_visits VALUES(20,3,(now() AT TIME ZONE 'Asia/Tokyo')::date-18,0,false,false,false),(21,3,(now() AT TIME ZONE 'Asia/Tokyo')::date-1,0,true,false,false),(22,3,(now() AT TIME ZONE 'Asia/Tokyo')::date+1,1000,false,false,false)")
  const r=await db.query("SELECT metric_last_visit_date=((now() AT TIME ZONE 'Asia/Tokyo')::date-18) AS ok FROM customer_search_metrics WHERE id=3")
  assert.equal(r.rows[0].ok,true)
})
test('署名は利用者・日付・有効期限を固定し、改ざん・他人・期限切れを拒否',()=>{
  const server=load('lib/rankRecoveryServer.ts',{'node:crypto':crypto,'@/lib/supabase/admin':{createAdminClient:()=>({})},'./rankRecovery':recovery,'./dateUtils':dates,'./customerRankChange':ranks})
  const token=server.rankProof(snapshot(),actor,'review_restore',today)
  assert.equal(server.verifyRankProof(token,actor,today).operation,'review_restore')
  for(const [value,user,now] of [[token+'x',actor,today],[token,castActor,today],[token,actor,new Date(today.getTime()+600001)],[token,actor,new Date('2026-10-16T00:00:00+09:00')]]) assert.throws(()=>server.verifyRankProof(value,user,now),/INVALID_RANK_PROOF/)
})
test('UIは初期に誰も選択せず、手動は選択不可、unknownは注意・確認操作を表示',()=>{
  const colors=load('lib/colors.ts')
  const comp=load('components/RankRecoveryPage.tsx',{react:React,'react/jsx-runtime':jsx,'@/lib/colors':colors,'@/lib/authCache':{},'@/lib/cache':{},'@/lib/rankRecovery':recovery,'./PageHeader':{},'./CompactListField':{}})
  const rows=['unknown','manual','auto'].map((origin,i)=>({...recovery.evaluateRankSnapshot(snapshot(origin),true,today),id:String(i),token:'test',keepToken:origin==='unknown'?'keep':null}))
  const html=renderToStaticMarkup(React.createElement(comp.RankRecoveryCards,{rows,selected:new Set(),busy:false,canEdit:true,onSelect(){},onKeep(){}}))
  assert.equal((html.match(/type="checkbox"/g)||[]).length,3);assert.doesNotMatch(html,/checked=""/)
  assert.match(html,/手動の復帰は「ランク再評価」から確認できます/);assert.match(html,/過去の変更元は不明/);assert.match(html,/手動の「切れた」として残す/)
})
test('手動ログの操作者は認証本人。actor GUCを偽装しても他人の操作として記録しない',async()=>{
  await asRole('authenticated',()=>db.exec(`SELECT set_config('app.rank_actor','${castActor}',false);UPDATE customers SET customer_rank='S' WHERE id=3`))
  const r=(await db.query('SELECT actor_id,operation FROM customer_rank_history WHERE customer_id=3 ORDER BY revision DESC LIMIT 1')).rows[0]
  assert.equal(r.actor_id,actor);assert.equal(r.operation,'manual')
  await db.exec("SELECT set_config('app.rank_actor','',false)")
})
test('履歴も顧客RLSの担当範囲を維持する。castは他担当の履歴を取得不可',async()=>{
  assert.equal((await asRole('authenticated',()=>db.query('SELECT * FROM customer_rank_history WHERE customer_id=3'),castActor)).rows.length,0)
  assert.ok((await asRole('authenticated',()=>db.query('SELECT * FROM customer_rank_history WHERE customer_id=2'),castActor)).rows.length>0)
})
test('適用後の読み取り専用verification SQLで来店日/履歴/revision不整合が0件',async()=>{
  const result=await db.exec(fs.readFileSync('supabase/verification/v03125_rank_origin_recovery.sql','utf8'))
  const keyed=result.flatMap(r=>r.rows)
  assert.equal(keyed.find(r=>'invalid_metadata' in r).invalid_metadata,0)
  assert.equal(keyed.find(r=>'missing_latest_history' in r).missing_latest_history,0)
  assert.equal(keyed.find(r=>'inconsistent_last_visits' in r).inconsistent_last_visits,0)
})

test('明示再評価の計算はmanual/unknown/autoすべてを現在の90/180日基準へ戻せる',()=>{
  for(const origin of ['manual','unknown','auto'])for(const [days,rank] of [[18,'B'],[90,'C'],[179,'C'],[180,'切れた']]){
    const s=snapshot(origin,[visit(days,0)]),before=JSON.stringify(s)
    const result=recovery.evaluateRankSnapshot(s,false,today,true)
    assert.equal(result.recommended,rank);assert.equal(result.autoEligible,true)
    assert.equal(JSON.stringify(s),before)
  }
})
test('明示再評価でも実来店未記録の切れたは固定。予定/未来だけでも復帰しない',()=>{
  for(const visits of [[],[visit(1,1000,true)],[visit(-1,1000)]])for(const origin of ['manual','unknown','auto']){
    const result=recovery.evaluateRankSnapshot(snapshot(origin,visits),false,today,true)
    assert.equal(result.recommended,'切れた');assert.equal(result.autoEligible,false)
    assert.match(result.reasons[0],/実来店未記録/)
  }
})
test('DBの明示再評価は手動/履歴なし切れたを復帰し、前の出所と操作を履歴に残す',async()=>{
  for(const [id,origin] of [[30,'manual'],[31,'unknown']]){
    await db.query("INSERT INTO customers(id,customer_name,cast_name,nomination_status,customer_rank) VALUES($1,'明示再評価','テストキャスト','本指名','切れた')",[id])
    await db.query("INSERT INTO customer_visits(id,customer_id,visit_date,amount_spent,is_planned) VALUES($1,$2,(now() AT TIME ZONE 'Asia/Tokyo')::date-18,0,false)",[id+100,id])
    let s=await pgSnapshot(id)
    if(origin==='unknown'){await pgApply(id,s,'切れた','undo','unknown');s=await pgSnapshot(id)}
    const revision=s.customer.customer_rank_revision
    await pgApply(id,s,'B','recalculate')
    const after=await pgSnapshot(id),log=(await db.query('SELECT * FROM customer_rank_history WHERE customer_id=$1 ORDER BY revision DESC LIMIT 1',[id])).rows[0]
    assert.equal(after.customer.customer_rank,'B');assert.equal(after.customer.customer_rank_origin,'auto')
    assert.equal(after.customer.customer_rank_revision,revision+1)
    assert.equal(log.from_rank,'切れた');assert.equal(log.from_origin,origin);assert.equal(log.operation,'recalculate');assert.equal(log.actor_id,actor)
  }
})
test('DBの明示再評価も本指名/実来店が必須。場内・未記録・未来・予定は拒否',async()=>{
  for(const [id,nomination,day,planned] of [[40,'場内',-18,false],[41,'本指名',null,false],[42,'本指名',1,false],[43,'本指名',-1,true]]){
    await db.query("INSERT INTO customers(id,customer_name,cast_name,nomination_status,customer_rank) VALUES($1,'対象外','テストキャスト',$2,'切れた')",[id,nomination])
    if(day!==null)await db.query("INSERT INTO customer_visits(id,customer_id,visit_date,amount_spent,is_planned) VALUES($1,$2,(now() AT TIME ZONE 'Asia/Tokyo')::date+$3::integer,0,$4)",[id+100,id,day,planned])
    const s=await pgSnapshot(id)
    await assert.rejects(pgApply(id,s,'B','recalculate'),/RANK_PROTECTED/)
    assert.equal((await pgSnapshot(id)).customer.customer_rank,'切れた')
    assert.equal((await db.query('SELECT count(*)::int AS n FROM customer_rank_history WHERE customer_id=$1',[id])).rows[0].n,0)
  }
})
test('DBの明示再評価も古いsnapshot/権限外RPC/GUC偽装を拒否、履歴へ書けない',async()=>{
  const s=await pgSnapshot(30)
  await db.query("INSERT INTO customer_visits(id,customer_id,visit_date,amount_spent,is_planned) VALUES(999,30,(now() AT TIME ZONE 'Asia/Tokyo')::date,0,false)")
  await assert.rejects(pgApply(30,s,'A','recalculate'),/RANK_CONFLICT/)
  await assert.rejects(asRole('authenticated',()=>db.query('SELECT apply_customer_rank($1,$2,$3,$4,$5)',[30,JSON.stringify(s),'A','recalculate',castActor])),/permission denied/)
  await assert.rejects(asRole('authenticated',()=>db.exec("SELECT set_config('app.rank_operation','recalculate',true);UPDATE customers SET customer_rank='A' WHERE id=30"),castActor),/RANK_METADATA_PROTECTED/)
  assert.equal((await pgSnapshot(30)).customer.customer_rank,'B')
})
test('新migrationは履歴CHECKとサービス専用RPCのみ。RLS/実行権限を広げない',async()=>{
  const grants=(await db.query("SELECT has_function_privilege('authenticated','apply_customer_rank(bigint,jsonb,text,text,uuid,text)','EXECUTE') AS authenticated,has_function_privilege('anon','apply_customer_rank(bigint,jsonb,text,text,uuid,text)','EXECUTE') AS anon,has_function_privilege('service_role','apply_customer_rank(bigint,jsonb,text,text,uuid,text)','EXECUTE') AS service")).rows[0]
  assert.equal(grants.authenticated,false);assert.equal(grants.anon,false);assert.equal(grants.service,true)
  const sql=fs.readFileSync('supabase/migrations/20261015060000_v03127_explicit_cut_recalculation.sql','utf8')
  assert.doesNotMatch(sql,/ALTER TABLE public\.customers|DISABLE ROW LEVEL SECURITY|GRANT/i)
  assert.match(sql,/p_operation='recalculate'/)
})
