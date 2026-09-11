import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CAST_TRAINING_CATEGORY_META,
  CAST_TRAINING_ELIGIBLE_SHIFT_STATUSES,
  CAST_TRAINING_MEMO_MAX,
  getCastTrainingMonthBounds,
  isTrainingScheduleEligibleShift,
  isRealDateOnly,
  parseCastTrainingScheduleDeleteInput,
  parseCastTrainingScheduleInput,
} from './castTrainingSchedule'

const CAST_1 = '11111111-1111-4111-8111-111111111111'
const CAST_2 = '22222222-2222-4222-8222-222222222222'
const STAFF = '33333333-3333-4333-8333-333333333333'

const validInput = {
  castIds: [CAST_1, CAST_2, CAST_1],
  scheduleDate: '2026-09-12',
  category: 'phase1',
  topic: CAST_TRAINING_CATEGORY_META.phase1.topics[0],
  memo: '  1行目\r\n2行目  ',
  assignedStaffId: STAFF,
  isCompleted: false,
}

test('一括入力を正規化し、重複キャストを除く', () => {
  const result = parseCastTrainingScheduleInput(validInput)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.value.castIds, [CAST_1, CAST_2])
  assert.equal(result.value.memo, '1行目\n2行目')
})

test('区分と定型項目の組み合わせが違う入力を拒否する', () => {
  const result = parseCastTrainingScheduleInput({
    ...validInput,
    category: 'phase2',
  })
  assert.equal(result.ok, false)
})

test('新しいフェーズ項目とキャストMTを受理する', () => {
  assert.deepEqual(CAST_TRAINING_CATEGORY_META.phase1.topics, [
    'STEP1（動画視聴）',
    'STEP2（動画視聴）',
    'STEP3（動画視聴）',
  ])
  assert.deepEqual(CAST_TRAINING_CATEGORY_META.phase2.topics, [
    'STEP5（前日の確認）',
    'STEP6（前日の確認）',
  ])
  assert.equal(CAST_TRAINING_CATEGORY_META.phase3.topics.length, 7)
  assert.deepEqual(CAST_TRAINING_CATEGORY_META.cast_mt.topics, ['課題共有', '顧客確認'])
  assert.equal(parseCastTrainingScheduleInput({
    ...validInput,
    category: 'cast_mt',
    topic: '課題共有',
  }).ok, true)
})

test('保存済みの旧フェーズ項目は後方互換として受理する', () => {
  assert.equal(parseCastTrainingScheduleInput({
    ...validInput,
    category: 'phase1',
    topic: '接客の基本姿勢',
  }).ok, true)
})

test('実在日・月境界を正しく判定する', () => {
  assert.equal(isRealDateOnly('2026-02-29'), false)
  assert.equal(isRealDateOnly('2028-02-29'), true)
  assert.deepEqual(getCastTrainingMonthBounds('2028-02'), {
    start: '2028-02-01',
    end: '2028-02-29',
  })
  assert.equal(getCastTrainingMonthBounds('2026-13'), null)
})

test('出勤・来客出勤・希望出勤を教育設定対象にする', () => {
  assert.deepEqual(CAST_TRAINING_ELIGIBLE_SHIFT_STATUSES, ['出勤', '来客出勤', '希望出勤'])
  assert.equal(isTrainingScheduleEligibleShift('出勤'), true)
  assert.equal(isTrainingScheduleEligibleShift('来客出勤'), true)
  assert.equal(isTrainingScheduleEligibleShift('希望出勤'), true)
  assert.equal(isTrainingScheduleEligibleShift('休み'), false)
  assert.equal(isTrainingScheduleEligibleShift('希望休み'), false)
  assert.equal(isTrainingScheduleEligibleShift('未定'), false)
})

test('必須値・UUID・文字数を検証する', () => {
  assert.equal(parseCastTrainingScheduleInput({ ...validInput, castIds: [] }).ok, false)
  assert.equal(parseCastTrainingScheduleInput({ ...validInput, castIds: ['bad-id'] }).ok, false)
  assert.equal(parseCastTrainingScheduleInput({ ...validInput, assignedStaffId: 'bad-id' }).ok, false)
  assert.equal(parseCastTrainingScheduleInput({ ...validInput, memo: '文'.repeat(CAST_TRAINING_MEMO_MAX + 1) }).ok, false)
  assert.equal(parseCastTrainingScheduleInput({ ...validInput, isCompleted: 'false' }).ok, false)
})

test('削除入力でも重複除去・日付検証を行う', () => {
  const valid = parseCastTrainingScheduleDeleteInput({
    castIds: [CAST_1, CAST_1],
    scheduleDate: '2026-09-12',
  })
  assert.equal(valid.ok, true)
  if (valid.ok) assert.deepEqual(valid.value.castIds, [CAST_1])
  assert.equal(parseCastTrainingScheduleDeleteInput({
    castIds: [CAST_1],
    scheduleDate: '2026-02-29',
  }).ok, false)
})
