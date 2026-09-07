import test from 'node:test'
import assert from 'node:assert/strict'
import { businessDateJST, toJSTDateString } from './dateUtils'

test('営業日はJST 3:59までは前日、4:00ちょうどから当日に切り替わる', () => {
  assert.equal(businessDateJST(new Date('2026-09-08T18:59:59.999Z')), '2026-09-08')
  assert.equal(businessDateJST(new Date('2026-09-08T19:00:00.000Z')), '2026-09-09')
})

test('営業日の4時切替は月・年の境界でも前日を正しく返す', () => {
  assert.equal(businessDateJST(new Date('2026-12-31T17:00:00.000Z')), '2026-12-31')
  assert.equal(businessDateJST(new Date('2026-12-31T19:00:00.000Z')), '2027-01-01')
})

test('通常のJST日付は従来どおり0時で切り替わる', () => {
  const afterMidnight = new Date('2026-09-08T15:00:00.000Z')
  assert.equal(toJSTDateString(afterMidnight), '2026-09-09')
  assert.equal(businessDateJST(afterMidnight), '2026-09-08')
})
