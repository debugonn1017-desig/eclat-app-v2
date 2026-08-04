import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_SORT_OPTIONS,
  RETURN_VISIT_DEADLINE_PRESETS,
  SALES_CONTACT_INTERVALS,
  calculateReturnVisitDeadline,
  classifyFollowUpRegion,
  classifyFollowUpTiming,
  getDeadlineInfo,
  getSalesContactDeadline,
  isFollowUpActionItems,
  isFollowUpNextAction,
  isReturnVisitDeadlinePreset,
  isSalesContactIntervalDays,
  resolveReturnVisitDeadline,
  sortFollowUpItems,
  type FollowUpSortableItem,
} from './followUpWorkflow'

function makeSortItem(
  name: string,
  activatedAt: string,
  options: {
    lastContactedAt?: string | null
    returnDeadline?: string | null
    salesInterval?: 1 | 2 | 3 | 7 | 14 | 30 | null
  } = {},
): FollowUpSortableItem {
  return {
    activated_at: activatedAt,
    last_contacted_at: options.lastContactedAt ?? null,
    return_visit_deadline: options.returnDeadline ?? null,
    sales_contact_interval_days: options.salesInterval ?? null,
    customer: { customer_name: name, nickname: null },
  }
}

test('オーナー確定の行動・再来店期限・営業連絡間隔の選択肢を固定する', () => {
  assert.deepEqual(FOLLOW_UP_ACTIONS, [
    '営業連絡',
    '関係値づくり',
    '来店斡旋',
    '同伴斡旋',
    'アフター斡旋',
    'プライベートで関係値づくり',
  ])
  assert.deepEqual(
    RETURN_VISIT_DEADLINE_PRESETS.map(option => option.label),
    ['明日', '3日以内', '1週間以内', '2週間以内', '1ヶ月以内', '2ヶ月以内', '3ヶ月以内', '半年以内'],
  )
  assert.deepEqual(
    SALES_CONTACT_INTERVALS.map(option => option.label),
    ['毎日', '2日以上空けない', '3日以上空けない', '1週間以上空けない', '2週間以上空けない', '1ヶ月以上空けない'],
  )
  assert.deepEqual(
    FOLLOW_UP_SORT_OPTIONS.map(option => option.label),
    [
      '対応優先順',
      '追加が新しい順',
      '追加が古い順',
      '最終連絡が古い順（未連絡優先）',
      '最終連絡が新しい順',
      '再来店期限が近い順',
      '営業連絡期限が近い順',
      'お客様名順',
    ],
  )
})

test('追いかけ中の地域を福岡県・県外・地域未設定へ漏れなく分類する', () => {
  assert.equal(classifyFollowUpRegion('福岡県'), 'fukuoka')
  assert.equal(classifyFollowUpRegion(' 福岡県 '), 'fukuoka')
  assert.equal(classifyFollowUpRegion('東京都'), 'outside')
  assert.equal(classifyFollowUpRegion('海外'), 'outside')
  assert.equal(classifyFollowUpRegion(null), 'unset')
  assert.equal(classifyFollowUpRegion(''), 'unset')
  assert.equal(classifyFollowUpRegion('   '), 'unset')
})

test('次回連絡日を期限超過・今日・今週・それ以降・日付なしに分類する', () => {
  const today = '2026-07-27'
  assert.equal(classifyFollowUpTiming('2026-07-26', today), 'overdue')
  assert.equal(classifyFollowUpTiming('2026-07-27', today), 'today')
  assert.equal(classifyFollowUpTiming('2026-08-02', today), 'thisWeek')
  assert.equal(classifyFollowUpTiming('2026-08-03', today), 'later')
  assert.equal(classifyFollowUpTiming(null, today), 'unscheduled')
})

test('次の行動は定義済みの日本語選択肢だけを許可する', () => {
  assert.equal(isFollowUpNextAction('LINE'), true)
  assert.equal(isFollowUpNextAction('同伴相談'), true)
  assert.equal(isFollowUpNextAction('メール'), false)
  assert.equal(isFollowUpNextAction(null), false)
})

test('新しい行動は定義済みの複数選択だけを重複なく許可する', () => {
  assert.equal(isFollowUpActionItems(['営業連絡', '関係値づくり']), true)
  assert.equal(isFollowUpActionItems(['プライベートで関係値づくり']), true)
  assert.equal(isFollowUpActionItems([]), true)
  assert.equal(isFollowUpActionItems(['営業連絡', '営業連絡']), false)
  assert.equal(isFollowUpActionItems(['LINE']), false)
  assert.equal(isFollowUpActionItems('営業連絡'), false)
})

test('再来店期限プリセットと営業連絡間隔は定義済み値だけを許可する', () => {
  assert.equal(isReturnVisitDeadlinePreset('within_2_weeks'), true)
  assert.equal(isReturnVisitDeadlinePreset('within_4_months'), false)
  assert.equal(isSalesContactIntervalDays(1), true)
  assert.equal(isSalesContactIntervalDays(30), true)
  assert.equal(isSalesContactIntervalDays(31), false)
  assert.equal(isSalesContactIntervalDays('7'), false)
})

test('再来店期限は選択日のJST日付から計算する', () => {
  const today = '2026-07-28'
  assert.equal(calculateReturnVisitDeadline('tomorrow', today), '2026-07-29')
  assert.equal(calculateReturnVisitDeadline('within_3_days', today), '2026-07-31')
  assert.equal(calculateReturnVisitDeadline('within_1_week', today), '2026-08-04')
  assert.equal(calculateReturnVisitDeadline('within_2_weeks', today), '2026-08-11')
  assert.equal(calculateReturnVisitDeadline('within_6_months', today), '2027-01-28')
})

