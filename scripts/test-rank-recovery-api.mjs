// 架空データのみ。実APIの認証/署名/対象範囲/明示確認を通して検証する。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as crypto from 'node:crypto'
function load(file,mocks={}) {
  const exports={}
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  vm.runInNewContext(`(function(require,exports){${code}\n})`,{Request,Response,URL,URLSearchParams,Error,console,Buffer,Date,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'isolated-fixture-secret'}}},{filename:file})(name=>{
    if(Object.hasOwn(mocks,name))return mocks[name]
    throw new Error('Unexpected import '+name)
  },exports)
  return exports
}
const dates=load('lib/dateUtils.ts'),ranks=load('lib/customerRankChange.ts')
const calculator=load('lib/rankCalculatorV2.ts',{'./dateUtils':dates})
const recovery=load('lib/rankRecovery.ts',{'./rankCalculatorV2':calculator})
const pagination=load('lib/supabaseHelpers.ts')
const rules=calculator.makeDefaultRankRules()
for(const rank of ['S','A','B','C','切れた'])for(const c of rules[rank].conditions)c.enabled=false
rules.B.conditions.push({field:'days_since_last_visit',op:'lte',value:60,enabled:true})
rules.切れた.conditions.push({field:'days_since_last_visit',op:'gte',value:180,enabled:true})
const ago=days=>dates.toJSTDateString(new Date(Date.now()-days*86400000))
function row(id=1,origin='unknown',name='みやこ',rank='切れた') {
  return {customer:{id,customer_name:'架空のお客様'+id,cast_name:name,nomination_status:'本指名',first_visit_date:null,customer_rank:rank,customer_rank_origin:origin,customer_rank_revision:0},
    visits:[{id,visit_date:ago(18),amount_spent:0,is_planned:false,has_douhan:false,has_after:false}],
    criteria:[{id:1,scope_type:'default',scope_id:null,rank_rules:rules,monthly_period_months:3}],cast:{id:'cast',cast_tier:'BC'}}
}
function fixture({profile={id:'staff',role:'admin',is_owner:true,is_active:true},allowed=true,canWrite=allowed,rows=[row()],schemaError=false,missingSnapshot=false,batchError=false,conflictIds=[]}={}) {
  const snapshots=structuredClone(rows),calls=[]
  const visible=s=>profile?.role!=='cast'||s.customer.cast_name===profile.cast_name
  const client={from(table){
    let filters=[],start=0,end=Infinity
    const run=()=>{
      if(table==='profiles')return {data:[{id:'cast',role:'cast',cast_name:'みやこ'}].filter(r=>filters.every(f=>f(r))),error:null}
      return {data:snapshots.filter(visible).map(s=>s.customer).filter(r=>filters.every(f=>f(r))).sort((a,b)=>a.id-b.id).slice(start,end+1),error:null}
    }
    return {select(){return this},order(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},in(k,values){filters.push(r=>values.includes(r[k]));return this},range(a,b){start=a;end=b;calls.push(['range',a,b]);return this},
      async maybeSingle(){const result=run();return {...result,data:result.data[0]||null}},then(resolve,reject){return Promise.resolve(run()).then(resolve,reject)}}
  }}
  const admin={from:client.from,rpc:async(name,args)=>{
    calls.push([name,args])
    if(schemaError)return {data:null,error:{message:'fixture only'}}
    if(name==='customer_rank_snapshots')return {data:missingSnapshot?[]:structuredClone(snapshots.filter(s=>args.p_ids.includes(s.customer.id))),error:null}
    assert.equal(name,'apply_customer_rank_batch')
    if(batchError)return {data:null,error:{message:'fixture write failure'}}
    const results=args.p_changes.map(change=>{
      const s=snapshots.find(s=>s.customer.id===change.p_id)
      if(conflictIds.includes(change.p_id))return {id:String(change.p_id),ok:false,error:'データが変更されました'}
      s.customer.customer_rank=change.p_next_rank
      s.customer.customer_rank_origin=change.p_operation==='review_keep'?'manual':change.p_operation==='undo'?change.p_origin:'auto'
      s.customer.customer_rank_revision++
      return {id:String(change.p_id),ok:true}
    })
    return {data:results,error:null}
  }}
  const server=load('lib/rankRecoveryServer.ts',{'node:crypto':crypto,'@/lib/supabase/admin':{createAdminClient:()=>admin},'./rankRecovery':recovery,'./dateUtils':dates,'./customerRankChange':ranks})
  const mocks={'next/server':{NextResponse:{json:(body,options)=>new Response(JSON.stringify(body),options)}},
    '@/lib/auth':{getCurrentProfile:async()=>profile,checkPermission:async name=>name==='顧客.編集'?canWrite:allowed,requirePermission:async()=>{if(!profile)throw new Error('UNAUTHENTICATED');if(profile.role!=='admin'||!allowed)throw new Error('FORBIDDEN');return profile}},
    '@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/supabaseHelpers':pagination,'@/lib/rankRecovery':recovery,'@/lib/rankRecoveryServer':server}
  const api=load('app/api/customer-ranks/route.ts',mocks),global=load('app/api/admin/recalculate-all-ranks/route.ts',mocks)
  return {calls,snapshots,server,
    get:query=>api.GET(new Request('https://example.test/api/customer-ranks?'+query)),
    post:body=>api.POST(new Request('https://example.test/api/customer-ranks',{method:'POST',body:JSON.stringify(body)})),
    global:body=>global.POST(new Request('https://example.test/api/admin/recalculate-all-ranks',{method:'POST',body:JSON.stringify(body)}))}
}
test('未ログイン/権限なしは署名取得・書込み・DBアクセス前に拒否',async()=>{
  for(const [options,status] of [[{profile:null},401],[{profile:{id:'staff',role:'admin',is_owner:false},allowed:false},403]]){
    const f=fixture(options)
    assert.equal((await f.get('mode=recovery')).status,status)
    assert.equal((await f.post({tokens:['invalid']})).status,status)
    assert.equal(f.calls.length,0)
  }
})
test('キャストは自分のcutだけ、他キャスト名/id指定はサーバーで拒否',async()=>{
  const f=fixture({profile:{id:'cast',role:'cast',cast_name:'みやこ'},rows:[row(),row(2,'unknown','かれん')]})
  const response=await f.get('mode=recovery')
  assert.equal(response.status,200);assert.equal((await response.json()).total,1)
  const before=f.calls.length
  assert.equal((await f.get('mode=recovery&castName='+encodeURIComponent('かれん'))).status,403)
  assert.equal((await f.get('mode=auto&castId=other')).status,403)
  assert.equal(f.calls.length,before)
})
test('読み取り専用スタッフは確認画面を見られるが編集は不可',async()=>{
  const f=fixture({profile:{id:'staff',role:'admin',is_owner:false},canWrite:false})
  assert.equal((await f.get('mode=recovery')).status,200)
  assert.equal((await f.post({tokens:['invalid']})).status,403)
})
test('確認画面の初期は候補のみ、手動も含めた分類/人数と50件ページングは全件を使用',async()=>{
  const rows=Array.from({length:1003},(_,i)=>row(i+1,i===1002?'manual':'unknown'))
  const f=fixture({rows}),r=await f.get('mode=recovery&page=21')
  const data=await r.json()
  assert.equal(r.status,200);assert.equal(data.total,1002);assert.equal(data.counts.manual,1);assert.equal(data.items.length,2)
  assert.equal(f.calls.filter(c=>c[0]==='range').length,2)
  assert.equal((await (await f.get('mode=recovery&source=manual')).json()).items[0].token,null)
})
test('legacy復帰は明示確認必須、選択した人だけを変更。再送は競合として拒否',async()=>{
  const f=fixture({rows:[row(),row(2)]}),data=await (await f.get('mode=recovery')).json(),token=data.items[0].token
  assert.equal((await f.post({tokens:[token]})).status,400)
  assert.equal(f.calls.filter(c=>c[0]==='apply_customer_rank_batch').length,0)
  const result=await (await f.post({tokens:[token],confirmLegacy:true})).json()
  assert.equal(result.changed,1);assert.equal(f.snapshots[0].customer.customer_rank,'B');assert.equal(f.snapshots[1].customer.customer_rank,'切れた')
  const stale=await (await f.post({tokens:[token],confirmLegacy:true})).json()
  assert.equal(stale.changed,0);assert.equal(stale.results[0].ok,false)
})
test('履歴なしを手動として残す操作はランク同値でも手動保護を設定',async()=>{
  const f=fixture(),data=await (await f.get('mode=recovery')).json()
  const result=await (await f.post({tokens:[data.items[0].keepToken]})).json()
  assert.equal(result.changed,1);assert.equal(f.snapshots[0].customer.customer_rank,'切れた');assert.equal(f.snapshots[0].customer.customer_rank_origin,'manual')
})
test('他人/改ざんしたトークン・重複・50人超を拒否、書込みはゼロ',async()=>{
  const f=fixture(),data=await (await f.get('mode=recovery')).json(),token=data.items[0].token
  for(const [body,status] of [[{tokens:[token+'x']},409],[{tokens:[f.server.rankProof(f.snapshots[0],'other','review_restore')]},409],[{tokens:[token,token]},400],[{tokens:Array(51).fill(token)},400]]) assert.equal((await f.post(body)).status,status)
  assert.equal(f.calls.filter(c=>c[0]==='apply_customer_rank_batch').length,0)
})
test('署名が有効でも対象がRLS範囲外になった場合は全体を拒否',async()=>{
  const f=fixture({profile:{id:'cast',role:'cast',cast_name:'みやこ'}}),data=await (await f.get('mode=recovery')).json()
  f.snapshots[0].customer.cast_name='かれん'
  assert.equal((await f.post({tokens:[data.items[0].token],confirmLegacy:true})).status,403)
  assert.equal(f.calls.filter(c=>c[0]==='apply_customer_rank_batch').length,0)
})
test('プレビュー後の0円実来店・基準変更でも古い証明を反映しない',async()=>{
  for(const mutate of [s=>s.visits.push({...s.visits[0],id:20,visit_date:ago(1)}),s=>s.criteria[0].monthly_period_months=4]){
    const f=fixture(),data=await (await f.get('mode=recovery')).json()
    mutate(f.snapshots[0]);const result=await (await f.post({tokens:[data.items[0].token],confirmLegacy:true})).json()
    assert.equal(result.changed,0);assert.equal(result.results[0].ok,false)
  }
})
test('DB失敗・競合した人は成功数に含めず、部分成功を返す',async()=>{
  const f=fixture({rows:[row(),row(2)],conflictIds:[2]}),data=await (await f.get('mode=recovery')).json()
  const result=await (await f.post({tokens:data.items.map(r=>r.token),confirmLegacy:true})).json()
  assert.equal(result.changed,1);assert.equal(result.results.filter(r=>!r.ok).length,1)
  const fail=fixture({batchError:true}),d=await (await fail.get('mode=recovery')).json()
  assert.equal((await (await fail.post({tokens:[d.items[0].token],confirmLegacy:true})).json()).changed,0)
})
test('スキーマ/基準未適用・snapshot不足は503。空一覧成功として表示しない',async()=>{
  for(const f of [fixture({schemaError:true}),fixture({missingSnapshot:true}),fixture({rows:[{...row(),criteria:[]}]})]){
    const response=await f.get('mode=recovery')
    assert.equal(response.status,503);assert.equal((await response.json()).items,undefined)
  }
})
test('自動プレビューは手動/履歴なしcutを除外。autoのcutだけ復帰対象にできる',async()=>{
  const f=fixture({rows:[row(),row(2,'manual'),row(3,'auto')]}),data=await (await f.get('mode=auto&castId=cast')).json()
  assert.equal(data.items.length,1);assert.equal(data.items[0].id,'3')
  assert.equal((await (await f.post({tokens:[data.items[0].token]})).json()).changed,1)
})
test('全店再評価は権限+署名付きプレビュー必須、手動/unknownのcutは触らない',async()=>{
  const f=fixture({rows:[row(),row(2,'manual'),row(3,'auto')]}),preview=await (await f.global({dryRun:true})).json()
  assert.equal(preview.changed,1);assert.equal(preview.tokens.length,1)
  assert.equal((await f.global({dryRun:false})).status,400)
  assert.equal((await (await f.global({dryRun:false,tokens:preview.tokens})).json()).changed,1)
  assert.equal(f.snapshots[0].customer.customer_rank,'切れた');assert.equal(f.snapshots[1].customer.customer_rank,'切れた')
  assert.equal((await fixture({profile:{id:'cast',role:'cast'},allowed:false}).global({dryRun:true})).status,403)
})
test('全店適用へ復帰確認/Undoの証明を流用できず、古いプレビューは上書きしない',async()=>{
  const f=fixture({rows:[row(1,'auto')]}),d=await (await f.get('mode=recovery')).json()
  assert.equal((await f.global({dryRun:false,tokens:[d.items[0].token]})).status,400)
  const preview=await (await f.global({dryRun:true})).json();f.snapshots[0].customer.customer_rank_revision++
  const result=await (await f.global({dryRun:false,tokens:preview.tokens})).json()
  assert.equal(result.changed,0);assert.equal(result.failed,1)
})
test('署名付きUndoは前のrankとoriginに戻す。別操作後は古いUndoを拒否',async()=>{
  const f=fixture({rows:[row(1,'manual','みやこ','S')]})
  const token=f.server.rankProof(f.snapshots[0],'staff','undo',new Date(),{rank:'切れた',origin:'unknown'})
  assert.equal((await (await f.post({tokens:[token]})).json()).changed,1)
  assert.equal(f.snapshots[0].customer.customer_rank_origin,'unknown')
  assert.equal((await (await f.post({tokens:[token]})).json()).changed,0)
})
