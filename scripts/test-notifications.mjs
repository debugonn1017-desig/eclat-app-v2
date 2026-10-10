// 固定データとモックだけで検証。実DB・Pushサービス・ブラウザ許可には触れない。
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const exports = {}
  vm.runInNewContext(`(function(require, exports) { ${code}\n})`, { Buffer, URL, Response, Request, AbortSignal, Error, console, ...globals }, { filename: file })(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    throw new Error(`Unexpected import: ${name}`)
  }, exports)
  return exports
}
const validation = load('lib/pushValidation.ts')
const reads = load('lib/announcementReadState.ts')
const endpoint = 'https://web.push.apple.com/test-device'
const point = Buffer.alloc(65, 1); point[0] = 4
const keys = { p256dh: point.toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') }

test('既読キーは本人別・数値IDも正規化。更新したお知らせは新しい既読トークン', () => {
  assert.notEqual(reads.announcementReadKey('cast-a'), reads.announcementReadKey('cast-b'))
  assert.equal(reads.announcementReadToken({ id: 12, updated_at: 'a' }), reads.announcementReadToken({ id: '12', updated_at: 'a' }))
  assert.notEqual(reads.announcementReadToken({ id: '12', updated_at: 'a' }), reads.announcementReadToken({ id: '12', updated_at: 'b' }))
  assert.deepEqual([...reads.parseAnnouncementReads('[null,12,"12:a"]')], ['12:a'])
  assert.equal(reads.parseAnnouncementReads('invalid json').size, 0)
  assert.equal(reads.parseAnnouncementReads('{}').size, 0)
})
test('既読保存は直近500件に制限', () => {
  const result = reads.parseAnnouncementReads(JSON.stringify(Array.from({ length: 600 }, (_, n) => String(n))))
  assert.equal(result.size, 500)
  assert.ok(!result.has('0') && result.has('599'))
})
test('Apple/Google/Mozilla/WindowsのHTTPSだけ許可。ローカル・偽ドメイン・認証情報・不正鍵は拒否', () => {
  for (const url of [endpoint, 'https://fcm.googleapis.com/fcm/send/device', 'https://updates.push.services.mozilla.com/wpush/v2/device', 'https://wns.notify.windows.com/device']) assert.ok(validation.isSafePushEndpoint(url))
  for (const url of ['http://web.push.apple.com/device', 'https://127.0.0.1/', 'https://localhost/', 'https://web.push.apple.com.evil.test/x', 'https://evil.test@web.push.apple.com/x', 'https://web.push.apple.com:8443/x', 'https://web.push.apple.com/x#data', 'garbage', null]) assert.equal(validation.isSafePushEndpoint(url), false)
  assert.ok(validation.validPushKeys(keys))
  for (const input of [null, {}, { ...keys, auth: 'abc' }, { ...keys, p256dh: Buffer.alloc(65).toString('base64url') }]) assert.equal(validation.validPushKeys(input), false)
})

function api(file, { profile = { id: 'me', role: 'cast' }, configured = true, permissionError = null,
  announcement = { id: '12', created_by: 'me', is_active: true, target_type: 'all', title: '固定のお知らせ', target_cast_ids: [] }, canManage = false, dbError = null, delivered = 1 } = {}) {
  const calls = []
  let adminCreated = 0
  const query = table => {
    const builder = {
      select(...args) { calls.push(['select', table, ...args]); return this },
      eq(...args) { calls.push(['eq', table, ...args]); return this },
      neq(...args) { calls.push(['neq', table, ...args]); return this },
      in(...args) { calls.push(['in', table, ...args]); return this },
      order(...args) { calls.push(['order', table, ...args]); return this },
      delete() { calls.push(['delete', table]); return this },
      upsert(...args) { calls.push(['upsert', table, ...args]); return this },
      maybeSingle() { return Promise.resolve({ data: announcement, error: dbError }) },
      range(...args) { calls.push(['range', table, ...args]); return Promise.resolve({ data: [{ id: 'recipient' }], error: dbError }) },
      then(resolve, reject) { return Promise.resolve({ data: [{ endpoint }], error: dbError }).then(resolve, reject) },
    }
    return builder
  }
  const result = load(file, {
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
    '@/lib/auth': { getCurrentProfile: async () => profile,
      requirePermission: async permission => { calls.push(['permission', permission]); if (permissionError) throw new Error(permissionError); return profile },
      checkPermission: async () => canManage },
    '@/lib/supabase/server': { createClient: async () => ({ from: query }) },
    '@/lib/supabase/admin': { createAdminClient: () => { adminCreated++; return { from: query } } },
    '@/lib/pushValidation': validation,
    '@/lib/push': { isPushConfigured: () => configured,
      sendPushToUsers: async (...args) => { calls.push(['send', ...args.slice(1)]); return { delivered, failed: 0 } } },
  })
  return { calls, adminCreated: () => adminCreated,
    post: body => result.POST(new Request('https://example.test/api/push', { method: 'POST', body: JSON.stringify(body) })),
    get: result.GET }
}
test('購読登録は未認証を401。入力のuser_idを使わず認証本人だけに保存', async () => {
  const denied = api('app/api/push/subscribe/route.ts', { profile: null })
  assert.equal((await denied.post({ endpoint, keys })).status, 401)
  assert.equal(denied.adminCreated(), 0)
  const env = api('app/api/push/subscribe/route.ts')
  assert.equal((await env.post({ endpoint, keys, user_id: 'other', userAgent: 'x'.repeat(600) })).status, 200)
  const row = env.calls.find(call => call[0] === 'upsert')[2]
  assert.equal(row.user_id, 'me')
  assert.equal(row.user_agent.length, 512)
  assert.ok(env.calls.some(call => call[0] === 'neq' && call[2] === 'user_id' && call[3] === 'me'))
  assert.ok(env.calls.some(call => call[0] === 'eq' && call[2] === 'p256dh' && call[3] === keys.p256dh))
})
test('通知設定取得は本人のendpointだけ。no-store・鍵なし・未設定とDB失敗は成功扱いしない', async () => {
  const env = api('app/api/push/subscribe/route.ts')
  const response = await env.get()
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.ok(env.calls.some(call => call[0] === 'eq' && call[2] === 'user_id' && call[3] === 'me'))
  assert.deepEqual((await response.json()).endpoints, [endpoint])
  assert.ok(!env.calls.some(call => call[0] === 'select' && call.includes('*')))
  assert.equal((await api('app/api/push/subscribe/route.ts', { configured: false }).post({ endpoint, keys })).status, 503)
  assert.equal((await api('app/api/push/subscribe/route.ts', { dbError: { message: 'private detail' } }).post({ endpoint, keys })).status, 503)
  assert.equal((await api('app/api/push/subscribe/route.ts').post({ endpoint: 'https://localhost', keys })).status, 400)
})
test('解除は本人＋指定端末だけ。端末なしの全解除・他ユーザー解除は不可', async () => {
  const env = api('app/api/push/unsubscribe/route.ts')
  assert.equal((await env.post({ endpoint, user_id: 'other' })).status, 200)
  assert.ok(env.calls.some(call => call[0] === 'eq' && call[2] === 'user_id' && call[3] === 'me'))
  assert.ok(env.calls.some(call => call[0] === 'eq' && call[2] === 'endpoint' && call[3] === endpoint))
  assert.equal((await env.post({})).status, 400)
  assert.equal((await api('app/api/push/unsubscribe/route.ts', { profile: null }).post({ endpoint })).status, 401)
})
test('テスト通知は本人・指定端末のみ。0配信を成功と表示しない', async () => {
  const env = api('app/api/push/test/route.ts')
  assert.equal((await env.post({ endpoint, userIds: ['other'] })).status, 200)
  const send = env.calls.find(call => call[0] === 'send')
  assert.deepEqual([...send[1]], ['me'])
  assert.equal(send[3], endpoint)
  const response = await api('app/api/push/test/route.ts', { delivered: 0 }).post({ endpoint })
  assert.equal((await response.json()).ok, false)
})
test('店舗お知らせ送信は二つの権限が必要。権限なしはDB・配信に触れない', async () => {
  const env = api('app/api/push/announcement/route.ts', { permissionError: 'FORBIDDEN' })
  assert.equal((await env.post({ id: 12 })).status, 403)
  assert.equal(env.adminCreated(), 0)
  const allowed = api('app/api/push/announcement/route.ts')
  await allowed.post({ id: 12 })
  assert.deepEqual(allowed.calls.filter(call => call[0] === 'permission').map(call => call[1]), ['通知.送信', 'お知らせ.投稿'])
})
test('個人宛の受信者・タイトルは保存済みのお知らせから。入力の本文や宛先は無視', async () => {
  const id = '12345678-1234-1234-1234-123456789abc'
  const env = api('app/api/push/announcement/route.ts', { announcement: { id: '12', created_by: 'me', is_active: true, target_type: 'individual', target_cast_ids: [id], title: '正しいタイトル', body: 'ロック画面に出さない本文' } })
  assert.equal((await env.post({ id: 12, title: '偽タイトル', body: '偽本文', userIds: ['other'], url: 'https://evil.test' })).status, 200)
  assert.ok(env.calls.some(call => call[0] === 'in' && call[2] === 'id' && call[3][0] === id))
  assert.ok(env.calls.some(call => call[0] === 'eq' && call[2] === 'is_active' && call[3] === true))
  assert.ok(env.calls.some(call => call[0] === 'eq' && call[2] === 'role' && call[3] === 'cast'))
  assert.ok(env.calls.some(call => call[0] === 'order' && call[1] === 'profiles' && call[2] === 'id' && call[3].ascending === true))
  const payload = env.calls.find(call => call[0] === 'send')[2]
  assert.equal(payload.title, 'Éclat｜正しいタイトル')
  assert.equal(payload.url, '/announcements')
  assert.ok(!payload.body.includes('ロック画面に出さない本文'))
})
test('他人の投稿・無効な投稿は配信不可。管理権限による代理配信のみ可', async () => {
  const announcement = { id: '12', created_by: 'other', is_active: true, target_type: 'all', title: 'お知らせ' }
  const env = api('app/api/push/announcement/route.ts', { announcement })
  assert.equal((await env.post({ id: 12 })).status, 403)
  assert.equal(env.adminCreated(), 0)
  assert.equal((await api('app/api/push/announcement/route.ts', { announcement, canManage: true }).post({ id: 12 })).status, 200)
  assert.equal((await api('app/api/push/announcement/route.ts', { announcement: { ...announcement, is_active: false } }).post({ id: 12 })).status, 404)
})

function pushClient({ responseOk = true, unsubscribeOk = true, fetchFails = false } = {}) {
  const calls = []
  const subscription = { endpoint, unsubscribe: async () => { calls.push('unsubscribe'); return unsubscribeOk } }
  const client = load('lib/pushClient.ts', {}, {
    navigator: { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }) } },
    fetch: async () => { calls.push('server'); if (fetchFails) throw new Error('network'); return new Response(JSON.stringify({ error: '保存失敗' }), { status: responseOk ? 200 : 503 }) },
  })
  return { client, calls }
}
test('解除API失敗は成功表示しない。サーバー解除→端末解除の順序', async () => {
  const failed = pushClient({ responseOk: false })
  await assert.rejects(failed.client.removeCurrentPushSubscription(), /保存失敗/)
  assert.deepEqual(failed.calls, ['server'])
  const good = pushClient()
  await good.client.removeCurrentPushSubscription()
  assert.deepEqual(good.calls, ['server', 'unsubscribe'])
  await assert.rejects(pushClient({ unsubscribeOk: false }).client.removeCurrentPushSubscription(), /再度/)
})
test('ログアウトはサーバー通信失敗でも端末解除する', async () => {
  const env = pushClient({ fetchFails: true })
  await assert.rejects(env.client.stopPushOnLogout(), /network/)
  assert.deepEqual(env.calls, ['server', 'unsubscribe'])
})

