// 実Reactコンポーネント＋架空API。実アカウント・本番DBには接続しない。
// node scripts/preview-customer-goals.mjs → http://127.0.0.1:6116
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
const root = fileURLToPath(new URL('..', import.meta.url))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const sources = {}, css = []
const mocks = {
  react: () => read('node_modules/react/cjs/react.development.js'),
  'react/jsx-runtime': () => read('node_modules/react/cjs/react-jsx-runtime.development.js'),
  'react-dom': () => read('node_modules/react-dom/cjs/react-dom.development.js'),
  'react-dom/client': () => read('node_modules/react-dom/cjs/react-dom-client.development.js'),
  scheduler: () => read('node_modules/scheduler/cjs/scheduler.development.js'),
  'next/dynamic': () => `const R=require('react');module.exports={__esModule:true,default:loader=>{const Lazy=R.lazy(loader);return props=>R.createElement(R.Suspense,{fallback:R.createElement('p',null,'読込中…')},R.createElement(Lazy,props))}}`,
  'next/navigation': () => `exports.useRouter=()=>({push:()=>{throw Error('Unexpected navigation')}})`,
  '@/lib/authCache': () => `exports.fetchMe=async()=>({role:'admin',is_owner:true})`,
  '@/lib/excelExport': () => `exports.exportSingleCustomer=async()=>{}`,
  '@/lib/supabase/client': () => `const client={from:()=>({select(){return this},eq(){return this},single:async()=>({data:{id:'11111111-1111-4111-8111-111111111111'},error:null})})};exports.createClient=()=>client`,
  '@/hooks/useCustomers': () => `const get=(url)=>fetch(url).then(r=>r.json());const actions={getCustomer:id=>get('/fixture/customers/'+id),getVisits:async()=>[],getContacts:async()=>[],getBottles:async()=>[],getMemos:async()=>[],updateCustomer:(id,data)=>fetch('/fixture/customers/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json()),toast:()=>{},ToastView:null};exports.useCustomerActions=()=>actions`,
  '@/hooks/useUndoToast': () => `exports.useUndoToast=()=>({show:()=>{},ToastView:null})`,
  '@/hooks/useViewMode': () => `exports.useViewMode=()=>({isPC:innerWidth>=768})`,
}
function add(request, from = '') {
  let key = request
  if (!(key in mocks) && !['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'scheduler'].includes(key)) {
    key = key.startsWith('@/') ? key.slice(2) : key.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(from), key)) : key
    key = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(ext => key + ext).find(file => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile()) || key
  }
  if (sources[key]) return key
  sources[key] = '// loading'
  let source
  if (mocks[request]) source = mocks[request]()
  else if (key.endsWith('.css')) {
    const input = read(key), prefix = path.basename(key).replace(/\W/g, '') + '_'
    const names = [...new Set([...input.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m => m[1]))]
    const classes = Object.fromEntries(names.map(name => [name, prefix + name]))
    css.push(input.replace(/:global\(([^)]+)\)/g, '$1').replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => '.' + classes[name]))
    source = `module.exports={__esModule:true,default:${JSON.stringify(classes)}}`
  } else source = ts.transpileModule(read(key), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  sources[key] = source.replace(/require\(["']([^"']+)["']\)/g, (_, name) => `require(${JSON.stringify(add(name, key))})`)
  return key
}
for (const key of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'scheduler', '@/components/StarCustomerGoals', '@/hooks/useStarLog', '@/lib/dateUtils']) add(key)
const entry = `
const React=require('react'),{createRoot}=require('react-dom/client'),Goals=require('components/StarCustomerGoals.tsx').default,{useStarLog}=require('hooks/useStarLog.tsx');
function App(){
const [customers,setCustomers]=React.useState([]),[revision,setRevision]=React.useState(0),[month,setMonth]=React.useState('2026-11'),[view,setView]=React.useState('all'),[sortKey,setSortKey]=React.useState('lastVisitNewest');
const readonly=new URLSearchParams(location.search).has('readonly');
const load=React.useCallback(()=>fetch('/fixture/customers').then(r=>r.json()).then(setCustomers),[]);
React.useEffect(()=>{load()},[load,revision]);
const refresh=()=>setRevision(v=>v+1);const logs=useStarLog({enabled:true,scopeKey:'fixture',castName:'あかり',revision,onChanged:refresh});
const map=(key)=>new Map(customers.map(c=>[String(c.id),c[key]]));
const remove=async ids=>{await fetch('/fixture/remove',{method:'POST',body:JSON.stringify(ids)});refresh();return true};
const ordered=[...customers].filter(c=>c.is_starred).sort((a,b)=>sortKey==='name'?a.customer_name.localeCompare(b.customer_name,'ja'):sortKey==='lastVisitOldest'?a.lastVisit.localeCompare(b.lastVisit):b.lastVisit.localeCompare(a.lastVisit));
return React.createElement(React.Fragment,null,React.createElement('main',{style:{maxWidth:1200,margin:'auto',padding:'8px'}},React.createElement(Goals,{castId:'11111111-1111-4111-8111-111111111111',castName:'あかり',month,setMonth,target:{target_sales:1200000,target_avg_spend:60000,target_work_days:20},customers:ordered,today:'2026-11-03',metadataReady:true,metadataError:false,lastVisits:map('lastVisit'),totals:map('total'),counts:map('count'),averages:map('average'),patterns:new Map(),staffNames:new Map(),companions:new Map(),bottleSearch:new Map(),logs,revision,busy:logs.busy,canManage:!readonly,isAdmin:true,sortKey,onSort:setSortKey,view,onView:setView,noReply:new Set(),onRemoveStar:remove,onNoReply:async()=>true,onSever:async()=>true,onRank:()=>{},onRefresh:refresh,onBusyChange:()=>{}})),logs.Overlays)}
createRoot(document.getElementById('app')).render(React.createElement(App));`
const bundle = `const factories={${Object.entries(sources).map(([key, value]) => `${JSON.stringify(key)}:function(require,module,exports,process){${value}\n}`).join(',')}};
const cache={};function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;factories[name](require,module,module.exports,{env:{NODE_ENV:'development'}});return module.exports}\n${entry}`
const castId = '11111111-1111-4111-8111-111111111111'
let customers, goals, cycles, events, conflict = false, fail = false
function reset() {
  const names = ['田中さん', '佐藤さん', '山本さん', '中村さん', '高橋さん', '小林さん']
  customers = Array.from({ length: 56 }, (_, i) => ({ id: String(i + 1), customer_name: names[i] || `お客様${i + 1}`, nickname: '', cast_name: 'あかり', cast_type: 'その他', customer_rank: i === 2 ? 'C' : 'B', nomination_status: [3, 4].includes(i) ? '場内' : '本指名', region: i === 5 ? '' : [2, 4].includes(i) ? '熊本県' : '福岡県', occupation: '会社員', age_group: '40代', phase: 'リピート', favorite_type: '可愛い系', is_starred: true, no_reply: false, lastVisit: `2026-11-0${i % 2 + 1}`, last_contact_date: '2026-10-29', total: 120000, count: 3, average: 40000, customer_staff_ids: [] }))
  goals = new Map(customers.filter((_, i) => i !== 5).map((c, i) => [`2026-11:${c.id}`, { cast_id: castId, customer_id: Number(c.id), month: '2026-11-01', target_sales: i === 0 ? 300000 : 100000, target_visits: 3, note: i === 0 ? '月後半のお食事を相談する' : '金曜の出勤前に連絡する', revision: 1, updated_at: '2026-11-03T00:00:00Z' }]))
  cycles = customers.map(c => ({ id: `22222222-2222-4222-8222-${c.id.padStart(12, '0')}`, customer_id: Number(c.id), started_on: null, opened_at: '2026-10-01T00:00:00Z', ended_at: null, last_checked_on: null, last_status: '返信待ち', last_checked_by: null }))
  events = new Map(); conflict = false; fail = false
}
reset()
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost'), readonly = request.headers.referer?.includes('readonly=1')
  const json = (data, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
  const body = async () => { let value = ''; for await (const chunk of request) value += chunk; return JSON.parse(value || '{}') }
  response.setHeader('Cache-Control', 'no-store')
  if (url.pathname === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle); return }
  if (url.pathname === '/fixture/reset') { reset(); json({ ok: true }); return }
  if (url.pathname === '/fixture/conflict') { conflict = true; json({ ok: true }); return }
  if (url.pathname === '/fixture/fail') { fail = !fail; json({ ok: true }); return }
  if (url.pathname === '/fixture/state') { json({ customers, goals: [...goals.values()], cycles, events: [...events.values()] }); return }
  if (url.pathname === '/fixture/remove') { const ids = await body(); customers.forEach(c => { if (ids.includes(c.id)) c.is_starred = false }); json({ ok: true }); return }
  if (url.pathname === '/fixture/customers') { json(customers); return }
  if (url.pathname.startsWith('/fixture/customers/')) {
    const c = customers.find(c => c.id === url.pathname.split('/').pop())
    if (request.method === 'PUT') Object.assign(c, await body())
    json(c); return
  }
  if (url.pathname === '/api/customer-staff/options') { json({ staff: [] }); return }
  if (url.pathname === '/api/planned-visits') { json([]); return }
  if (url.pathname === '/api/customer-goals') {
    if (request.method === 'GET') {
      if (fail) { json({ error: '架空の通信エラー。実績を0として扱いません。' }, 503); return }
      const month = url.searchParams.get('month')
      json({ castId, month, goals: [...goals.values()].filter(g => g.month.startsWith(month)), actuals: Object.fromEntries(customers.map((c, i) => [c.id, { sales: month === '2026-11' ? (i === 0 ? 120000 : 0) : 0, visits: month === '2026-11' && i === 0 ? 1 : 0 }])), customerIds: customers.map(c => c.id), canEdit: !readonly }); return
    }
    if (readonly) { json({ error: '閲覧のみ' }, 403); return }
    const b = await body(), key = `${b.month}:${b.customerId}`, initial = goals.get(key)
    if (!customers.find(c => c.id === b.customerId)?.is_starred) { json({ error: '⭐️が解除されています。入力を控えて一覧を更新してください' }, 409); return }
    if (conflict || (initial?.revision || 0) !== b.expectedRevision) { conflict = false; json({ error: '別のスタッフが保存しました。入力を控えて最新を再取得してください。' }, 409); return }
    const goal = { cast_id: castId, customer_id: Number(b.customerId), month: b.month + '-01', target_sales: b.targetSales, target_visits: b.targetVisits, note: b.note, revision: (initial?.revision || 0) + 1, updated_at: new Date().toISOString() }
    goals.set(key, goal); json({ goal }); return
  }
  if (url.pathname === '/api/star-logs') { json({ items: cycles.filter(cy => customers.some(c => Number(c.id) === cy.customer_id && c.is_starred)) }); return }
  if (url.pathname.startsWith('/api/star-logs/')) {
    const id = url.pathname.split('/').pop(), cycle = cycles.find(c => String(c.customer_id) === id), customer = customers.find(c => c.id === id)
    if (request.method === 'POST') { const b = await body(); cycle.last_checked_on = b.checkedOn; cycle.last_status = b.status; cycle.last_checked_by = 'スタッフA'; events.set(b.requestId, { id: b.requestId, kind: 'check', event_on: b.checkedOn, status: b.status, note: b.note, actor_name: 'スタッフA', recorded_at: new Date().toISOString(), revision: 0 }); json({ ok: true }); return }
    json({ customer, cycle, logs: [...events.values()], can_edit: !readonly, has_more: false }); return
  }
  if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(`<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width, initial-scale=1"><title>⭐️目標・実績（架空データ）</title><style>${read('app/globals.css').replace(/@import[^;]+;/g, '')}\n${css.join('\n')} body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;background:#fff9fa} </style><div id="app"></div><script src="/app.js"></script></html>`); return }
  response.writeHead(404); response.end('Not found')
}).listen(6116, '127.0.0.1', () => process.stdout.write('Customer goals fixture: http://127.0.0.1:6116\n'))
