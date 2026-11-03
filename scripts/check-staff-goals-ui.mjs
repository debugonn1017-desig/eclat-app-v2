// localhostの架空APIだけを操作する、本日確認と共通月別カードの回帰確認。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ECLAT_PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:6116'
const out = process.env.ECLAT_STAFF_GOALS_QA_DIR || '/private/tmp/eclat-staff-goals-qa'
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = [], checks = []
const addChecks = checks.push.bind(checks)
checks.push = (...values) => { console.log(JSON.stringify({ passed: values })); return addChecks(...values) }
const portraitPages = file => {
  const boxes = [...fs.readFileSync(file, 'latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
  assert.ok(boxes.length > 1, `Expected multiple A4 pages: ${file}`)
  for (const box of boxes) { assert.ok(Math.abs(Number(box[1]) - 595.28) < 1); assert.ok(Math.abs(Number(box[2]) - 841.89) < 1) }
  return boxes.length
}
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true })
  page.on('pageerror', error => errors.push(error.message))
  const checkedBy = '確認スタッフ（確認者名が長い場合の表示テスト）'
  await page.route('**/api/star-logs**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET' || !['/api/star-logs', '/api/star-logs/64'].includes(pathname)) { await route.continue(); return }
    const response = await route.fetch(), data = await response.json()
    const longActor = cycle => { if (cycle?.customer_id === 64 && cycle.last_checked_on) cycle.last_checked_by = checkedBy }
    longActor(data.cycle); data.items?.forEach(longActor)
    await route.fulfill({ response, json: data })
  })
  const allCustomers = () => page.getByRole('group', { name: '⭐️の表示対象' }).getByRole('button', { name: '⭐️全員', exact: true })
  const waitReady = async (count = 126) => {
    await page.waitForFunction(expected => document.querySelectorAll('[data-customer-ledger]').length === expected, count)
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'PDF保存')?.disabled)
  }
  const openToday = async (suffix = '') => {
    await page.goto(origin + '/?staff=1' + suffix)
    await page.getByRole('button', { name: /^1\. 本日確認/ }).click()
    await allCustomers().click()
    await waitReady()
  }
  await page.request.get(origin + '/fixture/reset?staff=1')
  await openToday()
  assert.equal(await page.getByRole('navigation', { name: 'ページ切替' }).count(), 0)
  const ids = await page.locator('[data-customer-ledger]').evaluateAll(elements => elements.map(element => element.dataset.customerId))
  assert.equal(new Set(ids).size, 126)
  for (const category of ['県内顧客', '県外顧客', '県内場内', '県外場内']) assert.equal(await page.getByRole('button', { name: new RegExp('^' + category) }).count(), 1)
  const value = (id, measure, kind) => page.locator(`[data-customer-id="${id}"] [data-goal-measure="${measure}"] [data-goal-value="${kind}"]`)
  assert.equal(await value('1', 'sales', 'target').innerText(), '¥300,000')
  assert.equal(await value('1', 'sales', 'actual').innerText(), '¥120,000')
  assert.equal(await value('64', 'sales', 'target').innerText(), '¥500,000')
  assert.equal(await value('64', 'sales', 'actual').innerText(), '¥250,000')
  assert.match(await page.locator('[data-customer-id="1"]').innerText(), /あかりの11月備考/)
  assert.match(await page.locator('[data-customer-id="64"]').innerText(), /りなの11月備考/)
  let state = await (await page.request.get(origin + '/fixture/state')).json()
  assert.ok(state.searchRequests.some(request => request.starredView === 'all' && request.page === '2'))
  checks.push('126人を2ページから連続表示', '4分類', '2キャストの異なる月別目標・実績・備考')
  const dimensions = await page.locator('[data-customer-ledger]').first().boundingBox()
  await page.screenshot({ path: out + '/staff-mobile.png' })

  // 別キャストの目標は、その行のcastIdで既存保存APIへ渡す。
  await page.getByRole('button', { name: /^県外場内/ }).click()
  const target = page.locator('[data-customer-id="64"]')
  await target.getByRole('button', { name: 'りな・お客様64の操作を表示' }).click()
  await target.getByRole('button', { name: /目標・備考/ }).click()
  const editor = page.getByRole('dialog', { name: /りな・お客様64 · 目標・備考の編集/ })
  await editor.getByRole('spinbutton', { name: '目標売上（円）' }).fill('700000')
  await editor.getByRole('spinbutton', { name: '目標来店回数（回）' }).fill('6')
  await editor.getByRole('textbox', { name: '月別の備考' }).fill('りな保存・別担当へ混ざらない')
  await editor.getByRole('button', { name: '保存する', exact: true }).click()
  await editor.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('[data-customer-id="64"]')?.innerText.includes('りな保存'))
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'PDF保存')?.disabled)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  state = await (await page.request.get(origin + '/fixture/state')).json()
  assert.equal(state.goalWrites.at(-1).castId, '33333333-3333-4333-8333-333333333333')
  assert.equal(state.goalWrites.at(-1).customerId, '64')
  assert.equal(state.goals.find(goal => goal.customer_id === 64 && goal.month === '2026-11-01').target_sales, 700000)
  assert.equal(state.goals.find(goal => goal.customer_id === 1 && goal.month === '2026-11-01').target_sales, 300000)
  checks.push('正しい担当castIdで目標保存')

  // 同寸ボタンと、本日確認後の状況・行・スクロール維持。
  await target.evaluate(element => element.scrollIntoView({ block: 'center' }))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
  const before = await target.boundingBox(), beforeScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
  const confirm = target.getByRole('button', { name: '本日確認', exact: true }), log = target.getByRole('button', { name: '記録・ログ', exact: true })
  const confirmBox = await confirm.boundingBox(), logBox = await log.boundingBox()
  assert.ok(Math.abs(confirmBox.width - logBox.width) < 1); assert.equal(confirmBox.height, logBox.height)
  await confirm.click()
  await target.getByRole('button', { name: /本日確認済み/ }).waitFor()
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'PDF保存')?.disabled)
  const after = await target.boundingBox(), afterScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
  assert.equal(before.x, after.x); assert.equal(before.width, after.width); assert.equal(before.height, after.height); assert.deepEqual(afterScroll, beforeScroll)
  const checkedButton = target.getByRole('button', { name: /本日確認済み/ })
  assert.match(await checkedButton.innerText(), new RegExp(checkedBy.replace(/[()]/g, '\\$&')))
  assert.ok((await checkedButton.getAttribute('title')).includes(checkedBy))
  assert.equal(await checkedButton.evaluate(button => getComputedStyle(button).textOverflow), 'ellipsis')
  const checkedBox = await checkedButton.boundingBox()
  assert.ok(Math.abs(checkedBox.width - logBox.width) < 1); assert.equal(checkedBox.height, logBox.height)
  state = await (await page.request.get(origin + '/fixture/state')).json()
  assert.equal(state.cycles.find(cycle => cycle.customer_id === 64).last_status, '返信待ち')
  assert.equal(state.events.filter(event => event.customer_id === 64).length, 1)
  await log.click()
  await page.getByRole('dialog').last().getByText('本日、連絡状況を確認しました。', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  checks.push('本日確認・ログの同寸と位置保持', '長い確認者名を表示しても同寸', '実確認ログ')

  // 検索・対象月・分類・位置を持つ状態から、長押し→実個人ページ編集保存→復帰。
  await page.getByLabel('目標の対象月').fill('2026-12')
  if (!await page.getByPlaceholder('名前・ニックネーム・ボトル名').isVisible()) await page.getByText('検索・並び・表示条件', { exact: true }).click()
  await page.getByPlaceholder('名前・ニックネーム・ボトル名').fill('重点')
  await page.getByRole('button', { name: '検索', exact: true }).click()
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'PDF保存')?.disabled)
  await page.getByRole('button', { name: /^県外場内/ }).click()
  await target.scrollIntoViewIfNeeded()
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
  const name = await target.locator('[role="button"]').boundingBox()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: name.x + 40, y: name.y + 10 }] })
  await page.waitForTimeout(650)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  let info = page.getByRole('dialog', { name: 'りな・お客様64のお客様情報' })
  await info.waitFor()
  assert.match(await info.innerText(), /2026年12月の目標・実績/)
  await info.getByRole('button', { name: '個人ページを開く' }).click()
  const personal = page.getByRole('dialog', { name: 'お客様の個人ページ', exact: true })
  await personal.getByRole('button', { name: '編集', exact: true }).click()
  await personal.locator('input[name="customer_name"]').fill('りな・お客様64・変更済み')
  await personal.locator('select[name="region"]').selectOption('東京都')
  assert.equal(await personal.getByRole('button', { name: 'お客様の個人ページを閉じる' }).isDisabled(), true)
  assert.equal(await personal.locator('input[name="monthly_target_sales"]').count(), 0)
  await personal.getByRole('button', { name: '入力内容を保存する' }).click()
  await personal.getByRole('button', { name: '編集', exact: true }).waitFor()
  await personal.getByRole('button', { name: 'お客様の個人ページを閉じる' }).click()
  await personal.waitFor({ state: 'hidden' })
  info = page.getByRole('dialog').last()
  await info.getByRole('button', { name: '一覧に戻る' }).click()
  await page.waitForFunction(() => document.querySelector('[data-customer-id="64"]')?.innerText.includes('変更済み'))
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'PDF保存')?.disabled)
  assert.equal(await page.getByLabel('目標の対象月').inputValue(), '2026-12')
  assert.equal(await page.getByPlaceholder('名前・ニックネーム・ボトル名').inputValue(), '重点')
  assert.equal(await page.getByRole('button', { name: /^県外場内/ }).getAttribute('aria-pressed'), 'true')
  assert.equal(await allCustomers().getAttribute('aria-pressed'), 'true')
  assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), scroll)
  assert.match(await target.innerText(), /東京都/)
  checks.push('長押し・実個人ページ編集保存後の月/分類/検索/位置保持')

  // スワイプしても既存の編集・ランク・星解除などの操作を保つ。
  await target.evaluate(element => element.scrollIntoView({ block: 'center' }))
  const targetBox = await target.boundingBox(), y = targetBox.y + 60
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: targetBox.x + targetBox.width - 45, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: targetBox.x + 40, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await target.getByRole('button', { name: /目標・備考/ }).waitFor()
  await target.getByRole('button', { name: '戻る', exact: true }).click()
  checks.push('スワイプ操作')

  // 分類で31名へ絞っていても、現在の本日確認対象126名をA4縦で全件出力。
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF保存', exact: true }).click()
  const download = await downloadEvent
  await download.saveAs(out + '/staff-goals.pdf')
  assert.ok(fs.statSync(out + '/staff-goals.pdf').size > 10000)
  const directPages = portraitPages(out + '/staff-goals.pdf')
  let printedCustomers = 0
  await page.exposeFunction('captureStaffPrintCustomers', count => { printedCustomers = count })
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(() => { window.print = () => window.captureStaffPrintCustomers(document.querySelectorAll('body>article [data-report-customer]').length) })
  await page.getByRole('button', { name: '印刷', exact: true }).click()
  await page.waitForFunction(() => document.body.dataset.customerGoalsPrint === 'true' && document.querySelectorAll('body>article [data-report-customer]').length === 126)
  assert.match(await page.locator('body>article').innerText(), /担当 あかり/)
  assert.match(await page.locator('body>article').innerText(), /担当 りな/)
  await page.pdf({ path: out + '/staff-native-print.pdf', preferCSSPageSize: true, printBackground: true })
  const nativePages = portraitPages(out + '/staff-native-print.pdf')
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: 'screen' })
  await page.waitForFunction(() => !document.body.dataset.customerGoalsPrint)
  assert.equal(printedCustomers, 126)
  assert.equal(await page.locator('body>article').count(), 0)
  assert.equal(await page.getByRole('button', { name: /^県外場内/ }).getAttribute('aria-pressed'), 'true')
  checks.push('全126名PDF・印刷A4縦', '印刷後の一覧復帰')

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await openToday()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `overflow at ${width}`)
    if (width === 1440) await page.screenshot({ path: out + '/staff-desktop.png' })
  }
  checks.push('5画面幅の横はみ出しなし')

  await openToday('&readonly=1')
  assert.equal(await page.getByRole('button', { name: /の操作を表示/ }).count(), 0)
  assert.equal(await page.getByRole('button', { name: '本日確認', exact: true }).first().isDisabled(), true)
  checks.push('閲覧権限')

  await openToday()
  await page.request.get(origin + '/fixture/fail')
  await page.getByLabel('目標の対象月').fill('2026-12')
  await page.getByRole('alert').filter({ hasText: '架空の通信エラー' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'PDF保存', exact: true }).isDisabled(), true)
  assert.equal(await page.locator('[data-customer-ledger]').count(), 126)
  assert.deepEqual(await page.locator('[data-goal-value="actual"]').allTextContents(), Array(252).fill('—'))
  checks.push('月別取得失敗を0実績として表示しない')
  await page.request.get(origin + '/fixture/fail')
  await page.request.get(origin + '/fixture/fail-search-page?page=2')
  await page.reload()
  await page.getByRole('button', { name: /^1\. 本日確認/ }).click()
  await allCustomers().click()
  await page.getByRole('alert').filter({ hasText: '架空の続き取得エラー' }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'PDF保存', exact: true }).isDisabled(), true)
  assert.notEqual(await page.locator('[data-customer-ledger]').count(), 100)
  checks.push('連続一覧の途中失敗を部分成功にしない')
  await page.request.get(origin + '/fixture/fail-search-page')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ok: true, dimensions, pages: { direct: directPages, native: nativePages }, checks, output: out }))
} catch (error) {
  console.error(error)
  console.error(JSON.stringify({ errors, checks }))
  throw error
} finally { await browser.close() }
