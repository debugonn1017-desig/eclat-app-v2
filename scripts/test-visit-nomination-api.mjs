// Real route/server/validation modules with synthetic session/DB fixtures only.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {randomUUID} from 'node:crypto'
const load=(file,mocks={})=>{
 const exports={},code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInThisContext(`(function(require,exports){${code}\n})`,{filename:file})(name=>{if(Object.hasOwn(mocks,name))return mocks[name];throw Error('Unexpected API fixture import '+name)},exports)
 return exports
}
const logic=load('lib/visitNominationCorrection.ts'),helpers=load('lib/supabaseHelpers.ts'),staff=load('lib/customerStaff.ts'),ranks=load('lib/customerRankChange.ts')
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',cast='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const baseCustomer={id:1,customer_name:'架空のお客様',cast_name:'あかり',nomination_status:'場内',customer_rank:'B',is_starred:true,has_customer_staff:false}
const baseVisit={id:11,customer_id:1,visit_date:'2026-11-05',visit_time:'23:00:00',nomination_status_at_visit:'場内',is_planned:false,amount_spent:50000,created_at:'2026-11-05T16:55:12+00:00'}
const input=(patch={})=>({customerId:'1',visitId:'11',expectedVisitDate:'2026-11-05',expectedStatus:'場内',expectedRevision:0,newStatus:'本指名',requestId:randomUUID(),...patch})
function fixture({authenticated=true,role='admin',owner=false,read=true,edit=true,visible=true,castName='あかり',rpcError=null,rpcInvalid=false,failedTable='',visits,history=[]}={}){
 let current={...baseCustomer};const calls=[],rows={customer_visits:visits||[{...baseVisit},{...baseVisit,id:12,is_planned:true},{...baseVisit,id:13,visit_date:'2099-01-01'},{...baseVisit,id:14,customer_id:2}],customer_visit_nomination_corrections:history,nomination_history:[]}
 const profile=authenticated?{id:actor,role,is_owner:owner,is_active:true,cast_name:role==='cast'?castName:null}:null
 function from(table){
  const filters=[],orders=[],call={table,columns:null,range:null};calls.push(call);let update=null,insert=null
  const result=()=>{
   if(failedTable===table)return{data:null,error:{message:'fixture read failed'}}
   let data=table==='customers'?visible?[current]:[]:table==='profiles'?[{id:cast,cast_name:'あかり',role:'cast'}]:rows[table]||[]
   data=data.filter(row=>filters.every(f=>f(row)))
   for(const[key,asc]of orders.slice().reverse())data.sort((a,b)=>String(a[key]??'').localeCompare(String(b[key]??''),undefined,{numeric:true})*(asc?1:-1))
   if(call.range)data=data.slice(call.range[0],call.range[1]+1)
   if(update&&data.length){current={...current,...update};data=[current];calls.push({committed:update})}
   if(insert){rows[table].push(insert);data=[insert];calls.push({inserted:insert,table})}
   return{data:data.map(r=>({...r})),error:null}
  }
  const q={select(columns){call.columns=columns;return q},eq(k,v){filters.push(r=>String(r[k])===String(v));return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},in(k,v){filters.push(r=>v.map(String).includes(String(r[k])));return q},or(v){assert.equal(v,'is_planned.is.null,is_planned.eq.false');filters.push(r=>r.is_planned!==true);return q},lte(k,v){filters.push(r=>r[k]<=v);return q},order(k,{ascending=true}={}){orders.push([k,ascending]);return q},range(a,b){call.range=[a,b];return q},update(value){update=value;calls.push({update:value});return q},insert(value){insert=value;return q},async maybeSingle(){const r=result();return{...r,data:r.data?.[0]||null}},async single(){const r=result();return{...r,data:r.data?.[0]||null}},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}}
  return q
 }
 const client={from,auth:{getUser:async()=>({data:{user:authenticated?{id:actor}:null}})}}
 const common={'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},'@/lib/auth':{getCurrentProfile:async()=>profile,checkPermission:async name=>name==='顧客.編集'?edit:read},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/visitNominationCorrection':logic,'@/lib/supabaseHelpers':helpers,'@/lib/dateUtils':{todayJST:()=> '2026-11-06'}}
 const star=load('lib/starLogServer.ts',common);common['@/lib/starLogServer']=star
 const server=load('lib/visitNominationServer.ts',{...common,'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{
  calls.push({rpc:name,args});if(rpcError)return{data:null,error:rpcError};if(rpcInvalid)return{data:{},error:null}
  const visit={...baseVisit,id:args.p_visit_id,customer_id:args.p_customer_id,nomination_status_at_visit:args.p_new_visit_status},correction={id:randomUUID(),visit_id:String(args.p_visit_id),visit_date:args.p_expected_visit_date,old_status:args.p_expected_visit_status,new_status:args.p_new_visit_status,actor_name:'架空スタッフ',created_at:'2026-11-06T01:00:00Z',revision:args.p_expected_revision+1}
  current={...current,...args.p_customer_patch};return{data:{customer:{...current},visit,correction},error:null}
 }})}})
 common['@/lib/visitNominationServer']=server
 const route=load('app/api/visit-nominations/route.ts',common)
 const customerRoute=load('app/api/customers/[id]/route.ts',{...common,'@/lib/customerStaff':staff,'@/lib/customerRankChange':ranks,'@/lib/rankRecoveryServer':{loadRankSnapshots:async()=>[],rankProof:()=>''},'@/lib/customerStaffServer':{parseCustomerStaffIds:staff.parseCustomerStaffIds,getCustomerStaffAssignments:async()=>[],validateCustomerStaffIds:async()=>[],syncCustomerStaffAssignments:async()=>[],customerStaffErrorMessage:String}})
 return{calls,rows,current:()=>current,get:(query='customerId=1')=>route.GET(new Request('https://example.test/api/visit-nominations?'+query)),put:(value=input(),query='')=>route.PUT(new Request('https://example.test/api/visit-nominations'+query,{method:'PUT',body:typeof value==='string'?value:JSON.stringify(value)})),patch:value=>customerRoute.PATCH(new Request('https://example.test/api/customers/1',{method:'PATCH',body:JSON.stringify(value)}),{params:Promise.resolve({id:'1'})})}
}
test('厳密な入力: 日付・ID・区分・版・requestIdと未知項目を検証する',()=>{
 assert.equal(logic.validateVisitNominationCorrection(input()),null)
 assert.equal(logic.validateVisitNominationCorrection(input({expectedStatus:null})),null)
 for(const patch of [{customerId:'0'},{customerId:'1.5'},{visitId:'1,2'},{expectedVisitDate:'2026-02-30'},{expectedStatus:'誤り'},{newStatus:'未設定'},{expectedRevision:-1},{expectedRevision:0.5},{requestId:'not-a-uuid'},{amount_spent:100},{actorId:'forged'},{expectedCustomerStatus:'誤り'}])assert.ok(logic.validateVisitNominationCorrection(input(patch)))
 assert.ok(logic.validateVisitNominationCorrection(input({newStatus:'場内'})))
})
test('GETは本人/スタッフ閲覧認可後に実来店と追記履歴だけを返す',async()=>{
 const history=[{id:1,customer_id:1,visit_id:11,visit_date:'2026-11-05',old_status:'フリー',new_status:'場内',actor_name:'架空スタッフ',created_at:'2026-11-06T00:00:00Z',revision:1},{id:2,customer_id:1,visit_id:11,visit_date:'2026-11-05',old_status:'場内',new_status:'本指名',actor_name:'架空スタッフ',created_at:'2026-11-06T01:00:00Z',revision:2}]
 const f=fixture({edit:false,read:true,history}),r=await f.get();assert.equal(r.status,200);const data=await r.json()
 assert.equal(data.canEdit,false);assert.equal(data.customerStatus,'場内');assert.deepEqual(data.visits.map(v=>v.id),['11']);assert.equal(data.visits[0].nomination_revision,2);assert.deepEqual(data.history.map(h=>h.id),['2','1'])
 assert.match(r.headers.get('cache-control'),/private.*no-store/);assert.equal(r.headers.get('vary'),'Cookie');assert.equal(f.calls.filter(c=>c.rpc||c.update).length,0)
})
test('GETは不正ID・非ログイン・権限なし・他担当を拒否し情報を返さない',async()=>{
 for(const query of ['', 'customerId=0','customerId=1.1','customerId=1%20']){const f=fixture();assert.equal((await f.get(query)).status,400);assert.equal(f.calls.length,0)}
 for(const[options,status]of[[{authenticated:false},401],[{read:false,edit:false},403],[{role:'cast',castName:'なみ'},404],[{visible:false},404]]){const f=fixture(options),r=await f.get();assert.equal(r.status,status);assert.equal((await r.json()).visits,undefined);assert.equal(f.calls.filter(c=>c.rpc||c.update).length,0)}
})
test('GETは1000件超の来店と監査履歴を全ページ取得する',async()=>{
 const visits=Array.from({length:1005},(_,i)=>({...baseVisit,id:1000+i})),history=visits.map((v,i)=>({id:i+1,customer_id:1,visit_id:v.id,visit_date:v.visit_date,old_status:'場内',new_status:'本指名',revision:1,created_at:'2026-11-06T00:00:00Z',actor_name:'架空スタッフ'}))
 const f=fixture({visits,history}),r=await f.get();assert.equal(r.status,200);const data=await r.json();assert.equal(data.visits.length,1005);assert.equal(data.history.length,1005)
 for(const table of ['customer_visits','customer_visit_nomination_corrections'])assert.ok(f.calls.some(c=>c.table===table&&c.range?.[0]===1000))
})
test('GETの読取り失敗は空履歴として成功しない',async()=>{
 for(const failedTable of ['customers','customer_visits','customer_visit_nomination_corrections']){const r=await fixture({failedTable}).get();assert.equal(r.status,503);assert.equal((await r.json()).visits,undefined)}
})
test('単独訂正はサーバー由来actorでサービス限定RPCを呼び金額を送らない',async()=>{
 const f=fixture(),payload=input(),r=await f.put(payload);assert.equal(r.status,200);const data=await r.json();assert.equal(data.visit.id,'11');assert.equal(data.visit.nomination_revision,1);assert.equal(data.visit.nomination_status_at_visit,'本指名')
 const call=f.calls.find(c=>c.rpc);assert.equal(call.rpc,'correct_customer_visit_nomination');assert.equal(call.args.p_actor_id,actor);assert.deepEqual(call.args.p_customer_patch,{});assert.equal(call.args.p_require_latest,false);assert.equal(call.args.p_request_id,payload.requestId)
 assert.equal(f.calls.filter(c=>c.update||c.inserted).length,0)
})
test('PUTは未知項目・クエリID相違・未来・不正JSON・閲覧専用をDB書込前に拒否',async()=>{
 for(const value of [input({amount_spent:1}),input({expectedVisitDate:'2099-11-05'}),'invalid json']){const f=fixture();assert.equal((await f.put(value)).status,400);assert.equal(f.calls.filter(c=>c.rpc).length,0)}
 {const f=fixture();assert.equal((await f.put(input(),'?customerId=2')).status,400);assert.equal(f.calls.filter(c=>c.rpc).length,0)}
 for(const[options,status]of[[{authenticated:false},401],[{edit:false},403]]){const f=fixture(options);assert.equal((await f.put()).status,status);assert.equal(f.calls.filter(c=>c.rpc).length,0)}
})
test('DBの競合/権限/不正値/通信失敗を区別し、成功の形を偽らない',async()=>{
 for(const[code,status]of[['40001',409],['23505',409],['42501',403],['22023',400],['22P02',400],['23514',400],['XX000',503]]){const f=fixture({rpcError:{code,message:'PRIVATE INTERNAL DETAIL'}}),r=await f.put();assert.equal(r.status,status);assert.doesNotMatch(JSON.stringify(await r.json()),/PRIVATE INTERNAL/)}
 assert.equal((await fixture({rpcInvalid:true}).put()).status,503)
})
test('基本情報+直近訂正は同じRPCへ全既存payloadと期待値を渡す',async()=>{
 const f=fixture(),correction=input({expectedCustomerStatus:'場内'}),r=await f.patch({customer_name:'  新しい名前  ',nickname:'呼び名',nomination_status:'本指名',memo:'入力メモ',monthly_target_sales:123456,visit_nomination_correction:correction})
 assert.equal(r.status,200);const data=await r.json();assert.equal(data.customer_name,'新しい名前');assert.equal(data.nomination_status,'本指名');assert.equal(data.corrected_visit.id,'11')
 const call=f.calls.find(c=>c.rpc);assert.equal(call.args.p_require_latest,true);assert.equal(call.args.p_expected_customer_status,'場内');assert.deepEqual(call.args.p_customer_patch,{customer_name:'新しい名前',nickname:'呼び名',nomination_status:'本指名',memo:'入力メモ',monthly_target_sales:123456})
 assert.equal(f.calls.filter(c=>c.update||c.inserted).length,0,'顧客/指名転換履歴を別リクエストで二重保存しない')
})
test('基本情報と来店の連携保存失敗は顧客の通常更新へフォールバックしない',async()=>{
 const f=fixture({rpcError:{code:'40001'}}),before=structuredClone(f.current()),r=await f.patch({nomination_status:'本指名',memo:'保存しない入力',visit_nomination_correction:input({expectedCustomerStatus:'場内'})})
 assert.equal(r.status,409);assert.deepEqual(f.current(),before);assert.equal(f.calls.filter(c=>c.update||c.inserted).length,0)
})
test('基本情報の補助訂正は本指名昇格と明示期待値だけ。ID不一致/順位変更混在を拒否',async()=>{
 for(const body of [{nomination_status:'場内',visit_nomination_correction:input({expectedCustomerStatus:'場内'})},{nomination_status:'本指名',visit_nomination_correction:input()},{nomination_status:'本指名',visit_nomination_correction:input({expectedCustomerStatus:'本指名'})},{nomination_status:'本指名',visit_nomination_correction:input({customerId:'2',expectedCustomerStatus:'場内'})},{nomination_status:'本指名',expected_customer_rank:'B',customer_rank:'A',visit_nomination_correction:input({expectedCustomerStatus:'場内'})}]){const f=fixture();assert.equal((await f.patch(body)).status,400);assert.equal(f.calls.filter(c=>c.rpc||c.update).length,0)}
})
test('旧クライアントの通常PATCHはRPCへ切替えず、来店を変えず指名履歴だけ追加',async()=>{
 const f=fixture(),before=structuredClone(f.rows.customer_visits),r=await f.patch({customer_name:'架空のお客様',nomination_status:'本指名',memo:'通常編集'})
 assert.equal(r.status,200);assert.equal(f.current().nomination_status,'本指名');assert.deepEqual(f.rows.customer_visits,before);assert.equal(f.calls.filter(c=>c.rpc).length,0);assert.equal(f.rows.nomination_history.length,1)
})
