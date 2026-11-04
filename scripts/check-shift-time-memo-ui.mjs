// 架空データ専用。実シフト画面の時間メモ、保存、Undo/Redoをブラウザで確認する。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.ECLAT_PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:' + (process.env.ECLAT_SHIFT_PREVIEW_PORT || 6117)
const out = process.env.ECLAT_SHIFT_QA_DIR || '.test-dist/v152-shift-ui'
fs.mkdirSync(out, { recursive: true })
const castId = '11111111-1111-4111-8111-111111111111'
const times = ['20:00', '20:30', '21:00', '21:30', '22:00', '22:30']
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  const cell = day => page.locator(`[data-shift-cell="${castId}:2026-11-${String(day).padStart(2, '0')}"]`)
  const data = async () => (await page.request.get(origin + '/fixture/state')).json()
  const persisted = async day => (await data()).shifts.find(row => row.cast_id === castId && row.shift_date === `2026-11-${String(day).padStart(2, '0')}`)
  const waitTime = async (day, time) => page.waitForFunction(({ key, time }) => (document.querySelector(`[data-shift-cell="${key}"]`)?.getAttribute('data-shift-time') || null) === time, { key: `${castId}:2026-11-${String(day).padStart(2, '0')}`, time })
  const save = async () => {
    const button = page.getByRole('button', { name: /^保存（/ })
    await button.click(); await button.waitFor({ state: 'hidden' })
  }
  const ready = async () => {
    await cell(1).waitFor()
    await page.getByRole('button', { name: '時間メモ', exact: true }).waitFor()
    await page.waitForFunction(() => !document.querySelector('[data-shift-cell]')?.getAttribute('aria-disabled') || document.querySelector('[data-shift-cell]')?.getAttribute('aria-disabled') === 'false')
  }
  const visibleTimeMode = async () => page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find(element => element.textContent.trim() === '時間メモ')
    return button?.getAttribute('aria-pressed') === 'true' && getComputedStyle(button).backgroundColor === button.style.backgroundColor
  })
  await page.request.post(origin + '/fixture/reset')
  await page.goto(origin + '/admin/shifts'); await ready()
  const originalWorkDays = await cell(1).evaluate(element => element.closest('tr').lastElementChild.textContent)
  await page.getByRole('button', { name: '時間メモ', exact: true }).click()
  const choice = page.getByLabel('希望出勤の時間メモ')
  assert.deepEqual((await choice.locator('option').allTextContents()).filter(text => times.includes(text)), times)
  await choice.selectOption('20:30'); await cell(1).click(); await waitTime(1, '20:30')
  assert.equal(await cell(1).evaluate(element => element.closest('tr').lastElementChild.textContent), originalWorkDays, '時間メモで出勤日数を変えない')
  await cell(4).click(); await waitTime(4, null)
  assert.equal((await persisted(4)).status, '休み', '時間モードで休みを出勤に変えない')
  await page.getByTitle('元に戻す (Ctrl+Z)').click(); await waitTime(1, null)
  await page.getByTitle('やり直す (Ctrl+Shift+Z)').click(); await waitTime(1, '20:30')
  await save()
  assert.equal((await persisted(1)).memo, '希望出勤時間: 20:30\n衣装確認')
  await page.reload(); await ready(); await waitTime(1, '20:30')

  // 候補の全時刻が入力でき、既存の自由メモを失わない。
  await page.getByRole('button', { name: '時間メモ', exact: true }).click()
  for (const time of times) { await choice.selectOption(time); await cell(2).click(); await waitTime(2, time) }
  await save()
  assert.equal((await persisted(2)).memo, '希望出勤時間: 22:30\n別のメモを保持')
  await choice.selectOption('clear'); await cell(2).click(); await waitTime(2, null); await save()
  assert.equal((await persisted(2)).memo, '別のメモを保持', '時間だけ消して他のメモを残す')

  // 既存の状態ペイントで希望出勤を確定しても時間を消さない。
  await page.getByRole('button', { name: '出勤', exact: true }).click()
  await cell(1).click(); await save()
  assert.equal((await persisted(1)).status, '出勤'); assert.equal((await persisted(1)).memo, '希望出勤時間: 20:30\n衣装確認')
  const statusOnlyWrite = (await data()).writes.filter(query => query.operation === 'upsert').at(-1)
  assert.ok(statusOnlyWrite.rows.every(row => !Object.hasOwn(row, 'memo')), '状態だけの保存は最新のメモを上書きしない')

  // 来店予定を開く操作はセルを塗り替えない。
  await page.getByRole('button', { name: '時間メモ', exact: true }).click(); await choice.selectOption('21:30')
  await cell(5).locator('span[title]').click()
  await page.getByText('架空来店予定 様', { exact: true }).waitFor()
  assert.equal((await persisted(5)).memo, '')
  assert.equal(await cell(5).getAttribute('data-shift-time'), null)
  await page.getByRole('button', { name: '✕', exact: true }).click()

  // 保存失敗は成功扱いにせず、下書き・再保存導線を維持する。
  await cell(5).click(); await waitTime(5, '21:30')
  await page.request.post(origin + '/fixture/control', { data: { writeFailure: true } })
  await page.getByRole('button', { name: /^保存（/ }).click()
  await page.getByText(/保存に失敗しました/).waitFor()
  assert.equal((await persisted(5)).memo, ''); await waitTime(5, '21:30')
  assert.equal(await page.getByRole('button', { name: /^保存（/ }).isEnabled(), true)
  await page.request.post(origin + '/fixture/control', { data: { writeFailure: false } }); await save()
  assert.equal((await persisted(5)).memo, '希望出勤時間: 21:30')
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await visibleTimeMode()
  await page.screenshot({ path: out + '/desktop.png', fullPage: false })

  // 他端末で確定済みに変わった場合、時間だけの保存で出勤希望へ戻さない。
  await choice.selectOption('22:00'); await cell(2).click(); await waitTime(2, '22:00')
  await page.request.post(origin + '/fixture/concurrent-shift', { data: { castId, date: '2026-11-02', status: '出勤' } })
  await save()
  assert.equal((await persisted(2)).status, '出勤'); assert.equal((await persisted(2)).memo, '希望出勤時間: 22:00\n別のメモを保持')

  // 他端末のメモ更新は競合として保護し、古い下書きで上書きしない。
  await choice.selectOption('22:30'); await cell(5).click(); await waitTime(5, '22:30')
  await page.request.post(origin + '/fixture/concurrent-shift', { data: { castId, date: '2026-11-05', memo: '他端末で追記されたメモ' } })
  await page.getByRole('button', { name: /^保存（/ }).click()
  await page.getByText(/ほかの画面でメモが変更/).waitFor()
  assert.equal((await persisted(5)).memo, '他端末で追記されたメモ'); await waitTime(5, '22:30')

  // 実機幅ではグリッドだけ横スクロールし、操作部は画面内に収まる。
  await page.request.post(origin + '/fixture/reset')
  await page.setViewportSize({ width: 390, height: 900 }); await page.reload(); await ready()
  await page.getByRole('button', { name: '時間メモ', exact: true }).click()
  await choice.selectOption('20:30'); await cell(1).click(); await waitTime(1, '20:30'); await save()
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390)
  const choiceBox = await choice.boundingBox()
  assert.ok(choiceBox && choiceBox.x >= 0 && choiceBox.x + choiceBox.width <= 391)
  await visibleTimeMode()
  await page.screenshot({ path: out + '/mobile.png', fullPage: false })

  // 新しく作る希望出勤日も同じ下書き内で時間を設定できる。
  await page.getByRole('button', { name: '希望出勤', exact: true }).click(); await cell(6).click()
  await page.getByRole('button', { name: '時間メモ', exact: true }).click(); await choice.selectOption('22:30'); await cell(6).click(); await waitTime(6, '22:30'); await save()
  assert.equal((await persisted(6)).memo, '希望出勤時間: 22:30')
  assert.ok((await data()).writes.some(query => query.operation === 'insert' && query.rows.some(row => row.shift_date === '2026-11-06')))
  await page.getByRole('button', { name: '希望出勤', exact: true }).click(); await cell(7).click()
  await page.getByRole('button', { name: '時間メモ', exact: true }).click(); await choice.selectOption('20:00'); await cell(7).click(); await waitTime(7, '20:00')
  await page.request.post(origin + '/fixture/concurrent-shift', { data: { castId, date: '2026-11-07', create: true, status: '出勤', memo: '他端末の新規シフト' } })
  await page.getByRole('button', { name: /^保存（/ }).click(); await page.getByText(/ほかの画面でメモが変更/).waitFor()
  assert.equal((await persisted(7)).status, '出勤'); assert.equal((await persisted(7)).memo, '他端末の新規シフト')

  // 月間取得失敗で、未取得のセルへ時刻やシフトを保存しない。
  await page.request.post(origin + '/fixture/control', { data: { readFailure: true } })
  await page.reload()
  await page.getByText(/シフト取得に失敗しました/).waitFor()
  const writesBefore = (await data()).writes.length
  const existing = cell(1)
  if (await existing.count()) {
    assert.equal(await existing.getAttribute('aria-disabled'), 'true')
    await existing.click({ force: true })
  }
  assert.equal((await data()).writes.length, writesBefore)
  assert.equal(await page.getByRole('button', { name: /^保存（/ }).count(), 0)
  await page.request.post(origin + '/fixture/control', { data: { readFailure: false } })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ok: true, times, checks: ['希望出勤だけに時間を設定', '6候補の表示と入力', '出勤日数不変', 'Undo/Redo', '保存後の再読込', '状態変更でメモ保持', '時間解除で自由メモ保持', '来店予定操作の非干渉', '保存失敗と再保存', '別端末の状態変更を戻さない', '別端末のメモ競合保護', '390pxの操作部と横スクロール', '新規希望出勤と時間を同時保存', '別端末で新規作成された行を保護', '取得失敗時の書込防止'], output: out }))
} finally { await browser.close() }
