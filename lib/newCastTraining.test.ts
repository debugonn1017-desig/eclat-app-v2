import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getNewCastTrainingProgress,
  getTrainingStepStatus,
  isValidDateOnly,
  NEW_CAST_TRAINING_STEPS,
} from './newCastTraining'

test('日付形式と実在日を検証する', () => {
  assert.equal(isValidDateOnly('2026-02-28'), true)
  assert.equal(isValidDateOnly('2026-02-29'), false)
  assert.equal(isValidDateOnly('2028-02-29'), true)
  assert.equal(isValidDateOnly('2026-2-01'), false)
})

test('入店日当日は1日目のSTEP1', () => {
  const progress = getNewCastTrainingProgress('2026-08-01', '2026-08-01')
  assert.equal(progress?.dayNumber, 1)
  assert.equal(progress?.weekNumber, 1)
  assert.equal(progress?.currentStep?.step, 1)
})

test('STEP1〜3の境界を自動計算する', () => {
  assert.equal(getNewCastTrainingProgress('2026-08-01', '2026-08-04')?.currentStep?.step, 1)
  assert.equal(getNewCastTrainingProgress('2026-08-01', '2026-08-05')?.currentStep?.step, 2)
  assert.equal(getNewCastTrainingProgress('2026-08-01', '2026-08-09')?.currentStep?.step, 2)
  assert.equal(getNewCastTrainingProgress('2026-08-01', '2026-08-10')?.currentStep?.step, 3)
  assert.equal(getNewCastTrainingProgress('2026-08-01', '2026-08-14')?.currentStep?.step, 3)
})

test('STEP4〜7の境界を自動計算する', () => {
  assert.equal(getNewCastTrainingProgress('2026-08-01', '2026-08-15')?.currentStep?.step, 4)
  assert.equal(getNewCastTrainingProgress('2026-08-01', '2026-08-29')?.currentStep?.step, 5)
  assert.equal(getNewCastTrainingProgress('2026-08-01', '2026-09-12')?.currentStep?.step, 6)
  assert.equal(getNewCastTrainingProgress('2026-08-01', '2026-09-26')?.currentStep?.step, 7)
  assert.equal(getNewCastTrainingProgress('2026-08-01', '2026-10-29')?.dayNumber, 90)
  assert.equal(getNewCastTrainingProgress('2026-08-01', '2026-10-29')?.currentStep?.step, 7)
})

test('91日目以降は層を変えず育成期間終了として返す', () => {
  const progress = getNewCastTrainingProgress('2026-08-01', '2026-10-30')
  assert.equal(progress?.phase, 'completed')
  assert.equal(progress?.progressPercent, 100)
  assert.equal(progress?.currentStep, null)
  for (const step of NEW_CAST_TRAINING_STEPS) {
    assert.equal(progress && getTrainingStepStatus(step, progress), 'completed')
  }
})

test('未来の入店日は開始前として返す', () => {
  const progress = getNewCastTrainingProgress('2026-08-10', '2026-08-01')
  assert.equal(progress?.phase, 'before_start')
  assert.equal(progress?.daysUntilStart, 9)
  assert.equal(progress?.currentStep, null)
})

test('未設定・不正日付はnull', () => {
  assert.equal(getNewCastTrainingProgress(null, '2026-08-01'), null)
  assert.equal(getNewCastTrainingProgress('', '2026-08-01'), null)
  assert.equal(getNewCastTrainingProgress('2026-02-29', '2026-08-01'), null)
})
