// 通知専用。ページ・顧客データをキャッシュせず、fetchも横取りしない。
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

function localNotificationUrl(value) {
  try {
    const url = new URL(value || '/announcements', self.location.origin)
    if (url.origin === self.location.origin && url.protocol === 'https:') return url.href
  } catch { /* 外部・不正な遷移先は使わない */ }
  return self.location.origin + '/announcements'
}

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* 必ず見える通知を出す */ }
  if (!data || typeof data !== 'object') data = {}
  event.waitUntil(self.registration.showNotification(
    typeof data.title === 'string' ? data.title : 'Éclatのお知らせ', {
      body: typeof data.body === 'string' ? data.body : '新しいお知らせがあります。',
      icon: '/icon-192.png', badge: '/icon-192.png',
      tag: typeof data.tag === 'string' ? data.tag : 'eclat-announcement',
      data: { url: localNotificationUrl(data.url) },
    },
  ))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = localNotificationUrl(event.notification.data?.url)
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const current = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (current) {
      try {
        const navigated = await current.navigate(url)
        if (navigated) { await navigated.focus(); return }
      } catch { /* 既存タブが終了中なら新しいタブで開く */ }
    }
    await self.clients.openWindow(url)
  })())
})