test('月単位の再来店期限は月末を越えず末日に丸める', () => {
  assert.equal(calculateReturnVisitDeadline('within_1_month', '2026-01-31'), '2026-02-28')
  assert.equal(calculateReturnVisitDeadline('within_1_month', '2028-01-31'), '2028-02-29')
  assert.equal(calculateReturnVisitDeadline('within_2_months', '2026-12-31'), '2027-02-28')
})

test('同じ再来店期限プリセットでメモ保存しても絶対期限を先送りしない', () => {
  assert.equal(
    resolveReturnVisitDeadline(
      'within_1_month',
      'within_1_month',
      '2026-08-28',
      '2026-08-10',
    ),
    '2026-08-28',
  )
  assert.equal(
    resolveReturnVisitDeadline(
      'within_2_months',
      'within_1_month',
      '2026-08-28',
      '2026-08-10',
    ),
    '2026-10-10',
  )
  assert.equal(resolveReturnVisitDeadline(null, 'within_1_month', '2026-08-28'), null)
})

test('再来店期限の残り日数と超過日数を表示用に返す', () => {
  assert.deepEqual(getDeadlineInfo(null, '2026-07-28'), {
    status: 'unscheduled',
    daysRemaining: null,
    label: '期限未設定',
  })
  assert.equal(getDeadlineInfo('2026-07-27', '2026-07-28').label, '1日超過')
  assert.equal(getDeadlineInfo('2026-07-28', '2026-07-28').label, '今日まで')
  assert.equal(getDeadlineInfo('2026-08-04', '2026-07-28').label, 'あと7日')
})

test('営業連絡期限は最終連絡日から数え、未連絡なら追いかけ開始日から数える', () => {
  assert.equal(
    getSalesContactDeadline('2026-07-28T14:59:00+09:00', '2026-07-01T00:00:00Z', 3),
    '2026-07-31',
  )
  assert.equal(
    getSalesContactDeadline(null, '2026-07-28T01:00:00Z', 7),
    '2026-08-04',
  )
  assert.equal(getSalesContactDeadline(null, '2026-07-28T01:00:00Z', null), null)
})

test('対応優先順は営業連絡と再来店の近い方を使い、期限なしを最後にする', () => {
  const items = [
    makeSortItem('期限なし', '2026-08-03T00:00:00Z'),
    makeSortItem('営業8日', '2026-08-02T00:00:00Z', {
      lastContactedAt: '2026-08-01T00:00:00+09:00',
      returnDeadline: '2026-08-20',
      salesInterval: 7,
    }),
    makeSortItem('再来店7日', '2026-08-01T00:00:00Z', {
      returnDeadline: '2026-08-07',
    }),
  ]

  assert.deepEqual(
    sortFollowUpItems(items, 'priority').map(item => item.customer.customer_name),
    ['再来店7日', '営業8日', '期限なし'],
  )
})

test('追加日は現在の追いかけ開始日時で新旧を並べ替える', () => {
  const items = [
    makeSortItem('古い', '2026-07-01T00:00:00Z'),
    makeSortItem('新しい', '2026-08-01T00:00:00Z'),
  ]

  assert.deepEqual(
    sortFollowUpItems(items, 'addedNewest').map(item => item.customer.customer_name),
    ['新しい', '古い'],
  )
  assert.deepEqual(
    sortFollowUpItems(items, 'addedOldest').map(item => item.customer.customer_name),
    ['古い', '新しい'],
  )
})

test('最終連絡の古い順は未連絡を先頭、新しい順は未連絡を最後にする', () => {
  const items = [
    makeSortItem('最近', '2026-07-01T00:00:00Z', {
      lastContactedAt: '2026-08-03T00:00:00Z',
    }),
    makeSortItem('未連絡', '2026-07-02T00:00:00Z'),
    makeSortItem('以前', '2026-07-03T00:00:00Z', {
      lastContactedAt: '2026-07-20T00:00:00Z',
    }),
  ]

  assert.deepEqual(
    sortFollowUpItems(items, 'contactOldest').map(item => item.customer.customer_name),
    ['未連絡', '以前', '最近'],
  )
  assert.deepEqual(
    sortFollowUpItems(items, 'contactNewest').map(item => item.customer.customer_name),
    ['最近', '以前', '未連絡'],
  )
})

test('個別期限とお客様名を並べ替え、元配列は変更しない', () => {
  const items = [
    makeSortItem('りん', '2026-08-03T00:00:00Z', {
      lastContactedAt: '2026-08-01T00:00:00+09:00',
      returnDeadline: null,
      salesInterval: 7,
    }),
    makeSortItem('あい', '2026-08-02T00:00:00Z', {
      lastContactedAt: '2026-08-01T00:00:00+09:00',
      returnDeadline: '2026-08-20',
      salesInterval: 3,
    }),
    makeSortItem('みお', '2026-08-01T00:00:00Z', {
      returnDeadline: '2026-08-10',
    }),
  ]
  const originalNames = items.map(item => item.customer.customer_name)

  assert.deepEqual(
    sortFollowUpItems(items, 'returnDeadline').map(item => item.customer.customer_name),
    ['みお', 'あい', 'りん'],
  )
  assert.deepEqual(
    sortFollowUpItems(items, 'salesDeadline').map(item => item.customer.customer_name),
    ['あい', 'りん', 'みお'],
  )
  assert.deepEqual(
    sortFollowUpItems(items, 'customerName').map(item => item.customer.customer_name),
    ['あい', 'みお', 'りん'],
  )
  assert.deepEqual(items.map(item => item.customer.customer_name), originalNames)
})
