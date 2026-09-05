import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCastIssueMonthly,
  sortCastIssueMonthlyRows,
  type CastIssueMonthlyRow,
} from './castIssueMonthly'

test('月間一覧は売上・本指名・場内・フリー配席・ボウズ・出勤を同じ月で集計する', () => {
  const result = buildCastIssueMonthly({
    casts: [{
      id: 'cast-1', cast_name: 'りほ', display_name: null, cast_tier: 'A層', created_at: '2026-01-01',
      target_sales: 100_000, target_work_days: 5,
    }],
    customers: [
      { id: 'customer-1', cast_name: 'りほ', nomination_status: '本指名', region: '福岡県' },
      { id: 'customer-2', cast_name: 'りほ', nomination_status: '場内', region: '福岡県' },
    ],
    visits: [
      { id: 1, customer_id: 'customer-1', visit_date: '2026-09-02', amount_spent: 30_000, nomination_status_at_visit: '本指名', is_planned: false },
      { id: 2, customer_id: 'customer-1', visit_date: '2026-09-03', amount_spent: 0, nomination_status_at_visit: '本指名', is_planned: false },
      { id: 3, customer_id: 'customer-2', visit_date: '2026-09-04', amount_spent: 20_000, nomination_status_at_visit: '場内', is_planned: true },
    ],
    nominationHistory: [
      { cast_id: 'cast-1', changed_at: '2026-09-03T16:00:00.000Z', new_status: '場内' },
    ],
    extensionSales: [
      { cast_id: 'cast-1', sale_date: '2026-09-03', amount_spent: 5_000 },
    ],
    freeSeatings: [
      { cast_id: 'cast-1', business_date: '2026-09-02', seating_count: 2 },
      { cast_id: 'cast-1', business_date: '2026-09-03', seating_count: 3 },
    ],
    shifts: [
      { cast_id: 'cast-1', shift_date: '2026-09-01', status: '出勤' },
      { cast_id: 'cast-1', shift_date: '2026-09-02', status: '出勤' },
      { cast_id: 'cast-1', shift_date: '2026-09-03', status: '来客出勤' },
      { cast_id: 'cast-1', shift_date: '2026-09-04', status: '休み' },
    ],
    periodStart: '2026-09-01',
    periodEnd: '2026-09-04',
    rollingPeriodStart: '2026-08-09',
    rollingPeriodEnd: '2026-09-05',
    today: '2026-09-05',
  })

  assert.equal(result.rows.length, 1)
  assert.deepEqual(result.rows[0], {
    cast_id: 'cast-1',
    cast_name: 'りほ',
    cast_tier: 'A層',
    created_at: '2026-01-01',
    rolling_fukuoka_honshimei_customer_count: 1,
    sales: 35_000,
    target_sales: 100_000,
    achievement_rate: 35,
    honshimei_count: 2,
    banai_count: 1,
    free_seating_count: 5,
    bowzu_days: 1,
    bowzu_work_days: 3,
    current_bowzu_streak: 0,
    work_days: 3,
    target_work_days: 5,
    remaining_work_days: 2,
  })
  assert.equal(result.summary.sales, 35_000)
  assert.equal(result.summary.free_seating_count, 5)
})

test('旧来店は現在の本指名で補完し、設定値0では達成率と残り出勤を0にする', () => {
  const result = buildCastIssueMonthly({
    casts: [{
      id: 'cast-1', cast_name: 'かな', display_name: null, cast_tier: null, created_at: '2026-01-01',
      target_sales: 0, target_work_days: 0,
    }],
    customers: [{ id: 'customer-1', cast_name: 'かな', nomination_status: '本指名', region: '福岡県' }],
    visits: [{ customer_id: 'customer-1', visit_date: '2026-08-10', amount_spent: 0, nomination_status_at_visit: null }],
    nominationHistory: [], extensionSales: [], freeSeatings: [], shifts: [],
    periodStart: '2026-08-01', periodEnd: '2026-08-31',
    rollingPeriodStart: '2026-08-09', rollingPeriodEnd: '2026-09-05', today: '2026-09-05',
  })

  assert.equal(result.rows[0].honshimei_count, 1)
  assert.equal(result.rows[0].achievement_rate, 0)
  assert.equal(result.rows[0].remaining_work_days, 0)
})

