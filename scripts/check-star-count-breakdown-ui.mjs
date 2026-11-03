// 架空データ専用。入口/PC左名簿/人数APIの分類一致と未取得表示を確認する。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ECLAT_PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:6116'
const out = process.env.ECLAT_STAR_COUNTS_QA_DIR || '/private/tmp/eclat-star-counts-qa'
fs.mkdirSync(out, { recursive: true })
const primary = ['県内顧客', '県外顧客', '県内場内', '県外場内']
const categories = [...primary, 'その他・地域未設定', '切れたお客様']
const casts = ['あかり', 'りな', 'ゆい']
const zeros = () => Object.fromEntries(categories.map(category => [category, 0]))
const categoryOf = customer => customer.customer_rank === '切れた' ? '切れたお客様'
  : customer.nomination_status === '場内' ? customer.region === '福岡県' ? '県内場内' : '県外場内'
  : customer.nomination_status === '本指名' && customer.region ? customer.region === '福岡県' ? '県内顧客' : '県外顧客' : 'その他・地域未設定'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  // ⭐️が0名の在籍キャストも0を表示する。顧客/目標データは追加しない。
  await page.route('**/api/customers/cast-options', async route => {
    const response = await route.fetch(), data = await response.json()
    data.casts.push({ id: '44444444-4444-4444-8444-444444444444', cast_name: 'ゆい', display_name: 'ゆい', cast_tier: 'BB', is_active: true })
    await route.fulfill({ response, json: data })
  })
  await page.request.get(origin + '/fixture/reset?staff=1')
  for (const [id, data] of [
    ['1', { customer_rank: 'C' }], ['3', { region: null }], ['4', { customer_rank: '切れた' }], ['5', { region: '' }], ['6', { is_starred: false }],
    ['65', { customer_rank: 'C' }], ['67', { region: '' }], ['68', { customer_rank: '切れた' }], ['69', { region: null }], ['71', { is_starred: false }],
  ]) assert.equal((await page.request.put(origin + '/fixture/customers/' + id, { data })).ok(), true)
  const state = await (await page.request.get(origin + '/fixture/state')).json(), starred = state.customers.filter(customer => customer.is_starred)
  const total = zeros(), byCast = Object.fromEntries(casts.map(cast => [cast, zeros()]))
  for (const customer of starred) { total[categoryOf(customer)]++; byCast[customer.cast_name][categoryOf(customer)]++ }
  assert.deepEqual(total, { '県内顧客': 30, '県外顧客': 31, '県内場内': 28, '県外場内': 31, 'その他・地域未設定': 2, '切れたお客様': 2 })
  const counts = await (await page.request.get(origin + '/api/customers/star-counts?starredView=all')).json()
  assert.equal(counts.total.total, 124); assert.deepEqual(counts.total.categories, total); assert.deepEqual(counts.matched.total.categories, total)
  for (const cast of casts.slice(0, 2)) assert.deepEqual(counts.byCast[cast].categories, byCast[cast])
  assert.equal(counts.byCast['ゆい'], undefined)
  const waitRoster = async scope => page.waitForFunction(({ scope, count }) => {
    const buttons = [...(document.querySelector(`[data-star-list="${scope}"]`)?.querySelectorAll('[data-star-cast]') || [])]
    return buttons.length === count && buttons.every(button => button.querySelectorAll('[data-star-primary="true"]').length === 4 && [...button.querySelectorAll('[data-star-category]')].every(field => field.dataset.count !== 'unknown'))
  }, { scope, count: casts.length })
  const readRoster = scope => page.locator(`[data-star-list="${scope}"] [data-star-cast]`).evaluateAll(buttons => buttons.map(button => ({
    cast: button.dataset.starCast, categories: Object.fromEntries([...button.querySelectorAll('[data-star-category]')].map(field => [field.dataset.starCategory, field.dataset.count === 'unknown' ? 'unknown' : Number(field.dataset.count)])),
    primary: [...button.querySelectorAll('[data-star-primary="true"]')].map(field => ({ label: field.dataset.starCategory, x: field.getBoundingClientRect().x, y: field.getBoundingClientRect().y, right: field.getBoundingClientRect().right, font: parseFloat(getComputedStyle(field).fontSize) })), right: button.getBoundingClientRect().right,
  })))
  const assertRoster = async scope => {
    const roster = await readRoster(scope)
    assert.deepEqual(roster.map(item => item.cast), casts)
    for (const item of roster) {
      assert.deepEqual(item.categories, Object.fromEntries(categories.filter((category, index) => index < 4 || byCast[item.cast][category] > 0).map(category => [category, byCast[item.cast][category]])))
      assert.deepEqual(item.primary.map(field => field.label), primary)
      assert.ok(item.primary.every(field => field.font >= 11 && field.right <= item.right + 1))
      assert.equal(item.primary[0].y, item.primary[1].y); assert.equal(item.primary[2].y, item.primary[3].y)
      assert.ok(item.primary[2].y > item.primary[0].y)
    }
    return roster.map(({ cast, categories }) => ({ cast, categories }))
  }
  await page.goto(origin + '/?staff=1'); await waitRoster('menu')
  const menu = await assertRoster('menu')
  await page.screenshot({ path: out + '/menu-desktop.png' })
  await page.getByRole('button', { name: /^1\. 本日確認/ }).click()
  const all = page.getByRole('group', { name: '⭐️の表示対象' }).getByRole('button', { name: '⭐️全員', exact: true })
  await all.click()
  await page.waitForFunction(() => document.querySelectorAll('[data-customer-ledger]').length === 124)
  await waitRoster('sidebar')
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'PDF保存')?.disabled)
  assert.deepEqual(await assertRoster('sidebar'), menu)
  const groups = await page.locator('details[data-goal-category]').evaluateAll(elements => elements.map(group => ({ category: group.dataset.goalCategory, open: group.open, count: group.querySelectorAll('[data-customer-ledger]').length })))
  assert.deepEqual(groups.map(group => group.category), categories)
  assert.ok(groups.every(group => !group.open && group.count === total[group.category]))
  assert.equal(await page.locator('[data-customer-ledger]:visible').count(), 0)
  const monthlyTotals = await page.getByLabel('表示対象の月別合計').textContent()
  await page.screenshot({ path: out + '/sidebar-desktop.png' })
  await page.locator('[data-category-toggle="県外場内"]').click()
  assert.equal(await page.locator('[data-customer-ledger]:visible').count(), 31)
  assert.deepEqual(await assertRoster('sidebar'), menu)
  assert.equal(await page.getByLabel('表示対象の月別合計').textContent(), monthlyTotals)
  await page.getByRole('group', { name: '⭐️の表示対象' }).getByRole('button', { name: '場内・対象日', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-customer-ledger]').length === 61)
  await waitRoster('sidebar'); assert.deepEqual(await assertRoster('sidebar'), menu)
  const banai = await (await page.request.get(origin + '/api/customers/star-counts?starredView=banai')).json()
  assert.equal(banai.matched.total.total, 61); assert.equal(banai.matched.total.categories['切れたお客様'], 2)
  assert.deepEqual(banai.total.categories, total)
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(origin + '/?staff=1'); await waitRoster('menu')
    assert.deepEqual(await assertRoster('menu'), menu)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width)
    if (width === 390) await page.screenshot({ path: out + '/menu-mobile.png' })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.route('**/api/customers/star-counts**', route => route.fulfill({ status: 503, json: { error: '架空の人数取得失敗' } }))
  await page.goto(origin + '/?staff=1')
  await page.getByRole('alert').filter({ hasText: '人数を取得できませんでした' }).waitFor()
  const unknownMenu = await readRoster('menu')
  assert.equal(unknownMenu.length, 3); assert.ok(unknownMenu.every(item => Object.values(item.categories).every(value => value === 'unknown')))
  await page.getByRole('button', { name: /^1\. 本日確認/ }).click()
  await page.locator('[data-star-list="sidebar"]').waitFor({ state: 'visible' })
  await page.getByRole('alert').filter({ hasText: '人数を取得できませんでした' }).waitFor()
  const unknownSidebar = await readRoster('sidebar')
  assert.equal(unknownSidebar.length, 3); assert.ok(unknownSidebar.every(item => Object.values(item.categories).every(value => value === 'unknown')))
  await page.screenshot({ path: out + '/counts-unavailable.png' })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ok: true, customers: 124, categories: total, checks: ['本番counterを使う架空APIと独立期待値の一致', '入口と左名簿の4分類人数一致', 'C本指名を含む・地域なし場内は県外', '切れたとその他は別枠・⭐️なし除外', '0名と未取得を区別', '初期全閉・開閉と表示対象に関係なく⭐️全員の内訳', '2列内訳・11px以上・320/390/768/1440px'], output: out }))
} finally { await browser.close() }
