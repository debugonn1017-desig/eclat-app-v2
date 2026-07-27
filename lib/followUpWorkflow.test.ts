import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FOLLOW_UP_ACTIONS,
  RETURN_VISIT_DEADLINE_PRESETS,
  SALES_CONTACT_INTERVALS,
  calculateReturnVisitDeadline,
  classifyFollowUpTiming,
  getDeadlineInfo,
  getSalesContactDeadline,
  isFollowUpActionItems,
  isFollowUpNextAction,
  isReturnVisitDeadlinePreset,
  isSalesContactIntervalDays,
  resolveReturnVisitDeadline,
} from './followUpWorkflow'

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
