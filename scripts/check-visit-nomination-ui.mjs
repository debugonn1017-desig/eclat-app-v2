// Actual components/hooks, synthetic loopback API only; never use a production URL.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{chromium}=require(process.env.ECLAT_PLAYWRIGHT_MODULE||'/private/tmp/costes-interview-manual/node_modules/playwright')
const origin='http://127.0.0.1:6121',out='.test-dist/v158-visit-nomination-ui'
fs.mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[]
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 const state=async()=>await(await page.request.get(origin+'/fixture/state')).json()
 const control=async data=>assert.ok((await page.request.post(origin+'/fixture/control',{data})).ok())
 const reset=async()=>assert.ok((await page.request.get(origin+'/fixture/reset')).ok())
 const openVisits=async()=>{
  await page.goto(origin)
  await page.getByRole('button',{name:'来店履歴',exact:true}).click()
  await page.locator('[data-visit-nomination="11"]').waitFor()
 }
 const row=()=>page.locator('[data-visit-nomination="11"]')
 const begin=async()=>{
  await row().getByRole('button',{name:'2026/11/05の指名区分を訂正',exact:true}).click()
  await row().getByLabel('正しい指名区分',{exact:true}).selectOption('本指名')
 }
 const confirm=()=>row().getByRole('checkbox')
 const save=()=>row().getByRole('button',{name:'この来店の訂正を保存',exact:true})
 await reset();await openVisits()
 assert.equal(await page.locator('[data-visit-nomination="12"]').count(),0,'予定には訂正操作を出さない')
 const before=await state();await begin()
 assert.equal(await save().isEnabled(),false)
 assert.equal(await page.locator('[data-fixture-close]').isEnabled(),false,'訂正中は元一覧を閉じない')
 await confirm().check();assert.equal(await save().isEnabled(),true)
 await control({failure:'conflict'});await save().click()
 await row().getByRole('alert').waitFor()
 assert.equal(await row().getByLabel('正しい指名区分',{exact:true}).inputValue(),'本指名')
 assert.equal(await confirm().isChecked(),true)
 assert.deepEqual((await state()).visits,before.visits)
 checks.push('日付と前後区分を明示・確認必須・競合時は入力と元記録を保持')
 await control({failure:'',delayMs:350});await save().click()
 await row().getByRole('button',{name:'訂正を保存中…',exact:true}).waitFor()
 assert.equal(await row().getByRole('button',{name:'キャンセル',exact:true}).isEnabled(),false)
 assert.equal(await page.locator('[data-fixture-close]').isEnabled(),false)
 await row().getByRole('button',{name:'2026/11/05の指名区分を訂正',exact:true}).waitFor()
 const after=await state(),changed=after.visits.find(v=>v.id==='11'),old=before.visits.find(v=>v.id==='11')
 assert.equal(changed.nomination_status_at_visit,'本指名');assert.equal(changed.nomination_revision,1)
 assert.deepEqual({...changed,nomination_status_at_visit:old.nomination_status_at_visit,nomination_revision:old.nomination_revision},old)
 assert.deepEqual(after.visits.filter(v=>v.id!=='11'),before.visits.filter(v=>v.id!=='11'))
 assert.deepEqual(after.customer,before.customer);assert.equal(after.history.length,1)
 const puts=after.requests.filter(r=>r.path==='/api/visit-nominations'&&r.method==='PUT')
 assert.equal(puts.length,2);assert.equal(puts[0].data.requestId,puts[1].data.requestId)
 await row().getByText('指名区分の訂正履歴 1件',{exact:true}).click()
 await row().getByText('架空スタッフ',{exact:false}).waitFor()
 assert.match(await row().textContent(),/場内 → 本指名/)
 checks.push('保存中の閉じる保護・対象1件だけ変更・金額/日付/他来店/顧客不変・操作者履歴')
 await page.screenshot({path:out+'/desktop-history.png',fullPage:false})
 // Successful server commit followed by lost response must retry the same request without duplicate history.
 await reset();await openVisits();await begin();await confirm().check();await control({failure:'afterCommit'});await save().click()
 await row().getByRole('alert').waitFor();assert.equal((await state()).history.length,1)
 await save().click();await row().getByRole('button',{name:'2026/11/05の指名区分を訂正',exact:true}).waitFor()
 assert.equal((await state()).history.length,1)
 checks.push('保存後通信切断の同一requestId再送で履歴を重複しない')
 // A read-only response must never expose mutation controls.
 await reset();await control({canEdit:false});await openVisits()
 assert.equal(await page.getByRole('button',{name:/の指名区分を訂正$/}).count(),0)
 checks.push('閲覧専用では訂正ボタンを表示しない')
 // Promoting a customer alone must retain all historical nomination snapshots.
 await reset();await page.goto(origin+'/?form=1')
 await page.locator('select[name="nomination_status"]').selectOption('本指名')
 const linked=()=>page.getByRole('checkbox',{name:/直近の来店も本指名に訂正/})
 await linked().waitFor();assert.equal(await linked().isChecked(),false)
 assert.match(await page.locator('form').textContent(),/2026\/11\/05/)
 const normalBefore=await state();await page.getByRole('button',{name:'この内容で保存する',exact:true}).click()
 await page.locator('[data-fixture-list]').waitFor()
 const normalAfter=await state();assert.equal(normalAfter.customer.nomination_status,'本指名');assert.deepEqual(normalAfter.visits,normalBefore.visits)
 checks.push('本指名変更の補助チェックは初期OFF・未選択なら過去来店を変更しない')
 // Explicit linking corrects exactly the displayed latest actual visit, not plans or older dates.
 await reset();await page.goto(origin+'/?form=1');await page.locator('select[name="nomination_status"]').selectOption('本指名');await linked().check()
 const linkedBefore=await state();await page.getByRole('button',{name:'この内容で保存する',exact:true}).click()
 await page.locator('[data-fixture-list]').waitFor()
 const linkedAfter=await state();assert.equal(linkedAfter.customer.nomination_status,'本指名');assert.equal(linkedAfter.visits.find(v=>v.id==='11').nomination_status_at_visit,'本指名')
 assert.deepEqual(linkedAfter.visits.filter(v=>v.id!=='11'),linkedBefore.visits.filter(v=>v.id!=='11'));assert.equal(linkedAfter.history.length,1)
 checks.push('明示チェック時だけ表示した直近実来店を顧客変更と一緒に訂正')
 // getCustomer normalises legacy DB NULL to an empty form value; the correction must restore NULL in its expected value.
 await reset();await control({customer:{nomination_status:null}});await page.goto(origin+'/?form=1')
 await page.locator('select[name="nomination_status"]').selectOption('本指名');await linked().check()
 await page.getByRole('button',{name:'この内容で保存する',exact:true}).click();await page.locator('[data-fixture-list]').waitFor()
 const legacyAfter=await state(),legacyPatch=legacyAfter.requests.find(request=>request.path==='/api/customers/1'&&request.method==='PATCH')
 assert.equal(legacyPatch.data.visit_nomination_correction.expectedCustomerStatus,null)
 assert.equal(legacyAfter.customer.nomination_status,'本指名');assert.equal(legacyAfter.visits.find(v=>v.id==='11').nomination_status_at_visit,'本指名')
 checks.push('旧NULL顧客区分は空フォーム値から期待値NULLへ戻して連携訂正できる')

 // Stale linked nomination must not claim success or clear the form.
 await reset();await page.goto(origin+'/?form=1');await page.locator('select[name="nomination_status"]').selectOption('本指名');await linked().check();await control({failure:'conflict'})
 await page.getByRole('button',{name:'この内容で保存する',exact:true}).click()
 await page.waitForFunction(()=>!document.querySelector('button[type="submit"]')?.disabled)
 assert.equal(await page.locator('[data-fixture-list]').count(),0);assert.equal(await linked().isChecked(),true);assert.equal((await state()).history.length,0);assert.equal((await state()).customer.nomination_status,'場内')
 checks.push('基本情報と来店の連携保存が失敗したらフォームと選択を保持')
 for(const width of [320,390]){
  await reset();await page.setViewportSize({width,height:900});await openVisits();await begin();await confirm().check()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width)
  assert.equal(await row().getByLabel('正しい指名区分',{exact:true}).evaluate(el=>getComputedStyle(el).fontSize),'16px')
  await page.screenshot({path:out+'/mobile-'+width+'.png',fullPage:false})
 }
 checks.push('320/390pxで横はみ出しなし・16px入力・確認と操作ボタンを表示')
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({ok:true,checks,output:out}))
}finally{await browser.close()}
