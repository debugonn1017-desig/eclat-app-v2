import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CAST_MEETING_LOG_STAFF_NAME_MAX,
  CAST_MEETING_LOG_TITLE_MAX,
  CAST_MEETING_LOG_TRANSCRIPT_MAX,
  parseCastMeetingLogInput,
} from './castMeetingLog'

const validInput = {
  castId: 'cast-1',
  meetingDate: '2026-08-22',
  title: '  今月の振り返り  ',
  staffName: '  拓馬　管理者  ',
  transcript: '  1行目\r\n2行目  ',
}

test('有効な入力を正規化し、文字起こしの改行は保持する', () => {
  const result = parseCastMeetingLogInput(validInput)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.value, {
    castId: 'cast-1',
    meetingDate: '2026-08-22',
    title: '今月の振り返り',
    staffName: '拓馬 管理者',
    transcript: '1行目\n2行目',
  })
})

test('オブジェクト以外を拒否する', () => {
  assert.equal(parseCastMeetingLogInput(null).ok, false)
  assert.equal(parseCastMeetingLogInput([]).ok, false)
})

test('実在しない日付を拒否し、うるう日は受け付ける', () => {
  assert.equal(parseCastMeetingLogInput({ ...validInput, meetingDate: '2026-02-29' }).ok, false)
  assert.equal(parseCastMeetingLogInput({ ...validInput, meetingDate: '2028-02-29' }).ok, true)
})

test('必須5項目の空欄を拒否する', () => {
  for (const key of ['castId', 'meetingDate', 'title', 'staffName', 'transcript'] as const) {
    assert.equal(parseCastMeetingLogInput({ ...validInput, [key]: '   ' }).ok, false, key)
  }
})

test('最大文字数ちょうどは受け付ける', () => {
  const result = parseCastMeetingLogInput({
    ...validInput,
    title: '題'.repeat(CAST_MEETING_LOG_TITLE_MAX),
    staffName: '担'.repeat(CAST_MEETING_LOG_STAFF_NAME_MAX),
    transcript: '文'.repeat(CAST_MEETING_LOG_TRANSCRIPT_MAX),
  })
  assert.equal(result.ok, true)
})

test('最大文字数を超える入力を拒否する', () => {
  assert.equal(parseCastMeetingLogInput({
    ...validInput,
    title: '題'.repeat(CAST_MEETING_LOG_TITLE_MAX + 1),
  }).ok, false)
  assert.equal(parseCastMeetingLogInput({
    ...validInput,
    staffName: '担'.repeat(CAST_MEETING_LOG_STAFF_NAME_MAX + 1),
  }).ok, false)
  assert.equal(parseCastMeetingLogInput({
    ...validInput,
    transcript: '文'.repeat(CAST_MEETING_LOG_TRANSCRIPT_MAX + 1),
  }).ok, false)
})
