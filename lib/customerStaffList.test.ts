import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CUSTOMER_STAFF_RANK_GROUPS,
  filterCustomerStaffCustomers,
  getCustomerStaffRankGroup,
  groupCustomerStaffCustomers,
  normalizeCustomerStaffSearchText,
  sortCustomerStaffCustomers,
  type CustomerStaffListRow,
} from './customerStaffList'

function row(overrides: Partial<CustomerStaffListRow> & Pick<CustomerStaffListRow, 'id'>): CustomerStaffListRow {
  return {
    customer_name: null,
    nickname: null,
    nomination_status: null,
    customer_rank: null,
    region: null,
    search_text: null,
    total_spent: 0,
    visit_count: 0,
    avg_per_visit: 0,
    last_visit_date: null,
    ...overrides,
  }
}

test('ランクは S/A/B/C/切れた/未設定のどれか1つへ分類する', () => {
  const inputs = ['S', 'A', 'B', 'C', '切れた', null, '', '不正値'] as const
  assert.deepEqual(inputs.map(getCustomerStaffRankGroup), [
    'S', 'A', 'B', 'C', '切れた', '未設定', '未設定', '未設定',
  ])
})

test('ランク別グループは排他的かつ全件を保持する', () => {
  const rows = [
    row({ id: 's', customer_rank: 'S' }),
    row({ id: 'b', customer_rank: 'B' }),
    row({ id: 'none' }),
  ]
  const groups = groupCustomerStaffCustomers(rows)
  assert.deepEqual(groups.map(group => group.rank), [...CUSTOMER_STAFF_RANK_GROUPS])
  assert.deepEqual(groups.flatMap(group => group.items.map(item => item.id)), ['s', 'b', 'none'])
})

test('検索は空白・全半角・大文字小文字を吸収し、ボトル名も対象にする', () => {
  const rows = [
    row({ id: '1', customer_name: '山田 太郎', search_text: '山田 太郎 ｱﾙﾏﾝﾄﾞ GOLD' }),
    row({ id: '2', customer_name: '佐藤 次郎', search_text: '佐藤 次郎' }),
  ]
  assert.equal(normalizeCustomerStaffSearchText(' ＡＢ c '), 'abc')
  assert.deepEqual(filterCustomerStaffCustomers(rows, {
    query: 'アルマンドgold', rank: 'all', nomination: 'all', region: 'all',
  }).map(item => item.id), ['1'])
})

test('指名状況・地域・ランクの条件はANDで絞り込む', () => {
  const rows = [
    row({ id: '1', customer_rank: 'A', nomination_status: '本指名', region: '福岡県' }),
    row({ id: '2', customer_rank: 'A', nomination_status: '本指名', region: '大阪府' }),
    row({ id: '3', customer_rank: 'B', nomination_status: '場内', region: '福岡県' }),
  ]
  assert.deepEqual(filterCustomerStaffCustomers(rows, {
    query: '', rank: 'A', nomination: '本指名', region: 'fukuoka',
  }).map(item => item.id), ['1'])
})

test('地域未設定はNULL・空文字・空白のみを含む', () => {
  const rows = [
    row({ id: 'null', region: null }),
    row({ id: 'empty', region: '' }),
    row({ id: 'space', region: '  ' }),
    row({ id: 'fukuoka', region: '福岡県' }),
  ]
  assert.deepEqual(filterCustomerStaffCustomers(rows, {
    query: '', rank: 'all', nomination: 'all', region: 'unset',
  }).map(item => item.id), ['null', 'empty', 'space'])
})

test('標準順を復元し、他の並び替えでも入力配列を変更しない', () => {
  const rows = [
    row({ id: 'first', total_spent: 10, last_visit_date: null }),
    row({ id: 'second', total_spent: 30, last_visit_date: '2026-08-20' }),
    row({ id: 'third', total_spent: 20, last_visit_date: '2026-08-01' }),
  ]
  assert.deepEqual(sortCustomerStaffCustomers(rows, 'totalSpent').map(item => item.id), [
    'second', 'third', 'first',
  ])
  assert.deepEqual(sortCustomerStaffCustomers(rows, 'lastVisitOldest').map(item => item.id), [
    'first', 'third', 'second',
  ])
  assert.deepEqual(sortCustomerStaffCustomers(rows, 'standard').map(item => item.id), [
    'first', 'second', 'third',
  ])
  assert.deepEqual(rows.map(item => item.id), ['first', 'second', 'third'])
})
