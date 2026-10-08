import { test } from 'node:test'
import assert from 'node:assert/strict'
import { customerDataWithoutMarks, compareStarredCustomers } from './customerMarks'

test('基本情報保存は星と返信なしを送信せず、元データを変えない', () => {
  const row={customer_name:'サンプル',nomination_status:'本指名',is_starred:true,no_reply:true,memo:'テスト'}
  assert.deepEqual(customerDataWithoutMarks(row), {customer_name:'サンプル',nomination_status:'本指名',memo:'テスト'})
  assert.equal(row.is_starred,true)
  assert.equal(row.no_reply,true)
})
test('星が最優先で、場内の星あり/なしの各グループ内は来店が新しい順', () => {
  const rows=[{starred:false,nomination:'場内',lastVisitDate:'2026-10-06'}, {starred:true,nomination:'場内',lastVisitDate:'2026-10-01'}, {starred:true,nomination:'場内',lastVisitDate:'2026-10-05'}]
  assert.deepEqual([...rows].sort(compareStarredCustomers), [rows[2],rows[1],rows[0]])
})
test('場内以外は星が同じなら標準の元順を維持し、来店なしは場内で最後', () => {
  assert.equal(compareStarredCustomers({starred:true,nomination:'本指名',lastVisitDate:'2026-01-01'}, {starred:true,nomination:'本指名',lastVisitDate:'2026-10-01'}),0)
  assert.ok(compareStarredCustomers({starred:false,nomination:'場内',lastVisitDate:null},{starred:false,nomination:'場内',lastVisitDate:'2026-10-01'})>0)
})
