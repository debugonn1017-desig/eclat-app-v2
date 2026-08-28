import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCastIssueVisibility,
  calculateCastBowzuStats,
  calculateAverageVisitCycle,
  classifyCastIssueRegion,
  sortCastIssueCustomers,
  type CastIssueCustomerInput,
} from './castIssueVisibility'

const customer = (overrides: Partial<CastIssueCustomerInput> = {}): CastIssueCustomerInput => ({
  id: 'c1',
  customer_name: 'テスト様',
  nickname: null,
  nomination_status: '本指名',
  customer_rank: 'A',
  region: '福岡県',
  ...overrides,
})

test('地域は福岡県・県外・未設定へ排他的に分類する', () => {
  assert.equal(classifyCastIssueRegion('福岡県'), 'fukuoka')
  assert.equal(classifyCastIssueRegion(' 福岡県 '), 'fukuoka')
  assert.equal(classifyCastIssueRegion('東京都'), 'outside')
  assert.equal(classifyCastIssueRegion(null), 'unset')
  assert.equal(classifyCastIssueRegion('   '), 'unset')
})

test('ボウズは出勤日に本指名の実来店がない日だけを数える', () => {
  const result = calculateCastBowzuStats({
    shifts: [
      { shift_date: '2026-08-01', status: '出勤' },
      { shift_date: '2026-08-03', status: '休み' },
      { shift_date: '2026-08-05', status: '来客出勤' },
      { shift_date: '2026-08-10', status: '出勤' },
      { shift_date: '2026-08-15', status: '出勤' },
      { shift_date: '2026-08-20', status: '出勤' },
      { shift_date: '2026-08-28', status: '出勤' },
      { shift_date: '2026-08-29', status: '出勤' },
    ],
    visits: [
      { customer_id: 'hon1', visit_date: '2026-08-01', amount_spent: 10_000 },
      { customer_id: 'banai1', visit_date: '2026-08-05', amount_spent: 20_000 },
      { customer_id: 'hon1', visit_date: '2026-08-10', amount_spent: 30_000, is_planned: true },
      { customer_id: 'hon1', visit_date: '2026-08-15', amount_spent: 40_000 },
      { customer_id: 'hon1', visit_date: '2026-08-20', amount_spent: 0 },
    ],
    honshimeiCustomerIds: new Set(['hon1']),
    periodStart: '2026-08-01',
    today: '2026-08-29',
  })

  assert.deepEqual(result, {
    period_work_days: 6,
    period_bowzu_days: 3,
    current_bowzu_streak: 1,
  })
})

test('連続ボウズは休みを飛ばして出勤日だけを遡り、当日は確定しない', () => {
  const result = calculateCastBowzuStats({
    shifts: [
      { shift_date: '2026-08-20', status: '出勤' },
      { shift_date: '2026-08-21', status: '休み' },
      { shift_date: '2026-08-23', status: '出勤' },
      { shift_date: '2026-08-25', status: '来客出勤' },
      { shift_date: '2026-08-27', status: '希望出勤' },
      { shift_date: '2026-08-28', status: '出勤' },
      { shift_date: '2026-08-29', status: '出勤' },
    ],
    visits: [
      { customer_id: 'hon1', visit_date: '2026-08-20', amount_spent: 10_000 },
      { customer_id: 'free1', visit_date: '2026-08-23', amount_spent: 10_000 },
    ],
    honshimeiCustomerIds: new Set(['hon1']),
    periodStart: '2026-08-01',
    today: '2026-08-29',
  })

  assert.equal(result.period_work_days, 4)
  assert.equal(result.period_bowzu_days, 3)
  assert.equal(result.current_bowzu_streak, 3)
})

test('来店周期は同日重複を除いた正の日数差だけで平均する', () => {
  assert.equal(calculateAverageVisitCycle([
    { customer_id: 'c1', visit_date: '2026-08-20', amount_spent: 0 },
    { customer_id: 'c1', visit_date: '2026-08-20', amount_spent: 1000 },
    { customer_id: 'c1', visit_date: '2026-08-10', amount_spent: 2000 },
    { customer_id: 'c1', visit_date: '2026-07-21', amount_spent: 3000 },
  ]), 15)
})

test('直近4週間は両端を含み、予定来店は除外して集計する', () => {
  const result = buildCastIssueVisibility({
    customers: [customer()],
    visits: [
      { customer_id: 'c1', visit_date: '2026-08-01', amount_spent: 10_000 },
      { customer_id: 'c1', visit_date: '2026-08-28', amount_spent: 20_000 },
      { customer_id: 'c1', visit_date: '2026-08-20', amount_spent: 99_999, is_planned: true },
      { customer_id: 'c1', visit_date: '2026-07-31', amount_spent: 99_999 },
    ],
    nominationHistory: [],
    activeFollowUpCustomerIds: new Set(),
    periodStart: '2026-08-01',
    today: '2026-08-28',
  })
  assert.equal(result.recent_honshimei.length, 1)
  assert.equal(result.recent_honshimei[0].period_visits, 2)
  assert.equal(result.recent_honshimei[0].period_sales, 30_000)
  assert.equal(result.recent_honshimei[0].period_average_spend, 15_000)
  assert.equal(result.summary.period_honshimei_customer_count, 1)
  assert.equal(result.summary.period_honshimei_visit_count, 2)
  assert.equal(result.summary.period_honshimei_sales, 30_000)
})

