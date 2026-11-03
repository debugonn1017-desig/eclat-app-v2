// 独立した実React履歴UIを架空APIで検証。本番・共有fixtureに接続しない。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url)), require = createRequire(import.meta.url)
const { chromium } = require(process.env.ECLAT_PLAYWRIGHT_MODULE || 'playwright')
const out = process.env.ECLAT_HISTORY_QA_DIR || '/private/tmp/eclat-goal-history-ui'
fs.mkdirSync(out, { recursive: true })
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const builtCssDirectory = path.join(root, '.next/static/css')
const builtGlobals = fs.existsSync(builtCssDirectory) ? fs.readdirSync(builtCssDirectory).filter(file => file.endsWith('.css')).map(file => fs.readFileSync(path.join(builtCssDirectory, file), 'utf8')).find(source => source.includes('--font-app-sans') && /body\{[^}]*font-size:var\(--text-body\)/.test(source)) : null
assert.ok(builtGlobals, 'Run the production build before export QA so the real ancestor CSS is verified')
const sources = {}, css = [builtGlobals]
const packageFiles = { react: 'react/cjs/react.development.js', 'react/jsx-runtime': 'react/cjs/react-jsx-runtime.development.js', 'react-dom': 'react-dom/cjs/react-dom.development.js', 'react-dom/client': 'react-dom/cjs/react-dom-client.development.js', scheduler: 'scheduler/cjs/scheduler.development.js' }
function add(request, from = '') {
  let key = request
  if (!packageFiles[key]) {
    key = key.startsWith('@/') ? key.slice(2) : key.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(from), key)) : key
    key = ['', '.ts', '.tsx'].map(ext => key + ext).find(file => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile()) || key
  }
  if (sources[key]) return key
  sources[key] = '// loading'
  let source
  if (packageFiles[key]) source = read('node_modules/' + packageFiles[key])
  else if (key.endsWith('.css')) {
    const input = read(key), prefix = path.basename(key).replace(/\W/g, '') + '_'
    const names = [...new Set([...input.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m => m[1]))], classes = Object.fromEntries(names.map(name => [name, prefix + name]))
    css.push(input.replace(/:global\(([^)]+)\)/g, '$1').replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => '.' + classes[name]))
    source = `module.exports={__esModule:true,default:${JSON.stringify(classes)}}`
  } else source = ts.transpileModule(read(key), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  sources[key] = source.replace(/require\(["']([^"']+)["']\)/g, (_, name) => `require(${JSON.stringify(add(name, key))})`)
  return key
}
for (const key of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'scheduler', '@/components/CustomerGoalHistory']) add(key)
const entry = `const React=require('react'),{createRoot}=require('react-dom/client'),History=require('components/CustomerGoalHistory.tsx').default;function App(){const [scope,setScope]=React.useState({customerId:'1',enabled:false,revision:0});window.setHistoryFixture=setScope;return React.createElement(History,scope)}createRoot(document.getElementById('app')).render(React.createElement(App));`
const bundle = `const factories={${Object.entries(sources).map(([key, value]) => `${JSON.stringify(key)}:function(require,module,exports,process){${value}\n}`).join(',')}};const cache={};function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;factories[name](require,module,module.exports,{env:{NODE_ENV:'development'}});return module.exports}\n${entry}`
let mode = 'normal'
const requests = []
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture.test')
  if (url.pathname === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle); return }
  if (url.pathname === '/api/customer-goals/history') {
    const customerId = url.searchParams.get('customerId'), currentMode = mode
    requests.push({ customerId, method: request.method, mode: currentMode })
    const send = () => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (currentMode === 'error') { response.statusCode = 503; response.end(JSON.stringify({ error: '架空の通信エラー' })); return }
      const note = currentMode === 'normal' ? '<img src=x onerror=alert(1)>\n長い備考'.repeat(35) : currentMode === 'slow' ? '古いレスポンス' : `${currentMode}の最新履歴`
      response.end(JSON.stringify({ customerId, items: currentMode === 'empty' ? [] : [{ castId: 'old-cast', castName: currentMode === 'normal' ? '長い旧担当のキャスト名'.repeat(4) : `お客様${customerId}の旧担当`, castActive: false, month: '2028-02-01', targetSales: 0, targetVisits: null, note, updatedAt: '2026-11-04T00:00:00Z' }] }))
    }
    if (currentMode === 'slow') setTimeout(send, 350)
    else send()
    return
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><html lang="ja" class="h-full antialiased"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.join('\n')}</style></head><body class="min-h-full flex flex-col"><main class="w-full min-h-screen relative overflow-x-hidden"><div id="app"></div></main><script src="/app.js"></script></body></html>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'chrome', headless: true }), checks = [], errors = []
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => typeof window.setHistoryFixture === 'function')
  assert.equal(await page.locator('details').count(), 0); assert.equal(requests.length, 0)
  const setScope = value => page.evaluate(value => window.setHistoryFixture(value), value)
  const open = async () => { await page.locator('details>summary').click(); await page.waitForFunction(() => document.querySelector('details')?.open) }
  await setScope({ customerId: '1', enabled: true, revision: 0 })
  await page.locator('details').waitFor(); assert.equal(await page.locator('details').evaluate(el => el.open), false)
  await page.waitForTimeout(50); assert.equal(requests.length, 0)
  await open(); await page.getByText('退店', { exact: true }).waitFor()
  assert.equal(requests.length, 1); assert.ok(await page.getByText('2028/02/01〜2028/02/29', { exact: false }).count())
  assert.equal(await page.getByText('¥0', { exact: true }).count(), 1); assert.equal(await page.getByText('未設定', { exact: true }).count(), 1)
  assert.equal(await page.locator('input,textarea,select,img').count(), 0)
  checks.push('disabled/closed never fetch; read-only, zero versus unset, leap-month period, escaped note')
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    const metrics = await page.locator('details').evaluate(el => ({ width: el.getBoundingClientRect().width, scroll: el.scrollWidth, client: el.clientWidth, page: document.documentElement.scrollWidth }))
    assert.equal(metrics.page, width); assert.ok(metrics.scroll <= metrics.client + 1)
    await page.locator('details').screenshot({ path: path.join(out, `history-${width}.png`) })
  }
  checks.push('320/390/768/1440 long-name and long-note no horizontal overflow')
  await page.locator('details>summary').click(); await page.waitForFunction(() => !document.querySelector('details')?.open)
  mode = 'assignment'; await open(); await page.getByText('assignmentの最新履歴', { exact: false }).waitFor()
  assert.equal(requests.length, 2)
  checks.push('reopening the same customer refetches after assignment changes')
  mode = 'revision'; await setScope({ customerId: '1', enabled: true, revision: 1 })
  await page.getByText('revisionの最新履歴', { exact: false }).waitFor(); assert.equal(requests.length, 3)
  checks.push('same-customer parent revision refreshes while open')
  mode = 'slow'; await setScope({ customerId: '1', enabled: true, revision: 2 })
  await page.waitForTimeout(50); assert.equal(requests.length, 4)
  mode = 'customer2'; await setScope({ customerId: '2', enabled: true, revision: 0 })
  await page.waitForFunction(() => document.querySelector('details') && !document.querySelector('details').open)
  await open(); await page.getByText('customer2の最新履歴', { exact: false }).waitFor(); await page.waitForTimeout(450)
  assert.equal(await page.getByText('古いレスポンス', { exact: false }).count(), 0)
  checks.push('customer switch aborts stale response and resets fold')
  mode = 'slow'; await setScope({ customerId: '1', enabled: true, revision: 3 }); await open(); await page.waitForTimeout(50)
  await setScope({ customerId: '1', enabled: false, revision: 3 }); await page.waitForTimeout(450)
  assert.equal(await page.locator('details').count(), 0)
  checks.push('disabling access aborts pending fetch and clears rendered history')
  mode = 'empty'; await setScope({ customerId: '3', enabled: true, revision: 0 }); await open()
  await page.getByText('旧担当が保存した月別目標の履歴はありません。', { exact: true }).waitFor()
  mode = 'error'; await setScope({ customerId: '4', enabled: true, revision: 0 }); await open()
  await page.getByRole('alert').waitFor(); mode = 'retry'; await page.getByRole('button', { name: '再取得', exact: true }).click()
  await page.getByText('retryの最新履歴', { exact: false }).waitFor()
  assert.ok(requests.every(request => request.method === 'GET')); assert.deepEqual(errors, [])
  checks.push('empty/error/retry handled; only GET requests')
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok: true, checks, requests }, null, 2))
  console.log(JSON.stringify({ ok: true, checks, requests: requests.length, output: out }))
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
