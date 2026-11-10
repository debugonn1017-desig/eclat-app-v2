// 実コンポーネント・実compiled globals・本番祖先を使う架空専用preview。
// npm run build -- --webpack 後に node scripts/preview-locker-ranking.mjs --port=6120
// 実アカウント/DB/外部通信/保存操作は使わない。API応答だけを架空化する。
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const root = process.env.ECLAT_REPO || fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(path.join(root, 'package.json')), ts = require('typescript')
const port = Number(process.argv.find(value => value.startsWith('--port='))?.slice(7) || process.env.ECLAT_LOCKER_PREVIEW_PORT || 6120)
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const globalFiles = fs.readdirSync(path.join(root, '.next/static/css')).filter(file => file.endsWith('.css'))
const globals = globalFiles.map(file => read('.next/static/css/' + file)).find(source => source.includes('--font-app-sans') && /body\{[^}]*letter-spacing/.test(source))
if (!globals) throw Error('Build the app before locker ranking QA')
const me = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_name: '架空管理者', role: 'admin', is_active: true, is_owner: true, permissions: {} }
const sources = {}, css = []
const mocks = {
  react: () => read('node_modules/react/cjs/react.development.js'),
  'react/jsx-runtime': () => read('node_modules/react/cjs/react-jsx-runtime.development.js'),
  'react-dom': () => read('node_modules/react-dom/cjs/react-dom.development.js'),
  'react-dom/client': () => read('node_modules/react-dom/cjs/react-dom-client.development.js'),
  scheduler: () => read('node_modules/scheduler/cjs/scheduler.development.js'),
  'next/navigation': () => `const router={push:()=>{throw Error('Navigation outside locker fixture')},back:()=>{throw Error('Navigation outside locker fixture')}};exports.useRouter=()=>router;exports.usePathname=()=>'/admin/locker-ranking';exports.useParams=()=>({});exports.useSearchParams=()=>new URLSearchParams(location.search)`,
  'next/link': () => `const R=require('react');module.exports={__esModule:true,default:({children,prefetch,...props})=>R.createElement('a',props,children)}`,
  '@/lib/authCache': () => `exports.fetchMe=()=>fetch('/api/auth/me').then(r=>r.json());exports.invalidateMe=()=>{}`,
  '@/lib/supabase/client': () => `const client={from(table){if(table!=='announcements')throw Error('Unexpected fixture table '+table);const query={select(){return this},eq(){return this},order(){return this},then(resolve,reject){return fetch('/fixture/announcements').then(r=>r.json()).then(resolve,reject)}};return query},auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{throw Error('Logout outside read-only fixture')}}};exports.createClient=()=>client`,
}
function add(request, from = '') {
  let key = request
  if (!Object.hasOwn(mocks, request)) {
    key = key.startsWith('@/') ? key.slice(2) : key.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(from), key)) : key
    key = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(ext => key + ext).find(file => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile()) || key
  }
  if (sources[key]) return key
  sources[key] = '// loading'
  let source
  if (mocks[request]) source = mocks[request]()
  else if (key.endsWith('.css')) {
    const input = read(key), prefix = key.replace(/\W/g, '_') + '_', globals = []
    // :global内のbody印刷flag等は本番と同じ名前のまま残す。
    const local = input.replace(/:global\(([^)]+)\)/g, (_, value) => { globals.push(value); return `GLOBALTOKEN${globals.length - 1}END` })
    const names = [...new Set([...local.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(match => match[1]))], classes = Object.fromEntries(names.map(name => [name, prefix + name]))
    css.push(local.replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => '.' + classes[name]).replace(/GLOBALTOKEN(\d+)END/g, (_, index) => globals[Number(index)]))
    source = `module.exports={__esModule:true,default:${JSON.stringify(classes)}}`
  } else source = ts.transpileModule(read(key), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  sources[key] = source.replace(/require\(["']([^"']+)["']\)/g, (_, name) => `require(${JSON.stringify(add(name, key))})`)
  return key
}
for (const key of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'scheduler', '@/components/LockerRankingPage']) add(key)
// 既存レポートのnamed @pageと併存させ、紙サイズのscope漏れも検証する。
for (const key of ['@/components/CustomerGoalsExport.module.css', '@/components/StarredCustomersPrint.module.css']) add(key)
const entry = `const React=require('react'),{createRoot}=require('react-dom/client'),Page=require('components/LockerRankingPage.tsx').default;createRoot(document.getElementById('app')).render(React.createElement(Page));`
const bundle = `const factories={${Object.entries(sources).map(([key, value]) => `${JSON.stringify(key)}:function(require,module,exports,process){${value}\n}`).join(',')}};const cache={};function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;if(!factories[name])throw Error('Missing fixture module '+name);factories[name](require,module,module.exports,{env:{NODE_ENV:'development'}});return module.exports}\n${entry}`
const businessDate = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10), currentMonth = businessDate.slice(0, 7)
const previous = new Date(businessDate + 'T00:00:00Z'); previous.setUTCDate(previous.getUTCDate() - 1)
const requests = [], attempts = new Map()
function ranking(month, scenario) {
  const rows = scenario === 'empty' ? [] : Array.from({ length: 36 }, (_, i) => ({
    castId: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
    castName: i === 0 ? `${month}の架空あかり` : i === 8 ? '長いお名前のキャスト'.repeat(5) : `架空キャスト${String(i + 1).padStart(2, '0')}`,
    rank: i + 1, sales: i < 2 ? 123456789 : i > 32 ? 0 : 98765432 - i * 1000000,
    honshimei: i === 0 ? 9999 : i % 8, banai: i % 9, douhan: i % 4, bowzuDays: i % 3, bowzuStreak: i === 0 ? 123 : i % 5,
  }))
  return { month, periodStart: month + '-01', periodEnd: month === currentMonth ? businessDate : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10), businessDate, previousBusinessDate: previous.toISOString().slice(0, 10), rows,
    previousDayBowzu: rows.length ? [rows[0], rows[8], rows[20]].map((row, i) => ({ castId: row.castId, castName: row.castName, streak: [12, 2, 1][i] })) : [] }
}
createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:' + port), json = (value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)) }
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'")
  if (request.method !== 'GET') { json({ error: 'Read-only fictional fixture' }, 405); return }
  if (url.pathname === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle); return }
  if (url.pathname === '/api/auth/me') { json(me); return }
  if (url.pathname === '/fixture/announcements') { json({ data: [], error: null }); return }
  if (url.pathname === '/fixture/profile') { json({ globals: 'production-compiled', globalFiles, businessDate, currentMonth, requests, components: ['LockerRankingPage', 'PageHeader', 'BottomNav', 'UserChip', 'NotificationBell'] }); return }
  if (url.pathname === '/api/admin/locker-ranking') {
    const month = url.searchParams.get('month') || currentMonth, referer = new URL(request.headers.referer || '/', 'http://127.0.0.1:' + port), scenario = referer.searchParams.get('scenario') || 'normal'
    const key = referer.href, attempt = (attempts.get(key) || 0) + 1; attempts.set(key, attempt); requests.push({ month, scenario, attempt })
    const send = () => {
      if (scenario === 'error' || scenario === 'error-once' && attempt === 1) { json({ error: '架空の集計エラー。再取得してください。' }, 503); return }
      if (!/^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(month) || month > currentMonth) { json({ error: '対象月が不正です' }, 400); return }
      json(ranking(month, scenario))
    }
    if (scenario === 'race' && month.endsWith('-10')) setTimeout(send, 450)
    else send()
    return
  }
  if (url.pathname.startsWith('/api/')) { json({ error: 'Unexpected API in locker fixture' }, 404); return }
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><html lang="ja" class="h-full antialiased"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>更衣室ランキングQA・架空データ</title><style>${globals}\n${css.join('\n')}</style></head><body class="min-h-full flex flex-col" data-locker-fixture="production-compiled"><main class="w-full min-h-screen relative overflow-x-clip"><div id="app"></div></main><script src="/app.js"></script></body></html>`)
}).listen(port, '127.0.0.1', () => console.log(`Locker fixture http://127.0.0.1:${port}; ${Object.keys(sources).length} real/mock modules`))
