// Actual React components and hooks with local-only synthetic APIs. No production account or database.
import fs from 'node:fs'
import path from 'node:path'
import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
const root=fileURLToPath(new URL('..',import.meta.url)),port=Number(process.env.ECLAT_NOMINATION_PREVIEW_PORT||6121)
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid local fixture port')
const read=file=>fs.readFileSync(path.join(root,file),'utf8')
const compiled=fs.readdirSync(path.join(root,'.next/static/css')).filter(f=>f.endsWith('.css')).map(f=>read('.next/static/css/'+f))
const globals=compiled.find(s=>s.includes('--font-app-sans')&&/body\{[^}]*letter-spacing/.test(s))
if(!globals)throw Error('Build the application CSS before running this fixture')
const sources={},css=[]
const empty=`module.exports={__esModule:true,default:()=>null}`
const mocks={
 react:()=>read('node_modules/react/cjs/react.development.js'),
 'react/jsx-runtime':()=>read('node_modules/react/cjs/react-jsx-runtime.development.js'),
 'react-dom':()=>read('node_modules/react-dom/cjs/react-dom.development.js'),
 'react-dom/client':()=>read('node_modules/react-dom/cjs/react-dom-client.development.js'),
 scheduler:()=>read('node_modules/scheduler/cjs/scheduler.development.js'),
 'next/dynamic':()=>`module.exports={__esModule:true,default:()=>()=>null}`,
 'next/navigation':()=>`exports.useRouter=()=>({push:()=>{throw Error('Unexpected navigation')}})`,
 '@/lib/authCache':()=>`exports.fetchMe=async()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'admin',is_owner:!new URLSearchParams(location.search).has('readonly'),permissions:{'顧客.閲覧':true,'顧客.編集':!new URLSearchParams(location.search).has('readonly')}})`,
 '@/lib/excelExport':()=>`exports.exportSingleCustomer=async()=>{}`,
 '@/components/CustomerMeetingHistory':()=>empty,
 '@/components/LineMessageProposerModal':()=>empty,
 '@/components/RankExplanationModal':()=>empty,
 '@/hooks/useViewMode':()=>`const R=require('react');exports.useViewMode=()=>{const [isPC,set]=R.useState(innerWidth>=768);R.useEffect(()=>{const f=()=>set(innerWidth>=768);addEventListener('resize',f);return()=>removeEventListener('resize',f)},[]);return{isPC}}`,
 '@/lib/supabase/client':()=>`const query=table=>{const q={table,filters:[],orders:[]};const run=async()=>{const r=await fetch('/fixture/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(q)});return r.json()};const a={select(columns){q.columns=columns;return a},eq(k,v){q.filters.push(['eq',k,v]);return a},in(k,v){q.filters.push(['in',k,v]);return a},is(k,v){q.filters.push(['is',k,v]);return a},or(v){q.filters.push(['or',v]);return a},order(k,v={}){q.orders.push([k,v]);return a},range(f,t){q.range=[f,t];return a},limit(n){q.range=[0,n-1];return a},single(){q.single=true;return run()},maybeSingle(){q.single=true;return run()},then(r,j){return run().then(r,j)}};return a};const db={from:query,auth:{getUser:async()=>({data:{user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}}})}};exports.createClient=()=>db`,
}
function add(request,from=''){
 let key=request
 if(!(key in mocks)&&!['react','react/jsx-runtime','react-dom','react-dom/client','scheduler'].includes(key)){
  key=key.startsWith('@/')?key.slice(2):key.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(from),key)):key
  key=['','.ts','.tsx','/index.ts','/index.tsx'].map(ext=>key+ext).find(f=>fs.existsSync(path.join(root,f))&&fs.statSync(path.join(root,f)).isFile())||key
 }
 if(sources[key])return key
 sources[key]='// loading'
 let source
 if(mocks[request])source=mocks[request]()
 else if(key.endsWith('.css')){
  const input=read(key),prefix=path.basename(key).replace(/\W/g,'')+'_',names=[...new Set([...input.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m=>m[1]))],classes=Object.fromEntries(names.map(n=>[n,prefix+n]))
  css.push(input.replace(/:global\(([^)]+)\)/g,'$1').replace(/\.([a-zA-Z_][\w-]*)/g,(_,n)=>'.'+classes[n]));source=`module.exports={__esModule:true,default:${JSON.stringify(classes)}}`
 }else source=ts.transpileModule(read(key),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 sources[key]=source.replace(/require\(["']([^"']+)["']\)/g,(_,name)=>`require(${JSON.stringify(add(name,key))})`)
 return key
}
for(const name of ['react','react/jsx-runtime','react-dom','react-dom/client','scheduler','@/components/CustomerDetailPanel','@/components/CustomerForm'])add(name)
const entry=`const R=require('react'),{createRoot}=require('react-dom/client'),Panel=require('components/CustomerDetailPanel.tsx').default,Form=require('components/CustomerForm.tsx').default;function App(){const actions=require('hooks/useCustomers.ts').useCustomerActions();const[customer,setCustomer]=R.useState(null),[closed,setClosed]=R.useState(false),[busy,setBusy]=R.useState(false);R.useEffect(()=>{actions.getCustomer('1').then(setCustomer)},[]);window.nominationBusy=busy;if(!customer)return R.createElement('p',null,'読込中');if(closed)return R.createElement('p',{'data-fixture-list':true},'元の一覧に戻りました');return R.createElement('div',{'data-fixture-host':true},R.createElement('button',{disabled:busy,'data-fixture-close':true,onClick:()=>setClosed(true)},'一覧を閉じる'),new URLSearchParams(location.search).has('form')?R.createElement(Form,{initialData:customer,onSubmit:async(data,correction)=>{window.nominationSubmitted={data,correction};const result=await actions.updateCustomer('1',data,correction);if(result)setClosed(true);return result},onCancel:()=>setClosed(true)}):R.createElement(Panel,{customerId:'1',isPC:innerWidth>=768,isAdmin:true,responsiveContainer:true,onCustomerUpdated:()=>{window.nominationRefreshes=(window.nominationRefreshes||0)+1},onEditingChange:setBusy}));}createRoot(document.getElementById('app')).render(R.createElement(App));`
const bundle=`const factories={${Object.entries(sources).map(([key,value])=>`${JSON.stringify(key)}:function(require,module,exports,process){${value}\n}`).join(',')}};const cache={};function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;if(!factories[name])throw Error('Missing fixture module '+name);factories[name](require,module,module.exports,{env:{NODE_ENV:'development'}});return module.exports}\n${entry}`
const baseCustomer={id:'1',customer_name:'架空のお客様',nickname:'テスト',cast_name:'あかり',nomination_status:'場内',is_starred:true,customer_rank:'B',region:'福岡県',occupation:'経営者',age_group:'40代',customer_staff_ids:[],customer_staff_names:[],has_customer_staff:false,monthly_target_visits:3,monthly_target_sales:300000,memo:'既存のお客様メモ'}
const baseVisits=[{id:'11',customer_id:'1',visit_date:'2026-11-05',visit_time:'23:00:00',nomination_status_at_visit:'場内',nomination_revision:0,is_planned:false,amount_spent:50000,party_size:2,extension_minutes:0,has_douhan:false,has_after:false,companion_honshimei:'',companion_banai:'',memo:'当日のメモ',created_at:'2026-11-05T16:55:12.386771+00:00'},{id:'10',customer_id:'1',visit_date:'2026-10-02',visit_time:null,nomination_status_at_visit:'場内',nomination_revision:0,is_planned:false,amount_spent:30000,party_size:1,extension_minutes:0,has_douhan:false,has_after:false,companion_honshimei:'',companion_banai:'',memo:'前月メモ',created_at:'2026-10-02T16:55:12.386771+00:00'},{id:'12',customer_id:'1',visit_date:'2099-11-05',visit_time:null,nomination_status_at_visit:null,nomination_revision:0,is_planned:true,amount_spent:0,party_size:1,extension_minutes:0,has_douhan:false,has_after:false,companion_honshimei:'',companion_banai:'',memo:'予定',created_at:'2026-11-05T17:00:00+00:00'}]
let customer,visits,history,requests,failure,delayMs,canEdit,replays
function reset(){customer=structuredClone(baseCustomer);visits=structuredClone(baseVisits);history=[];requests=[];failure='';delayMs=0;canEdit=true;replays=new Map()}reset()
createServer(async(request,response)=>{
 const url=new URL(request.url,'http://127.0.0.1:'+port),json=(value,status=200)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(value))},body=async()=>{let s='';for await(const part of request)s+=part;return s?JSON.parse(s):{}}
 response.setHeader('Cache-Control','no-store');response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'")
 if(url.pathname==='/app.js'){response.setHeader('Content-Type','application/javascript');response.end(bundle);return}
 if(url.pathname==='/fixture/reset'){reset();json({ok:true});return}
 if(url.pathname==='/fixture/state'){json({customer,visits,history,requests,failure,delayMs,canEdit});return}
 if(url.pathname==='/fixture/control'){const data=await body();if('failure'in data)failure=data.failure;if('canEdit'in data)canEdit=data.canEdit;if('delayMs'in data)delayMs=data.delayMs;if(data.customer)Object.assign(customer,data.customer);if(data.visit)Object.assign(visits.find(v=>v.id===String(data.visit.id)),data.visit);json({ok:true});return}
 if(url.pathname==='/api/auth/me'){json({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'admin',is_owner:true});return}
 if(url.pathname==='/api/customer-staff/options'){json({staff:[]});return}
 if(url.pathname==='/api/planned-visits'){json([]);return}
 if(url.pathname==='/api/customer-meetings/history'){json({records:[],rows:[],canEdit:true});return}
 const applyCorrection=(input,linked=false)=>{
  if(!canEdit)return{error:'顧客を編集する権限がありません',status:403}
  const replay=replays.get(input.requestId)
  if(replay)return JSON.stringify(replay.input)===JSON.stringify(input)?{visit:replay.visit}:{error:'同じ保存IDで別の内容は保存できません',status:409}
  const target=visits.find(v=>v.id===String(input.visitId))
  if(!target||target.is_planned||target.visit_date>'2026-11-06')return{error:'実来店を確認してください',status:400}
  if(target.visit_date!==input.expectedVisitDate||target.nomination_status_at_visit!==input.expectedStatus||target.nomination_revision!==input.expectedRevision)return{error:'別の端末で指名区分が変更されています。入力内容は残しています。',status:409}
  if(linked&&input.expectedCustomerStatus!==customer.nomination_status)return{error:'指名状況が変更されています',status:409}
  const old=target.nomination_status_at_visit;target.nomination_status_at_visit=input.newStatus;target.nomination_revision++
  history.push({id:'history-'+(history.length+1),customer_id:'1',visit_id:target.id,visit_date:target.visit_date,old_status:old,new_status:input.newStatus,revision:target.nomination_revision,actor_name:'架空スタッフ',actor_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',created_at:'2026-11-06T01:00:00.000Z',request_id:input.requestId})
  replays.set(input.requestId,{input:structuredClone(input),visit:structuredClone(target)});return{visit:structuredClone(target)}
 }
 if(url.pathname==='/api/visit-nominations'){
  if(request.method==='GET'){json({customerId:'1',customerStatus:customer.nomination_status,visits:visits.filter(v=>!v.is_planned&&v.visit_date<='2026-11-06'),history,canEdit});return}
  if(request.method!=='PUT'){json({error:'Method not allowed'},405);return}
  const data=await body();requests.push({path:url.pathname,method:request.method,data})
  if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs))
  if(failure&&failure!=='afterCommit'){json({error:'別の端末で指名区分が変更されています。入力内容は残しています。'},failure==='conflict'?409:503);return}
  const result=applyCorrection(data)
  if(result.error){json({error:result.error},result.status);return}
  if(failure==='afterCommit'){failure='';json({error:'架空の保存後通信エラー'},503);return}
  json(result);return
 }
 if(url.pathname==='/api/customers/1'){
  if(request.method==='PATCH'){const data=await body();requests.push({path:url.pathname,method:request.method,data});if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));if(failure){json({error:'架空の保存失敗'},failure==='conflict'?409:503);return}const correction=data.nomination_correction||data.visit_nomination_correction;if(correction){const result=applyCorrection(correction,true);if(result.error){json({error:result.error},result.status);return}}const patch={...data};delete patch.nomination_correction;delete patch.visit_nomination_correction;Object.assign(customer,patch);json(customer);return}
  json(customer);return
 }
 if(url.pathname==='/fixture/query'){
  const q=await body(),tables={customer_visits:visits,customer_contacts:[],customer_bottles:[],customer_memos:[],profiles:[{id:'11111111-1111-4111-8111-111111111111',cast_name:'あかり',role:'cast'}]}
  if(!(q.table in tables)){json({data:null,error:{message:'Unexpected fixture table '+q.table}},500);return}
  let rows=tables[q.table].filter(row=>(q.filters||[]).every(([op,k,v])=>op==='or'?true:op==='in'?v.map(String).includes(String(row[k])):op==='is'?(row[k]??null)===v:String(row[k])===String(v)))
  for(const [k,opt]of(q.orders||[]).slice().reverse())rows.sort((a,b)=>String(a[k]??'').localeCompare(String(b[k]??''),undefined,{numeric:true})*(opt.ascending===false?-1:1))
  if(q.range)rows=rows.slice(q.range[0],q.range[1]+1)
  json({data:q.single?rows[0]||null:rows,error:null});return
 }
 if(url.pathname.startsWith('/api/')){requests.push({path:url.pathname,method:request.method,data:request.method==='GET'?null:await body()});json({error:'Unconfigured local fixture endpoint '+url.pathname},404);return}
 response.setHeader('Content-Type','text/html;charset=utf-8');response.end(`<!doctype html><html lang="ja" class="h-full antialiased"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>架空来店指名訂正 QA</title><style>${globals}\n${css.join('\n')}</style></head><body class="min-h-full flex flex-col"><main class="w-full min-h-screen relative overflow-x-clip"><div id="app"></div></main><script src="/app.js"></script></body></html>`)
}).listen(port,'127.0.0.1',()=>console.log(`Nomination fixture http://127.0.0.1:${port}`))
