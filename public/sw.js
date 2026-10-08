// v0.3.107: 通知機能を廃止。既存の通知専用Workerも更新時に終了する。
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const subscription = await self.registration.pushManager.getSubscription()
    if (subscription) await subscription.unsubscribe()
    const notifications = await self.registration.getNotifications()
    notifications.forEach(notification => notification.close())
    await self.registration.unregister()
  })())
})
