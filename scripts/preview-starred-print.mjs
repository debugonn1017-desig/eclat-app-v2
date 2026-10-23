// 実コンポーネントの印刷操作を架空データだけで確認。認証/DB/外部通信は使用しない。
// node scripts/preview-starred-print.mjs → http://127.0.0.1:6114
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
const root = fileURLToPath(new URL('..', import.meta.url))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const compile = file => ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
function load(file, mocks) {
  const exports = {}
  vm.runInThisContext(`(function(require,exports){${compile(file)}\n})`, { filename: file })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    throw new Error('Unexpected fixture import: ' + name)
  }, exports)
  return exports
}
const logic = load('lib/starredCustomersPrint.ts', { '@/lib/customerCategory': load('lib/customerCategory.ts', {}), '@/lib/starredCustomers': load('lib/starredCustomers.ts', {}) })
const styleSource = read('components/StarredCustomersPrint.module.css')
const classNames = [...new Set([...styleSource.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => match[1]))]
const styles = Object.fromEntries(classNames.map(name => [name, 'print_' + name]))
const css = styleSource.replace(/:global\(([^)]+)\)/g, '$1').replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => '.' + styles[name])
const component = load('components/StarredCustomersPrint.tsx', { react: React, 'react-dom': { createPortal: node => node }, 'react/jsx-runtime': jsx, '@/lib/customerListScroll': load('lib/customerListScroll.ts', {}), './StarredCustomersPrint.module.css': { __esModule: true, default: styles } })
const customers = Array.from({ length: 63 }, (_, i) => ({
  id: String(i + 1), customer_name: i === 1 ? 'とても長いお名前のお客様とニックネームの折り返し確認' : 'サンプルのお客様' + String(i + 1).padStart(2, '0'),
  nickname: i % 3 === 0 ? 'ニックネーム' + (i + 1) : null,
  cast_name: 'テストキャスト', nomination_status: i % 4 ? '本指名' : '場内',
  customer_rank: ['S', 'A', 'B', 'C', '切れた'][i % 5], region: i % 3 ? '福岡県' : '東京都',
}))
const makeReport = () => logic.buildStarredPrintReport({ customers, starredIds: new Set(customers.map(c => c.id)), castName: 'テストキャスト', displayName: 'テストキャスト', today: '2026-10-24', sortLabel: 'お客様名', compare: (a, b) => a.customer_name.localeCompare(b.customer_name, 'ja'),
  lastVisits: new Map(customers.slice(0, -1).map(c => [c.id, '2026-10-23'])), visitCounts: new Map(customers.map(c => [c.id, Number(c.id) * 2])), averageSpend: new Map(customers.map(c => [c.id, 123456])), totalSales: new Map(customers.map(c => [c.id, 12345678])),
  cycles: new Map([['1', { started_on: '2026-10-01', last_checked_on: '2026-10-24', last_status: '返信待ち' }]]), logsReady: true,
})
// ReactのローカルCJS配布と実コンポーネントをブラウザーで使用。テスト用printは呼出し回数だけ記録。
const sources = {
  react: read('node_modules/react/cjs/react.development.js'),
  'react/jsx-runtime': read('node_modules/react/cjs/react-jsx-runtime.development.js'),
  'react-dom': read('node_modules/react-dom/cjs/react-dom.development.js'),
  'react-dom/client': read('node_modules/react-dom/cjs/react-dom-client.development.js'),
  scheduler: read('node_modules/scheduler/cjs/scheduler.development.js'),
  '@/lib/customerListScroll': compile('lib/customerListScroll.ts'),
  './StarredCustomersPrint.module.css': `module.exports={__esModule:true,default:${JSON.stringify(styles)}};`,
  Print: compile('components/StarredCustomersPrint.tsx'),
}
const bundle = `const factories={${Object.entries(sources).map(([name, source]) => `${JSON.stringify(name)}:function(require,module,exports,process){${source}\n}`).join(',')}};
const cache={};function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;factories[name](require,module,module.exports,{env:{NODE_ENV:'development'}});return module.exports}
const React=require('react'),{createRoot}=require('react-dom/client'),Print=require('Print').default;
function App(){const [all,setAll]=React.useState(true),[filtered,setFiltered]=React.useState(false),[calls,setCalls]=React.useState(0);React.useEffect(()=>{window.print=()=>setCalls(c=>c+1)},[]);const report=${JSON.stringify(makeReport())};return React.createElement('main',{style:{padding:'24px',fontFamily:'sans-serif'}},
React.createElement('h1',null,'テストキャストの⭐️のお客様（架空データ）'),
React.createElement('button',{onClick:()=>setAll(false)},'本日連絡のお客様'),React.createElement('button',{onClick:()=>setAll(true)},'⭐️全員表示'),
React.createElement('button',{onClick:()=>setFiltered(v=>!v)},filtered?'全員へ戻す':'今日未確認で絞る'),
all&&React.createElement(Print,{count:report.count,disabled:false,createReport:()=>report}),
React.createElement('p',{role:'status'},'画面の人数 '+(filtered?2:report.count)+'名 / 印刷の呼び出し '+calls+'回'),
React.createElement('p',null,'印刷対象外の背景：この内容は紙面には含めない'),
React.createElement('a',{href:'/?paper=1'},'印刷CSSの紙面を確認'));}createRoot(document.getElementById('app')).render(React.createElement(App));`

createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost')
  response.setHeader('Cache-Control', 'no-store')
  if (url.pathname === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle); return }
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  const paper = url.searchParams.has('paper')
  const content = paper ? `<main>印刷対象外の背景</main><dialog open class="${styles.dialog}"><header class="${styles.controls}">印刷しない操作ボタン</header><div class="${styles.paper}">${renderToStaticMarkup(React.createElement(component.StarredCustomersPrintReport, { report: makeReport() }))}</div></dialog>` : '<div id="app"></div><script src="/app.js"></script>'
  response.end(`<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>⭐️印刷確認・架空データ</title><style>body{margin:0}*{box-sizing:border-box}${paper ? css.replace('@media print', '@media all') : css}</style></head><body>${content}</body></html>`)
}).listen(6114, '127.0.0.1', () => process.stdout.write('Print fixture: http://127.0.0.1:6114 (?paper=1: 印刷CSS)\n'))
