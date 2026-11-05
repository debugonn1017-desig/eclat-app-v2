// 架空データ専用。入口/PC左名簿/人数APIの分類一致と未取得表示を確認する。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ECLAT_PLAYWRIGHT_MODULE || 'playwright')
const port = Number(process.env.ECLAT_GOALS_PREVIEW_PORT || 6116)
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('架空プレビューのポートが不正です')
const origin = `http://127.0.0.1:${port}`
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
  let longNames = false
  page.on('pageerror', error => errors.push(error.message))
  // ⭐️0名のキャストでも全顧客の売上を表示する。人数・目標には非星顧客を混ぜない。
  await page.route('**/api/customers/cast-options', async route => {
    const response = await route.fetch(), data = await response.json()
    if (!data.casts.some(cast => cast.cast_name === 'ゆい')) data.casts.push({ id: '44444444-4444-4444-8444-444444444444', cast_name: 'ゆい', display_name: 'ゆい', cast_tier: 'BB', is_active: true })
    if (longNames) for (const cast of data.casts) cast.display_name = `${cast.cast_name}・長い名前の表示確認`
    await route.fulfill({ response, json: data })
  })
  await page.request.get(origin + '/fixture/reset?staff=1')
  await page.request.get(origin + '/fixture/roster-monthly-sales-setup')
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
  // 期待値は架空明細を独立に足す。人数のstarred配列・API集計関数は売上期待値に使わない。
  const expectedSales = Object.fromEntries(casts.map(cast => [cast, 0]))
  const customerCasts = new Map(state.customers.map(customer => [String(customer.id), customer.cast_name]))
  const inCurrentMonth = date => date >= '2026-11-01' && date < '2026-12-01' && date <= '2026-11-03'
  for (const visit of state.rosterSalesVisits) if (customerCasts.has(String(visit.customer_id)) && visit.is_planned !== true && inCurrentMonth(visit.visit_date)) expectedSales[customerCasts.get(String(visit.customer_id))] += Number(visit.amount_spent ?? 0)
  const castNames = new Map(state.rosterSalesCasts.map(cast => [cast.id, cast.cast_name]))
  for (const sale of state.rosterExtensionSales) if (castNames.has(sale.cast_id) && inCurrentMonth(sale.sale_date)) expectedSales[castNames.get(sale.cast_id)] += Number(sale.amount_spent ?? 0)
  assert.deepEqual(expectedSales, { 'あかり': 3855000, 'りな': 15785000, 'ゆい': 93000 })
  assert.deepEqual(counts.monthlySales, { month: '2026-11', total: Object.values(expectedSales).reduce((sum, amount) => sum + amount, 0), byCast: expectedSales })
  assert.equal(counts.monthlySales.byCast['ゆい'], 93000, '⭐️0名でも非星の実来店と場内延長を表示する')
  assert.equal(state.customers.find(customer => customer.cast_name === 'ゆい').is_starred, false)
  const waitRoster = async scope => page.waitForFunction(({ scope, count }) => {
    const buttons = [...(document.querySelector(`[data-star-list="${scope}"]`)?.querySelectorAll('[data-star-cast]') || [])]
    return buttons.length === count && buttons.every(button => button.querySelectorAll('[data-star-primary="true"]').length === 4 && [...button.querySelectorAll('[data-star-category]')].every(field => field.dataset.count !== 'unknown'))
  }, { scope, count: casts.length })
  const readRoster = scope => page.locator(`[data-star-list="${scope}"] [data-star-cast]`).evaluateAll(buttons => buttons.map(button => {
    const rect = element => {
      if (!element) return null
      const box = element.getBoundingClientRect(), style = getComputedStyle(element)
      return { x:box.x, y:box.y, right:box.right, width:box.width, height:box.height, font:parseFloat(style.fontSize) }
    }
    const buttonStyle = getComputedStyle(button), name = button.querySelector('[data-star-name]'), block = button.querySelector('[data-star-count-block]'), sales = button.querySelector('[data-star-month-sales]')
    const fields = [...button.querySelectorAll('[data-star-category]')].map(field => ({
      label: field.dataset.starCategory, primary: field.dataset.starPrimary === 'true', ...rect(field),
      labelBox: rect(field.firstElementChild), valueBox: rect(field.lastElementChild), gap: field.lastElementChild.getBoundingClientRect().x - field.firstElementChild.getBoundingClientRect().right,
    }))
    return { cast: button.dataset.starCast, categories: Object.fromEntries([...button.querySelectorAll('[data-star-category]')].map(field => [field.dataset.starCategory, field.dataset.count === 'unknown' ? 'unknown' : Number(field.dataset.count)])),
      fields, primary:fields.filter(field => field.primary), button:rect(button), name:rect(name), block:block ? {...rect(block),text:block.textContent} : null,
      sales:sales ? {...rect(sales),month:sales.dataset.month,value:sales.dataset.sales,text:sales.textContent} : null,
      contentLeft:button.getBoundingClientRect().x + parseFloat(buttonStyle.borderLeftWidth) + parseFloat(buttonStyle.paddingLeft), contentRight:button.getBoundingClientRect().right - parseFloat(buttonStyle.borderRightWidth) - parseFloat(buttonStyle.paddingRight),
      targets:name ? [...name.parentElement.children].filter(element => element !== name && /^対象/.test(element.textContent || '')).map(rect) : [],
    }
  }))
  const assertGeometry = (item, long = false) => {
    assert.ok(item.name && item.block, `Missing name/count block: ${item.cast}`)
    assert.ok(Math.abs(item.name.x-item.contentLeft) <= 2, `Name must start at the left: ${JSON.stringify(item)}`)
    assert.ok(item.name.right <= item.block.x - 2, `Name/count overlap: ${JSON.stringify(item)}`)
    assert.ok(Math.abs(item.contentRight-item.block.right) <= 2, `Count block must align right: ${JSON.stringify(item)}`)
    assert.ok(item.block.width <= 220 && item.block.x+item.block.width/2 > item.button.x+item.button.width/2, `Count block is not compact on the right: ${JSON.stringify(item)}`)
    assert.ok(item.name.font >= 11)
    assert.ok(item.sales && item.sales.font >= 11 && item.sales.font <= 12, `Missing compact monthly sales: ${JSON.stringify(item)}`)
    assert.ok(item.sales.x >= item.contentLeft - 1 && item.sales.right <= item.contentRight + 1, `Sales overflow: ${JSON.stringify(item)}`)
    if (long) assert.ok(item.name.width >= 44, `Long name is squeezed: ${JSON.stringify(item)}`)
    for (const target of item.targets) assert.ok(target.right <= item.block.x - 2, `Target count overlaps right block: ${JSON.stringify(item)}`)
    for (const field of item.fields) {
      assert.ok(field.labelBox.font >= 11 && field.valueBox.font >= 11)
      assert.ok(field.gap >= 3 && field.gap <= 8.5, `Label/value gap must stay close: ${JSON.stringify(field)}`)
      assert.ok(field.right <= item.block.right + 1 && field.valueBox.right <= item.block.right + 1)
    }
    assert.deepEqual(item.primary.map(field => field.label), primary)
    assert.equal(item.primary[0].y, item.primary[1].y); assert.equal(item.primary[2].y, item.primary[3].y)
    assert.ok(item.primary[2].y > item.primary[0].y)
  }
  const assertRoster = async (scope, expected = byCast, long = false, sales = expectedSales) => {
    const roster = await readRoster(scope)
    assert.deepEqual(roster.map(item => item.cast), casts)
    for (const item of roster) {
      assert.deepEqual(item.categories, Object.fromEntries(categories.filter((category, index) => index < 4 || expected[item.cast][category] > 0).map(category => [category, expected[item.cast][category]])))
      assertGeometry(item, long)
      assert.equal(item.sales.month, '2026-11'); assert.equal(item.sales.value, String(sales[item.cast]))
      assert.match(item.sales.text, /11月売上/); assert.ok(item.sales.text.includes(sales[item.cast].toLocaleString('ja-JP')))
      assert.match(item.block.text, new RegExp(`⭐️?\\s*${Object.values(expected[item.cast]).reduce((sum,value)=>sum+value,0)}名`))
    }
    return roster.map(({ cast, categories }) => ({ cast, categories }))
  }
  await page.goto(origin + '/?staff=1'); await waitRoster('menu')
  const menu = await assertRoster('menu')
  await page.screenshot({ path: out + '/menu-desktop.png' })
  console.log(JSON.stringify({ geometry:'menu', width:1440, image:out+'/menu-desktop.png' }))
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
  const starredGoalSales = starred.reduce((sum, customer) => sum + (customer.cast_name === 'りな' ? 250000 : customer.id === '1' ? 120000 : 60000), 0)
  assert.ok(monthlyTotals.includes('¥' + starredGoalSales.toLocaleString('ja-JP')), '顧客別目標実績の合計は⭐️限定を維持する')
  assert.notEqual(starredGoalSales, counts.monthlySales.total, '名簿の全顧客売上と⭐️目標実績は別集計')
  await page.screenshot({ path: out + '/sidebar-desktop.png' })
  console.log(JSON.stringify({ geometry:'sidebar', width:1440, image:out+'/sidebar-desktop.png' }))
  await page.locator('[data-category-toggle="県外場内"]').click()
  assert.equal(await page.locator('[data-customer-ledger]:visible').count(), 31)
  assert.deepEqual(await assertRoster('sidebar'), menu)
  assert.equal(await page.getByLabel('表示対象の月別合計').textContent(), monthlyTotals)
  await page.getByLabel('目標の対象月').fill('2026-12')
  await page.waitForFunction(() => document.querySelector('[aria-label="表示対象の月別合計"] strong')?.textContent?.startsWith('¥0 '))
  assert.deepEqual(await assertRoster('sidebar'), menu, '個人側の対象月を変えても名簿の当月売上は変えない')
  await page.getByLabel('目標の対象月').fill('2026-11')
  await page.getByRole('group', { name: '⭐️の表示対象' }).getByRole('button', { name: '場内・対象日', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-customer-ledger]').length === 61)
  await waitRoster('sidebar'); assert.deepEqual(await assertRoster('sidebar'), menu)
  const banai = await (await page.request.get(origin + '/api/customers/star-counts?starredView=banai')).json()
  assert.equal(banai.matched.total.total, 61); assert.equal(banai.matched.total.categories['切れたお客様'], 2)
  assert.deepEqual(banai.total.categories, total)
  assert.deepEqual(banai.monthlySales, counts.monthlySales, '本日確認の絞り込みは当月売上を変えない')
  for (const query of ['starredView=all&castName=ゆい', 'starredView=all&keyword=重点', 'starredView=all&starCheck=unchecked', 'starredView=banai&starredVisitDate=2026-11-02']) {
    const filtered = await (await page.request.get(origin + '/api/customers/star-counts?' + query)).json()
    assert.deepEqual(filtered.monthlySales, counts.monthlySales, `絞り込みと独立した当月売上: ${query}`)
  }
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(origin + '/?staff=1'); await waitRoster('menu')
    assert.deepEqual(await assertRoster('menu'), menu)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width)
    if (width === 390) await page.screenshot({ path: out + '/menu-mobile.png' })
    await page.getByRole('button', { name: /^1\. 本日確認/ }).click()
    await page.getByRole('group', { name:'⭐️の表示対象' }).getByRole('button', { name:'⭐️全員', exact:true }).click()
    await page.waitForFunction(() => document.querySelectorAll('[data-customer-ledger]').length === 124)
    await waitRoster('sidebar')
    if (width >= 768) assert.deepEqual(await assertRoster('sidebar'), menu)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `main overflow at ${width}`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.route('**/api/customers/star-counts**', route => route.fulfill({ status: 503, json: { error: '架空の人数取得失敗' } }))
  await page.goto(origin + '/?staff=1')
  await page.getByRole('alert').filter({ hasText: '人数・当月売上を取得できませんでした' }).waitFor()
  const unknownMenu = await readRoster('menu')
  assert.equal(unknownMenu.length, 3); assert.ok(unknownMenu.every(item => Object.values(item.categories).every(value => value === 'unknown')))
  unknownMenu.forEach(item => assertGeometry(item))
  assert.ok(unknownMenu.every(item => item.sales.value === 'unknown' && !item.sales.text.includes('¥0')))
  await page.getByRole('button', { name: /^1\. 本日確認/ }).click()
  await page.locator('[data-star-list="sidebar"]').waitFor({ state: 'visible' })
  await page.getByRole('alert').filter({ hasText: '人数・当月売上を取得できませんでした' }).waitFor()
  const unknownSidebar = await readRoster('sidebar')
  assert.equal(unknownSidebar.length, 3); assert.ok(unknownSidebar.every(item => Object.values(item.categories).every(value => value === 'unknown')))
  unknownSidebar.forEach(item => assertGeometry(item))
  assert.ok(unknownSidebar.every(item => item.sales.value === 'unknown'))
  await page.screenshot({ path: out + '/counts-unavailable.png' })

  // 正確性の検証とは分け、顧客を水増しせず人数APIだけで長名/4桁の配置を確認する。
  await page.unroute('**/api/customers/star-counts**')
  longNames = true
  const largeByCast = Object.fromEntries(casts.map((cast, castIndex) => [cast, Object.fromEntries(categories.map((category, index) => [category, 1234 + index * 1111 + castIndex]))]))
  const countOf = values => ({ total:Object.values(values).reduce((sum, value) => sum + value, 0), honshimei:values['県内顧客'] + values['県外顧客'], banai:values['県内場内'] + values['県外場内'], categories:values })
  const sumCounts = values => countOf(Object.fromEntries(categories.map(category => [category, values.reduce((sum, value) => sum + value.categories[category], 0)])))
  const largeCounts = Object.fromEntries(casts.map(cast => [cast, countOf(largeByCast[cast])]))
  const largeSales = Object.fromEntries(casts.map((cast, index) => [cast, 1234567890 + index]))
  const targetCounts = Object.fromEntries(casts.map(cast => [cast, countOf(Object.fromEntries(categories.map((category, index) => [category, [1000,1000,1000,1000,123,198][index]])))]))
  await page.route('**/api/customers/star-counts**', async route => {
    const response = await route.fetch(), data = await response.json()
    await route.fulfill({ response, json:{ ...data, monthlySales:{ month:'2026-11', total:Object.values(largeSales).reduce((sum,value)=>sum+value,0), byCast:largeSales }, total:sumCounts(Object.values(largeCounts)), byCast:largeCounts, matched:{ total:sumCounts(Object.values(targetCounts)), byCast:targetCounts } } })
  })
  const geometry = []
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height:1000 }); await page.goto(origin + '/?staff=1'); await waitRoster('menu')
    await page.screenshot({ path:out + `/long-name-four-digit-menu-${width}.png` })
    await assertRoster('menu', largeByCast, true, largeSales)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `long-name menu overflow at ${width}`)
    const menuGeometry = await readRoster('menu')
    geometry.push({ scope:'menu', width, minNameWidth:Math.min(...menuGeometry.map(item => item.name.width)), maxGap:Math.max(...menuGeometry.flatMap(item => item.fields.map(field => field.gap))) })
    if (width >= 768) {
      await page.getByRole('button', { name:/^1\. 本日確認/ }).click()
      await waitRoster('sidebar')
      await page.screenshot({ path:out + `/long-name-four-digit-sidebar-${width}.png` })
      console.log(JSON.stringify({ geometry:'long-name-sidebar', width, image:out+`/long-name-four-digit-sidebar-${width}.png` }))
      await assertRoster('sidebar', largeByCast, true, largeSales)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `long-name sidebar overflow at ${width}`)
      const sidebarGeometry = await readRoster('sidebar')
      assert.ok(sidebarGeometry.every(item => item.targets.length === 1), 'Four-digit target counts must remain visible next to names')
      geometry.push({ scope:'sidebar', width, minNameWidth:Math.min(...sidebarGeometry.map(item => item.name.width)), maxGap:Math.max(...sidebarGeometry.flatMap(item => item.fields.map(field => field.gap))) })
    }
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ok: true, customers: 124, categories: total, monthlySales: expectedSales, checks: ['本番counterを使う人数と独立期待値の一致', '入口と左名簿の4分類人数・当月売上一致', '非星を含む実来店と場内延長の当月合計', '⭐️0名のキャストも非星売上を表示', '月選択・表示条件と独立した当月売上', '顧客別目標実績は⭐️限定を維持', '予定・未来日・前月翌月・結合先なしを売上から除外', 'C本指名を含む・地域なし場内は県外', '切れたとその他は別枠・人数は⭐️なし除外', '0名と未取得を区別・取得エラーを0円にしない', '初期全閉・開閉と表示対象に関係なく⭐️全員の内訳', '2列内訳・11px以上・320/390/768/1440px', '名前左・人数右端揃え・主分類/その他ともlabelと値が近接', '長いキャスト名・4桁人数・対象人数と右ブロックの重なりなし'], geometry, output: out }))
} finally { await browser.close() }
