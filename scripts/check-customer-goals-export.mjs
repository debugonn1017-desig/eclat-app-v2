// A4縦の実PDF/実印刷コンポーネントを架空データだけで検証。本番への接続はしない。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url)), require = createRequire(import.meta.url)
const { chromium } = require(process.env.ECLAT_PLAYWRIGHT_MODULE || 'playwright')
const out = process.env.ECLAT_EXPORT_QA_DIR || path.join(root, '.test-dist/customer-goals-export')
fs.mkdirSync(out, { recursive: true })
const sources = {}, css = []
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
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
for (const key of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'scheduler', '@/components/CustomerGoalsExport']) add(key)
const report = { castName: '全キャスト', month: '2026-11', today: '2026-11-03', scopeLabel: '本日確認リスト（表示条件の全対象）', rows: Array.from({ length: 18 }, (_, i) => ({
  id: String(i + 1), name: i === 17 ? '最終のお客様' : `確認用のお客様${i + 1}`, castName: i % 2 ? 'いろは' : 'ゆい', category: i % 2 ? '県内顧客' : '県外場内', region: i % 2 ? '福岡県' : '熊本県', occupation: '会社員',
  targetSales: i === 0 ? null : i === 1 ? 0 : 300000, sales: i === 1 ? 0 : 120000, targetVisits: i === 0 ? null : i === 1 ? 0 : 3, visits: i === 1 ? 0 : 1,
  note: i === 2 ? ('長い備考と改行を含む確認用メモです。\n').repeat(100).slice(0, 1950) + '長文終端' : `備考${i + 1}：金曜の出勤前に連絡する。`, lastVisit: i === 0 ? null : i === 1 ? '2026-11-03' : '2026-10-28', checked: i === 0 ? null : i % 3 === 0, checkedBy: i % 3 === 0 ? '確認スタッフ' : null,
})) }
const entry = `const React=require('react'),{createRoot}=require('react-dom/client'),Export=require('components/CustomerGoalsExport.tsx').default;createRoot(document.getElementById('app')).render(React.createElement(Export,{report:${JSON.stringify(report)},disabled:false,onBusyChange:()=>{}}));`
const bundle = `const factories={${Object.entries(sources).map(([key, value]) => `${JSON.stringify(key)}:function(require,module,exports,process){${value}\n}`).join(',')}};const cache={};function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;factories[name](require,module,module.exports,{env:{NODE_ENV:'development'}});return module.exports}\n${entry}`
const server = createServer((request, response) => {
  if (request.url === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle); return }
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:sans-serif}${css.join('\n')}</style><div id="app"></div><script src="/app.js"></script></html>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.getByRole('button', { name: 'PDF保存', exact: true }).waitFor()
  await page.evaluate(() => {
    window.pdfCommands = []
    const original = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) { window.pdfCommands.push({ text, x, y, align: this.textAlign }); return original.call(this, text, x, y, ...rest) }
  })
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF保存', exact: true }).click()
  await (await downloaded).saveAs(path.join(out, 'customer-goals-a4-portrait.pdf'))
  const commands = await page.evaluate(() => window.pdfCommands), text = commands.map(c => c.text).join('')
  assert.ok(text.includes('最終のお客様') && text.includes('長文終端') && text.includes('備考（続き）'))
  assert.ok(text.includes('未設定') && text.includes('¥0') && text.includes('0回') && text.includes('本日来店'))
  assert.ok(commands.every(c => c.y >= 0 && c.y < 1123 && c.x >= 0 && c.x <= 794), 'PDF text outside A4 canvas')
  const pdf = fs.readFileSync(path.join(out, 'customer-goals-a4-portrait.pdf')).toString('latin1')
  assert.ok(pdf.includes('/MediaBox [0 0 595.28 841.89]'))
  assert.ok(!pdf.includes('/MediaBox [0 0 841.89 595.28]'))
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(() => { window.print = () => { window.printInvoked = true } })
  await page.getByRole('button', { name: '印刷', exact: true }).click()
  await page.waitForFunction(() => window.printInvoked && document.body.dataset.customerGoalsPrint === 'true')
  assert.equal(await page.locator('[data-report-customer]').count(), 18)
  assert.equal(await page.locator('article table thead th').allTextContents().then(a => a.join('/')), '項目/目標/実績/差')
  assert.ok((await page.locator('article').innerText()).includes('長文終端'))
  await page.pdf({ path: path.join(out, 'native-print-a4-portrait.pdf'), preferCSSPageSize: true, printBackground: true })
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: 'screen' })
  assert.equal(await page.locator('body>article').count(), 0)
  assert.equal(await page.getByRole('button', { name: '印刷', exact: true }).isEnabled(), true)
  assert.deepEqual(errors, [])
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok: true, customers: 18, canvasPages: (pdf.match(/\/Type \/Page /g) || []).length, checks: ['A4 portrait', 'all scoped customers', 'Japanese note continuation and final row', 'zero versus unset', 'daily cast labels', 'native print and restoration'] }, null, 2))
  console.log(JSON.stringify({ ok: true, output: out }))
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
