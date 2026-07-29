import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCustomerVisitPatterns,
  formatPatternWeekdays,
  getEarlyTimeSort,
} from './customerVisitPattern'

test('予定を除外し、直近10件だけを集計する', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: index,
    customer_id: 'c1',
    visit_date: `2026-07-${String(index + 1).padStart(2, '0')}`,
    visit_time: '23:00',
    is_planned: false,
  }))
  rows.push({
    id: 99,
    customer_id: 'c1',
    visit_date: '2026-07-30',
    visit_time: '20:00',
    is_planned: true,
  })

  const pattern = buildCustomerVisitPatterns(rows).c1
  assert.equal(pattern.sampleVisitCount, 10)
  assert.equal(pattern.earlyHour, 23)
  assert.equal(pattern.earlyHourCount, 10)
})

test('20時台の実績は、23時台の頻度が多くても優先表示する', () => {
  const pattern = buildCustomerVisitPatterns([
    { customer_id: 'c1', visit_date: '2026-07-01', visit_time: '20:10' },
    { customer_id: 'c1', visit_date: '2026-07-02', visit_time: '23:10' },
    { customer_id: 'c1', visit_date: '2026-07-03', visit_time: '23:20' },
  ]).c1

  assert.equal(pattern.earlyHour, 20)
  assert.equal(pattern.earlyHourCount, 1)
  assert.equal(pattern.usualHour, 23)
  assert.equal(pattern.usualHourCount, 2)
  assert.equal(getEarlyTimeSort(pattern), 0)
})

test('早い時間の優先順は20→21→22→23→0時台', () => {
  const patterns = buildCustomerVisitPatterns([
    { customer_id: 'c20', visit_date: '2026-07-01', visit_time: '20:00' },
    { customer_id: 'c21', visit_date: '2026-07-01', visit_time: '21:00' },
    { customer_id: 'c22', visit_date: '2026-07-01', visit_time: '22:00' },
    { customer_id: 'c23', visit_date: '2026-07-01', visit_time: '23:00' },
    { customer_id: 'c0', visit_date: '2026-07-01', visit_time: '00:30' },
  ])

  assert.deepEqual(
    ['c20', 'c21', 'c22', 'c23', 'c0'].map(id => getEarlyTimeSort(patterns[id])),
    [0, 1, 2, 3, 4],
  )
})

test('曜日は件数、最新日、曜日番号の順で最大2つ', () => {
  const pattern = buildCustomerVisitPatterns([
    { customer_id: 'c1', visit_date: '2026-07-03', visit_time: null }, // 金
    { customer_id: 'c1', visit_date: '2026-07-10', visit_time: null }, // 金
    { customer_id: 'c1', visit_date: '2026-07-04', visit_time: null }, // 土
    { customer_id: 'c1', visit_date: '2026-07-11', visit_time: null }, // 土
    { customer_id: 'c1', visit_date: '2026-07-05', visit_time: null }, // 日
  ]).c1

  assert.deepEqual(pattern.weekdayCodes, [6, 5])
  assert.equal(formatPatternWeekdays(pattern.weekdayCodes), '土・金曜日')
})

test('1〜2回のデータでも集計でき、時刻なしも来店回数に含む', () => {
  const pattern = buildCustomerVisitPatterns([
    { customer_id: 'c1', visit_date: '2026-07-03', visit_time: null },
    { customer_id: 'c1', visit_date: '2026-07-04', visit_time: '' },
  ]).c1

  assert.equal(pattern.sampleVisitCount, 2)
  assert.equal(pattern.earlyHour, null)
  assert.equal(pattern.usualHour, null)
  // 同数なら、より最近の来店曜日を先にする。
  assert.deepEqual(pattern.weekdayCodes, [6, 5])
})
