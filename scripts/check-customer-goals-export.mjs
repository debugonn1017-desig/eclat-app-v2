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
const report = { castName: '全キャスト', month: '2026-11', today: '2026-11-03', scopeLabel: '本日確認リスト（表示条件の全対象）', rows: Array.from({ length: 18 }, (_, i) => ({
  id: String(i + 1), name: i === 17 ? '最終のお客様' : `確認用のお客様${i + 1}`, castName: i % 2 ? 'いろは' : 'ゆい', category: i % 2 ? '県内顧客' : '県外場内', region: i % 2 ? '福岡県' : '熊本県', occupation: '会社員',
  targetSales: i === 0 ? null : i === 1 ? 0 : 300000, sales: i === 1 ? 0 : 120000, targetVisits: i === 0 ? null : i === 1 ? 0 : 3, visits: i === 1 ? 0 : 1,
  note: i === 2 ? ('長い備考と改行を含む確認用メモです。\n').repeat(100).slice(0, 1950) + '長文終端' : `備考${i + 1}：金曜の出勤前に連絡する。`, lastVisit: i === 0 ? null : i === 1 ? '2026-11-03' : '2026-10-28', checked: i === 0 ? null : i % 3 === 0, checkedBy: i % 3 === 0 ? '確認スタッフ' : null,
})) }
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
  // 長文の中間を落として末尾だけを残す不具合も検出。これらの文字は架空備考だけに現れる。
  for (const letter of ['改', '含', 'モ']) {
    const expected = rows.reduce((sum, row) => sum + row.note.split(letter).length - 1, 0)
    assert.equal(compact(text).split(letter).length - 1, expected, `${label}: long note content lost (${letter})`)
  }
}
function pdfInfo(file) {
  return JSON.parse(execFileSync(python, ['-c', `import json,sys,unicodedata
from pypdf import PdfReader
r=PdfReader(sys.argv[1]); print(json.dumps([{'width':float(p.mediabox.width),'height':float(p.mediabox.height),'text':unicodedata.normalize('NFKC',p.extract_text() or '').replace('⻑','長')} for p in r.pages]))`, file], { encoding:'utf8' }))
}
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function containsName(text, name) {
  return new RegExp(escapeRegex(compact(name)) + (/\d$/.test(name) ? '(?!\\d)' : '')).test(compact(text))
}
function assertA4(pages) {
  assert.ok(pages.length > 0)
  for (const page of pages) { assert.ok(Math.abs(page.width - 595.28) < .6); assert.ok(Math.abs(page.height - 841.89) < .6) }
}
function renderAndCheckPaper(pdfPath, commandsPath, prefix) {
  execFileSync('pdftoppm', ['-r', '100', '-png', pdfPath, prefix])
  return JSON.parse(execFileSync(python, ['-c', `import json,sys,glob,re,logging
from PIL import Image,ImageDraw,ImageChops
import pdfplumber
logging.getLogger('pdfminer').setLevel(logging.ERROR)
pdf,commands,prefix=sys.argv[1:]
pages=pdfplumber.open(pdf).pages
trace=json.load(open(commands)) if commands else None
ids=sorted(set(c['page'] for c in trace['commands'])) if trace else []
result=[]
for index,file in enumerate(sorted(glob.glob(prefix+'-*.png'),key=lambda s:int(re.search(r'-(\\d+)\\.png$',s).group(1)))):
 im=Image.open(file).convert('RGB'); w,h=im.size; mask=Image.new('L',(w,h),255); draw=ImageDraw.Draw(mask)
 if trace:
  for c in trace['commands']:
   if c['page']!=ids[index]: continue
   size=float(re.search(r'([\\d.]+)px',c['font']).group(1)); x=c['x']-c['width'] if c['align']=='right' else c['x']; y=c['y']
   draw.rectangle(((x-3)*w/794,(y-3)*h/1123,(x+c['width']+3)*w/794,(y+size*1.8+3)*h/1123),fill=0)
 else:
  p=pages[index]
  for obj in [*p.chars,*p.images]:
   draw.rectangle((obj['x0']*w/p.width-3,obj['top']*h/p.height-3,obj['x1']*w/p.width+3,obj['bottom']*h/p.height+3),fill=0)
 r,g,b=im.split(); diff=ImageChops.lighter(ImageChops.difference(r,g),ImageChops.lighter(ImageChops.difference(g,b),ImageChops.difference(r,b)))
 colored=ImageChops.multiply(diff.point(lambda v:255 if v>2 else 0),mask)
 count=colored.histogram()[255]; result.append({'file':file,'unmaskedColoredPixels':count,'paperPixels':mask.histogram()[255]})
print(json.dumps(result))`, pdfPath, commandsPath || '', prefix], { encoding:'utf8' }))
}
try {
  const page = await browser.newPage({ viewport: { width:390, height:844 }, acceptDownloads:true }), errors = [], external = []
  page.on('pageerror', error => errors.push(error.message))
  const origin = `http://127.0.0.1:${server.address().port}`
  await page.route('**/*', async route => { if (!route.request().url().startsWith(origin + '/')) { external.push(route.request().url()); await route.abort() } else await route.continue() })
  await page.goto(origin)
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).display), 'flex')
  await page.getByRole('button', { name:'PDF保存', exact:true }).waitFor()
  await page.evaluate(() => {
    window.pdfCommands = []; window.pdfCards = []; window.pdfFills = []
    const text = CanvasRenderingContext2D.prototype.fillText, stroke = CanvasRenderingContext2D.prototype.strokeRect, fill = CanvasRenderingContext2D.prototype.fillRect
    const ids = new WeakMap(); let nextId = 0
    const id = context => { if (!ids.has(context.canvas)) ids.set(context.canvas, ++nextId); return ids.get(context.canvas) }
    CanvasRenderingContext2D.prototype.fillText = function(value, x, y, ...rest) {
      window.pdfCommands.push({ text:value, x, y, width:this.measureText(value).width, font:this.font, align:this.textAlign, page:id(this) })
      return text.call(this, value, x, y, ...rest)
    }
    CanvasRenderingContext2D.prototype.strokeRect = function(x, y, width, height) { window.pdfCards.push({ x,y,width,height,page:id(this) }); return stroke.call(this,x,y,width,height) }
    CanvasRenderingContext2D.prototype.fillRect = function(x, y, width, height) { window.pdfFills.push({ x,y,width,height,fill:this.fillStyle,page:id(this) }); return fill.call(this,x,y,width,height) }
  })
  const cases = [
    ['empty-0',0,false], ['single-1',1,false], ['blank-regression-10',10,false], ['normal-15',15,false],
    ['boundary-16',16,false], ['boundary-17',17,false], ['today-18',18,false], ['personal-default-15',15,false],
    ['long-18',18,true], ['whitespace-note-1',1,false], ['mixed-126',126,true],
  ].filter(([label]) => !process.env.ECLAT_EXPORT_CASES || process.env.ECLAT_EXPORT_CASES.split(',').includes(label))
  const results = []
  for (const [label,count,long] of cases) {
    const current = { ...report, castName:label.startsWith('today') || count===126 ? '全キャスト' : 'いろは', scopeLabel:label==='personal-default-15' ? undefined : label.startsWith('today') ? '本日確認リスト（表示条件の全対象）' : '⭐️全員', rows:Array.from({length:count},(_,i) => ({
      ...report.rows[i%report.rows.length], id:String(i+1),
      name:i===count-1 ? '最終のお客様' : long && i%18===3 ? '長いお名前のお客様'.repeat(8)+'姓名終端' : `確認用のお客様${i+1}`,
      castName:long && i%18===4 ? '長い担当キャスト名'.repeat(5) : label.startsWith('today') && i%2 ? 'ゆい' : 'いろは',
      checked:i===count-1 ? true : report.rows[i%report.rows.length].checked,
      checkedBy:i===count-1 ? '末尾確認者' : long && i%18===6 ? '長い確認スタッフ名'.repeat(5) : '確認スタッフ',
      targetSales:i===0 ? null : i===1 ? 0 : long && i%18===5 ? 99999999 : 300000,
      sales:i===1 ? 0 : long && i%18===5 ? 1234567890 : 120000,
      note:label==='whitespace-note-1' ? ' \n\t ' : long && i%18===2 ? report.rows[2].note+` NOTE_END_${String(i+1).padStart(3,'0')}` : `備考${i+1}・金曜に連絡 NOTE_END_${String(i+1).padStart(3,'0')}`,
    })) }
    await page.evaluate(value => { window.pdfCommands=[]; window.pdfCards=[]; window.pdfFills=[]; window.setExportReport(value) }, current)
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button',{name:'PDF保存',exact:true}).click()
    const directPath = path.join(out,`${label}-customer-goals-a4-portrait.pdf`)
    await (await downloaded).saveAs(directPath)
    const trace = await page.evaluate(() => ({commands:window.pdfCommands,cards:window.pdfCards,fills:window.pdfFills})), joined = trace.commands.map(command=>command.text).join('')
    const commandsPath = path.join(out,`${label}-commands.json`)
    fs.writeFileSync(commandsPath,JSON.stringify(trace,null,2))
    const directPages=pdfInfo(directPath); assertA4(directPages)
    const canvasIds=[...new Set(trace.commands.map(command=>command.page))].sort((a,b)=>a-b)
    assert.equal(canvasIds.length,directPages.length)
    for(const id of canvasIds) if(count) assert.ok(trace.cards.some(card=>card.page===id),`${label}: direct page has no customer`)
    assert.ok(trace.fills.every(item=>['#ffffff','white','transparent','rgba(0, 0, 0, 0)'].includes(item.fill)),`${label}: colored PDF background`)
    assert.ok(trace.commands.every(command=>command.x>=0 && command.x<=794 && command.y>=0 && command.y<1123),`${label}: text outside A4`)
    const xs=[...new Set(trace.cards.map(card=>card.x))].sort((a,b)=>a-b)
    assert.ok(xs.length<=2);if(count>=15)assert.equal(xs.length,2)
    for(const card of trace.cards) {
      assert.ok(card.x>=0 && card.x+card.width<=794 && card.y>=0 && card.y+card.height<=1123)
      const footer=trace.commands.find(command=>command.page===card.page && command.text.startsWith('Éclat'))
      if(footer)assert.ok(card.y+card.height<=footer.y,`${label}: card overlaps footer`)
      const content=trace.commands.filter(command=>command.page===card.page && command.y>=card.y && command.y<card.y+card.height && command.x>=card.x && command.x<=card.x+card.width)
      for(const command of content){const start=command.align==='right'?command.x-command.width:command.x;assert.ok(start>=card.x-.6 && start+command.width<=card.x+card.width+.6,`${label}: text crosses column: ${command.text}`);assert.ok(parseFloat(command.font.match(/([\d.]+)px/)[1])>=11.3,`${label}: body below 8.5pt`)}
    }
    for(const row of current.rows){assert.ok(containsName(joined,row.name),`${label}: missing direct customer ${row.id}`);if(row.note.trim())assert.ok(compact(joined).includes(`NOTE_END_${row.id.padStart(3,'0')}`),`${label}: missing direct note tail ${row.id}`)}
    if(count){assert.ok(joined.includes('未設定'));assert.ok(joined.includes('末尾確認者'))}if(count>=2)assert.ok(joined.includes('¥0')&&joined.includes('0回')&&joined.includes('本日来店'))
    if(long){assert.ok(joined.includes('長文終端')&&joined.includes('姓名終端'));assertLongNoteContent(joined,current.rows,label+' direct')}
    if(label==='personal-default-15')assert.ok(joined.includes('⭐️全員'))
    if(label==='today-18')assert.ok(joined.includes('本日確認リスト')&&joined.includes('担当 ゆい'))
    await page.emulateMedia({media:'print'})
    await page.evaluate(()=>{window.printInvoked=false;window.print=()=>{window.printInvoked=true}})
    await page.getByRole('button',{name:'印刷',exact:true}).click()
    await page.waitForFunction(()=>window.printInvoked && document.body.dataset.customerGoalsPrint==='true')
    assert.deepEqual(await page.locator('body').evaluate(element=>({display:getComputedStyle(element).display,minHeight:getComputedStyle(element).minHeight})),{display:'block',minHeight:'0px'})
    assert.equal(await page.locator('[data-report-customer]').count(),count)
    const paper=page.locator('body>article'), article=await paper.innerText()
    assert.equal(await paper.locator('[class*="_printColumns"]').evaluate(element=>getComputedStyle(element).columnCount),'2')
    const nativeStyle=await paper.evaluate(element=>{
      const all=[element,...element.querySelectorAll('*')],visible=all.filter(node=>node.getBoundingClientRect().width&&node.getBoundingClientRect().height)
      return {backgrounds:[...new Set(visible.map(node=>getComputedStyle(node).backgroundColor))],fontSizes:visible.filter(node=>node.matches('th,td,p,small')).map(node=>parseFloat(getComputedStyle(node).fontSize))}
    })
    assert.ok(nativeStyle.backgrounds.every(value=>['rgba(0, 0, 0, 0)','rgb(255, 255, 255)'].includes(value)),`${label}: tinted native paper ${nativeStyle.backgrounds}`)
    assert.ok(nativeStyle.fontSizes.every(size=>size>=11.28),`${label}: native body below 8.5pt`)
    if(count)assert.equal(await paper.locator('table').first().locator('thead th').allTextContents().then(values=>values.join('/')),'項目/目標/実績/差')
    for(const row of current.rows)assert.ok(containsName(article,row.name))
    const nativePath=path.join(out,`${label}-native-print-a4-portrait.pdf`)
    await page.pdf({path:nativePath,preferCSSPageSize:true,printBackground:true})
    const nativePages=pdfInfo(nativePath);assertA4(nativePages)
    const nativeText=nativePages.map(value=>value.text).join(''),customerPages=nativePages.map(value=>current.rows.some(row=>containsName(value.text,row.name)))
    if(count)assert.ok(customerPages.every(Boolean),`${label}: printed page without customers (blank/footnote-only page)`)
    for(const row of current.rows){assert.ok(containsName(nativeText,row.name),`${label}: missing printed customer ${row.id}`);if(row.note.trim())assert.ok(compact(nativeText).includes(`NOTE_END_${row.id.padStart(3,'0')}`),`${label}: missing printed note tail ${row.id}`)}
    if(count)assert.ok(compact(nativeText).includes('末尾確認者'));if(long){assert.ok(compact(nativeText).includes('長文終端')&&compact(nativeText).includes('姓名終端'));assertLongNoteContent(nativeText,current.rows,label+' native')}
    if(label==='personal-default-15')assert.ok(compact(nativeText).includes('全員'))
    if(label==='today-18')assert.ok(compact(nativeText).includes('本日確認リスト')&&compact(nativeText).includes('担当ゆい'))
    if(count<=15&&!long){assert.equal(directPages.length,1,`${label}: normal PDF should fit one page`);assert.equal(nativePages.length,1,`${label}: normal print should fit one page`)}
    if(count===126){assert.ok(directPages.length<22);assert.ok(nativePages.length<26)}
    await page.evaluate(()=>{window.dispatchEvent(new Event('afterprint'));window.printInvoked=false})
    assert.equal(await page.locator('body>article').count(),0)
    assert.equal(await page.locator('body').evaluate(element=>getComputedStyle(element).page),'auto','Other pages keep their page settings')
    await page.emulateMedia({media:'screen'})
    assert.equal(await page.locator('body').evaluate(element=>getComputedStyle(element).display),'flex')
    assert.equal(await page.getByRole('button',{name:'印刷',exact:true}).isEnabled(),true)
    let pixels=[]
    if(['normal-15','blank-regression-10','long-18'].includes(label)){
      pixels=[...renderAndCheckPaper(directPath,commandsPath,path.join(out,`${label}-direct`)),...renderAndCheckPaper(nativePath,null,path.join(out,`${label}-native`))]
      assert.ok(pixels.every(value=>value.unmaskedColoredPixels<=8),`${label}: tinted backgrounds remain: ${JSON.stringify(pixels)}`)
    }
    const result={label,customers:count,canvasPages:directPages.length,nativePages:nativePages.length,cards:trace.cards.length,customerPages,backgrounds:nativeStyle.backgrounds,pixels}
    results.push(result);console.log(JSON.stringify(result))
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[])
  const result={ok:true,results,checks:['production globals and exact app layout ancestors','A4 portrait and two measured columns','15 normal customers fit one page','10-customer footnote-only second page regression','all customers, Japanese continuation and every note tail remain','zero versus unset and final confirmation actor','body at least 8.5pt, no overlapping columns or footer','white/transparent backgrounds in drawing calls, DOM and rendered pixels','previous print styles coexist; state and page scope restore'],output:out}
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,output:out,results:results.map(({label,canvasPages,nativePages})=>({label,canvasPages,nativePages}))}))
} finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