function pushUi({ permission = 'granted', saveFails = false } = {}) {
  const calls = [], states = []
  let index = 0
  const defaults = [true, 'default', true, false, true, false, null, 0]
  const Component = load('components/PushSubscriptionButton.tsx', {
    react: { useEffect: () => {}, useRef: () => ({ current: false }), useState: () => { const i = index++; return [defaults[i], value => states.push([i, value])] } },
    'react/jsx-runtime': jsxRuntime,
    'next/link': { __esModule: true, default: 'a' },
    '@/lib/colors': { C: { white: '#fff', border: '#ddd', pink: '#faa', dark: '#333' } },
    '@/lib/pushClient': { currentPushSubscription: async () => null, readyPushWorker: async () => {
      calls.push('worker'); return { pushManager: { getSubscription: async () => ({ toJSON: () => ({ endpoint, keys }) }) } }
    }, vapidApplicationKey: () => new ArrayBuffer(0), pushRequest: async () => {
      calls.push('save'); if (saveFails) throw new Error('保存失敗'); return { ok: true, userId: 'me' }
    } },
  }, { process: { env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'fixture-public' } }, navigator: { userAgent: 'fixture' },
    Notification: { permission: 'default', requestPermission: async () => { calls.push('permission'); return permission } } }).default
  const element = Component({ accountId: 'me' })
  const find = element => {
    if (!element || typeof element !== 'object') return null
    if (element.type === 'button' && element.props.onClick && !element.props.disabled) return element
    for (const child of React.Children.toArray(element.props?.children)) { const match = find(child); if (match) return match }
    return null
  }
  return { calls, states, click: () => find(element).props.onClick() }
}
test('iPhoneの通知許可をWorker準備前に直接要求。保存成功時だけオンにする', async () => {
  const good = pushUi()
  await good.click()
  assert.deepEqual(good.calls, ['permission', 'worker', 'save'])
  assert.ok(good.states.some(([i, value]) => i === 3 && value === true))
  const failed = pushUi({ saveFails: true })
  await failed.click()
  assert.ok(!failed.states.some(([i, value]) => i === 3 && value === true))
  const denied = pushUi({ permission: 'denied' })
  await denied.click()
  assert.deepEqual(denied.calls, ['permission'])
})
test('通知設定の連打で二重登録しない', async () => {
  const env = pushUi()
  await Promise.all([env.click(), env.click()])
  assert.deepEqual(env.calls, ['permission', 'worker', 'save'])
})

