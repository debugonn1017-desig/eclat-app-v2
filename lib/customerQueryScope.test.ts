import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveCustomerQueryScope } from './customerQueryScope'

test('管理者の全件表示は担当条件を追加しない', () => {
  assert.deepEqual(
    resolveCustomerQueryScope({ role: 'admin', cast_name: null }, null),
    { ok: true, castNames: [] },
  )
})

test('管理者のキャスト指定は指定値だけを適用する', () => {
  assert.deepEqual(
    resolveCustomerQueryScope({ role: 'admin', cast_name: null }, 'りな'),
    { ok: true, castNames: ['りな'] },
  )
})

test('キャストはURL指定なしでも本人担当に固定する', () => {
  assert.deepEqual(
    resolveCustomerQueryScope({ role: 'cast', cast_name: 'りな' }, null),
    { ok: true, castNames: ['りな'] },
  )
})

test('キャストが本人名を指定しても条件を重複させない', () => {
  assert.deepEqual(
    resolveCustomerQueryScope({ role: 'cast', cast_name: 'りな' }, 'りな'),
    { ok: true, castNames: ['りな'] },
  )
})

test('キャストが他キャスト名を指定した場合は積集合になり0件を維持する', () => {
  assert.deepEqual(
    resolveCustomerQueryScope({ role: 'cast', cast_name: 'りな' }, 'あかり'),
    { ok: true, castNames: ['りな', 'あかり'] },
  )
})

test('担当名未設定のキャストはservice_role検索を許可しない', () => {
  assert.deepEqual(
    resolveCustomerQueryScope({ role: 'cast', cast_name: null }, null),
    { ok: false, reason: 'CAST_NAME_MISSING' },
  )
})