test('通常周期より7日以上遅れた本指名だけを周期遅れにする', () => {
  const result = buildCastIssueVisibility({
    customers: [customer(), customer({ id: 'c2', customer_name: '未到達様' })],
    visits: [
      { customer_id: 'c1', visit_date: '2026-07-10', amount_spent: 10_000 },
      { customer_id: 'c1', visit_date: '2026-07-20', amount_spent: 10_000 },
      { customer_id: 'c2', visit_date: '2026-08-08', amount_spent: 10_000 },
      { customer_id: 'c2', visit_date: '2026-08-18', amount_spent: 10_000 },
    ],
    nominationHistory: [],
    activeFollowUpCustomerIds: new Set(['c1']),
    periodStart: '2026-08-01',
    today: '2026-08-28',
  })
  assert.deepEqual(result.overdue_honshimei.map(row => row.id), ['c1'])
  assert.equal(result.overdue_honshimei[0].average_cycle_days, 10)
  assert.equal(result.overdue_honshimei[0].overdue_days, 29)
  assert.equal(result.overdue_honshimei[0].follow_up_active, true)
})

test('場内獲得は4週間内の最新履歴へ顧客単位でまとめる', () => {
  const result = buildCastIssueVisibility({
    customers: [customer({ nomination_status: '本指名', region: '東京都' })],
    visits: [],
    nominationHistory: [
      { customer_id: 'c1', new_status: '場内', changed_at: '2026-08-02T10:00:00+09:00' },
      { customer_id: 'c1', new_status: '場内', changed_at: '2026-08-25T10:00:00+09:00' },
      { customer_id: 'c1', new_status: '本指名', changed_at: '2026-08-26T10:00:00+09:00' },
    ],
    activeFollowUpCustomerIds: new Set(['c1']),
    periodStart: '2026-08-01',
    today: '2026-08-28',
  })
  assert.equal(result.recent_banai.length, 1)
  assert.equal(result.recent_banai[0].acquired_date, '2026-08-25')
  assert.equal(result.recent_banai[0].days_since_acquisition, 3)
  assert.equal(result.recent_banai[0].region_group, 'outside')
  assert.equal(result.recent_banai[0].nomination_status, '本指名')
})

test('顧客一覧向けの累計・来店傾向・関係者・追いかけ情報を共通で付加する', () => {
  const result = buildCastIssueVisibility({
    customers: [customer({ age_group: '30代', last_contact_date: '2026-08-27' })],
    visits: [
      {
        id: 1,
        customer_id: 'c1',
        visit_date: '2026-08-24',
        visit_time: '20:30',
        amount_spent: 20_000,
        companion_honshimei: '同行A',
      },
      {
        id: 2,
        customer_id: 'c1',
        visit_date: '2026-08-17',
        visit_time: '22:00',
        amount_spent: 10_000,
      },
      {
        id: 3,
        customer_id: 'c1',
        visit_date: '2026-08-10',
        visit_time: '20:00',
        amount_spent: 999_999,
        is_planned: true,
        companion_banai: '予定同行',
      },
    ],
    nominationHistory: [],
    activeFollowUpCustomerIds: new Set(['c1']),
    followUpMetaByCustomer: new Map([['c1', {
      next_actions: ['営業連絡', '来店斡旋'],
      return_visit_deadline: '2026-09-01',
    }]]),
    customerStaffNamesByCustomer: new Map([['c1', ['黒服A', '黒服B']]]),
    periodStart: '2026-08-01',
    today: '2026-08-28',
  })

  const row = result.recent_honshimei[0]
  assert.equal(row.lifetime_visit_count, 2)
  assert.equal(row.lifetime_sales, 30_000)
  assert.equal(row.lifetime_average_spend, 15_000)
  assert.equal(row.lifetime_last_visit_date, '2026-08-24')
  assert.equal(row.lifetime_days_since_last_visit, 4)
  assert.equal(row.visit_pattern?.sampleVisitCount, 2)
  assert.equal(row.visit_pattern?.earlyHour, 20)
  assert.equal(row.latest_companion_honshimei, '同行A')
  assert.equal(row.latest_companion_banai, '')
  assert.deepEqual(row.customer_staff_names, ['黒服A', '黒服B'])
  assert.deepEqual(row.follow_up_next_actions, ['営業連絡', '来店斡旋'])
  assert.equal(row.follow_up_return_visit_deadline, '2026-09-01')
})

