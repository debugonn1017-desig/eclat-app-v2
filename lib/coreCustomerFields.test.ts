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

test('指名状況がフリーなら空欄があっても基本情報不足から除外する', () => {
  const missing = getMissingCoreCustomerFields({
    customer_name: '仮名',
    nickname: '',
    age_group: '',
    region: '',
    spouse_status: '',
    occupation: '',
    nomination_status: 'フリー',
    customer_rank: 'C',
  })

  assert.deepEqual(missing, [])
})

test('切れた顧客は元の指名状況に関係なく基本情報不足から除外する', () => {
  const missing = getMissingCoreCustomerFields({
    customer_name: '仮名',
    nickname: '',
    age_group: '',
    region: '',
    spouse_status: '',
    occupation: '',
    nomination_status: '本指名',
    customer_rank: '切れた',
  })

  assert.deepEqual(missing, [])
})

test('本指名・場内・指名状況未設定は従来どおり7項目で判定する', () => {
  const honshimei = getMissingCoreCustomerFields({
    customer_name: '仮名',
    nickname: '',
    age_group: '30代',
    region: '福岡県',
    spouse_status: 'わからない',
    occupation: '会社員',
    nomination_status: '本指名',
    customer_rank: 'C',
  })
  const banai = getMissingCoreCustomerFields({
    customer_name: '仮名',
    nickname: 'ニックネーム',
    age_group: '30代',
    region: '',
    spouse_status: '未婚',
    occupation: '会社員',
    nomination_status: '場内',
    customer_rank: 'B',
  })
  const unset = getMissingCoreCustomerFields({
    customer_name: '仮名',
    nickname: 'ニックネーム',
    age_group: '30代',
    region: '福岡県',
    spouse_status: '未婚',
    occupation: '会社員',
    nomination_status: '',
    customer_rank: null,
  })

  assert.deepEqual(honshimei.map(field => field.key), ['nickname'])
  assert.deepEqual(banai.map(field => field.key), ['region'])
  assert.deepEqual(unset.map(field => field.key), ['nomination_status'])
})
