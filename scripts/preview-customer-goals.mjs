// 実Reactコンポーネント＋架空API。実アカウント・本番DBには接続しない。
// node scripts/preview-customer-goals.mjs → http://127.0.0.1:6116
// 本体と同じ祖先CSS/実フォントでの確認前には npm run build -- --webpack を実行する。
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { createCustomerMeetingFixture } from './customer-meeting-fixture.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.ECLAT_GOALS_PREVIEW_PORT || 6116)
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('架空プレビューのポートが不正です')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
// 架空APIも本体の純粋な分類/集計関数を使用し、プレビュー独自の分類を作らない。
function compileFixtureModule(file, dependencies = {}) {
  const source = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInThisContext(`(function(require,exports){${source}\n})`, { filename: file })(name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    throw new Error('Unexpected fixture module: ' + name)
  }, exports)
  return exports
}
const fixtureGoalLogic = compileFixtureModule('lib/starCustomerGoals.ts')
const fixtureMeetingLogic = compileFixtureModule('lib/customerMeeting.ts')
const fixtureStarLogic = compileFixtureModule('lib/starredCustomers.ts', { '@/lib/starCustomerGoals': fixtureGoalLogic, './starCustomerGoals': fixtureGoalLogic })
// 実アプリのコンパイル済み祖先CSSを使用し、プレビュー専用のフォント指定をしない。
const builtCssDirectory = path.join(root, '.next/static/css')
const builtStyles = fs.existsSync(builtCssDirectory) ? fs.readdirSync(builtCssDirectory).filter(file => file.endsWith('.css')).map(file => fs.readFileSync(path.join(builtCssDirectory, file), 'utf8')) : []
const builtGlobals = builtStyles.find(source => source.includes('--font-app-sans') && /body\{[^}]*letter-spacing/.test(source))
if (!builtGlobals) throw new Error('本体CSSを生成してください: npm run build -- --webpack')
const globalCss = builtGlobals
const sources = {}, css = []
const mocks = {
  react: () => read('node_modules/react/cjs/react.development.js'),
  'react/jsx-runtime': () => read('node_modules/react/cjs/react-jsx-runtime.development.js'),
  'react-dom': () => read('node_modules/react-dom/cjs/react-dom.development.js'),
  'react-dom/client': () => read('node_modules/react-dom/cjs/react-dom-client.development.js'),
  scheduler: () => read('node_modules/scheduler/cjs/scheduler.development.js'),
  'next/dynamic': () => `const R=require('react');module.exports={__esModule:true,default:loader=>{const Lazy=R.lazy(loader);return props=>R.createElement(R.Suspense,{fallback:R.createElement('p',null,'読込中…')},R.createElement(Lazy,props))}}`,
  'next/navigation': () => `exports.usePathname=()=>'/stars';exports.useRouter=()=>({push:()=>{throw Error('Unexpected navigation')}})`,
  'next/link': () => `const R=require('react');module.exports={__esModule:true,default:({children,prefetch,...props})=>R.createElement('a',{...props,onClick:e=>e.preventDefault()},children)}`,
  '@/lib/authCache': () => `exports.fetchMe=async()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'admin',is_owner:true})`,
  '@/lib/excelExport': () => `exports.exportSingleCustomer=async()=>{}`,
  '@/lib/supabase/client': () => `const client={from:()=>({select(){return this},eq(){return this},in(){return this},or(){return this},order(){return this},range:async()=>({data:[],error:null}),single:async()=>({data:{id:'11111111-1111-4111-8111-111111111111'},error:null})})};exports.createClient=()=>client`,
  '@/hooks/useCustomers': () => `const get=(url)=>fetch(url).then(r=>r.json());const actions={getCustomer:id=>get('/fixture/customers/'+id),getVisits:async()=>new URLSearchParams(location.search).has('typography')?[{id:'fixture-visit-1',customer_id:'1',visit_date:'2026-11-02',amount_spent:987654321,has_douhan:false,has_after:false,party_size:1}]:[],getContacts:async()=>[],getBottles:async()=>[],getMemos:async()=>[],updateCustomer:(id,data)=>fetch('/fixture/customers/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json()),toast:()=>{},ToastView:null};exports.useCustomerActions=()=>actions`,
  '@/hooks/useUndoToast': () => `exports.useUndoToast=()=>({show:()=>{},ToastView:null})`,
  '@/hooks/useViewMode': () => `const R=require('react');exports.useViewMode=()=>{const [isPC,setIsPC]=R.useState(innerWidth>=768);R.useEffect(()=>{const resize=()=>setIsPC(innerWidth>=768);addEventListener('resize',resize);return()=>removeEventListener('resize',resize)},[]);return{isPC}}`,
  '@/components/PageHeader': () => `const R=require('react');module.exports={__esModule:true,default:({title})=>R.createElement('header',{style:{height:48,padding:'12px',borderBottom:'1px solid #f0dde2',background:'#fff9fa',fontSize:14}},title)}`,
  '@/components/CastWorkspace': () => `const R=require('react');module.exports={__esModule:true,default:()=>R.createElement('p',null,'個人キャスト画面は通常のプレビューを使用')}`,
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
for (const key of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'scheduler', '@/components/StarCustomerGoals', '@/components/StaffStarsPage', '@/hooks/useStarLog', '@/lib/dateUtils']) add(key)
const entry = `
const React=require('react'),{createRoot}=require('react-dom/client'),Goals=require('components/StarCustomerGoals.tsx').default,Staff=require('components/StaffStarsPage.tsx').default,{useStarLog}=require('hooks/useStarLog.tsx');
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
const staff=new URLSearchParams(location.search).has('staff'),readonly=new URLSearchParams(location.search).has('readonly');
createRoot(document.getElementById('app')).render(React.createElement(staff?Staff:App,staff?{profile:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'admin',is_owner:!readonly,permissions:{'顧客.閲覧':true,'顧客.編集':!readonly}}}:null));`
const bundle = `const factories={${Object.entries(sources).map(([key, value]) => `${JSON.stringify(key)}:function(require,module,exports,process){${value}\n}`).join(',')}};
const cache={};function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;factories[name](require,module,module.exports,{env:{NODE_ENV:'development'}});return module.exports}\n${entry}`
const castId = '11111111-1111-4111-8111-111111111111'
const secondCastId = '33333333-3333-4333-8333-333333333333'
const fixtureCasts = [
  { id: castId, cast_name: 'あかり', display_name: 'あかり', cast_tier: 'AC', is_active: true, sort_order: 0 },
  { id: secondCastId, cast_name: 'りな', display_name: 'りな', cast_tier: 'BA', is_active: true, sort_order: 1 },
]
let customers, goals, cycles, events, goalWrites, fixtureMode = 'cast', conflict = false, fail = false, failSearchPage = 0
let searchRequests, staffGoalRequests, rosterSalesVisits, rosterExtensionSales, rosterSalesCasts
const meetingFixture = createCustomerMeetingFixture({ logic: fixtureMeetingLogic, getCustomers: () => customers })
function reset(staff = false) {
  fixtureMode = staff ? 'staff' : 'cast'
  const names = ['田中さん', '佐藤さん', '山本さん', '中村さん', '高橋さん', '小林さん']
  customers = Array.from({ length: staff ? 126 : 56 }, (_, i) => ({ id: String(i + 1), customer_name: staff ? `${i < 63 ? 'あかり' : 'りな'}・お客様${i + 1}` : names[i] || `お客様${i + 1}`, nickname: staff ? '重点' : '', cast_name: staff && i >= 63 ? 'りな' : 'あかり', cast_type: 'その他', customer_rank: i === 2 ? 'C' : 'B', nomination_status: staff ? i % 4 >= 2 ? '場内' : '本指名' : [3, 4].includes(i) ? '場内' : '本指名', region: staff ? i % 2 ? '熊本県' : '福岡県' : i === 5 ? '' : [2, 4].includes(i) ? '熊本県' : '福岡県', occupation: '会社員', age_group: '40代', phase: 'リピート', favorite_type: '可愛い系', is_starred: true, no_reply: false, lastVisit: staff ? i % 2 ? '2026-10-28' : '2026-11-02' : `2026-11-0${i % 2 + 1}`, last_contact_date: '2026-10-29', total: 120000, count: 3, average: 40000, customer_staff_ids: [] }))
  for (const customer of customers) customer.visitRecords = [{ visit_date: customer.lastVisit, is_planned: false, nomination_status_at_visit: customer.nomination_status }]
  // 名簿は⭐️の有無とは独立した全顧客実来店＋場内延長。通常の顧客別目標実績は下の既存fixtureを維持する。
  rosterSalesVisits = customers.map(customer => ({ id: `roster-${customer.id}`, customer_id: customer.id, visit_date: '2026-11-02', amount_spent: customer.cast_name === 'りな' ? 250000 : customer.id === '1' ? 120000 : 60000, is_planned: false }))
  rosterSalesCasts = fixtureCasts.map(cast => ({ ...cast }))
  rosterExtensionSales = staff ? [
    { id: 'extension-1', cast_id: castId, sale_date: '2026-11-02', amount_spent: 15000 },
    { id: 'extension-2', cast_id: secondCastId, sale_date: '2026-11-03', amount_spent: 35000 },
  ] : []
  goals = new Map(customers.filter((_, i) => i !== 5).map((c, i) => [`2026-11:${c.id}`, { cast_id: castId, customer_id: Number(c.id), month: '2026-11-01', target_sales: i === 0 ? 300000 : 100000, target_visits: 3, note: i === 0 ? '月後半のお食事を相談する' : '金曜の出勤前に連絡する', revision: 1, updated_at: '2026-11-03T00:00:00Z' }]))
  if (staff) goals = new Map(['2026-11', '2026-12'].flatMap(month => customers.map(c => [`${month}:${c.id}`, { cast_id: c.cast_name === 'りな' ? secondCastId : castId, customer_id: Number(c.id), month: month + '-01', target_sales: (c.cast_name === 'りな' ? 500000 : 300000) + (month === '2026-12' ? 100000 : 0), target_visits: c.cast_name === 'りな' ? 5 : 3, note: `${c.cast_name}の${month === '2026-11' ? '11月' : '12月'}備考・担当別の目標`, revision: 1, updated_at: '2026-11-03T00:00:00Z' }])))
  cycles = customers.map(c => ({ id: `22222222-2222-4222-8222-${c.id.padStart(12, '0')}`, customer_id: Number(c.id), started_on: null, opened_at: '2026-10-01T00:00:00Z', ended_at: null, last_checked_on: null, last_status: '返信待ち', last_checked_by: null }))
  events = new Map(); goalWrites = []; searchRequests = []; staffGoalRequests = []; conflict = false; fail = false; failSearchPage = 0
  meetingFixture.reset()
}
reset()
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost'), readonly = request.headers.referer?.includes('readonly=1')
  const json = (data, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
  const body = async () => { let value = ''; for await (const chunk of request) value += chunk; return JSON.parse(value || '{}') }
  response.setHeader('Cache-Control', 'no-store')
  if (url.pathname === '/fixture/style-profile') { json({ globals: 'production-compiled', font: 'system', nextFontFaces: 0, localFontFiles: 0 }); return }
  if (url.pathname === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle); return }
  if (url.pathname === '/fixture/reset') { reset(url.searchParams.has('staff')); json({ ok: true }); return }
  if (url.pathname === '/fixture/conflict') { conflict = true; json({ ok: true }); return }
  if (url.pathname === '/fixture/fail') { fail = !fail; json({ ok: true }); return }
  if (url.pathname === '/fixture/fail-search-page') { failSearchPage = Number(url.searchParams.get('page') || 0); json({ ok: true }); return }
  if (url.pathname === '/fixture/state') { json({ customers, goals: [...goals.values()], cycles, events: [...events.values()], goalWrites, searchRequests, staffGoalRequests, meetingRecords: meetingFixture.records(), rosterSalesVisits, rosterExtensionSales, rosterSalesCasts }); return }
  if (url.pathname === '/fixture/roster-monthly-sales-setup') {
    const extraId = '9001', extraCastId = '44444444-4444-4444-8444-444444444444'
    if (!customers.some(customer => customer.id === extraId)) customers.push({ ...customers[0], id: extraId, customer_name: 'ゆい・⭐️なしのお客様', nickname: '', cast_name: 'ゆい', is_starred: false, lastVisit: '2026-11-02', visitRecords: [{ visit_date: '2026-11-02', is_planned: false }] })
    if (!rosterSalesCasts.some(cast => cast.id === extraCastId)) rosterSalesCasts.push({ id: extraCastId, cast_name: 'ゆい', display_name: 'ゆい', cast_tier: 'BB', is_active: true, sort_order: 2 })
    if (!rosterSalesVisits.some(visit => visit.id === 'sales-only-actual')) rosterSalesVisits.push(
      { id: 'sales-only-actual', customer_id: extraId, visit_date: '2026-11-02', amount_spent: 87000, is_planned: null },
      { id: 'sales-only-planned', customer_id: extraId, visit_date: '2026-11-03', amount_spent: 700000, is_planned: true },
      { id: 'sales-only-future', customer_id: extraId, visit_date: '2026-11-04', amount_spent: 800000, is_planned: false },
      { id: 'sales-only-previous-month', customer_id: extraId, visit_date: '2026-10-31', amount_spent: 900000, is_planned: false },
      { id: 'sales-only-next-month', customer_id: extraId, visit_date: '2026-12-01', amount_spent: 1000000, is_planned: false },
      { id: 'sales-only-orphan', customer_id: '999999', visit_date: '2026-11-02', amount_spent: 1100000, is_planned: false },
    )
    if (!rosterExtensionSales.some(sale => sale.id === 'extension-sales-only')) rosterExtensionSales.push(
      { id: 'extension-sales-only', cast_id: extraCastId, sale_date: '2026-11-02', amount_spent: 6000 },
      { id: 'extension-future', cast_id: extraCastId, sale_date: '2026-11-04', amount_spent: 1200000 },
      { id: 'extension-previous-month', cast_id: extraCastId, sale_date: '2026-10-31', amount_spent: 1300000 },
      { id: 'extension-next-month', cast_id: extraCastId, sale_date: '2026-12-01', amount_spent: 1400000 },
    )
    json({ ok: true }); return
  }
  if (await meetingFixture.handle({ request, url, json, body, readonly })) return
  if (url.pathname === '/fixture/remove') { const ids = await body(); customers.forEach(c => { if (ids.includes(c.id)) c.is_starred = false }); json({ ok: true }); return }
  if (url.pathname === '/fixture/customers') { json(customers); return }
  if (url.pathname.startsWith('/fixture/customers/')) {
    const c = customers.find(c => c.id === url.pathname.split('/').pop())
    if (request.method === 'PUT') Object.assign(c, await body())
    json(c); return
  }
  if (url.pathname === '/api/customer-staff/options') { json({ staff: [] }); return }
  if (url.pathname === '/api/customers/cast-options') { json({ casts: rosterSalesCasts }); return }
  const actual = (c, month) => ({ sales: month === '2026-11' ? c.cast_name === 'りな' ? 250000 : Number(c.id) === 1 ? 120000 : 60000 : 0, visits: month === '2026-11' ? c.cast_name === 'りな' ? 2 : 1 : 0 })
  const matches = c => {
    if (!c.is_starred || (url.searchParams.get('castName') && c.cast_name !== url.searchParams.get('castName'))) return false
    const view = url.searchParams.get('starredView'), keyword = url.searchParams.get('keyword') || '', day = url.searchParams.get('starredVisitDay'), check = url.searchParams.get('starCheck'), visitDate = url.searchParams.get('starredVisitDate')
    const elapsed = Math.round((Date.parse('2026-11-03') - Date.parse(c.lastVisit)) / 86400000)
    if (view === 'honshimei' && c.nomination_status !== '本指名') return false
    if (view === 'banai' && (visitDate
      ? !['場内', '本指名'].includes(c.nomination_status) || !c.visitRecords.some(visit => visit.visit_date === visitDate && visit.is_planned !== true && visit.nomination_status_at_visit === '場内')
      : c.nomination_status !== '場内' || (day ? elapsed !== Number(day) : ![1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30].includes(elapsed)))) return false
    if (keyword && !`${c.customer_name}${c.nickname}`.includes(keyword)) return false
    const checked = cycles.find(cy => String(cy.customer_id) === c.id)?.last_checked_on === '2026-11-03'
    return !((check === 'checked' && !checked) || (check === 'unchecked' && checked))
  }
  if (url.pathname === '/api/customers/star-counts') {
    const count = fixtureStarLogic.countStarredCustomers
    const starred = customers.filter(c => c.is_starred), customerMap = new Map(customers.map(customer => [String(customer.id), customer]))
    const byCast = new Map(Object.keys(count(starred).byCast).map(name => [name, 0]))
    const actualVisits = rosterSalesVisits.filter(visit => customerMap.has(String(visit.customer_id)) && visit.is_planned !== true && visit.visit_date >= '2026-11-01' && visit.visit_date < '2026-12-01' && visit.visit_date <= '2026-11-03')
    const ids = [...new Set(actualVisits.map(visit => String(visit.customer_id)))], actuals = fixtureGoalLogic.aggregateGoalVisits(ids, actualVisits, '2026-11', '2026-11-03')
    for (const id of ids) { const cast = customerMap.get(id).cast_name; byCast.set(cast, (byCast.get(cast) || 0) + actuals[id].sales) }
    const castNames = new Map(rosterSalesCasts.map(cast => [cast.id, cast.cast_name]))
    for (const sale of rosterExtensionSales) if (castNames.has(sale.cast_id) && sale.sale_date >= '2026-11-01' && sale.sale_date < '2026-12-01' && sale.sale_date <= '2026-11-03') {
      const cast = castNames.get(sale.cast_id); byCast.set(cast, (byCast.get(cast) || 0) + Number(sale.amount_spent ?? 0))
    }
    json({ ...count(starred), matched: count(customers.filter(matches)), monthlySales: { month: '2026-11', total: [...byCast.values()].reduce((sum, amount) => sum + amount, 0), byCast: Object.fromEntries(byCast) } }); return
  }
  if (url.pathname === '/api/customers/search') {
    const page = Number(url.searchParams.get('page') || 1), pageSize = Number(url.searchParams.get('pageSize') || 50), sort = url.searchParams.get('sort')
    searchRequests.push(Object.fromEntries(url.searchParams))
    if (page === failSearchPage) { json({ error: '架空の続き取得エラー' }, 503); return }
    const rows = customers.filter(matches).sort((a, b) => {
      if (a.cast_name !== b.cast_name) return fixtureCasts.findIndex(c => c.cast_name === a.cast_name) - fixtureCasts.findIndex(c => c.cast_name === b.cast_name)
      if (sort === 'name') return a.customer_name.localeCompare(b.customer_name, 'ja')
      return sort === 'lastVisitOldest' ? a.lastVisit.localeCompare(b.lastVisit) : b.lastVisit.localeCompare(a.lastVisit)
    })
    json({ customers: rows.slice((page - 1) * pageSize, page * pageSize).map(c => ({ ...c, metrics: { totalSpent: c.total, visitCount: c.count, avgPerVisit: c.average, lastVisitDate: c.lastVisit, daysSinceLastVisit: Math.round((Date.parse('2026-11-03') - Date.parse(c.lastVisit)) / 86400000) } })), total: rows.length, pageCount: Math.max(1, Math.ceil(rows.length / pageSize)), page }); return
  }
  if (url.pathname === '/api/customer-marks') { json({ items: customers.map(c => ({ id: c.id, is_starred: c.is_starred, no_reply: c.no_reply })) }); return }
  if (url.pathname.startsWith('/api/customers/')) {
    const customer = customers.find(c => c.id === url.pathname.split('/').pop())
    if (!customer) { json({ error: '架空のお客様が見つかりません' }, 404); return }
    if (request.method === 'PATCH') Object.assign(customer, await body())
    json(customer); return
  }
  if (url.pathname === '/api/planned-visits') { json([]); return }
  if (url.pathname === '/api/customer-goals/history') {
    const customerId = url.searchParams.get('customerId')
    json({ customerId, items: customerId === '1' ? [{ castId: '44444444-4444-4444-8444-444444444444', castName: '以前の担当', castActive: false, month: '2026-09-01', targetSales: 200000, targetVisits: 2, note: '引き継ぎ前の月別目標・備考（架空データ）', updatedAt: '2026-09-30T12:00:00Z' }] : [] }); return
  }
  if (url.pathname === '/api/customer-goals/staff') {
    if (fail) { json({ error: '架空の通信エラー。実績を0として扱いません。' }, 503); return }
    const month = url.searchParams.get('month'), ids = (url.searchParams.get('customerIds') || '').split(',')
    staffGoalRequests.push({ month, customerIds: ids })
    json({ month, customerIds: ids, canEdit: !readonly, items: Object.fromEntries(ids.map(customerId => {
      const customer = customers.find(c => c.id === customerId), assigned = fixtureCasts.find(c => c.cast_name === customer?.cast_name)
      return [customerId, { customerId, castId: customer?.is_starred && assigned ? assigned.id : null, castName: customer?.cast_name || null, status: !customer?.is_starred ? 'unavailable' : assigned ? 'ready' : 'unassigned', goal: customer?.is_starred && assigned ? goals.get(`${month}:${customerId}`) || null : null, actual: customer?.is_starred && assigned ? actual(customer, month) : null }]
    })) }); return
  }
  if (url.pathname === '/api/customer-goals') {
    if (request.method === 'GET') {
      if (fail) { json({ error: '架空の通信エラー。実績を0として扱いません。' }, 503); return }
      const month = url.searchParams.get('month'), requestedCastId = url.searchParams.get('castId')
      const cast = fixtureCasts.find(c => c.id === requestedCastId)
      const current = customers.filter(c => c.is_starred && c.cast_name === cast?.cast_name), ids = new Set(current.map(c => c.id))
      json({ castId: requestedCastId, month, goals: [...goals.values()].filter(g => g.cast_id === requestedCastId && g.month === month + '-01' && ids.has(String(g.customer_id))), actuals: Object.fromEntries(current.map(c => [c.id, { sales: month === '2026-11' && c.id === '1' ? 120000 : 0, visits: month === '2026-11' && c.id === '1' ? 1 : 0 }])), customerIds: [...ids], canEdit: !readonly }); return
    }
    if (readonly) { json({ error: '閲覧のみ' }, 403); return }
    const b = await body(), key = `${b.month}:${b.customerId}`, initial = goals.get(key)
    const assigned = fixtureCasts.find(cast => cast.cast_name === customers.find(c => c.id === b.customerId)?.cast_name)
    if (!assigned || b.castId !== assigned.id) { json({ error: '担当のキャストIDが一致しません' }, 403); return }
    if (!customers.find(c => c.id === b.customerId)?.is_starred) { json({ error: '⭐️が解除されています。入力を控えて一覧を更新してください' }, 409); return }
    if (conflict || (initial?.revision || 0) !== b.expectedRevision) { conflict = false; json({ error: '別のスタッフが保存しました。入力を控えて最新を再取得してください。' }, 409); return }
    const goal = { cast_id: b.castId, customer_id: Number(b.customerId), month: b.month + '-01', target_sales: b.targetSales, target_visits: b.targetVisits, note: b.note, revision: (initial?.revision || 0) + 1, updated_at: new Date().toISOString() }
    goalWrites.push(b)
    goals.set(key, goal); json({ goal }); return
  }
  if (url.pathname === '/api/star-logs') { json({ items: cycles.filter(cy => customers.some(c => Number(c.id) === cy.customer_id && c.is_starred && (!url.searchParams.get('castName') || c.cast_name === url.searchParams.get('castName')))) }); return }
  if (url.pathname.startsWith('/api/star-logs/')) {
    const id = url.pathname.split('/').pop(), cycle = cycles.find(c => String(c.customer_id) === id), customer = customers.find(c => c.id === id)
    if (request.method === 'POST') { const b = await body(); cycle.last_checked_on = b.checkedOn; cycle.last_status = b.status; cycle.last_checked_by = 'スタッフA'; events.set(b.requestId, { id: b.requestId, customer_id: Number(id), kind: 'check', event_on: b.checkedOn, status: b.status, note: b.note, actor_name: 'スタッフA', recorded_at: new Date().toISOString(), revision: 0 }); json({ ok: true }); return }
    json({ customer, cycle, logs: [...events.values()].filter(event => event.customer_id === Number(id)), can_edit: !readonly, has_more: false }); return
  }
  if (url.pathname === '/') {
    const staff = url.searchParams.has('staff')
    if ((staff ? 'staff' : 'cast') !== fixtureMode) reset(staff)
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(`<!doctype html><html lang="ja" class="h-full antialiased"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>⭐️目標・実績（架空データ）</title><style>${globalCss}\n${css.join('\n')}</style><body class="min-h-full flex flex-col" data-fixture-global-css="${builtGlobals ? 'production-compiled' : 'source-fallback'}"><main class="w-full min-h-screen relative overflow-x-hidden"><div id="app"></div></main><script>const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-03T12:00:00+09:00']))}static now(){return RealDate.parse('2026-11-03T12:00:00+09:00')}}</script><script src="/app.js"></script></body></html>`)
    return
  }
  response.writeHead(404); response.end('Not found')
}).listen(port, '127.0.0.1', () => process.stdout.write(`Customer goals fixture: http://127.0.0.1:${port}\n`))
