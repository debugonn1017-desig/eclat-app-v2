import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyFollowUpTiming,
  isFollowUpNextAction,
} from './followUpWorkflow'

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
