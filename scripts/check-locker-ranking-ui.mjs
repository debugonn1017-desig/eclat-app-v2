// 実UI＋実compiled globals。認証/APIはpreviewの架空データのみ。
// ECLAT_PLAYWRIGHT_MODULE=/absolute/path/to/playwright node scripts/check-locker-ranking-ui.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ECLAT_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.ECLAT_LOCKER_PREVIEW_URL || 'http://127.0.0.1:6120'
const out = process.env.ECLAT_LOCKER_QA_DIR || '/private/tmp/eclat-locker-ranking-qa'
fs.mkdirSync(out, { recursive: true })
const checks = [], measurements = [], pageErrors = []
const runId = Date.now().toString(36)
const scenarioUrl = value => `${origin}/?scenario=${value}&qa=${runId}`
const ok = (label, condition = true) => { assert.ok(condition, label); checks.push(label) }
const waitLoaded = page => page.locator('[data-locker-ranking-table] tbody tr').last().waitFor()
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('request', request => assert.equal(new URL(request.url()).origin, origin, 'Fixture attempted external communication'))
  const profile = await (await page.request.get(origin + '/fixture/profile')).json()
  assert.equal(profile.globals, 'production-compiled')
  await page.goto(origin)
  await waitLoaded(page)
  const ancestor = await page.evaluate(() => ({ html: document.documentElement.className, body: document.body.className, main: document.body.firstElementChild.className, bodyFont: getComputedStyle(document.body).fontFamily, rowFont: getComputedStyle(document.querySelector('[data-locker-ranking-table]')).fontFamily }))
  ok('production html/body/main ancestors and compiled system font', ancestor.html === 'h-full antialiased' && ancestor.body === 'min-h-full flex flex-col' && ancestor.main === 'w-full min-h-screen relative overflow-x-hidden' && ancestor.bodyFont === ancestor.rowFont && !ancestor.bodyFont.includes('Zen'))
  assert.equal(await page.getByLabel('ランキングの対象月').inputValue(), profile.currentMonth)
  ok('default month follows JST business day and displayed period', (await page.locator('#locker-ranking-title').innerText()).includes(`${Number(profile.currentMonth.slice(5))}月`))
  // datetime is yesterday, not selected month. Check independently instead of deriving from UI.
  const yesterday = new Date(profile.businessDate + 'T00:00:00Z'); yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  assert.equal(await page.locator('[data-locker-bowzu] time').getAttribute('datetime'), yesterday.toISOString().slice(0, 10))
  assert.deepEqual(await page.locator('[data-locker-ranking-table] thead th').allTextContents(), ['順位', '名前', '実質売上', '本指名', '場内', '同伴数', '坊主数', '連続坊主'])
  ok('eight specified columns and no tier display', !(await page.locator('[data-locker-ranking-table]').innerText()).includes('ランク'))
  assert.equal(await page.locator('[data-locker-ranking-table] tbody tr').count(), 36)
  const medals = await page.locator('[data-locker-ranking-table] [data-locker-medal]').evaluateAll(elements => elements.map(el => ({ rank: el.dataset.lockerMedal, digit: el.querySelector('text').textContent, label: el.getAttribute('aria-label') })))
  assert.deepEqual(medals.map(item => item.rank), ['1', '2', '3', '4', '5'])
  assert.ok(medals.every(item => item.rank === item.digit && item.label === `第${item.rank}位`))
  const ranks = await page.locator('[data-locker-ranking-table] tbody tr').evaluateAll(elements => elements.map(el => Number(el.dataset.lockerRank)))
  assert.deepEqual(ranks, Array.from({ length: 36 }, (_, index) => index + 1))
  ok('five SVG medals with readable digits and sequential tied/zero-sale ranks')
  assert.equal(await page.locator('[data-locker-bowzu-cast]').count(), 3)
  ok('previous-day cards show consecutive worked-day counts', (await page.locator('[data-locker-bowzu]').innerText()).includes('連続12出勤'))

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const scroll = page.locator('[data-locker-ranking-scroll]')
    await scroll.evaluate(el => { el.scrollLeft = 0 })
    const before = await scroll.evaluate(el => {
      const row = el.querySelector('tbody tr'), box = el.getBoundingClientRect()
      return { x: box.x, width: box.width, rankX: row.cells[0].getBoundingClientRect().x, nameX: row.cells[1].getBoundingClientRect().x, bodyOverflow: document.documentElement.scrollWidth - innerWidth }
    })
    await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth })
    const after = await scroll.evaluate(el => {
      const row = el.querySelector('tbody tr'), box = el.getBoundingClientRect(), last = row.cells[7].getBoundingClientRect()
      return { rankX: row.cells[0].getBoundingClientRect().x, nameX: row.cells[1].getBoundingClientRect().x, lastRight: last.right, right: box.right, lastLeft: last.left, scrollWidth: el.scrollWidth, width: el.clientWidth }
    })
    assert.ok(before.bodyOverflow <= 1, `Body overflow at ${width}: ${before.bodyOverflow}`)
    assert.ok(Math.abs(after.rankX - before.rankX) < 1 && Math.abs(after.nameX - before.nameX) < 1, `Sticky columns moved at ${width}`)
    assert.ok(after.lastRight <= after.right + 1 && after.lastLeft >= after.nameX + 130, `Final column is obscured at ${width}`)
    await scroll.evaluate(el => { el.scrollLeft = 0 })
    const overflow = await page.locator('[data-locker-ranking-table] tbody th,[data-locker-ranking-table] tbody td').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent))
    assert.deepEqual(overflow, [], `Clipped names/numbers at ${width}`)
    const cardOverflow = await page.locator('[data-locker-bowzu-cast]').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent))
    assert.deepEqual(cardOverflow, [], `Bowzu card overflow at ${width}`)
    measurements.push({ width, before, after })
    await page.screenshot({ path: path.join(out, `locker-${width}.png`), fullPage: true })
  }
  ok('320/390/768/1024/1440: sticky names/ranks, reachable last column, long names and large amounts without clipping')

  // Re-fetch failure must retain previous visible data and prevent printing stale results.
  await page.route('**/api/admin/locker-ranking?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '架空の再取得失敗' }) }))
  await page.getByRole('button', { name: '再取得', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.locator('[data-locker-ranking-table] tbody tr').count(), 36)
  assert.ok((await page.getByRole('alert').innerText()).includes('前回取得したデータ'))
  assert.equal(await page.getByRole('button', { name: '印刷', exact: true }).isDisabled(), true)
  ok('failed re-fetch keeps prior data explicit and disables stale printing')
  await page.unroute('**/api/admin/locker-ranking?*')
  await page.getByRole('button', { name: 'もう一度取得', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[role=alert]'))
  ok('retry replaces failure with fresh results')

  await page.goto(scenarioUrl('empty'))
  await page.getByText('対象のキャストがいません。', { exact: true }).waitFor()
  assert.equal(await page.locator('[data-locker-ranking-table]').count(), 0)
  assert.equal(await page.locator('[data-locker-bowzu-cast]').count(), 0)
  assert.ok(await page.getByText('前日坊主の対象者はいません。', { exact: true }).isVisible())
  ok('zero casts and zero prior-day cards display empty states')

  await page.goto(scenarioUrl('error-once'))
  await page.getByRole('alert').waitFor()
  assert.equal(await page.locator('[data-locker-ranking-table]').count(), 0)
  assert.ok(await page.getByRole('button', { name: '印刷', exact: true }).isDisabled())
  await page.getByRole('button', { name: 'もう一度取得', exact: true }).click()
  await waitLoaded(page)
  ok('initial communication failure does not show zero data and retry works')

  await page.goto(scenarioUrl('race'))
  await waitLoaded(page)
  const oldRequest = page.waitForRequest(request => request.url().includes('month=2026-10'))
  await page.getByLabel('ランキングの対象月').fill('2026-10')
  await oldRequest
  await page.getByLabel('ランキングの対象月').fill('2026-09')
  await page.waitForFunction(() => document.querySelector('[data-locker-ranking-table] tbody th')?.textContent.includes('2026-09'))
  // Wait beyond the intentionally delayed older response to verify it cannot replace September.
  await page.waitForTimeout(550)
  assert.equal(await page.getByLabel('ランキングの対象月').inputValue(), '2026-09')
  assert.ok((await page.locator('[data-locker-ranking-table] tbody th').first().innerText()).includes('2026-09'))
  assert.equal(await page.locator('[data-locker-bowzu] time').getAttribute('datetime'), yesterday.toISOString().slice(0, 10))
  ok('rapid month changes ignore delayed older responses and prior-day cards stay current')

  await page.route('**/api/admin/locker-ranking?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ month: '2000-01', rows: [], previousDayBowzu: [] }) }))
  await page.getByLabel('ランキングの対象月').fill('2026-08')
  await page.getByRole('alert').waitFor()
  assert.equal(await page.locator('[data-locker-ranking-table]').count(), 0)
  assert.ok((await page.getByRole('alert').innerText()).includes('対象月を確認できません'))
  ok('mismatched response month is rejected rather than displayed under wrong heading')
  await page.unroute('**/api/admin/locker-ranking?*')

  await page.goto(origin)
  await waitLoaded(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => { window.scrollTo(0, 900); const el = document.querySelector('[data-locker-ranking-scroll]'); el.scrollLeft = el.scrollWidth })
  const saved = await page.evaluate(() => ({ y: scrollY, x: document.querySelector('[data-locker-ranking-scroll]').scrollLeft }))
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(() => { window.print = () => { window.lockerPrintInvoked = true } })
  // print media hides the controls after portal insertion, so invoke the actual control first.
  await page.getByRole('button', { name: '印刷', exact: true }).evaluate(el => el.click())
  await page.waitForFunction(() => window.lockerPrintInvoked && document.body.dataset.lockerRankingPrint === 'true')
  assert.equal(await page.locator('[data-locker-print-table] tbody tr').count(), 36)
  assert.equal(await page.locator('[data-locker-print-report] [data-locker-bowzu-cast]').count(), 3)
  assert.equal(await page.locator('[data-locker-print-report] [data-locker-medal]').count(), 5)
  const printStyle = await page.locator('body').evaluate(el => ({ display: getComputedStyle(el).display, minHeight: getComputedStyle(el).minHeight, htmlMinHeight: getComputedStyle(document.documentElement).minHeight, reportPage: getComputedStyle(document.querySelector('[data-locker-print-report]')).page }))
  assert.deepEqual(printStyle, { display: 'block', minHeight: '0px', htmlMinHeight: '0px', reportPage: 'locker-ranking' })
  const pdfPath = path.join(out, 'locker-ranking-a4-landscape.pdf')
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true })
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  const size = info.match(/Page size:\s+([\d.]+) x ([\d.]+)/)
  assert.ok(size && Math.abs(Number(size[1]) - 841.89) < 1 && Math.abs(Number(size[2]) - 595.28) < 1, info)
  const pages = JSON.parse(execFileSync(process.env.ECLAT_PYTHON || 'python3', ['-c', 'import json,sys; from pypdf import PdfReader; print(json.dumps([page.extract_text() for page in PdfReader(sys.argv[1]).pages]))', pdfPath], { encoding: 'utf8' }))
  assert.ok(pages.every(text => text.trim()), 'Blank PDF page')
  // Chrome/macOSの日本語CMapは「長」を同じ字形のCJK radical U+2ED1で抽出する。
  const printed = pages.join('').normalize('NFKC').replace(/\u2ed1/g, '長').replace(/\s/g, '')
  for (let i = 2; i <= 36; i++) if (i !== 9) assert.ok(printed.includes(`架空キャスト${String(i).padStart(2, '0')}`), `Printed row missing: ${i}`)
  assert.ok(printed.includes('長いお名前のキャスト'.repeat(5)) && printed.includes('連続12出勤') && printed.includes('連続2出勤') && printed.includes('連続1出勤'))
  ok('A4 landscape PDF keeps every row/card and has no empty trailing page while other report CSS coexists')
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: 'screen' })
  await page.waitForFunction(() => !document.body.dataset.lockerRankingPrint && !document.querySelector('[data-locker-print-report]'))
  await page.waitForTimeout(150)
  const restored = await page.evaluate(() => ({ y: scrollY, x: document.querySelector('[data-locker-ranking-scroll]').scrollLeft, display: getComputedStyle(document.body).display }))
  assert.equal(restored.display, 'flex')
  assert.ok(Math.abs(restored.y - saved.y) < 2 && Math.abs(restored.x - saved.x) < 2, JSON.stringify({ saved, restored }))
  ok('afterprint removes portal/flag and restores vertical/horizontal scroll and normal body styles')

  await page.evaluate(() => { window.print = () => { throw Error('架空の印刷例外') } })
  await page.getByRole('button', { name: '印刷', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.locator('[data-locker-print-report]').count(), 0)
  assert.equal(await page.locator('body').getAttribute('data-locker-ranking-print'), null)
  assert.ok(await page.getByRole('button', { name: '印刷', exact: true }).isEnabled())
  ok('print exceptions also clean up portal and permit retry')
  assert.deepEqual(pageErrors, [])
  const result = { ok: true, checks, measurements, ancestor, printStyle, pages: pages.length, output: out }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally { await browser.close() }
