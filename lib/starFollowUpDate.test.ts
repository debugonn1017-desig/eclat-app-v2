import assert from 'node:assert/strict'
import test from 'node:test'
import { starFollowUpDate, starFollowUpDateSource } from './starFollowUpDate'

const customer = { nomination_status: '場内', first_visit_date: '2026-11-10', is_starred: true }
test('初回来店日だけの場内顧客が翌日の追いかけ基準を持ち、元の実績データは変わらない', () => {
  const source = { ...customer, metric_last_visit_date: null, metric_visit_count: 0, metric_total_spent: 0 }
  const snapshot = { ...source }
  assert.equal(starFollowUpDate(source, null, '2026-11-11'), '2026-11-10')
  assert.equal(starFollowUpDateSource(source, null, '2026-11-11'), 'first_visit')
  assert.deepEqual(source, snapshot)
})
test('実来店ができたら初回来店日の補完をやめ、実来店を優先する', () => {
  for (const date of ['2026-11-05', '2026-11-10', '2026-11-11']) {
    assert.equal(starFollowUpDate(customer, date, '2026-11-11'), date)
    assert.equal(starFollowUpDateSource(customer, date, '2026-11-11'), 'visit')
  }
})
test('本指名・フリー・切れた・⭐️なしを初回来店日から勝手に場内扱いにしない', () => {
  for (const patch of [{ nomination_status: '本指名' }, { nomination_status: 'フリー' }, { nomination_status: null }, { customer_rank: '切れた' }, { is_starred: false }]) {
    assert.equal(starFollowUpDate({ ...customer, ...patch }, null, '2026-11-11'), null)
    assert.equal(starFollowUpDateSource({ ...customer, ...patch }, null, '2026-11-11'), null)
  }
})
test('未来・不正日付は補完せず、本日・うるう日は正しい暦日として扱う', () => {
  for (const value of [null, '', '2026-11-12', '2026-02-29', '2026-11-31', '2026-1-1', 'bad', '1999-12-31']) assert.equal(starFollowUpDate({ ...customer, first_visit_date: value }, null, '2026-11-11'), null)
  assert.equal(starFollowUpDate(customer, null, '2026-11-10'), '2026-11-10')
  assert.equal(starFollowUpDate({ ...customer, first_visit_date: '2024-02-29' }, null, '2024-03-01'), '2024-02-29')
})
test('不正な実績値を初回来店日で隠さず、取得済み実来店日は区分に依存せず保持する', () => {
  assert.equal(starFollowUpDate(customer, 'bad', '2026-11-11'), null)
  assert.equal(starFollowUpDate(customer, '2026-11-12', '2026-11-11'), null)
  assert.equal(starFollowUpDate({ nomination_status: '本指名' }, '2026-11-10', '2026-11-11'), '2026-11-10')
})