test('過去月は来店時点の指名状況で本指名人数・本数・売上を固定する', () => {
  const result = buildCastIssueVisibility({
    customers: [
      customer({ id: 'was-hon', nomination_status: 'フリー' }),
      customer({ id: 'now-hon', nomination_status: '本指名' }),
    ],
    visits: [
      {
        customer_id: 'was-hon',
        visit_date: '2026-07-10',
        amount_spent: 30_000,
        nomination_status_at_visit: '本指名',
      },
      {
        customer_id: 'was-hon',
        visit_date: '2026-07-20',
        amount_spent: 20_000,
        nomination_status_at_visit: '本指名',
      },
      {
        customer_id: 'now-hon',
        visit_date: '2026-07-15',
        amount_spent: 99_000,
        nomination_status_at_visit: '場内',
      },
      {
        customer_id: 'was-hon',
        visit_date: '2026-08-01',
        amount_spent: 99_000,
        nomination_status_at_visit: '本指名',
      },
    ],
    nominationHistory: [],
    activeFollowUpCustomerIds: new Set(),
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    today: '2026-08-29',
  })

  assert.deepEqual(result.recent_honshimei.map(row => row.id), ['was-hon'])
  assert.equal(result.summary.period_honshimei_customer_count, 1)
  assert.equal(result.summary.period_honshimei_visit_count, 2)
  assert.equal(result.summary.period_honshimei_sales, 50_000)
  assert.equal(result.recent_honshimei[0].lifetime_visit_count, 2)
  assert.equal(result.recent_honshimei[0].days_since_last_visit, 11)
})

test('過去月の周期遅れは月末時点の指名状況を履歴から復元する', () => {
  const result = buildCastIssueVisibility({
    customers: [customer({ nomination_status: 'フリー' })],
    visits: [
      { customer_id: 'c1', visit_date: '2026-07-01', amount_spent: 10_000, nomination_status_at_visit: '本指名' },
      { customer_id: 'c1', visit_date: '2026-07-11', amount_spent: 10_000, nomination_status_at_visit: '本指名' },
    ],
    nominationHistory: [{
      customer_id: 'c1',
      old_status: '本指名',
      new_status: 'フリー',
      changed_at: '2026-08-05T12:00:00+09:00',
    }],
    activeFollowUpCustomerIds: new Set(),
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    today: '2026-08-29',
  })

  assert.equal(result.overdue_honshimei.length, 1)
  assert.equal(result.overdue_honshimei[0].nomination_status, '本指名')
  assert.equal(result.overdue_honshimei[0].overdue_days, 10)
})

test('ボウズも来店時点の本指名スナップショットを優先する', () => {
  const result = calculateCastBowzuStats({
    shifts: [
      { shift_date: '2026-07-10', status: '出勤' },
      { shift_date: '2026-07-11', status: '出勤' },
    ],
    visits: [
      {
        customer_id: 'now-free',
        visit_date: '2026-07-10',
        amount_spent: 0,
        nomination_status_at_visit: '本指名',
      },
      {
        customer_id: 'now-hon',
        visit_date: '2026-07-11',
        amount_spent: 20_000,
        nomination_status_at_visit: '場内',
      },
    ],
    honshimeiCustomerIds: new Set(['now-hon']),
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    today: '2026-08-29',
  })

  assert.equal(result.period_work_days, 2)
  assert.equal(result.period_bowzu_days, 1)
  assert.equal(result.current_bowzu_streak, 1)
})

test('一覧の並び替えは元配列を変更せず期間・累計・期限の順を切り替える', () => {
  const result = buildCastIssueVisibility({
    customers: [customer({ id: 'low', customer_name: '低様' }), customer({ id: 'high', customer_name: '高様' })],
    visits: [
      { customer_id: 'low', visit_date: '2026-08-20', amount_spent: 100_000 },
      { customer_id: 'high', visit_date: '2026-08-18', amount_spent: 80_000 },
      { customer_id: 'high', visit_date: '2026-08-19', amount_spent: 80_000 },
    ],
    nominationHistory: [],
    activeFollowUpCustomerIds: new Set(['low']),
    periodStart: '2026-08-01',
    today: '2026-08-28',
  })
  const sourceIds = result.recent_honshimei.map(row => row.id)

  assert.deepEqual(
    sortCastIssueCustomers(result.recent_honshimei, 'period_visits_desc').map(row => row.id),
    ['high', 'low'],
  )
  assert.deepEqual(
    sortCastIssueCustomers(result.recent_honshimei, 'period_average_desc').map(row => row.id),
    ['low', 'high'],
  )
  assert.deepEqual(result.recent_honshimei.map(row => row.id), sourceIds)
})