function worker() {
  const events = {}, calls = []
  const self = { location: { origin: 'https://example.test' }, addEventListener: (name, fn) => { events[name] = fn },
    registration: { showNotification: async (...args) => { calls.push(args) } },
    clients: { matchAll: async () => [], openWindow: async url => calls.push(['open', url]) } }
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), { self, URL })
  return { events, calls, self }
}
test('Service WorkerはPushを表示し、外部URLを開かず、退役処理やページキャッシュを復活させない', async () => {
  const env = worker()
  let pending
  env.events.push({ data: { json: () => ({ title: '通知', body: 'お知らせ', url: 'https://evil.test/x' }) }, waitUntil: value => { pending = value } })
  await pending
  assert.equal(env.calls[0][1].data.url, 'https://example.test/announcements')
  env.events.notificationclick({ notification: { close() {}, data: { url: 'javascript:alert(1)' } }, waitUntil: value => { pending = value } })
  await pending
  assert.deepEqual(env.calls[1], ['open', 'https://example.test/announcements'])
  assert.ok(!env.events.fetch)
  assert.doesNotMatch(fs.readFileSync('public/sw.js', 'utf8'), /registration\.unregister|subscription\.unsubscribe/)
})
test('壊れたPush payloadでもユーザーに見える通知を表示', async () => {
  const env = worker()
  let pending
  env.events.push({ data: { json: () => { throw new Error('invalid') } }, waitUntil: value => { pending = value } })
  await pending
  assert.equal(env.calls[0][0], 'Éclatのお知らせ')
})
test('小型ベルは32px・9+バッジ。最新5件のみ。開くだけで隠れたお知らせを既読にしない', () => {
  const Bell = load('components/NotificationBell.tsx', {
    react: React, 'react/jsx-runtime': jsxRuntime, 'next/link': { __esModule: true, default: props => { const attributes = { ...props }; delete attributes.prefetch; return React.createElement('a', attributes) } },
    '@/lib/colors': load('lib/colors.ts'), '@/hooks/useAnnouncements': { useAnnouncements: () => ({
      userId: 'me', loaded: true, error: null, unreadCount: 12, isUnread: () => true, markRead() {}, refresh() {},
      items: Array.from({ length: 12 }, (_, n) => ({ id: String(n), title: '通知' + n, body: '本文', created_at: '2026-10-10', priority: 'normal', target_type: 'all' })),
    }) },
  }).default
  const html = renderToStaticMarkup(React.createElement(Bell))
  assert.match(html, /width:32px;height:32px/)
  assert.match(html, /9\+/)
  assert.match(html, /通知4/)
  assert.doesNotMatch(html, /通知5/)
  assert.match(html, /aria-haspopup="dialog"/)
  assert.match(html, /表示中を既読にする/)
})
test('携帯設定は成績最下部・本人ID。廃止済みの追いかけ/自動配信/汎用送信は停止を維持', () => {
  const source = fs.readFileSync('components/CastWorkspace.tsx', 'utf8')
  const start = source.indexOf('<Link href="/manual"')
  const block = source.slice(start, source.indexOf('{/* v0.3.49-E: 通知トースト */}', start))
  assert.match(block, /activeTab === 'KPI'/)
  assert.match(block, /accountId={viewerUserId}/)
  for (const file of ['app/api/push/send/route.ts', 'app/api/auto-push/check/route.ts', 'app/api/auto-push/settings/route.ts', 'app/api/cron/follow-up-reminders/route.ts']) assert.match(fs.readFileSync(file, 'utf8'), /410/)
  const admin = fs.readFileSync('app/admin/casts/page.tsx', 'utf8')
  assert.match(admin, /useState\(false\)/)
  assert.match(admin, /!editingAnnouncementId && hasPerm\('通知.送信'\)/)
})
