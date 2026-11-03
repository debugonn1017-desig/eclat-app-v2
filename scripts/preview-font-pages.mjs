// 実画面・実compiled globalsを、ローカル架空APIだけで表示する独立QA fixture。
// npm run build -- --webpack 後に node scripts/preview-font-pages.mjs --port=6118
// /cast-issues /manual /daily-sales。DB・実アカウント・保存操作は使わない。
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const root = process.env.ECLAT_REPO || fileURLToPath(new URL('..',import.meta.url))
const require = createRequire(path.join(root, 'package.json')), ts = require('typescript')
const port = Number(process.argv.find(value=>value.startsWith('--port='))?.slice(7) || process.env.ECLAT_FONT_PREVIEW_PORT || 6118)
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const globalFiles = fs.readdirSync(path.join(root, '.next/static/css')).filter(file => file.endsWith('.css'))
const globals = globalFiles.map(file => read('.next/static/css/' + file)).find(source => source.includes('--font-app-sans') && /body\{[^}]*letter-spacing/.test(source))
if (!globals) throw Error('Build the app before font QA')
const castIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
const casts = ['架空あかり', '架空りな'].map((name, index) => ({ id:castIds[index], cast_name:name, display_name:name, cast_tier:index ? 'BA':'AC', role:'cast', is_active:true, created_at:'2025-01-01T00:00:00Z', joined_at:'2025-01-01', training_start_date:null, kpi_customer_count:24+index }))
const customers = [...casts.map((cast,index) => ({ id:String(index+1), customer_name:index?'架空の佐藤さん':'架空の田中さん', nickname:'架空データ', cast_name:cast.cast_name, nomination_status:'本指名', customer_rank:'A', age_group:'40代', first_visit_date:'2026-10-01', region:'福岡県' })),{id:'3',customer_name:'架空の場内のお客様',nickname:'架空',cast_name:casts[0].cast_name,nomination_status:'場内',customer_rank:'B',age_group:'30代',first_visit_date:'2026-10-10',region:'福岡県'}]
const me = { id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_name:'架空管理者', role:'admin', is_owner:true, permissions:{'売上.入力':true,'顧客.閲覧':true} }
const manual = { version:'fixture', generatedAt:'2026-11-04', philosophy:{ concept:'架空教材', purpose:'文字の読みやすさ確認', reasons:[], actions:[], ngList:[], balance:{earlyStage:'確認',deepStage:'確認'} }, sevenSteps:Array.from({length:7},(_,index)=>({no:index+1,title:`架空STEP${index+1}`,purpose:'読みやすく接客のポイントを確認します。'})), manuals:[{id:'fixture-manual',title:'架空の会話例：お客様の好みを確認する',step:'STEP1',category:'好み',group:'会話',scene:'接客中',purpose:'好みを伺う',serif:'いつもどのようなお食事がお好きですか？',reactions:[],info:'好み',why:'会話をつなぐ',standard:'確認する',keywords:['架空','会話']}], castTypes:[], chapter_0:{title:'架空の心構え',filename:'fixture',rawMarkdown:'確認用の架空教材です。'},actions:[],conversations:[],themes:[],philosophy_files:[],extras_groups:{} }
const sources = {}, css = []
const emptyOverlay = `module.exports={__esModule:true,default:()=>{throw Error('Overlay outside the four-screen font fixture')}}`
const mocks = {
  react:()=>read('node_modules/react/cjs/react.development.js'),
  'react/jsx-runtime':()=>read('node_modules/react/cjs/react-jsx-runtime.development.js'),
  'react-dom':()=>read('node_modules/react-dom/cjs/react-dom.development.js'),
  'react-dom/client':()=>read('node_modules/react-dom/cjs/react-dom-client.development.js'),
  scheduler:()=>read('node_modules/scheduler/cjs/scheduler.development.js'),
  'next/navigation':()=>`const router={push:()=>{throw Error('Navigation outside font fixture')},back:()=>{throw Error('Navigation outside font fixture')}};exports.useRouter=()=>router;exports.usePathname=()=>location.pathname;exports.useParams=()=>({});exports.useSearchParams=()=>new URLSearchParams(location.search)`,
  'next/link':()=>`const R=require('react');module.exports={__esModule:true,default:({children,prefetch,...props})=>R.createElement('a',props,children)}`,
  'next/dynamic':()=>`module.exports={__esModule:true,default:()=>()=>{throw Error('Dynamic overlay outside font fixture')}}`,
  '@/components/CustomerDetailPanel':()=>emptyOverlay,
  '@/components/CustomerForm':()=>emptyOverlay,
  '@/lib/authCache':()=>`exports.fetchMe=()=>fetch('/api/auth/me').then(r=>r.json());exports.invalidateMe=()=>{}`,
  '@/hooks/useCasts':()=>`exports.useCasts=()=>({casts:window.fontFixture.casts,isLoaded:true})`,
  '@/hooks/useCustomers':()=>`exports.useCustomers=()=>({customers:window.fontFixture.customers,addCustomer:async()=>{throw Error('Read-only font fixture')},toast:()=>{},ToastView:null})`,
  '@/hooks/useCustomerListActions':()=>`const activeFollowUpIds=new Set(),loadActiveFollowUpIds=async()=>activeFollowUpIds;const actions={activeFollowUpIds,busy:false,loadActiveFollowUpIds,addToFollowUp:async()=>false,removeFromFollowUp:async()=>false,moveToSevered:async()=>false,ToastView:null};exports.useCustomerListActions=()=>actions`,
  '@/lib/supabase/client':()=>`const client={from(table){const q={table,columns:'*',filters:[]};const builder={select(columns){q.columns=columns;return builder},then(resolve,reject){return fetch('/fixture/db?query='+encodeURIComponent(JSON.stringify(q))).then(r=>r.json()).then(resolve,reject)}};for(const method of ['eq','in','order','range','gte','lte','not','or'])builder[method]=(...args)=>{q.filters.push([method,...args]);return builder};for(const method of ['insert','update','delete','upsert'])builder[method]=()=>{throw Error('Read-only font fixture')};return builder},auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{throw Error('Logout outside font fixture')}}};exports.createClient=()=>client`,
}
function add(request, from = '') {
  let key = request
  if (!Object.hasOwn(mocks, request)) {
    key = key.startsWith('@/') ? key.slice(2) : key.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(from),key)) : key
    key = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(ext=>key+ext).find(file=>fs.existsSync(path.join(root,file)) && fs.statSync(path.join(root,file)).isFile()) || key
  }
  if (sources[key]) return key
  sources[key] = '// loading'
  let source
  if (mocks[request]) source = mocks[request]()
  else if (key.endsWith('.css')) {
    const input = read(key), prefix = key.replace(/\W/g,'_')+'_'
    const names = [...new Set([...input.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(match=>match[1]))]
    const classes = Object.fromEntries(names.map(name=>[name,prefix+name]))
    css.push(input.replace(/:global\(([^)]+)\)/g,'$1').replace(/\.([a-zA-Z_][\w-]*)/g,(_,name)=>'.'+classes[name]))
    source = `module.exports={__esModule:true,default:${JSON.stringify(classes)}}`
  } else source = ts.transpileModule(read(key),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
  sources[key] = source.replace(/require\(["']([^"']+)["']\)/g,(_,name)=>`require(${JSON.stringify(add(name,key))})`)
  return key
}
for (const key of ['react','react/jsx-runtime','react-dom','react-dom/client','scheduler','@/app/admin/cast-issues/page','@/components/ManualHomeClient','@/app/admin/daily-sales/page']) add(key)
const entry = `const React=require('react'),{createRoot}=require('react-dom/client');const component=location.pathname==='/manual'?'components/ManualHomeClient.tsx':location.pathname==='/daily-sales'?'app/admin/daily-sales/page.tsx':'app/admin/cast-issues/page.tsx';fetch('/fixture/bootstrap').then(r=>r.json()).then(data=>{window.fontFixture=data;createRoot(document.getElementById('app')).render(React.createElement(require(component).default,{isAdmin:true}));})`
const bundle = `const factories={${Object.entries(sources).map(([key,value])=>`${JSON.stringify(key)}:function(require,module,exports,process){${value}\n}`).join(',')}};const cache={};function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;if(!factories[name])throw Error('Missing fixture module '+name);factories[name](require,module,module.exports,{env:{NODE_ENV:'development'}});return module.exports}\n${entry}`
const queryReads = []
const server = createServer((request,response)=>{
  const url = new URL(request.url,'http://127.0.0.1:'+port)
  const json = (value,status=200)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(value))}
  response.setHeader('Cache-Control','no-store')
  response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'")
  if(request.method!=='GET') {json({error:'Read-only fake data fixture'},405);return}
  if(url.pathname==='/app.js'){response.setHeader('Content-Type','application/javascript');response.end(bundle);return}
  if(url.pathname==='/fixture/bootstrap'){json({casts,customers});return}
  if(url.pathname==='/api/auth/me'){json(me);return}
  if(url.pathname==='/manual/data.json'){json(manual);return}
  if(url.pathname==='/fixture/profile'){json({globals:'production-compiled',bodyFont:'system',compiledFiles:globalFiles,components:['app/admin/cast-issues/page.tsx','components/ManualHomeClient.tsx','app/admin/daily-sales/page.tsx'],queryReads});return}
  if(url.pathname==='/fixture/db'){
    const query=JSON.parse(url.searchParams.get('query'));queryReads.push(query)
    const visits=customers.map((customer,index)=>({id:'visit-'+customer.id,customer_id:customer.id,visit_date:'2026-11-04',visit_time:index?'22:30:00':'20:30:00',extension_minutes:30,amount_spent:customer.nomination_status==='場内'?0:index?987654:1234567,party_size:2,table_number:'P1',has_douhan:true,has_after:false,is_first_visit:false,companion_honshimei:'架空りな',companion_banai:'',memo:'架空メモ：次回は金曜日にご来店予定です。',customers:customer}))
    const data={cast_shifts:casts.map(cast=>({cast_id:cast.id,status:'出勤'})),customer_visits:visits,cast_extension_sales:[{id:'extension-1',cast_id:castIds[0],amount_spent:80000,party_size:1,start_time:'22:30:00',extension_minutes:30,table_number:'P2',has_douhan:false,has_after:false,companion_honshimei:'',companion_banai:'',memo:'架空の延長'}],cast_daily_free_seatings:castIds.map((cast_id,index)=>({cast_id,seating_count:index?0:12})),customer_bottles:[],announcements:[]}[query.table]
    if(!data){json({data:null,error:{message:'Unexpected fake table '+query.table}},500);return}
    json({data,error:null});return
  }
  if(url.pathname==='/api/admin/cast-issues'){
    const month=new Date(Date.now()+9*3600000).toISOString().slice(0,7)
    json({period:{mode:'rolling',month,start:month+'-01',end:month+'-04'},casts,selected_cast:casts[0],summary:{period_honshimei_customer_count:24,period_honshimei_visit_count:42,period_honshimei_sales:1234567,month_sales:1234567,sales_difference:765433,sales_achievement_rate:62,overdue_customer_count:0,banai_acquired_count:0,target_sales:2000000,target_work_days:20,current_work_days:3,period_work_days:3,period_bowzu_days:1,current_bowzu_streak:1},sections:{recent_honshimei:[],overdue_honshimei:[],recent_banai:[]}});return
  }
  if(url.pathname==='/api/admin/cast-issues/monthly'){
    const month=url.searchParams.get('month'),rows=[...casts,...casts.map((cast,index)=>({...cast,id:'extra-'+index,cast_name:index?'架空まい':'架空ゆい',cast_tier:'BB'}))].map((cast,index)=>({cast_id:cast.id,cast_name:cast.cast_name,cast_tier:cast.cast_tier,created_at:cast.created_at,rolling_fukuoka_honshimei_customer_count:15+index,sales:1234567+index*100000,target_sales:2000000,achievement_rate:62+index,month_progress_rate:13,achievement_progress_gap:49+index,honshimei_count:24+index,banai_count:12+index,free_seating_count:9+index,bowzu_days:1,bowzu_work_days:3,current_bowzu_streak:1,work_days:3,target_work_days:20,remaining_work_days:17}))
    json({period:{month,start:month+'-01',end:month+'-04'},rolling_period:{start:month+'-01',end:month+'-04'},rows,summary:{sales:5538268,target_sales:8000000,achievement_rate:69,month_progress_rate:13,achievement_progress_gap:56,honshimei_count:102,banai_count:54,free_seating_count:42,bowzu_days:4,work_days:12,target_work_days:80,remaining_work_days:68}});return
  }
  if(url.pathname.startsWith('/api/')){json({error:'Unexpected API in fake font fixture: '+url.pathname},404);return}
  if(!['/cast-issues','/manual','/daily-sales','/'].includes(url.pathname)){response.writeHead(404);response.end();return}
  response.setHeader('Content-Type','text/html; charset=utf-8')
  response.end(`<!doctype html><html lang="ja" class="h-full antialiased"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>実画面フォント確認・架空データ</title><style>${globals}\n${css.join('\n')}</style></head><body class="min-h-full flex flex-col" data-font-fixture="production-compiled"><main class="w-full min-h-screen relative overflow-x-hidden"><div id="app"></div></main><script src="/app.js"></script></body></html>`)
})
server.listen(port,'127.0.0.1',()=>console.log(`Font fixture http://127.0.0.1:${port} /cast-issues /manual /daily-sales; ${Object.keys(sources).length} real/mock modules`))
