import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateRankByRules,
  isAutoRankEligible,
  makeDefaultRankRules,
  normalizeRankRules,
} from './rankCalculatorV2'
import type { RankRule, RankRules } from '../types'

const criteria = { monthly_period_months: 3 }
const today = new Date(2026, 6, 27)

function disableAll(rule: RankRule): RankRule {
  return {
    ...rule,
    conditions: rule.conditions.map(condition => ({ ...condition, enabled: false })),
  }
}

test('旧S/A/B設定は従来どおり該当なしをCにする', () => {
  const defaults = makeDefaultRankRules()
  const legacyRules: RankRules = {
    S: disableAll(defaults.S),
    A: disableAll(defaults.A),
    B: disableAll(defaults.B),
  }
  const result = calculateRankByRules(
    { customer_rank: 'A' },
    [],
    legacyRules,
    criteria,
    today,
  )
  assert.equal(result.recommended, 'C')
})

test('切れた基準はS/A/B/Cより先に評価する', () => {
  const rules = normalizeRankRules(null)
  rules.切れた = {
    combine: 'all',
    conditions: rules.切れた.conditions.map(condition => ({
      ...condition,
      enabled: condition.field === 'days_since_last_visit',
      value: condition.field === 'days_since_last_visit' ? 180 : condition.value,
      op: condition.field === 'days_since_last_visit' ? 'gte' : condition.op,
    })),
  }
  const result = calculateRankByRules(
    { customer_rank: 'B' },
    [{ visit_date: '2025-01-01', amount_spent: 300000 }],
    rules,
    criteria,
    today,
  )
  assert.equal(result.recommended, '切れた')
  assert.equal(result.matchedRank, '切れた')
})

test('Cにも独立した条件を設定できる', () => {
  const rules = normalizeRankRules(null)
  rules.S = disableAll(rules.S)
  rules.A = disableAll(rules.A)
  rules.B = disableAll(rules.B)
  rules.切れた = disableAll(rules.切れた)
  rules.C = {
    combine: 'all',
    conditions: rules.C.conditions.map(condition => ({
      ...condition,
      enabled: condition.field === 'days_since_last_visit',
      value: condition.field === 'days_since_last_visit' ? 60 : condition.value,
      op: condition.field === 'days_since_last_visit' ? 'gte' : condition.op,
    })),
  }
  const result = calculateRankByRules(
    { customer_rank: 'A' },
    [{ visit_date: '2026-04-01', amount_spent: 1000 }],
    rules,
    criteria,
    today,
  )
  assert.equal(result.recommended, 'C')
  assert.equal(result.matchedRank, 'C')
})

test('新設定でどの条件にも該当しない場合は現在ランクを維持する', () => {
  const rules = normalizeRankRules(null)
  rules.S = disableAll(rules.S)
  rules.A = disableAll(rules.A)
  rules.B = disableAll(rules.B)
  rules.C = disableAll(rules.C)
  rules.切れた = disableAll(rules.切れた)
  const result = calculateRankByRules(
    { customer_rank: 'A' },
    [],
    rules,
    criteria,
    today,
  )
  assert.equal(result.recommended, 'A')
})

test('手動で切れたにした顧客は自動判定で変えない', () => {
  const result = calculateRankByRules(
    { customer_rank: '切れた' },
    [{ visit_date: '2026-07-20', amount_spent: 500000 }],
    normalizeRankRules(null),
    criteria,
    today,
  )
  assert.equal(result.recommended, '切れた')
})

test('自動ランク判定は本指名かつ切れた以外だけ', () => {
  assert.equal(isAutoRankEligible({ nomination_status: '本指名', customer_rank: 'A' }), true)
  assert.equal(isAutoRankEligible({ nomination_status: '場内', customer_rank: 'A' }), false)
  assert.equal(isAutoRankEligible({ nomination_status: 'フリー', customer_rank: 'C' }), false)
  assert.equal(isAutoRankEligible({ nomination_status: '本指名', customer_rank: '切れた' }), false)
})
