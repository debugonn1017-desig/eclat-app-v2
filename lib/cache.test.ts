import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearCacheScope,
  fetchWithCache,
  getCache,
  setCache,
  setCacheScope,
} from './cache'

test('認証ユーザー未確認中はデータをキャッシュしない', () => {
  clearCacheScope()
  setCache('sample', { value: 'secret' })
  assert.equal(getCache('sample'), null)
})

test('ユーザー切替時に以前のユーザーのキャッシュを返さない', () => {
  clearCacheScope()
  setCacheScope('user-a')
  setCache('sample', { value: 'A' })
  assert.deepEqual(getCache('sample'), { value: 'A' })

  setCacheScope('user-b')
  assert.equal(getCache('sample'), null)
  setCache('sample', { value: 'B' })
  assert.deepEqual(getCache('sample'), { value: 'B' })
})

test('取得中にユーザーが変わった場合は古い結果を画面にもキャッシュにも渡さない', async () => {
  clearCacheScope()
  setCacheScope('user-a')

  let resolveRequest!: (value: string) => void
  const request = new Promise<string>(resolve => {
    resolveRequest = resolve
  })
  const received: string[] = []
  const pending = fetchWithCache(
    'slow',
    () => request,
    value => received.push(value),
  )

  setCacheScope('user-b')
  resolveRequest('user-a-secret')
  await pending

  assert.deepEqual(received, [])
  assert.equal(getCache('slow'), null)
})
