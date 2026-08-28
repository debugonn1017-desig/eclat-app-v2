import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCastIssueVisibility,
  calculateAverageVisitCycle,
  classifyCastIssueRegion,
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
  assert.equal(result.recent_honshimei[0].four_week_visits, 2)
  assert.equal(result.recent_honshimei[0].four_week_sales, 30_000)
  assert.equal(result.recent_honshimei[0].average_spend, 15_000)
  assert.equal(result.summary.four_week_customer_count, 1)
  assert.equal(result.summary.four_week_sales, 30_000)
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
