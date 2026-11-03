import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
// 先に preview-font-pages.mjs を起動。Playwright は ECLAT_PLAYWRIGHT_MODULE で指定可。
// node scripts/check-font-pages-ui.mjs --origin=http://127.0.0.1:6118 --out=/private/tmp/eclat-font-pages-qa
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ECLAT_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.argv.find(value=>value.startsWith('--origin='))?.slice(9) || 'http://127.0.0.1:'+(process.env.ECLAT_FONT_PREVIEW_PORT || 6118)
assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/, 'Use only the local fake-data preview')
const out = process.argv.find(value=>value.startsWith('--out='))?.slice(6) || process.env.ECLAT_FONT_QA_DIR || '/private/tmp/eclat-font-pages-qa'
fs.mkdirSync(out,{recursive:true})
const browser = await chromium.launch({channel:'chrome',headless:true})
const metrics = [], errors = [], denied = [], badResponses = [], writes = []
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}})
  page.on('pageerror',error=>errors.push(error.message))
  page.on('response',response=>{if(response.status()>=400 && response.url().includes('/api/'))badResponses.push([response.status(),response.url()])})
  await page.route('**/*',async route=>{
    const request=route.request()
    if(!request.url().startsWith(origin+'/')){denied.push(request.url());await route.abort();return}
    if(request.method()!=='GET')writes.push([request.method(),request.url()])
    await route.continue()
  })
  const profile=await(await page.request.get(origin+'/fixture/profile')).json()
  assert.equal(profile.globals,'production-compiled')
  assert.deepEqual(profile.components,['app/admin/cast-issues/page.tsx','components/ManualHomeClient.tsx','app/admin/daily-sales/page.tsx'])
  const ancestor = async view => {
    const value = await page.evaluate(()=>{
      const body=getComputedStyle(document.body),main=document.body.firstElementChild
      return {font:body.fontFamily,size:parseFloat(body.fontSize),lineHeight:parseFloat(body.lineHeight),spacing:body.letterSpacing,bodyClass:document.body.className,htmlClass:document.documentElement.className,mainClass:main.className,fixture:document.body.dataset.fontFixture,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,zen:[...document.fonts].filter(font=>/Zen Maru/.test(font.family)).length}
    })
    assert.equal(value.fixture,'production-compiled');assert.match(value.font,/apple-system|BlinkMacSystemFont/);assert.doesNotMatch(value.font,/Zen Maru/)
    assert.equal(value.size,14);assert.equal(value.lineHeight,21);assert.ok(['normal','0px'].includes(value.spacing));assert.equal(value.zen,0)
    assert.equal(value.bodyClass,'min-h-full flex flex-col');assert.equal(value.mainClass,'w-full min-h-screen relative overflow-x-hidden')
    assert.equal(value.width,value.scrollWidth,`${view}: page must not horizontally overflow`)
    return value
  }
  await page.goto(origin+'/cast-issues')
  await page.getByRole('button',{name:'月間一覧',exact:true}).click()
  await page.locator('table tbody tr button').first().waitFor()
  const table=page.locator('table'),wrap=page.locator('[class*="monthlyTableWrap"]')
  assert.equal(await table.locator('thead th').count(),15);assert.equal(await table.locator('tbody tr button').count(),4)
  const tableMetrics=await table.evaluate(element=>{
    const style=getComputedStyle(element),container=element.parentElement,box=container.getBoundingClientRect(),sticky=element.querySelector('tbody tr:not([class*="monthlyTierRow"]) th')
    return {layout:style.tableLayout,width:element.getBoundingClientRect().width,containerWidth:container.clientWidth,containerRight:box.right,overflow:getComputedStyle(container).overflowX,sticky:getComputedStyle(sticky).position,stickyLeft:sticky.getBoundingClientRect().left,rows:element.querySelectorAll('tbody tr button').length,bodyFont:getComputedStyle(element.querySelector('td')).fontFamily,bodySize:getComputedStyle(element.querySelector('td')).fontSize}
  })
  assert.equal(tableMetrics.layout,'fixed');assert.equal(tableMetrics.width,2080);assert.ok(tableMetrics.containerWidth<2080);assert.ok(['auto','scroll'].includes(tableMetrics.overflow));assert.equal(tableMetrics.sticky,'sticky')
  const before=await ancestor('issues-pc')
  await page.screenshot({path:path.join(out,'issues-pc-left.png')})
  await wrap.evaluate(element=>{element.scrollLeft=element.scrollWidth-element.clientWidth})
  const scrolled=await table.evaluate(element=>({left:element.parentElement.scrollLeft,stickyLeft:element.querySelector('tbody tr:not([class*="monthlyTierRow"]) th').getBoundingClientRect().left,lastRight:element.querySelector('thead th:last-child').getBoundingClientRect().right,containerRight:element.parentElement.getBoundingClientRect().right}))
  assert.ok(scrolled.left>0);assert.ok(Math.abs(scrolled.stickyLeft-tableMetrics.stickyLeft)<2);assert.ok(scrolled.lastRight<=scrolled.containerRight+1)
  await page.screenshot({path:path.join(out,'issues-pc-right.png')})
  metrics.push({view:'issues-pc',ancestor:before,table:tableMetrics,scroll:scrolled})
  await page.getByRole('button',{name:'会議モード',exact:true}).click()
  await page.locator('[data-meeting="true"]').waitFor()
  assert.equal(await table.locator('tbody tr button').count(),4)
  metrics.push({view:'issues-meeting',ancestor:await ancestor('issues-meeting'),font:await page.locator('[class*="meetingHeader"] strong').evaluate(element=>({family:getComputedStyle(element).fontFamily,size:getComputedStyle(element).fontSize,weight:getComputedStyle(element).fontWeight}))})
  await page.screenshot({path:path.join(out,'issues-meeting.png')})
  await page.getByRole('button',{name:'通常表示に戻る',exact:true}).click()
  assert.equal(await page.locator('[data-meeting="true"]').count(),0)

  await page.goto(origin+'/manual')
  await page.locator('[data-manual-steps]').waitFor()
  await page.getByRole('button',{name:'架空管理者 / 管理者のメニュー'}).waitFor()
  assert.equal(await page.locator('.manual-error').count(),0)
  const manualMetrics=await page.locator('.manual-header').evaluate(element=>{
    const title=element.querySelector('h1'),body=document.querySelector('.manual-main'),box=element.getBoundingClientRect(),right=element.querySelector('.manual-header-right').getBoundingClientRect(),left=title.getBoundingClientRect()
    return {font:getComputedStyle(element).fontFamily,titleFont:getComputedStyle(title).fontFamily,titleSize:getComputedStyle(title).fontSize,titleRight:left.right,controlsLeft:right.left,headerRight:box.right,controlsRight:right.right,bodyFont:getComputedStyle(body).fontFamily,bodySize:getComputedStyle(body).fontSize}
  })
  assert.doesNotMatch(manualMetrics.font,/Zen Maru/);assert.match(manualMetrics.bodyFont,/Hiragino/);assert.ok(manualMetrics.titleRight<=manualMetrics.controlsLeft+1);assert.ok(manualMetrics.controlsRight<=manualMetrics.headerRight+1)
  metrics.push({view:'manual',ancestor:await ancestor('manual'),manual:manualMetrics})
  await page.screenshot({path:path.join(out,'manual-pc.png')})

  await page.setViewportSize({width:320,height:900});await page.goto(origin+'/daily-sales')
  const customerInput=page.getByPlaceholder('顧客名・ニックネーム・ボトル名で検索...').first()
  await page.waitForFunction(()=>document.querySelector('input[placeholder="顧客名・ニックネーム・ボトル名で検索..."]')?.value==='架空の田中さん')
  assert.equal(await customerInput.inputValue(),'架空の田中さん')
  const castSelect=page.locator('header select').first()
  const firstCast=await castSelect.inputValue(),secondCast='22222222-2222-4222-8222-222222222222'
  await castSelect.selectOption(secondCast)
  await page.waitForFunction(()=>document.querySelector('input[placeholder="顧客名・ニックネーム・ボトル名で検索..."]')?.value==='架空の佐藤さん')
  assert.equal(await page.getByLabel('本日のフリー配席数',{exact:true}).inputValue(),'0')
  await castSelect.selectOption(firstCast)
  await page.waitForFunction(()=>document.querySelector('input[placeholder="顧客名・ニックネーム・ボトル名で検索..."]')?.value==='架空の田中さん')
  const amount=page.locator('table').first().getByPlaceholder('¥0').first()
  await amount.fill('123456789');await amount.blur()
  assert.equal(await amount.inputValue(),'123,456,789')
  const dailyMetrics=await page.locator('table').first().evaluate(element=>{
    let container=element.parentElement
    while(container && !['auto','scroll'].includes(getComputedStyle(container).overflowX))container=container.parentElement
    const box=container.getBoundingClientRect(),canvas=document.createElement('canvas'),context=canvas.getContext('2d')
    const inputs=[...element.querySelectorAll('input')].map(input=>{const style=getComputedStyle(input),r=input.getBoundingClientRect();context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;return {type:input.type,value:input.value,font:style.fontFamily,size:parseFloat(style.fontSize),width:r.width,available:input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),textWidth:context.measureText(input.value).width,left:r.left,right:r.right}})
    return {tableWidth:element.getBoundingClientRect().width,containerWidth:container.clientWidth,containerLeft:box.left,containerRight:box.right,scrollWidth:container.scrollWidth,overflow:getComputedStyle(container).overflowX,inputs}
  })
  assert.ok(dailyMetrics.tableWidth>dailyMetrics.containerWidth);assert.ok(dailyMetrics.scrollWidth>dailyMetrics.containerWidth);assert.equal(dailyMetrics.overflow,'auto');assert.ok(dailyMetrics.containerLeft>=0 && dailyMetrics.containerRight<=320)
  for(const input of dailyMetrics.inputs)assert.doesNotMatch(input.font,/Zen Maru/)
  const money=dailyMetrics.inputs.find(input=>input.value==='123,456,789')
  const customer=dailyMetrics.inputs.find(input=>input.value==='架空の田中さん')
  assert.ok(customer.textWidth<=customer.available+1,'Customer name must have usable input width')
  await page.screenshot({path:path.join(out,'daily-sales-320-amount.png'),fullPage:true})
  assert.ok(money.size>=16,'Mobile text input keeps iOS 16px');assert.ok(money.textWidth<=money.available+1,`Amount clips: ${JSON.stringify(money)}`)
  const extensionAmount=page.locator('[data-daily-input-table="extensions"]').getByPlaceholder('¥0')
  await extensionAmount.fill('123456789');await extensionAmount.blur()
  assert.equal(await extensionAmount.inputValue(),'123,456,789')
  const allTables=await page.locator('[data-daily-input-table]').evaluateAll(elements=>elements.map(element=>({kind:element.dataset.dailyInputTable,width:element.getBoundingClientRect().width,layout:getComputedStyle(element).tableLayout,inputs:[...element.querySelectorAll('input,select')].filter(input=>input.type!=='checkbox').map(input=>{const style=getComputedStyle(input),canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;return {value:input.value,placeholder:input.getAttribute('placeholder'),type:input.type,width:input.getBoundingClientRect().width,available:input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),textWidth:context.measureText(input.value).width,size:parseFloat(style.fontSize)}})})))
  assert.deepEqual(allTables.map(value=>value.kind),['visits','extensions','banai'])
  for(const item of allTables){assert.equal(item.layout,'fixed');assert.ok(item.width>=760);for(const input of item.inputs){assert.ok(input.width>=50,`${item.kind}: narrow control ${JSON.stringify(input)}`);if(input.value==='123,456,789')assert.ok(input.textWidth<=input.available+1,`${item.kind}: amount clips ${JSON.stringify(input)}`)}}
  const footer=await page.locator('[data-daily-sales-footer]').evaluate(element=>{
    const info=selector=>{const node=element.querySelector(selector),box=node.getBoundingClientRect(),style=getComputedStyle(node),range=document.createRange();range.selectNodeContents(node);return {width:box.width,height:box.height,left:box.left,right:box.right,lineHeight:parseFloat(style.lineHeight),textWidth:range.getBoundingClientRect().width,available:node.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),text:node.textContent}}
    return {label:info('[data-daily-total-label]'),value:info('[data-daily-total-value]'),counts:info('[data-daily-total-counts]'),save:info('[data-daily-save]')}
  })
  await page.locator('[data-daily-sales-footer]').screenshot({path:path.join(out,'daily-sales-320-footer.png')})
  for(const key of ['label','value'])assert.ok(footer[key].height<=footer[key].lineHeight+1,`Footer ${key} must stay on one readable line`)
  assert.ok(footer.counts.width>=260 && footer.counts.height<=footer.counts.lineHeight*3+1,'Footer counts must wrap as normal lines')
  assert.ok(footer.save.textWidth<=footer.save.available+1 && footer.save.height<64,`Save button text must not be squeezed vertically: ${JSON.stringify(footer.save)}`)
  for(const item of Object.values(footer))assert.ok(item.left>=0 && item.right<=320,'Footer must fit the mobile viewport')
  await page.locator('[data-daily-input-scroll]').evaluate(element=>{element.scrollLeft=0})
  await page.screenshot({path:path.join(out,'daily-sales-320-left.png'),fullPage:true})
  await page.locator('[data-daily-input-scroll]').evaluate(element=>{element.scrollLeft=element.scrollWidth})
  const rightEnd=await page.locator('table').first().evaluate(element=>({scrollLeft:element.parentElement.scrollLeft,lastRight:element.querySelector('thead th:last-child').getBoundingClientRect().right,containerRight:element.parentElement.getBoundingClientRect().right}))
  assert.ok(rightEnd.scrollLeft>0);assert.ok(rightEnd.lastRight<=rightEnd.containerRight+1)
  metrics.push({view:'daily-sales-320',ancestor:await ancestor('daily-sales-320'),daily:dailyMetrics,allTables,footer,rightEnd})
  await page.screenshot({path:path.join(out,'daily-sales-320-right.png'),fullPage:true})
  assert.deepEqual(denied,[]);assert.deepEqual(writes,[]);assert.deepEqual(badResponses,[]);assert.deepEqual(errors,[])
  const result={ok:true,checks:['actual four screens, compiled globals and layout ancestors','system Gothic body14px/1.5, no Zen fonts','fixed monthly table scrolls within local container, first column stays visible','meeting enters and returns without changing rows','manual real header/body font and no overlap','daily320 casts switch and zero count retained','three daily tables keep usable column widths; nine-digit amounts fit at16px','large daily totals and save button wrap in readable horizontal lines','no external requests, writes or unexpected API'],metrics,output:out}
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(error),metrics,errors,denied,badResponses,writes},null,2));throw error}finally{await browser.close()}
