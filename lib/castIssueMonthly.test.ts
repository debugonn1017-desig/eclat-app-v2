import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCastIssueMonthly } from './castIssueMonthly'

test('月間一覧は売上・本指名・場内・フリー配席・ボウズ・出勤を同じ月で集計する', () => {
  const result = buildCastIssueMonthly({
    casts: [{
      id: 'cast-1', cast_name: 'りほ', display_name: null, cast_tier: 'A層', created_at: '2026-01-01',
      target_sales: 100_000, target_work_days: 5,
    }],
    customers: [
      { id: 'customer-1', cast_name: 'りほ', nomination_status: '本指名' },
      { id: 'customer-2', cast_name: 'りほ', nomination_status: '場内' },
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
    today: '2026-09-05',
  })

  assert.equal(result.rows.length, 1)
  assert.deepEqual(result.rows[0], {
    cast_id: 'cast-1',
    cast_name: 'りほ',
    cast_tier: 'A層',
    created_at: '2026-01-01',
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
    customers: [{ id: 'customer-1', cast_name: 'かな', nomination_status: '本指名' }],
    visits: [{ customer_id: 'customer-1', visit_date: '2026-08-10', amount_spent: 0, nomination_status_at_visit: null }],
    nominationHistory: [], extensionSales: [], freeSeatings: [], shifts: [],
    periodStart: '2026-08-01', periodEnd: '2026-08-31', today: '2026-09-05',
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
      { id: 'customer-1', cast_name: 'りほ', nomination_status: '本指名' },
      { id: 'customer-2', cast_name: 'かな', nomination_status: '本指名' },
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
    periodStart: '2026-09-01', periodEnd: '2026-09-30', today: '2026-10-01',
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