test('キャスト間の数字を混ぜず、場内獲得日はJSTの月境界で判定する', () => {
  const result = buildCastIssueMonthly({
    casts: [
      {
        id: 'cast-1', cast_name: 'りほ', display_name: null, cast_tier: 'A層', created_at: '2026-01-01',
        target_sales: 100_000, target_work_days: 2,
      },
      {
        id: 'cast-2', cast_name: 'かな', display_name: null, cast_tier: '新人層', created_at: '2026-02-01',
        target_sales: 50_000, target_work_days: 1,
      },
    ],
    customers: [
      { id: 'customer-1', cast_name: 'りほ', nomination_status: '本指名', region: '福岡県' },
      { id: 'customer-2', cast_name: 'かな', nomination_status: '本指名', region: '福岡県' },
    ],
    visits: [
      { id: 1, customer_id: 'customer-1', visit_date: '2026-09-01', amount_spent: 80_000, nomination_status_at_visit: '本指名' },
      { id: 2, customer_id: 'customer-2', visit_date: '2026-09-01', amount_spent: 20_000, nomination_status_at_visit: '本指名' },
    ],
    nominationHistory: [
      // UTCでは8/31だが、JSTでは9/1なので9月に含む。
      { cast_id: 'cast-1', changed_at: '2026-08-31T16:00:00.000Z', new_status: '場内' },
      // UTCでは9/30だが、JSTでは10/1なので9月には含めない。
      { cast_id: 'cast-2', changed_at: '2026-09-30T16:00:00.000Z', new_status: '場内' },
    ],
    extensionSales: [],
    freeSeatings: [
      { cast_id: 'cast-1', business_date: '2026-09-01', seating_count: 4 },
      { cast_id: 'cast-2', business_date: '2026-09-01', seating_count: 1 },
      { cast_id: 'cast-2', business_date: '2026-10-01', seating_count: 99 },
    ],
    shifts: [
      { cast_id: 'cast-1', shift_date: '2026-09-01', status: '出勤' },
      { cast_id: 'cast-2', shift_date: '2026-09-01', status: '出勤' },
    ],
    periodStart: '2026-09-01', periodEnd: '2026-09-30',
    rollingPeriodStart: '2026-09-04', rollingPeriodEnd: '2026-10-01', today: '2026-10-01',
  })

  assert.deepEqual(result.rows.map(row => ({
    cast: row.cast_name,
    sales: row.sales,
    honshimei: row.honshimei_count,
    banai: row.banai_count,
    free: row.free_seating_count,
  })), [
    { cast: 'りほ', sales: 80_000, honshimei: 1, banai: 1, free: 4 },
    { cast: 'かな', sales: 20_000, honshimei: 1, banai: 0, free: 1 },
  ])
  assert.equal(result.summary.sales, 100_000)
  assert.equal(result.summary.target_sales, 150_000)
  assert.equal(result.summary.achievement_rate, 67)
  assert.equal(result.summary.free_seating_count, 5)
})

test('直近4週間の福岡県本指名は来店回数ではなく顧客のユニーク人数で数える', () => {
  const result = buildCastIssueMonthly({
    casts: [{
      id: 'cast-1', cast_name: 'りほ', display_name: null, cast_tier: 'A層', created_at: '2026-01-01',
      target_sales: 0, target_work_days: 0,
    }],
    customers: [
      { id: 'fukuoka-1', cast_name: 'りほ', nomination_status: '本指名', region: '福岡県' },
      { id: 'fukuoka-2', cast_name: 'りほ', nomination_status: '場内', region: ' 福岡県 ' },
      { id: 'outside', cast_name: 'りほ', nomination_status: '本指名', region: '東京都' },
      { id: 'planned', cast_name: 'りほ', nomination_status: '本指名', region: '福岡県' },
      { id: 'before', cast_name: 'りほ', nomination_status: '本指名', region: '福岡県' },
    ],
    visits: [
      { id: 1, customer_id: 'fukuoka-1', visit_date: '2026-08-09', amount_spent: 10_000, nomination_status_at_visit: '本指名' },
      { id: 2, customer_id: 'fukuoka-1', visit_date: '2026-09-05', amount_spent: 20_000, nomination_status_at_visit: '本指名' },
      { id: 3, customer_id: 'fukuoka-2', visit_date: '2026-09-04', amount_spent: 30_000, nomination_status_at_visit: '本指名' },
      { id: 4, customer_id: 'outside', visit_date: '2026-09-04', amount_spent: 40_000, nomination_status_at_visit: '本指名' },
      { id: 5, customer_id: 'planned', visit_date: '2026-09-04', amount_spent: 50_000, nomination_status_at_visit: '本指名', is_planned: true },
      { id: 6, customer_id: 'before', visit_date: '2026-08-08', amount_spent: 60_000, nomination_status_at_visit: '本指名' },
    ],
    nominationHistory: [], extensionSales: [], freeSeatings: [], shifts: [],
    periodStart: '2026-08-01', periodEnd: '2026-08-31',
    rollingPeriodStart: '2026-08-09', rollingPeriodEnd: '2026-09-05', today: '2026-09-05',
  })

  assert.equal(result.rows[0].rolling_fukuoka_honshimei_customer_count, 2)
  // 過去月を表示していても、月間売上には9月分を混ぜない。
  assert.equal(result.rows[0].sales, 70_000)
})

test('全数値項目を高い順・低い順に安定して並び替える', () => {
  const row = (castId: string, value: number): CastIssueMonthlyRow => ({
    cast_id: castId,
    cast_name: castId,
    cast_tier: 'A層',
    created_at: '2026-01-01',
    rolling_fukuoka_honshimei_customer_count: value,
    sales: value,
    target_sales: value,
    achievement_rate: value,
    honshimei_count: value,
    banai_count: value,
    free_seating_count: value,
    bowzu_days: value,
    bowzu_work_days: value,
    current_bowzu_streak: value,
    work_days: value,
    target_work_days: value,
    remaining_work_days: value,
  })
  const source = [row('middle', 2), row('low', 1), row('high', 3), row('middle-2', 2)]
  const fields = [
    'rolling_fukuoka_honshimei_customer_count',
    'sales',
    'target_sales',
    'achievement_rate',
    'honshimei_count',
    'banai_count',
    'free_seating_count',
    'bowzu_days',
    'current_bowzu_streak',
    'work_days',
    'target_work_days',
    'remaining_work_days',
  ] as const

  for (const field of fields) {
    assert.deepEqual(
      sortCastIssueMonthlyRows(source, field, 'desc').map(item => item.cast_id),
      ['high', 'middle', 'middle-2', 'low'],
    )
    assert.deepEqual(
      sortCastIssueMonthlyRows(source, field, 'asc').map(item => item.cast_id),
      ['low', 'middle', 'middle-2', 'high'],
    )
  }
  assert.deepEqual(source.map(item => item.cast_id), ['middle', 'low', 'high', 'middle-2'])
  assert.notEqual(sortCastIssueMonthlyRows(source, 'standard', 'desc'), source)
})
