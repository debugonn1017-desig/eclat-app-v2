import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(fs.readFileSync('lib/shiftTimeMemo.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const helper = {}
vm.runInThisContext(`(function(exports){${source}\n})`, { filename: 'lib/shiftTimeMemo.ts' })(helper)
const { SHIFT_TIME_OPTIONS, getShiftTimeMemo, setShiftTimeMemo } = helper

test('選べる時間は20時から22時半までの6つだけ', () => {
  assert.deepEqual(SHIFT_TIME_OPTIONS, ['20:00', '20:30', '21:00', '21:30', '22:00', '22:30'])
  assert.throws(() => setShiftTimeMemo('', '23:00'), /時間を選んで/)
})

test('6つの時間を保存して読み出せる。通常のメモは保持', () => {
  const note = '送迎あり\n21:00に連絡する\n  元の空白も保持  '
  for (const time of SHIFT_TIME_OPTIONS) {
    const result = setShiftTimeMemo(note, time)
    assert.equal(getShiftTimeMemo(result), time)
    assert.equal(result, `希望出勤時間: ${time}\n${note}`)
  }
})

test('時間の変更は専用行だけを置換し、二重追加しない', () => {
  const note = '希望出勤時間: 20:00\n送迎あり\n希望出勤時間: 21:30'
  assert.equal(setShiftTimeMemo(note, '22:30'), '希望出勤時間: 22:30\n送迎あり')
  assert.equal(setShiftTimeMemo(setShiftTimeMemo(note, '22:30'), '22:30'), setShiftTimeMemo(note, '22:30'))
})

test('時間だけ消すと一般メモが残る。未設定のメモはそのまま', () => {
  assert.equal(setShiftTimeMemo('希望出勤時間: 20:30\n送迎あり', null), '送迎あり')
  assert.equal(setShiftTimeMemo('希望出勤時間: 20:30', null), '')
  for (const note of ['', '20:30', '希望出勤時間: 20:15\n手入力メモ', '  \n一般メモ\n']) assert.equal(setShiftTimeMemo(note, null), note)
})

test('未設定・旧メモ・CRLFを読み分け、集計やステータスは操作しない', () => {
  for (const note of [null, undefined, '', '20:00', '連絡時間: 20:00', '希望出勤時間: 23:00']) assert.equal(getShiftTimeMemo(note), null)
  assert.equal(getShiftTimeMemo('一般メモ\r\n希望出勤時間: 22:00\r\n送迎あり'), '22:00')
  assert.equal(setShiftTimeMemo(null, '21:00'), '希望出勤時間: 21:00')
  assert.equal(setShiftTimeMemo(undefined, null), '')
  assert.doesNotMatch(source, /cast_shifts|status\s*=|amount_spent|shift_date\s*=/)
})
