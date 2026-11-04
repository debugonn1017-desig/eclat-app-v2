// A4縦の実PDF/実印刷コンポーネントを架空データだけで検証。本番への接続はしない。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url)), require = createRequire(import.meta.url)
const { chromium } = require(process.env.ECLAT_PLAYWRIGHT_MODULE || 'playwright')
const out = process.env.ECLAT_EXPORT_QA_DIR || path.join(root, '.test-dist/customer-goals-export')
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
for (const key of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'scheduler', '@/components/CustomerGoalsExport', '@/components/StarredCustomersPrint.module.css', '@/components/LockerRankingPage.module.css']) add(key)
const categories = ['県内顧客', '県外顧客', '県内場内', '県外場内', 'その他・地域未設定', '切れたお客様']
const columnRatios = [.26, .19, .12, .22, .21]
const longNote = Array.from({ length: 60 }, (_, i) => `段落${String(i + 1).padStart(3, '0')}：長い備考と改行を含む確認用メモです。全文を保持。`).join('\n') + '\n長文終端'
const report = { castName: 'いろは', month: '2026-11', today: '2026-11-03', scopeLabel: '⭐️全員', rows: [] }
function fixture(label, count, long = false) {
  const allCasts = label.startsWith('today') || label === 'mixed-126' || long
  const category = index => label === 'five-categories-20' ? categories[index % 5] : label === 'all-categories-20' || count === 126 ? categories[index % categories.length] : categories[index < 8 ? 0 : 1 + Math.floor((index - 8) / 4) % 3]
  return { ...report, castName: allCasts ? '全キャスト' : 'いろは', scopeLabel: label === 'personal-default-20' ? undefined : label.startsWith('today') ? '本日確認リスト（表示条件の全対象）' : report.scopeLabel, rows: Array.from({ length: count }, (_, i) => ({
    id: String(i + 1), name: i === count - 1 ? '最終のお客様' : long && i % 18 === 3 ? '長いお名前のお客様'.repeat(8) + `姓名終端${i + 1}` : `確認用のお客様${i + 1}`,
    castName: allCasts ? long && i % 18 === 4 ? '長い担当キャスト名'.repeat(5) + '担当終端' : i % 2 ? 'ゆい' : 'いろは' : undefined,
    category: category(i), rank: i % 3 ? 'A' : 'B', region: i % 2 ? '福岡県' : '熊本県', occupation: '会社員',
    targetSales: i === 0 ? null : i === 1 ? 0 : long && i % 18 === 5 ? 999999999 : 300000,
    sales: i === 1 ? 0 : long && i % 18 === 5 ? 123456789 : 120000,
    targetVisits: i === 0 ? null : i === 1 ? 0 : 3, visits: i === 1 ? 0 : 1,
    checked: i === count - 1 ? true : i === 0 ? null : i % 3 === 0,
    checkedBy: i === count - 1 ? '末尾確認者' : long && i % 18 === 6 ? '長い確認スタッフ名'.repeat(5) + '確認終端' : i % 3 === 0 ? '確認スタッフ' : null,
    note: label === 'whitespace-note-1' ? ' \n\t ' : long && i % 18 === 2 ? longNote + ` NOTE_END_${String(i + 1).padStart(3, '0')}` : `備考${i + 1}・金曜に連絡 NOTE_END_${String(i + 1).padStart(3, '0')}`,
    lastVisit: i === 0 ? null : i === 1 ? report.today : '2026-10-28',
  })) }
}
const entry = `const React=require('react'),{createRoot}=require('react-dom/client'),Export=require('components/CustomerGoalsExport.tsx').default;function App(){const [report,setReport]=React.useState(${JSON.stringify(report)});window.setExportReport=setReport;return React.createElement(Export,{report,disabled:false,onBusyChange:()=>{}})}createRoot(document.getElementById('app')).render(React.createElement(App));`
const bundle = `const factories={${Object.entries(sources).map(([key, value]) => `${JSON.stringify(key)}:function(require,module,exports,process){${value}\n}`).join(',')}};const cache={};function require(name){if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;factories[name](require,module,module.exports,{env:{NODE_ENV:'development'}});return module.exports}\n${entry}`
const server = createServer((request, response) => {
  if (request.url === '/app.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle); return }
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><html lang="ja" class="h-full antialiased"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.join('\n')}</style></head><body class="min-h-full flex flex-col"><main class="w-full min-h-screen relative overflow-x-hidden"><div id="app"></div></main><script src="/app.js"></script></body></html>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const python = process.env.ECLAT_PYTHON || 'python3'
const compact = text => text.normalize('NFKC').replaceAll('⻑', '長').replace(/\s+/gu, '')
function assertLongNoteContent(text, rows, label) {
  // 一意の段落番号と本文の総数を検査し、途中を落として末尾だけを残す不具合も検出。
  for (const row of rows.filter(row => row.note.includes('長文終端'))) {
    for (const marker of row.note.match(/段落\d{3}/g)) assert.ok(compact(text).includes(marker), `${label}: missing note paragraph ${row.id} ${marker}`)
  }
  for (const letter of ['改', '段', '持']) {
    const expected = rows.reduce((sum, row) => sum + row.note.split(letter).length - 1, 0)
    assert.equal(compact(text).split(letter).length - 1, expected, `${label}: long note content lost (${letter})`)
  }
}
function pdfInfo(file) {
  return JSON.parse(execFileSync(python, ['-c', `import json,sys,unicodedata
from pypdf import PdfReader
r=PdfReader(sys.argv[1]); print(json.dumps([{'width':float(p.mediabox.width),'height':float(p.mediabox.height),'text':unicodedata.normalize('NFKC',p.extract_text() or '').replace('⻑','長')} for p in r.pages]))`, file], { encoding:'utf8' }))
}
function nativePdfBounds(file) {
  return JSON.parse(execFileSync(python, ['-c', `import json,sys,unicodedata,logging
import pdfplumber
logging.getLogger('pdfminer').setLevel(logging.ERROR)
def compact(text): return ''.join(unicodedata.normalize('NFKC',text).split())
result=[]
with pdfplumber.open(sys.argv[1]) as pdf:
 for page in pdf.pages:
  footer=[line for line in page.extract_text_lines() if '実績は対象月の実来店。' in compact(line['text'])]
  top=min((line['top'] for line in footer),default=None); bottom=max((line['bottom'] for line in footer),default=None)
  chars=[char['bottom'] for char in page.chars if top is None or not (char['top']>=top-.1 and char['bottom']<=bottom+.1)]
  # Browser row and memo borders are thin filled rectangles. Exclude the full-page white paper rectangle.
  rules=[rect['bottom'] for rect in page.rects if rect['height']<=2 and rect['width']>20]
  rules += [max(line['top'],line['bottom']) for line in page.lines]
  result.append({'footerTop':top,'footerBottom':bottom,'bodyBottom':max(chars,default=0),'rulesBottom':max(rules,default=0),'height':page.height})
print(json.dumps(result))`, file], { encoding: 'utf8' }))
}
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function containsName(text, name) {
  return new RegExp(escapeRegex(compact(name)) + (/\d$/.test(name) ? '(?!\\d)' : '')).test(compact(text))
}
function assertA4(pages) {
  assert.ok(pages.length > 0)
  for (const page of pages) { assert.ok(Math.abs(page.width - 595.28) < .6); assert.ok(Math.abs(page.height - 841.89) < .6) }
}
function renderPaper(pdfPath, prefix) {
  for (const file of fs.readdirSync(out).filter(file => file.startsWith(path.basename(prefix) + '-') && /-\d+\.png$/.test(file))) fs.unlinkSync(path.join(out, file))
  execFileSync('pdftoppm', ['-r', '100', '-png', pdfPath, prefix])
  return fs.readdirSync(out).filter(file => file.startsWith(path.basename(prefix) + '-') && file.endsWith('.png')).map(file => path.join(out, file))
}
const fontSize = command => Number(command.font.match(/([\d.]+)px/)[1])
const textStart = command => command.align === 'right' || command.align === 'end' ? command.x - command.width : command.align === 'center' ? command.x - command.width / 2 : command.x
function businessValues(row) {
  const yen = value => '¥' + value.toLocaleString('ja-JP')
  return [row.name, row.rank, row.region, row.occupation, row.castName, row.checked === null ? '確認状況未取得' : row.checked ? row.checkedBy : '本日未確認', row.targetSales === null ? '未設定' : yen(row.targetSales), yen(row.sales), row.targetVisits === null ? '未設定' : row.targetVisits + '回', row.visits + '回', row.lastVisit ? row.lastVisit.slice(5).replace('-', '/') : '未記録'].filter(Boolean)
}
function assertRowBusinessText(text, row, label) {
  for (const value of businessValues(row)) assert.ok(compact(text).includes(compact(value)), `${label}: missing business value ${row.id} ${value}`)
}
function assertBusinessText(text, current, label) {
  const joined = compact(text)
  for (const row of current.rows) {
    assert.ok(containsName(text, row.name), `${label}: missing customer ${row.id}`)
    assertRowBusinessText(text, row, label)
    if (row.note.trim()) assert.ok(joined.includes(`NOTE_END_${row.id.padStart(3, '0')}`), `${label}: missing note tail ${row.id}`)
  }
  if (current.rows.length) assert.ok(joined.includes('未設定') && joined.includes('末尾確認者'), `${label}: zero/unset/confirmation missing`)
  if (current.rows.length >= 2) assert.ok(joined.includes('¥0') && joined.includes('0回') && joined.includes('本日来店'), `${label}: explicit zero or same-day visit missing`)
  if (current.rows.some(row => row.note.includes('長文終端'))) assertLongNoteContent(text, current.rows, label)
}
function assertOrderedText(actual, expected, label) {
  // 継続明細の見出しや確認者が挟まっても、備考の全ての文字が順番どおり残る。
  const source = compact(actual), note = compact(expected)
  let cursor = 0
  for (const letter of note) { cursor = source.indexOf(letter, cursor); assert.notEqual(cursor, -1, `${label}: full note text lost`); cursor++ }
}
function assertPaleFill(value, label) {
  if (['transparent', 'rgba(0, 0, 0, 0)'].includes(value)) return
  const hex = value.match(/^#([\da-f]{6})$/i), rgb = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  const channels = hex ? [0, 2, 4].map(index => parseInt(hex[1].slice(index, index + 2), 16)) : rgb ? rgb.slice(1).map(Number) : []
  assert.ok(channels.length === 3 && Math.min(...channels) >= 235, `${label}: background is darker than approved pale fills (${value})`)
}
function assertCanvasLayout(trace, current, label) {
  const pageIds = [...new Set(trace.commands.map(command => command.page))].sort((a, b) => a - b)
  const fullRules = trace.lines.filter(line => Math.abs(line.y1 - line.y2) < .05 && Math.abs(line.x2 - line.x1) > 700)
  const rowFragments = []
  let activeRow = null
  for (const pageId of pageIds) {
    const footer = trace.commands.find(command => command.page === pageId && command.y > 1000 && command.text.startsWith('Éclat'))
    assert.ok(footer, `${label}: missing direct footer`)
    let previousBottom = 0
    for (const rule of fullRules.filter(line => line.page === pageId).sort((a, b) => a.order - b.order)) {
      const left = Math.min(rule.x1, rule.x2), width = Math.abs(rule.x2 - rule.x1), bottom = rule.y1
      const categoryBottoms = trace.fills.filter(fill => fill.page === pageId && fill.width > 700 && fill.height <= 30 && fill.y + fill.height <= bottom).map(fill => fill.y + fill.height)
      const top = Math.max(previousBottom, ...categoryBottoms, 0)
      const commands = trace.commands.filter(command => command.page === pageId && command.order < rule.order && command.y >= top - .2 && command.y < bottom && fontSize(command) <= 12)
      previousBottom = bottom
      // The report header also has a rule; later fragments can contain only the long note.
      if (!commands.some(command => fontSize(command) === 12 || command.text.includes('前ページから続き'))) continue
      assert.ok(left >= 22 && left + width <= 772, `${label}: row does not respect the 6mm side margins`)
      assert.ok(top >= 0 && bottom < 1123, `${label}: row outside A4`)
      if (footer) assert.ok(bottom <= footer.y, `${label}: row overlaps footer`)
      const starts = columnRatios.map((_, index) => left + width * columnRatios.slice(0, index).reduce((sum, value) => sum + value, 0))
      const noteCommands = []
      for (const command of commands) {
        const x = textStart(command), column = starts.findLastIndex(start => x >= start - .6)
        assert.ok(column >= 0 && column < 4, `${label}: unexpected text in memo column: ${command.text}`)
        assert.ok(x >= starts[column] - .6 && x + command.width <= starts[column] + width * columnRatios[column] + .6, `${label}: text crosses column ${column + 1}: ${command.text}`)
        assert.ok([9, 10, 12].includes(fontSize(command)), `${label}: unexpected body font ${command.font}`)
        if (column === 3) noteCommands.push(command)
      }
      const name = commands.filter(command => fontSize(command) === 12 && command.x < starts[1]).map(command => command.text).join('')
      const row = name ? current.rows.find(row => containsName(name, row.name)) : activeRow
      assert.ok(row, `${label}: unrecognized row fragment ${name}`)
      activeRow = row
      const continued = rowFragments.some(fragment => fragment.row.id === row.id)
      if (!continued) {
        for (const index of [1, 2]) assert.ok(commands.some(command => fontSize(command) === 10 && textStart(command) >= starts[index] && textStart(command) < starts[index + 1]), `${label}: ${row.id} actual column ${index + 1} must use 10px`)
      }
      const memoLines = trace.lines.filter(line => line.page === pageId && line.order < rule.order && line.y1 >= top && line.y1 < bottom && Math.abs(line.y1 - line.y2) < .05 && Math.min(line.x1, line.x2) >= starts[4] && Math.abs(line.x2 - line.x1) > 30)
      assert.equal(memoLines.length, continued ? 0 : 2, `${label}: ${row.id} must have exactly two first-part memo rules`)
      rowFragments.push({ row, page: pageId, top, bottom, note: noteCommands.map(command => command.text).join(''), text: commands.map(command => command.text).join('') })
    }
    if (current.rows.length) assert.ok(rowFragments.some(fragment => fragment.page === pageId), `${label}: direct page has no customer`)
  }
  for (const row of current.rows) {
    const fragments = rowFragments.filter(fragment => fragment.row.id === row.id)
    assert.ok(fragments.length, `${label}: no measured direct row ${row.id}`)
    assertRowBusinessText(fragments.map(fragment => fragment.text).join(''), row, label + ' direct row')
    const check = row.checked === null ? '確認状況未取得' : row.checked ? `確認済${row.checkedBy ? ' · ' + row.checkedBy : ''}` : '本日未確認'
    assert.equal(compact(fragments.map(fragment => fragment.note).join('')), compact((row.note.trim() ? row.note : '—') + check), `${label}: direct row ${row.id} full note/check text`)
  }
  for (const fill of trace.fills) {
    if (fill.width <= 3.1 && fill.height <= 30) continue // approved category accent bar
    assertPaleFill(fill.fill, label)
    assert.ok(fill.x >= 0 && fill.y >= 0 && fill.x + fill.width <= 794.1 && fill.y + fill.height <= 1123.1, `${label}: fill outside A4`)
  }
  for (const command of trace.commands) {
    const start = textStart(command)
    assert.ok(start >= 0 && start + command.width <= 794.1 && command.y >= 0 && command.y + fontSize(command) <= 1123, `${label}: text outside A4: ${command.text}`)
  }
  const categoryCommands = trace.commands.filter(command => fontSize(command) === 11)
  for (const category of new Set(current.rows.map(row => row.category))) assert.ok(categoryCommands.some(command => command.text === category), `${label}: missing category heading ${category}`)
  return { pages: pageIds.length, fragments: rowFragments.length }
}
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true }), errors = [], external = []
  page.on('pageerror', error => errors.push(error.message))
  const origin = `http://127.0.0.1:${server.address().port}`
  await page.route('**/*', async route => { if (!route.request().url().startsWith(origin + '/')) { external.push(route.request().url()); await route.abort() } else await route.continue() })
  await page.goto(origin)
  assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).display), 'flex')
  await page.getByRole('button', { name: 'PDF保存', exact: true }).waitFor()
  await page.evaluate(() => {
    window.pdfCommands = []; window.pdfFills = []; window.pdfLines = []
    const prototype = CanvasRenderingContext2D.prototype
    const original = Object.fromEntries(['fillText', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke'].map(name => [name, prototype[name]]))
    const ids = new WeakMap(), paths = new WeakMap(); let nextId = 0, order = 0
    const id = context => { if (!ids.has(context.canvas)) ids.set(context.canvas, ++nextId); return ids.get(context.canvas) }
    prototype.fillText = function(value, x, y, ...rest) {
      window.pdfCommands.push({ text: value, x, y, width: this.measureText(value).width, font: this.font, align: this.textAlign, page: id(this), order: ++order })
      return original.fillText.call(this, value, x, y, ...rest)
    }
    prototype.fillRect = function(x, y, width, height) {
      window.pdfFills.push({ x, y, width, height, fill: this.fillStyle, page: id(this), order: ++order })
      return original.fillRect.call(this, x, y, width, height)
    }
    prototype.beginPath = function(...args) { paths.set(this, { point: null, lines: [] }); return original.beginPath.apply(this, args) }
    prototype.moveTo = function(x, y) { const current = paths.get(this) || { lines: [] }; current.point = { x, y }; paths.set(this, current); return original.moveTo.call(this, x, y) }
    prototype.lineTo = function(x, y) {
      const current = paths.get(this) || { point: null, lines: [] }
      if (current.point) current.lines.push({ x1: current.point.x, y1: current.point.y, x2: x, y2: y })
      current.point = { x, y }; paths.set(this, current)
      return original.lineTo.call(this, x, y)
    }
    prototype.stroke = function(...args) {
      for (const line of paths.get(this)?.lines || []) window.pdfLines.push({ ...line, lineWidth: this.lineWidth, color: this.strokeStyle, page: id(this), order: ++order })
      return original.stroke.apply(this, args)
    }
  })
  const cases = [
    ['empty-0', 0, false], ['single-1', 1, false], ['blank-regression-10', 10, false],
    ['normal-20', 20, false], ['personal-default-20', 20, false], ['today-20', 20, false],
    ['boundary-21', 21, false], ['boundary-22', 22, false], ['boundary-40', 40, false],
    ['five-categories-20', 20, false], ['all-categories-20', 20, false], ['long-20', 20, true], ['whitespace-note-1', 1, false], ['mixed-126', 126, true],
  ].filter(([label]) => !process.env.ECLAT_EXPORT_CASES || process.env.ECLAT_EXPORT_CASES.split(',').includes(label))
  assert.ok(cases.length, 'No export QA cases selected')
  const results = []
  for (const [label, count, long] of cases) {
    const current = fixture(label, count, long)
    await page.evaluate(value => { window.pdfCommands = []; window.pdfFills = []; window.pdfLines = []; window.setExportReport(value) }, current)
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: 'PDF保存', exact: true }).click()
    const directPath = path.join(out, `${label}-customer-goals-a4-portrait.pdf`)
    await (await downloaded).saveAs(directPath)
    const trace = await page.evaluate(() => ({ commands: window.pdfCommands, fills: window.pdfFills, lines: window.pdfLines })), joined = trace.commands.map(command => command.text).join('')
    fs.writeFileSync(path.join(out, `${label}-commands.json`), JSON.stringify(trace, null, 2))
    const directPages = pdfInfo(directPath); assertA4(directPages)
    const directLayout = assertCanvasLayout(trace, current, label)
    assert.equal(directLayout.pages, directPages.length)
    assertBusinessText(joined, current, label + ' direct')
    if (label === 'personal-default-20') assert.ok(joined.includes('⭐️全員'))
    if (label === 'today-20') assert.ok(joined.includes('本日確認リスト') && joined.includes('担当 ゆい'))
    await page.emulateMedia({ media: 'print' })
    await page.evaluate(() => { window.printInvoked = false; window.print = () => { window.printInvoked = true } })
    await page.getByRole('button', { name: '印刷', exact: true }).click()
    await page.waitForFunction(() => window.printInvoked && document.body.dataset.customerGoalsPrint === 'true')
    assert.deepEqual(await page.locator('body').evaluate(element => ({ display: getComputedStyle(element).display, minHeight: getComputedStyle(element).minHeight })), { display: 'block', minHeight: '0px' })
    assert.equal(await page.locator('[data-report-customer]').count(), count)
    const paper = page.locator('body>article'), article = await paper.innerText()
    const nativeStyle = await paper.evaluate(element => {
      const all = [element, ...element.querySelectorAll('*')], visible = all.filter(node => node.getBoundingClientRect().width && node.getBoundingClientRect().height)
      const sizes = selector => [...element.querySelectorAll(selector)].map(node => parseFloat(getComputedStyle(node).fontSize))
      const rows = [...element.querySelectorAll('[data-report-part]')].map(row => {
        const rect = row.getBoundingClientRect(), cells = [...row.children].map(cell => cell.getBoundingClientRect().width)
        return { id: row.dataset.reportPart, customer: row.dataset.reportCustomer, display: getComputedStyle(row).display, columns: getComputedStyle(row).gridTemplateColumns.split(' ').map(Number.parseFloat), width: rect.width, cells, memo: row.querySelectorAll('[class*="_printMemo"]>span').length }
      })
      const columns = element.querySelector('[class*="_printColumns"]')
      return { backgrounds: [...new Set(visible.map(node => getComputedStyle(node).backgroundColor))], nameSizes: sizes('[class*="_printIdentity"] strong'), categorySizes: sizes('[class*="_printCategory"] h2'), actualSizes: sizes('[class*="_printActual"] b'), noteSizes: sizes('[class*="_printNote"]'), rows, columns: { display: getComputedStyle(columns).display, count: getComputedStyle(columns).columnCount }, page: getComputedStyle(element).page }
    })
    assert.deepEqual(nativeStyle.columns, { display: 'block', count: 'auto' }, `${label}: grouped rows must use the full page width`)
    assert.equal(nativeStyle.page, 'customer-goals')
    for (const background of nativeStyle.backgrounds) assertPaleFill(background, label + ' native')
    for (const [key, expected] of [['nameSizes', 12], ['categorySizes', 11], ['actualSizes', 10], ['noteSizes', 9]]) {
      if (count) assert.ok(nativeStyle[key].length > 0, `${label}: missing ${key}`)
      assert.ok(nativeStyle[key].every(size => Math.abs(size - expected) < .05), `${label}: ${key} must be ${expected}px: ${nativeStyle[key]}`)
    }
    const expectedOrder = categories.flatMap(category => current.rows.filter(row => row.category === category).map(row => row.id))
    assert.deepEqual(nativeStyle.rows.filter(row => row.customer).map(row => row.customer), expectedOrder, `${label}: category groups lost/reordered customers`)
    for (const row of nativeStyle.rows) {
      assert.equal(row.display, 'grid')
      assert.equal(row.columns.length, 5)
      assert.equal(row.cells.length, 5)
      for (const [index, ratio] of columnRatios.entries()) assert.ok(Math.abs(row.columns[index] / row.width - ratio) < .003, `${label}: native column ${index + 1} width`)
      assert.equal(row.memo, row.customer ? 2 : 0, `${label}: native memo must have two first-part rules`)
    }
    const headings = await paper.locator('[class*="_printCategory"] h2').allTextContents()
    assert.deepEqual(headings, categories.filter(category => current.rows.some(row => row.category === category)))
    for (const row of current.rows) {
      const content = await paper.locator('[data-report-part]').evaluateAll((elements, id) => {
        const parts = elements.filter(element => element.dataset.reportPart.startsWith(id + ':'))
        return { notes: parts.map(element => element.querySelector('[class*="_printNote"]')?.textContent || '').join(''), text: parts.map(element => element.innerText).join('') }
      }, row.id)
      assertRowBusinessText(content.text, row, label + ' native row')
      if (row.note.trim()) assert.equal(compact(content.notes), compact(row.note), `${label}: native DOM full note ${row.id}`)
    }
    assertBusinessText(article, current, label + ' native DOM')
    const nativePath = path.join(out, `${label}-native-print-a4-portrait.pdf`)
    await page.pdf({ path: nativePath, preferCSSPageSize: true, printBackground: true })
    const nativePages = pdfInfo(nativePath); assertA4(nativePages)
    const nativeBounds = nativePdfBounds(nativePath)
    assert.notEqual(nativeBounds.at(-1).footerTop, null, `${label}: final native page has no footer`)
    for (const [index, bounds] of nativeBounds.entries()) {
      const limit = bounds.footerTop ?? bounds.height - 6 / 25.4 * 72
      assert.ok(bounds.bodyBottom < limit + .1 && bounds.rulesBottom < limit + .1, `${label}: native page ${index + 1} customer/memo overlaps footer or page margin: ${JSON.stringify(bounds)}`)
      if (bounds.footerBottom !== null) assert.ok(bounds.footerBottom < bounds.height, `${label}: native footer outside A4`)
    }
    const nativeText = nativePages.map(value => value.text).join(''), customerPages = nativePages.map(value => current.rows.some(row => containsName(value.text, row.name)))
    if (count) assert.ok(customerPages.every(Boolean), `${label}: printed page without customers (blank/footnote-only page)`)
    assertBusinessText(nativeText, current, label + ' native PDF')
    for (const row of current.rows.filter(row => row.note.trim())) assertOrderedText(nativeText, row.note, `${label}: native PDF row ${row.id}`)
    if (label === 'personal-default-20') assert.ok(compact(nativeText).includes('全員'))
    if (label === 'today-20') assert.ok(compact(nativeText).includes('本日確認リスト') && compact(nativeText).includes('担当ゆい'))
    if (count <= 20 && !long && !['five-categories-20', 'all-categories-20'].includes(label)) {
      assert.equal(directPages.length, 1, `${label}: normal PDF should fit one page`)
      assert.equal(nativePages.length, 1, `${label}: normal print should fit one page`)
    }
    if (label === 'boundary-40') { assert.ok(directPages.length >= 2); assert.ok(nativePages.length >= 2) }
    if (count === 126) { assert.ok(directPages.length < 22); assert.ok(nativePages.length < 26) }
    await page.evaluate(() => { window.dispatchEvent(new Event('afterprint')); window.printInvoked = false })
    assert.equal(await page.locator('body>article').count(), 0)
    assert.equal(await page.locator('body').getAttribute('data-customer-goals-print'), null)
    assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).page), 'auto', 'Other pages keep their page settings')
    await page.emulateMedia({ media: 'screen' })
    assert.equal(await page.locator('body').evaluate(element => getComputedStyle(element).display), 'flex')
    assert.equal(await page.getByRole('button', { name: '印刷', exact: true }).isEnabled(), true)
    assert.equal(await page.getByRole('button', { name: 'PDF保存', exact: true }).isEnabled(), true)
    const renders = ['normal-20', 'blank-regression-10', 'long-20', 'all-categories-20', 'boundary-40'].includes(label) ? [...renderPaper(directPath, path.join(out, `${label}-direct`)), ...renderPaper(nativePath, path.join(out, `${label}-native`))] : []
    const result = { label, customers: count, canvasPages: directPages.length, nativePages: nativePages.length, rowFragments: directLayout.fragments, customerPages, nativeBounds, backgrounds: nativeStyle.backgrounds, renders }
    results.push(result); console.log(JSON.stringify(result))
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  assert.match(read('components/CustomerGoalsExport.module.css'), /@page customer-goals\s*\{[^}]*size:\s*A4 portrait;[^}]*margin:\s*6mm;/)
  const result = { ok: true, results, checks: ['production globals and exact app layout ancestors', 'A4 portrait, 6mm margins and five 26/19/12/22/21 percent columns', '20 normal customers in four 8/4/4/4 category groups fit one page', '10-customer blank-page regression and 21/22/40 page boundaries', 'all six categories and every customer, business value and full note remain', 'zero versus unset, same-day visit and final confirmation actor', '12px names, 11px categories, 10px actuals and 9px notes', 'two first-part memo rules, column bounds and footer bounds', 'approved pale category and visit fills', 'no external requests; previous A4 print styles coexist and print state restores'], output: out }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ ok: true, output: out, results: results.map(({ label, canvasPages, nativePages }) => ({ label, canvasPages, nativePages })) }))
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
