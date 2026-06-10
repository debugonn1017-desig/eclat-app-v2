// Éclat Web Push Service Worker
//   - push イベントで通知を表示
//   - notificationclick でクリック時に URL を開く

self.addEventListener('install', (event) => {
  // 即座に有効化
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Éclat', body: event.data.text() }
  }

  const title = payload.title || 'Éclat'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.ico',
    badge: payload.badge || '/favicon.ico',
    data: {
      url: payload.url || '/home',
      sentAt: payload.sentAt || Date.now(),
    },
    tag: payload.tag,                   // 同じタグなら上書き
    requireInteraction: payload.requireInteraction === true,
    silent: payload.silent === true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/home'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 既に開いてるタブがあればフォーカス + ナビゲート
        for (const client of clientList) {
          if ('focus' in client && 'navigate' in client) {
            client.focus()
            return client.navigate(url)
          }
        }
        // なければ新規タブ
        if (self.clients.openWindow) {
          return self.clients.openWindow(url)
        }
      })
  )
})
