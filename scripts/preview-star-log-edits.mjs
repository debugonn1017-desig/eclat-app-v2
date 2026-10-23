// 実コンポーネントの架空データ専用確認。認証・本番DB・外部通信は使わない。
// node scripts/preview-star-log-edits.mjs → http://127.0.0.1:6115
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
const root = fileURLToPath(new URL('..', import.meta.url))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const compile = file => ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
function cssModule(file, prefix) {
  const source = read(file)
  const names = [...new Set([...source.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => match[1]))]
  const styles = Object.fromEntries(names.map(name => [name, prefix + name]))
  return { code: `module.exports={__esModule:true,default:${JSON.stringify(styles)}}`, css: source.replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => '.' + styles[name]) }
}
const logCss = cssModule('components/StarLog.module.css', 'log_')
const previewCss = cssModule('components/CustomerCardPreview.module.css', 'preview_')
const sources = {
  react: read('node_modules/react/cjs/react.development.js'),
  'react/jsx-runtime': read('node_modules/react/cjs/react-jsx-runtime.development.js'),
  'react-dom': read('node_modules/react-dom/cjs/react-dom.development.js'),
  'react-dom/client': read('node_modules/react-dom/cjs/react-dom-client.development.js'),
  scheduler: read('node_modules/scheduler/cjs/scheduler.development.js'),
  '@/lib/colors': compile('lib/colors.ts'), '@/lib/starLog': compile('lib/starLog.ts'),
  '@/lib/customerListScroll': compile('lib/customerListScroll.ts'),
  '@/hooks/useJstToday': `module.exports={useJstToday:()=> '2026-10-24'}`,
  './StarLog.module.css': logCss.code, './CustomerCardPreview.module.css': previewCss.code,
  '@/components/StarLogSummary': compile('components/StarLogSummary.tsx'),
  '@/components/CustomerCardPreview': compile('components/CustomerCardPreview.tsx'),
  Panel: compile('components/StarLogPanel.tsx'),
}
const bundle = `const factories={${Object.entries(sources).map(([name, source]) => `${JSON.stringify(name)}:function(require,module,exports,process){${source}\n}`).join(',')}};
const cache={};function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;factories[name](require,module,module.exports,{env:{NODE_ENV:'development'}});return module.exports}
const React=require('react'),{createRoot}=require('react-dom/client'),Panel=require('Panel').default,{StarLogCardTools,default:Summary}=require('@/components/StarLogSummary');
function App(){const [data,setData]=React.useState(null),[open,setOpen]=React.useState(false);const readOnly=new URLSearchParams(window.location.search).has('readonly');
const load=()=>fetch('/fixture/summary').then(r=>r.json()).then(setData);React.useEffect(()=>{load()},[]);
const reset=()=>fetch('/fixture/reset',{method:'POST'}).then(load);
return React.createElement('main',{style:{padding:'20px',fontFamily:'sans-serif'}},React.createElement('h1',null,'⭐️確認マーク・ログ訂正（架空データ）'),
React.createElement('p',null,'本番のお客様やDBにはつながっていません。'),
React.createElement('div',{className:'fixtureControls'},React.createElement('button',{onClick:reset},'テストを初期化'),React.createElement('a',{href:readOnly?'/':'/?readonly=1'},readOnly?'編集モードへ':'閲覧専用で開く'),React.createElement('button',{onClick:()=>fetch('/fixture/conflict',{method:'POST'})},'次の訂正を競合させる')),
React.createElement('article',{className:'fixtureCard'},React.createElement('div',null,React.createElement('strong',null,'サンプルのお客様'),React.createElement('p',null,'⭐️ 場内 · 福岡県'),React.createElement('p',null,'来店から18日')),
React.createElement('div',{className:'metrics'},'客単価 ¥0　累計売上 ¥0　来店1回'),React.createElement('div',{className:'pattern'},'来店傾向　月 火 水 木 金 土'),React.createElement('div',null,React.createElement('small',null,'担当：テストキャスト'),React.createElement(StarLogCardTools,{cycle:data,today:'2026-10-24',onOpen:()=>setOpen(true)}))),
React.createElement('p',{className:'mobileLabel'},'スマホ要約表示'),React.createElement('div',{className:'mobileSummary'},React.createElement(Summary,{cycle:data,today:'2026-10-24'})),
open&&React.createElement(Panel,{key:readOnly?'read':'edit',target:{id:'1',name:'サンプルのお客様'},onClose:()=>setOpen(false),onSaved:load,onRestart:load,onBusyChange:()=>{}}),
React.createElement('p',{role:'status'},readOnly?'閲覧専用モード':'編集可能モード'));}
createRoot(document.getElementById('app')).render(React.createElement(App));`
const cycleId = '11111111-1111-4111-8111-111111111111'
let logs, cycle, conflict = false
function reset() {
  cycle = { id: cycleId, customer_id: 1, started_on: '2026-10-01', opened_at: '2026-10-01T12:00:00Z', ended_at: null, last_checked_on: '2026-10-24', last_status: '連絡済み', last_checked_by: 'テストスタッフA' }
  logs = [
    { id: '22222222-2222-4222-8222-222222222222', kind: 'check', event_on: '2026-10-24', status: '連絡済み', note: '本日キャストへ連絡状況を確認しました。\n次回の返信を確認します。', actor_name: 'テストスタッフA', recorded_at: '2026-10-24T10:00:00Z', revision: 0 },
    { id: '33333333-3333-4333-8333-333333333333', kind: 'check', event_on: '2026-10-23', status: '返信待ち', note: '前日の確認メモ', actor_name: 'テストスタッフB', recorded_at: '2026-10-23T10:00:00Z', revision: 0 },
    { id: '44444444-4444-4444-8444-444444444444', kind: 'started', event_on: '2026-10-01', started_on: '2026-10-01', actor_name: 'テストスタッフA', recorded_at: '2026-10-01T12:00:00Z', revision: 0 },
  ]; conflict = false
}
reset()
function refresh() {
  const latest = logs.filter(log => log.kind === 'check' && !log.deleted_at).sort((a, b) => b.event_on.localeCompare(a.event_on) || b.recorded_at.localeCompare(a.recorded_at))[0]
  cycle.last_checked_on = latest?.event_on ?? null; cycle.last_status = latest?.status ?? null; cycle.last_checked_by = latest?.actor_name ?? null
}
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  const json = (data, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
  response.setHeader('Cache-Control', 'no-store')
  if (url.pathname === '/fixture/reset') { reset(); json({ ok: true }); return }
  if (url.pathname === '/fixture/conflict') { conflict = true; json({ ok: true }); return }
  if (url.pathname === '/fixture/summary') { json(cycle); return }
  if (url.pathname === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle); return }
  if (url.pathname === '/api/star-logs/1') {
    if (request.method === 'GET') { json({ customer: { id: 1, customer_name: 'サンプルのお客様', cast_name: 'テストキャスト', is_starred: true }, cycle, logs: logs.filter(log => url.searchParams.has('includeDeleted') || !log.deleted_at), can_edit: !request.headers.referer?.includes('readonly=1'), has_more: false }); return }
    let body = ''; for await (const chunk of request) body += chunk
    const input = JSON.parse(body)
    if (request.method === 'PATCH') {
      if (conflict) { conflict = false; json({ error: '別のスタッフが変更しました。入力を控えて再取得してください（架空の競合）' }, 409); return }
      const log = logs.find(log => log.id === input.logId)
      if (!log || log.kind !== 'check' || log.revision !== input.expectedRevision) { json({ error: '対象の記録を読み直してください' }, 409); return }
      if (input.action === 'edit') Object.assign(log, { event_on: input.checkedOn, status: input.status, note: input.note, edited_at: '2026-10-24T11:00:00Z', edited_by_name: 'テストスタッフC' })
      else if (input.action === 'delete') Object.assign(log, { deleted_at: '2026-10-24T11:00:00Z', deleted_by_name: 'テストスタッフC' })
      else Object.assign(log, { deleted_at: null, deleted_by_name: null })
      log.revision++
    } else {
      logs.unshift({ id: input.requestId, kind: 'check', event_on: input.checkedOn, status: input.status, note: input.note, actor_name: 'テストスタッフC', recorded_at: '2026-10-24T11:00:00Z', revision: 0 })
    }
    refresh(); json({ ok: true }); return
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>⭐️ログ訂正・架空データ</title><style>body{margin:0;background:#FFF9FA;color:#3D2D38}*{box-sizing:border-box}h1{font-size:18px}.fixtureControls{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}.fixtureControls button{padding:8px}.fixtureCard{display:grid;grid-template-columns:1.1fr 1fr 1.15fr .9fr;gap:14px;border:1px solid #F0DDE2;background:white;border-radius:12px;padding:14px;font-size:12px}.pattern{background:#FAF5E8;border-radius:8px;padding:10px}.mobileSummary{max-width:270px;background:white;border:1px solid #F0DDE2;border-radius:10px;padding:10px}.mobileLabel{font-size:12px}@media(max-width:767px){.fixtureCard{grid-template-columns:1fr}.metrics,.pattern{display:none}}${logCss.css}${previewCss.css}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`)
}).listen(6115, '127.0.0.1', () => process.stdout.write('Log edits fixture: http://127.0.0.1:6115\n'))
