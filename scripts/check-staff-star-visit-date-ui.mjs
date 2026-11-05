// 実React画面＋架空API。日付指定と再来店、表示復帰、出力対象を検証する。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ECLAT_PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:6116', out = '.test-dist/v153-visit-date-ui'
fs.mkdirSync(out, { recursive: true })
const date = '2026-10-28', expectedIds = ['1', '3', '4', '67']
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [], requests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (/\/api\/customers\/(search|star-counts)/.test(request.url())) requests.push(new URL(request.url())) })
  await page.addInitScript(() => { window.printSnapshots = []; window.print = () => window.printSnapshots.push({ text: document.querySelector('body>article')?.textContent, ids: [...document.querySelectorAll('body>article [data-report-customer]')].map(element => element.dataset.reportCustomer) }) })
  await page.request.get(origin + '/fixture/reset?staff=1')
  const initial = await (await page.request.get(origin + '/fixture/state')).json()
  await Promise.all(initial.customers.map(customer => page.request.put(origin + '/fixture/customers/' + customer.id, { data: { visitRecords: [{ visit_date: '2026-10-27', is_planned: false }] } })))
  for (const [id, data] of [
    ['3', { lastVisit: '2026-11-02', visitRecords: [{ visit_date: date, is_planned: false }, { visit_date: '2026-11-02', is_planned: false }] }],
    ['4', { visitRecords: [{ visit_date: date, is_planned: false }, { visit_date: date, is_planned: null }] }],
    ['67', { region: null, lastVisit: '2026-11-02', visitRecords: [{ visit_date: date, is_planned: null }] }],
    ['7', { visitRecords: [{ visit_date: date, is_planned: true }] }],
    ['1', { visitRecords: [{ visit_date: date, is_planned: false }] }],
    ['11', { is_starred: false, visitRecords: [{ visit_date: date, is_planned: false }] }],
  ]) assert.ok((await page.request.put(origin + '/fixture/customers/' + id, { data })).ok())
  const ids = () => page.locator('[data-customer-ledger]').evaluateAll(elements => elements.map(element => element.dataset.customerId).sort((a, b) => Number(a) - Number(b)))
  const ready = async expected => {
    await page.waitForFunction(count => document.querySelectorAll('[data-customer-ledger]').length === count, expected.length)
    assert.deepEqual(await ids(), expected)
    if (expected.length) await page.getByRole('button', { name: 'PDF保存', exact: true }).waitFor()
    await page.waitForFunction(() => ![...document.querySelectorAll('[data-star-category]')].some(element => element.dataset.count === 'unknown'))
  }
  const chooseDate = async () => {
    await page.getByRole('button', { name: '来店日を指定', exact: true }).click()
    await page.getByLabel('来店日', { exact: true }).fill(date)
    await ready(expectedIds)
  }
  await page.goto(origin + '/?staff=1')
  await page.getByRole('button', { name: /^1\. 本日確認/ }).click()
  await chooseDate()
  const latest = requests.filter(url => url.pathname.endsWith('/search')).at(-1)
  assert.equal(latest.searchParams.get('starredVisitDate'), date)
  assert.equal(latest.searchParams.get('starredVisitDay'), null)
  const countRequest = requests.filter(url => url.pathname.endsWith('/star-counts')).at(-1)
  assert.equal(countRequest.searchParams.get('starredVisitDate'), date)
  const counts = await (await page.request.get(origin + '/api/customers/star-counts?' + countRequest.searchParams)).json()
  assert.equal(counts.matched.total.total, 4)
  assert.equal(counts.matched.total.categories['県内顧客'], 1)
  assert.equal(counts.matched.total.categories['県内場内'], 1); assert.equal(counts.matched.total.categories['県外場内'], 2)
  assert.equal(counts.total.total, 125)
  assert.equal(counts.matched.byCast['あかり'].total, 3); assert.equal(counts.matched.byCast['りな'].total, 1)
  const groups = await page.locator('details[data-goal-category]').evaluateAll(elements => elements.map(element => ({ category: element.dataset.goalCategory, open: element.open })))
  assert.deepEqual(groups, [{ category: '県内顧客', open: false }, { category: '県内場内', open: false }, { category: '県外場内', open: false }])
  await page.locator('[data-category-toggle="県内場内"]').click()
  assert.equal(await page.locator('[data-customer-id="3"]').isVisible(), true)
  assert.match(await page.locator('[data-customer-id="3"]').textContent(), /11\/02/, '再来店済みの人も指定日の対象に含む')

  // 指定日は出力にも残り、閉じた分類も含む正しい4名だけを印刷する。
  await page.getByRole('button', { name: '印刷', exact: true }).click()
  await page.waitForFunction(() => window.printSnapshots.length === 1)
  const printed = await page.evaluate(() => window.printSnapshots[0])
  assert.match(printed.text, /2026\/10\/28/); assert.equal(printed.ids.length, 4)
  assert.equal(await page.getByLabel('来店日', { exact: true }).inputValue(), date)
  assert.equal(await page.locator('details[data-goal-category="県内場内"]').evaluate(element => element.open), true)

  // 個人のキャストリストへ移動して戻っても日付指定を維持する。
  await page.locator('[data-star-list="sidebar"] [data-star-cast="あかり"]').click()
  await page.getByText('個人キャスト画面は通常のプレビューを使用', { exact: true }).waitFor()
  await page.getByRole('button', { name: '本日確認 全キャスト', exact: true }).click()
  await ready(expectedIds)
  assert.equal(await page.getByLabel('来店日', { exact: true }).inputValue(), date)
  assert.equal(await page.getByRole('button', { name: '来店日を指定', exact: true }).getAttribute('aria-pressed'), 'true')

  // 既存の日数条件と相互排他。日付を消しても対象日へ勝手に戻さない。
  await page.getByRole('button', { name: '対象日で表示', exact: true }).click()
  await page.getByLabel('場内の経過日数').selectOption('6')
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
  const dayRequest = requests.filter(url => url.pathname.endsWith('/search')).at(-1)
  assert.equal(dayRequest.searchParams.get('starredVisitDay'), '6'); assert.equal(dayRequest.searchParams.get('starredVisitDate'), null)
  await chooseDate()
  await page.getByLabel('来店日', { exact: true }).fill('')
  await page.waitForFunction(() => document.querySelectorAll('[data-customer-ledger]').length === 0)
  assert.equal(await page.getByRole('button', { name: 'PDF保存', exact: true }).isEnabled(), false)
  await page.getByLabel('来店日', { exact: true }).fill(date); await ready(expectedIds)

  // 0件は通常表示。通信失敗は0件成功や古い結果として扱わない。
  await page.getByLabel('来店日', { exact: true }).fill('2026-10-26'); await ready([])
  await page.getByLabel('来店日', { exact: true }).fill(date); await ready(expectedIds)
  await page.route('**/api/customers/search?**', route => new URL(route.request().url()).searchParams.has('starredVisitDate') ? route.fulfill({ status: 500, json: { error: '架空の日付指定取得エラー' } }) : route.continue())
  await page.getByLabel('来店日', { exact: true }).fill('2026-10-27')
  await page.getByRole('alert').filter({ hasText: '架空の日付指定取得エラー' }).waitFor()
  assert.equal((await ids()).length, 0)
  assert.equal(await page.getByRole('button', { name: 'PDF保存', exact: true }).isEnabled(), false)
  await page.unroute('**/api/customers/search?**')
  await page.getByLabel('来店日', { exact: true }).fill(date); await ready(expectedIds)
  await page.screenshot({ path: out + '/desktop.png', fullPage: false })

  // 場内から本指名へ変わった後も指定日の対象IDは残り、現在の分類へ移る。
  const beforePromotion = await (await page.request.get(origin + '/fixture/state')).json()
  await page.request.put(origin + '/fixture/customers/3', { data: { nomination_status: '本指名' } })
  await page.getByLabel('来店日', { exact: true }).fill('2026-10-26'); await ready([])
  await page.getByLabel('来店日', { exact: true }).fill(date); await ready(expectedIds)
  assert.equal(await page.locator('details[data-goal-category="県内顧客"] [data-customer-id="3"]').count(), 1)
  const afterPromotion = await (await page.request.get(origin + '/fixture/state')).json()
  assert.deepEqual(afterPromotion.goals, beforePromotion.goals)
  assert.deepEqual(afterPromotion.meetingRecords, beforePromotion.meetingRecords)
  assert.deepEqual(afterPromotion.cycles, beforePromotion.cycles)

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width)
    const input = await page.getByLabel('来店日', { exact: true }).boundingBox()
    assert.ok(input.x >= 0 && input.x + input.width <= width + 1)
    assert.deepEqual(await ids(), expectedIds)
    if (width === 390) await page.screenshot({ path: out + '/mobile.png', fullPage: false })
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ok: true, selectedDate: date, customers: expectedIds, checks: ['再来店済みを含む指定日の実来店', '本指名含む・予定と⭐️なし除外', '本指名化後も指定日のIDを維持', '重複来店は1名', '県内外場内・未設定の分類', '対象人数と一覧一致', '出力に日付と4名', '分類開閉と個人表示からの復帰', '日数と日付の相互排他', '空日付で全件へ戻さない', '0件と通信失敗', '320/390px表示'], output: out }))
} finally { await browser.close() }
