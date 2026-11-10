// 実シフト画面と実compiled globalsを架空の保存APIだけで検証する。
// npm run build -- --webpack 後に node scripts/preview-shift-time-memo.mjs
// 実アカウント・本番DBに接続しない。全て localhost 内の架空データ。
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.ECLAT_SHIFT_PREVIEW_PORT || 6117)
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const globals = fs.readdirSync(path.join(root, '.next/static/css')).filter(file => file.endsWith('.css')).map(file => read('.next/static/css/' + file)).find(source => source.includes('--font-app-sans') && /body\{[^}]*letter-spacing/.test(source))
if (!globals) throw Error('Build the app before shift memo QA')
const castIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
const casts = ['架空あかり', '架空りな'].map((name, index) => ({ id: castIds[index], cast_name: name, display_name: name, cast_tier: index ? 'BA' : 'AC', role: 'cast', is_active: true, created_at: '2025-01-01T00:00:00Z', joined_at: '2025-01-01', training_start_date: null }))
const me = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', display_name: '架空管理者', role: 'admin', is_owner: true, permissions: { 'シフト.管理': true } }
const sources = {}, css = []
const mocks = {
  react: () => read('node_modules/react/cjs/react.development.js'),
  'react/jsx-runtime': () => read('node_modules/react/cjs/react-jsx-runtime.development.js'),
  'react-dom': () => read('node_modules/react-dom/cjs/react-dom.development.js'),
  'react-dom/client': () => read('node_modules/react-dom/cjs/react-dom-client.development.js'),
  scheduler: () => read('node_modules/scheduler/cjs/scheduler.development.js'),
  'next/navigation': () => `const router={push:()=>{throw Error('Navigation outside shift fixture')},back:()=>{throw Error('Navigation outside shift fixture')}};exports.useRouter=()=>router;exports.usePathname=()=>'/admin/shifts'`,
  'next/link': () => `const R=require('react');module.exports={__esModule:true,default:({children,prefetch,...props})=>R.createElement('a',{...props,onClick:e=>e.preventDefault()},children)}`,
  '@/components/NotificationBell': () => `module.exports={__esModule:true,default:()=>null}`,
  '@/components/UserChip': () => `const R=require('react');module.exports={__esModule:true,default:()=>R.createElement('span',{style:{fontSize:10}},'架空管理者')}`,
  '@/lib/authCache': () => `exports.fetchMe=()=>fetch('/api/auth/me').then(r=>r.json());exports.invalidateMe=()=>{}`,
  '@/hooks/useCasts': () => `exports.useCasts=()=>({casts:window.shiftFixture.casts,isLoaded:true})`,
  '@/lib/supabase/client': () => `const client={from(table){const q={table,columns:'*',filters:[],operation:'select'};const builder={select(columns){q.columns=columns||'*';return builder},then(resolve,reject){return fetch('/fixture/db',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(q)}).then(r=>r.json()).then(resolve,reject)}};for(const method of ['eq','is','in','order','range','gte','lte','not','or','neq'])builder[method]=(...args)=>{q.filters.push([method,...args]);return builder};builder.upsert=(rows,options)=>{q.operation='upsert';q.rows=Array.isArray(rows)?rows:[rows];q.options=options;return builder};builder.insert=rows=>{q.operation='insert';q.rows=Array.isArray(rows)?rows:[rows];return builder};builder.update=values=>{q.operation='update';q.values=values;return builder};builder.delete=()=>{q.operation='delete';return builder};return builder}};exports.createClient=()=>client`,
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
    const input = read(key), prefix = key.replace(/\W/g, '_') + '_'
    const names = [...new Set([...input.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(match => match[1]))]
    const classes = Object.fromEntries(names.map(name => [name, prefix + name]))
    css.push(input.replace(/:global\(([^)]+)\)/g, '$1').replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => '.' + classes[name]))
    source = `module.exports={__esModule:true,default:${JSON.stringify(classes)}}`
  } else source = ts.transpileModule(read(key), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  sources[key] = source.replace(/require\(["']([^"']+)["']\)/g, (_, name) => `require(${JSON.stringify(add(name, key))})`)
  return key
}
for (const key of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'scheduler', '@/app/admin/shifts/page']) add(key)
const entry = `const React=require('react'),{createRoot}=require('react-dom/client');fetch('/fixture/bootstrap').then(r=>r.json()).then(data=>{window.shiftFixture=data;createRoot(document.getElementById('app')).render(React.createElement(require('app/admin/shifts/page.tsx').default));})`
const bundle = `const factories={${Object.entries(sources).map(([key, value]) => `${JSON.stringify(key)}:function(require,module,exports,process){${value}\n}`).join(',')}};const cache={};function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;if(!factories[name])throw Error('Missing shift fixture module '+name);factories[name](require,module,module.exports,{env:{NODE_ENV:'development'}});return module.exports}\n${entry}`
let shifts, writes, reads, controls
function reset() {
  shifts = [
    { cast_id: castIds[0], shift_date: '2026-11-01', status: '希望出勤', memo: '衣装確認' },
    { cast_id: castIds[0], shift_date: '2026-11-02', status: '希望出勤', memo: '希望出勤時間: 21:00\n別のメモを保持' },
    { cast_id: castIds[0], shift_date: '2026-11-03', status: '出勤', memo: '確定済みのメモ' },
    { cast_id: castIds[0], shift_date: '2026-11-04', status: '休み', memo: '休みのメモ' },
    { cast_id: castIds[0], shift_date: '2026-11-05', status: '希望出勤', memo: '' },
    { cast_id: castIds[1], shift_date: '2026-11-01', status: '希望出勤', memo: '' },
  ]
  writes = []; reads = []; controls = { readFailure: false, writeFailure: false, deleteFailure: false }
}
reset()
const matches = (row, filters) => filters.every(([method, column, value]) => method === 'eq' || method === 'is' ? row[column] === value : method === 'in' ? value.includes(row[column]) : method === 'gte' ? row[column] >= value : method === 'lte' ? row[column] <= value : method === 'neq' ? row[column] !== value : true)
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:' + port)
  const json = (value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
  const body = async () => { let value = ''; for await (const chunk of request) value += chunk; return JSON.parse(value || '{}') }
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'")
  if (url.pathname === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle); return }
  if (url.pathname === '/fixture/bootstrap') { json({ casts }); return }
  if (url.pathname === '/fixture/reset') { reset(); json({ ok: true }); return }
  if (url.pathname === '/fixture/control') { Object.assign(controls, await body()); json({ ok: true }); return }
  if (url.pathname === '/fixture/concurrent-shift') {
    const { castId, date, create, ...change } = await body()
    if (Object.keys(change).some(key => !['status', 'memo'].includes(key))) { json({ error: 'Unsupported fake shift change' }, 400); return }
    let row = shifts.find(shift => shift.cast_id === castId && shift.shift_date === date)
    if (!row && create) { row = { cast_id: castId, shift_date: date, status: '未定', memo: '' }; shifts.push(row) }
    if (!row) { json({ error: 'Fake shift not found' }, 404); return }
    Object.assign(row, change); json({ ok: true }); return
  }
  if (url.pathname === '/fixture/state') { json({ shifts, writes, reads, controls }); return }
  if (url.pathname === '/api/auth/me') { json(me); return }
  if (url.pathname === '/fixture/db') {
    const query = await body()
    if (query.operation === 'select') {
      reads.push(query)
      if (query.table === 'cast_shifts' && controls.readFailure) { json({ data: null, error: { message: '架空のシフト取得失敗' } }); return }
      let data = query.table === 'cast_shifts' ? shifts.filter(row => matches(row, query.filters))
        : query.table === 'planned_visits' ? [{ id: 1, customer_id: 'fixture-customer', cast_id: castIds[0], planned_date: '2026-11-05', planned_time: '21:30', party_size: 2, has_douhan: true, memo: '架空の予定メモ', status: '予定', customers: { customer_name: '架空来店予定' } }].filter(row => matches(row, query.filters))
          : query.table === 'customer_visits' ? [] : null
      if (!data) { json({ data: null, error: { message: 'Unexpected fake table ' + query.table } }); return }
      for (const [method, from, to] of query.filters) if (method === 'range') data = data.slice(from, to + 1)
      json({ data, error: null }); return
    }
    if (query.table !== 'cast_shifts') { json({ data: null, error: { message: 'Only fake shifts may be changed' } }); return }
    writes.push(query)
    if (controls.writeFailure || query.operation === 'delete' && controls.deleteFailure) { json({ data: null, error: { message: '架空のシフト保存失敗' } }); return }
    let changed = []
    if (query.operation === 'insert' && query.rows.some(input => shifts.some(row => row.cast_id === input.cast_id && row.shift_date === input.shift_date))) { json({ data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }); return }
    if (query.operation === 'upsert' || query.operation === 'insert') for (const input of query.rows) {
      let existing = shifts.find(row => row.cast_id === input.cast_id && row.shift_date === input.shift_date)
      if (existing) Object.assign(existing, input)
      else { existing = { memo: '', ...input }; shifts.push(existing) }
      changed.push(existing)
    }
    else if (query.operation === 'update') {
      changed = shifts.filter(row => matches(row, query.filters))
      for (const row of changed) Object.assign(row, query.values)
    }
    else if (query.operation === 'delete') { changed = shifts.filter(row => matches(row, query.filters)); shifts = shifts.filter(row => !matches(row, query.filters)) }
    else { json({ data: null, error: { message: 'Unsupported fake write' } }); return }
    json({ data: changed, error: null }); return
  }
  if (url.pathname.startsWith('/api/') || request.method !== 'GET') { json({ error: 'Unexpected shift fixture route' }, 404); return }
  if (!['/', '/admin/shifts'].includes(url.pathname)) { response.writeHead(404); response.end(); return }
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><html lang="ja" class="h-full antialiased"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>シフト時間メモ・架空データ</title><style>${globals}\n${css.join('\n')}</style></head><body class="min-h-full flex flex-col"><main class="w-full min-h-screen relative overflow-x-clip"><div id="app"></div></main><script>const NativeDate=Date;Date=class extends NativeDate{constructor(...a){super(...(a.length?a:['2026-11-05T03:00:00Z']))}static now(){return new NativeDate('2026-11-05T03:00:00Z').getTime()}}</script><script src="/app.js"></script></body></html>`)
})
server.listen(port, '127.0.0.1', () => console.log(`Shift memo fixture http://127.0.0.1:${port}; ${Object.keys(sources).length} real/mock modules`))
