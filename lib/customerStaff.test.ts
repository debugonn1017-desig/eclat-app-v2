import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatCustomerStaffNames,
  parseCustomerStaffIds,
} from './customerStaff'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

test('担当者IDは順序を保って重複を除く', () => {
  assert.deepEqual(parseCustomerStaffIds([A, B, A]), [A, B])
})

test('未指定と空配列を区別する', () => {
  assert.equal(parseCustomerStaffIds(undefined), undefined)
  assert.deepEqual(parseCustomerStaffIds([]), [])
})

test('不正IDを拒否する', () => {
  assert.throws(() => parseCustomerStaffIds(['not-a-uuid']))
})

test('担当者は20人以内に制限する', () => {
  const ids = Array.from({ length: 21 }, (_, index) => (
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
  ))
  assert.throws(() => parseCustomerStaffIds(ids), /CUSTOMER_STAFF_IDS_TOO_MANY/)
})

test('担当者名は読みやすく連結し、未設定も表現する', () => {
  assert.equal(formatCustomerStaffNames(['田中', '佐藤']), '田中・佐藤')
  assert.equal(formatCustomerStaffNames([]), '未割り当て')
})
