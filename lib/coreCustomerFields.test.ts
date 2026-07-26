import test from 'node:test'
import assert from 'node:assert/strict'
import { getMissingCoreCustomerFields } from './coreCustomerFields'

test('教育上の基本7項目を不足チェックする', () => {
  const missing = getMissingCoreCustomerFields({
    customer_name: '山田さん',
    nickname: '',
    age_group: '30代',
    region: null,
    spouse_status: 'わからない',
    occupation: '会社員',
    nomination_status: '本指名',
  })

  assert.deepEqual(
    missing.map(field => field.key),
    ['nickname', 'region'],
  )
})

test('空白だけの入力も未登録として扱う', () => {
  const missing = getMissingCoreCustomerFields({
    customer_name: '   ',
    nickname: 'やまちゃん',
    age_group: '30代',
    region: '福岡県',
    spouse_status: '未婚',
    occupation: '会社員',
    nomination_status: '場内',
  })

  assert.deepEqual(missing.map(field => field.key), ['customer_name'])
})
