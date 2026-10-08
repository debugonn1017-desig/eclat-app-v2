import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateMonthlyAverageSpend, getMonthlyNominationMetrics } from './castPerformance'

test('年間指名グラフは本指名を実人数、場内を本数で数える', () => {
  const customers = [{id:1,nomination_status:'本指名',region:'福岡県'}, {id:2,nomination_status:'本指名',region:'東京都'}, {id:3,nomination_status:'場内'}]
  const visits = [1,1,1,2,2,2,3,3].map(customer_id => ({ customer_id }))
  assert.deepEqual(getMonthlyNominationMetrics(customers, visits), {
    honshimeiVisits:6,localMonthlyPeople:1,outsideMonthlyPeople:1,banaiVisits:2,
  })
})
test('地域未設定は県外、予定は除外し0円の実来店は回数に含む', () => {
  const customers = [{id:'1',nomination_status:'本指名',region:null},{id:'2',nomination_status:'本指名',region:''},{id:'3',nomination_status:'本指名',region:'   '}]
  const visits = [{customer_id:1,amount_spent:0}, {customer_id:2,is_planned:true}, {customer_id:'3',is_planned:false}]
  assert.deepEqual(getMonthlyNominationMetrics(customers,visits), {honshimeiVisits:2,localMonthlyPeople:0,outsideMonthlyPeople:2,banaiVisits:0})
})
test('来店当時の指名を優先し、古い未記録行だけ現在の指名で補完', () => {
  const customers = [{id:'1',nomination_status:'本指名',region:'福岡県'}]
  const visits = [{customer_id:1,nomination_status_at_visit:'場内'}, {customer_id:1,nomination_status_at_visit:'フリー'}, {customer_id:1}]
  assert.deepEqual(getMonthlyNominationMetrics(customers,visits), {honshimeiVisits:1,localMonthlyPeople:1,outsideMonthlyPeople:0,banaiVisits:1})
})
test('範囲外顧客を集計せず、空の実績は0で安全に返す', () => {
  assert.deepEqual(getMonthlyNominationMetrics([], [{customer_id:'999'}]), {honshimeiVisits:0,localMonthlyPeople:0,outsideMonthlyPeople:0,banaiVisits:0})
})
test('客単価は売上÷本指名実来店回数、分母0は0円', () => {
  assert.equal(calculateMonthlyAverageSpend(123456,3),41152)
  assert.equal(calculateMonthlyAverageSpend(100000,0),0)
  assert.equal(calculateMonthlyAverageSpend(100,3),33)
})
