import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearCacheScope,
  fetchWithCache,
  getCache,
  setCache,
  setCacheScope,
  invalidateAllCastPages,
  invalidateAllCastsKPI,
} from './cache'

test('過去の指名訂正後は別月の成績・坊主表示を取り直し、無関係の顧客詳細は維持する', () => {
  clearCacheScope()
  setCacheScope('staff')
  for (const key of ['castPage:cast-a:2026-10', 'castPage:cast-a:2026-11', 'castPage:cast-b:2026-11', 'castsKPI:2026-10', 'castsKPI:2026-11', 'customerDetail:other']) setCache(key, 'old')
  invalidateAllCastPages()
  invalidateAllCastsKPI()
  for (const key of ['castPage:cast-a:2026-10', 'castPage:cast-a:2026-11', 'castPage:cast-b:2026-11', 'castsKPI:2026-10', 'castsKPI:2026-11']) assert.equal(getCache(key), null)
  assert.equal(getCache('customerDetail:other'), 'old')
})

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
