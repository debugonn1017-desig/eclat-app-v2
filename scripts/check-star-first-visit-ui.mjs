// 初来店日だけの⭐️場内を、実来店の数値へ混ぜず追いかける実React画面の回帰確認。
// preview-customer-goals.mjs の架空APIだけを操作する。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ECLAT_PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:6116', out = '.test-dist/star-first-visit-ui'
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.printSnapshots = []; window.pdfTexts = []
    window.print = () => window.printSnapshots.push(document.querySelector('body>article')?.textContent)
    const draw = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) { window.pdfTexts.push(String(text)); return draw.call(this, text, ...args) }
  })
  const patch = async (id, data) => assert.ok((await page.request.put(origin + '/fixture/customers/' + id, { data })).ok())
  const firstOnly = { nomination_status: '場内', first_visit_date: '2026-11-02', lastVisit: null, visitRecords: [], total: 0, count: 0, average: 0, goalActual: { sales: 0, visits: 0 } }
  const row = id => page.locator(`[data-customer-ledger][data-customer-id="${id}"]`)
  const openCategory = async category => {
    const group = page.locator(`details[data-goal-category="${category}"]`)
    if (!await group.evaluate(element => element.open)) await group.locator(':scope > summary').click()
  }
  const ready = async () => page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'PDF保存' && !button.disabled))
  await page.request.get(origin + '/fixture/reset')
  await patch('4', firstOnly)
  await patch('5', { ...firstOnly, first_visit_date: '2026-11-04' })
  await patch('6', { ...firstOnly, nomination_status: '本指名' })
  await patch('7', { ...firstOnly, customer_rank: '切れた' })
  await page.goto(origin); await ready()
  await openCategory('県内場内')
  assert.match(await row('4').innerText(), /初来店日\s*11\/02\s*1日経過\s*来店履歴未登録/)
  assert.equal(await row('4').locator('[data-follow-up-source]').getAttribute('data-follow-up-source'), 'first_visit')
  assert.equal(await row('4').locator('[data-goal-measure="sales"] [data-goal-value="actual"]').textContent(), '¥0')
  assert.equal(await row('4').locator('[data-goal-measure="visits"] [data-goal-value="actual"]').textContent(), '0回')

  await page.getByRole('button', { name: /^本日連絡 / }).click()
  await row('4').waitFor({ state: 'visible' })
  for (const id of ['5', '6', '7']) assert.equal(await row(id).count(), 0, `追いかけ対象外 ${id} を補完しない`)
  // 長押しの情報欄には実最終日の未記録と、別の追いかけ基準を併記する。
  await row('4').scrollIntoViewIfNeeded()
  const name = await row('4').getByRole('button', { name: '中村さん', exact: true }).boundingBox()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: name.x + 30, y: name.y + 10 }] })
  await page.waitForTimeout(650)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const info = page.getByRole('dialog', { name: '中村さんのお客様情報' })
  await info.waitFor()
  assert.match(await info.textContent(), /最終来店日未記録/)
  assert.match(await info.textContent(), /追いかけ基準初来店日 2026-11-02（来店履歴未登録）/)
  assert.match(await info.textContent(), /累計来店・売上0回・¥0/)
  await info.getByRole('button', { name: '一覧に戻る', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: /^本日連絡 / }).getAttribute('aria-pressed'), 'true')
  assert.equal(await page.locator('details[data-goal-category="県内場内"]').evaluate(element => element.open), true)
  const beforeConfirm = await row('4').boundingBox()
  await row('4').getByRole('button', { name: '本日確認', exact: true }).click()
  await row('4').getByRole('button', { name: /^本日確認済み/ }).waitFor()
  const afterConfirm = await row('4').boundingBox()
  assert.ok(Math.abs(beforeConfirm.x - afterConfirm.x) < 1)
  await page.screenshot({ path: out + '/cast-mobile.png', fullPage: false })
  await page.getByRole('button', { name: '印刷', exact: true }).click()
  await page.waitForFunction(() => window.printSnapshots.length > 0)
  assert.match(await page.evaluate(() => window.printSnapshots[0]), /初来店 11\/02.*来店履歴未登録/s)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF保存', exact: true }).click()
  const pdf = out + '/cast-first-visit.pdf'; await (await download).saveAs(pdf)
  assert.ok(fs.statSync(pdf).size > 1000)
  assert.match(await page.evaluate(() => window.pdfTexts.join('')), /初来店 11\/02.*来店履歴未登録/s)
  const castState = await (await page.request.get(origin + '/fixture/state')).json()
  const castCustomer = castState.customers.find(customer => customer.id === '4')
  assert.deepEqual(castCustomer.visitRecords, []); assert.equal(castCustomer.lastVisit, null)
  assert.equal(castCustomer.count, 0); assert.equal(castCustomer.total, 0)

  // スタッフの対象日・日付指定も同じ基準。別の実来店があれば初来店日へ戻さない。
  await page.request.get(origin + '/fixture/reset?staff=1')
  await patch('3', { ...firstOnly, customer_name: '初来店のみ様' })
  await patch('4', { first_visit_date: '2026-11-02', lastVisit: '2026-11-01', visitRecords: [{ visit_date: '2026-11-01', is_planned: false, nomination_status_at_visit: '場内' }] })
  await patch('5', { ...firstOnly, nomination_status: '本指名' })
  await patch('6', { ...firstOnly, customer_rank: '切れた' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(origin + '/?staff=1')
  await page.getByRole('button', { name: /^1\. 本日確認/ }).click(); await ready()
  assert.equal(await row('3').count(), 1)
  await openCategory('県内場内')
  assert.match(await row('3').innerText(), /初来店日\s*11\/02\s*1日経過\s*来店履歴未登録/)
  const source = await page.request.get(origin + '/api/customers/search?starred=true&starredView=banai')
  const result = await source.json(), metrics = result.customers.find(customer => customer.id === '3').metrics
  assert.equal(metrics.lastVisitDate, null); assert.equal(metrics.daysSinceLastVisit, null)
  assert.equal(metrics.followUpDate, '2026-11-02'); assert.equal(metrics.followUpDateSource, 'first_visit')
  assert.equal(metrics.totalSpent, 0); assert.equal(metrics.visitCount, 0)
  await page.getByRole('button', { name: '来店日を指定', exact: true }).click()
  await page.getByLabel('来店日', { exact: true }).fill('2026-11-02'); await ready()
  await page.waitForFunction(() => !!document.querySelector('[data-customer-id="3"]'))
  for (const id of ['4', '5', '6']) assert.equal(await row(id).count(), 0, `日付指定で初来店日を誤補完しない ${id}`)
  await page.screenshot({ path: out + '/staff-desktop.png', fullPage: false })
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await row('3').scrollIntoViewIfNeeded()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}pxで横にはみ出さない`)
    assert.ok(await row('3').getByText('来店履歴未登録', { exact: true }).isVisible())
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ok: true, output: out, checks: ['cast本日連絡', 'staff対象日と日付指定', '実最終日と追いかけ日を分離', '初来店日・来店履歴未登録を明示', '売上0/来店0保持', '未来/本指名/切れた/実来店ありを誤補完しない', '長押し・確認後の一覧復帰', '印刷とPDF', '320/390/1440幅'] }))
} finally { await browser.close() }
