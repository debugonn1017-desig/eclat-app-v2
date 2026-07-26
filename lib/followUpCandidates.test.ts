import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFollowUpCandidates } from './followUpCandidates'

const now = new Date('2026-07-27T05:00:00Z')

test('候補は A/B ランクだけで、追いかけ中の顧客は除外する', () => {
  const result = buildFollowUpCandidates(
    [
      { id: '1', customer_name: 'A', nickname: null, customer_rank: 'A', nomination_status: '本指名', region: '福岡県' },
      { id: '2', customer_name: 'B', nickname: null, customer_rank: 'B', nomination_status: '本指名', region: '福岡県' },
      { id: '3', customer_name: 'C', nickname: null, customer_rank: 'C', nomination_status: '本指名', region: '福岡県' },
      { id: '4', customer_name: '切れた', nickname: null, customer_rank: '切れた', nomination_status: '本指名', region: '福岡県' },
    ],
    [],
    new Set(['2']),
    now,
  )

  assert.deepEqual(result.map(row => row.id), ['1'])
})

test('3回来店以上は個人の中央値間隔×1.5で未来店候補を判定する', () => {
  const customers = [
    { id: '1', customer_name: 'A', nickname: null, customer_rank: 'A' as const, nomination_status: '本指名', region: '福岡県' },
  ]
  const result = buildFollowUpCandidates(
    customers,
    [
      { customer_id: '1', visit_date: '2026-05-01', amount_spent: 10000 },
      { customer_id: '1', visit_date: '2026-05-21', amount_spent: 10000 },
      { customer_id: '1', visit_date: '2026-06-10', amount_spent: 10000 },
    ],
    new Set(),
    now,
  )

  assert.equal(result[0]?.typical_interval_days, 20)
  assert.match(result[0]?.reasons[0] ?? '', /1.5倍/)
})

test('来店データが少ない場合は A=45日・B=60日の補助基準を使う', () => {
  const result = buildFollowUpCandidates(
    [
      { id: '1', customer_name: 'A', nickname: null, customer_rank: 'A', nomination_status: '本指名', region: null },
      { id: '2', customer_name: 'B', nickname: null, customer_rank: 'B', nomination_status: '本指名', region: null },
    ],
    [
      { customer_id: '1', visit_date: '2026-06-10', amount_spent: 10000 },
      { customer_id: '2', visit_date: '2026-06-10', amount_spent: 10000 },
    ],
    new Set(),
    now,
  )

  assert.deepEqual(result.map(row => row.id), ['1'])
})

test('十分な比較データがあるときだけ直近60日の下降を候補理由にする', () => {
  const result = buildFollowUpCandidates(
    [
      { id: '1', customer_name: 'A', nickname: null, customer_rank: 'A', nomination_status: '本指名', region: '福岡県' },
    ],
    [
      { customer_id: '1', visit_date: '2026-04-10', amount_spent: 50000 },
      { customer_id: '1', visit_date: '2026-05-10', amount_spent: 50000 },
      { customer_id: '1', visit_date: '2026-07-10', amount_spent: 10000 },
    ],
    new Set(),
    now,
  )

  assert.ok(result[0]?.reasons.some(reason => reason.includes('来店回数')))
  assert.ok(result[0]?.reasons.some(reason => reason.includes('売上')))
})
