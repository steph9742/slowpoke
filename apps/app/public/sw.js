// Service worker des notifications push Slowpoke.
// Servi à /sw.js et enregistré par le plugin client app/plugins/sw.client.ts.

// Active la nouvelle version tout de suite (sinon l'ancien SW reste actif et rend des notifs vides).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', function (event) {
  let payload

  if (event.data) {
    const payloadText = event.data.text()

    try {
      payload = JSON.parse(payloadText)
    }
    catch {
      payload = { message: payloadText }
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload?.title || 'Slowpoke', {
      body: payload?.body ?? payload?.message,
      data: {
        link: payload?.link || '/',
      },
    }),
  )
})

self.addEventListener('notificationclick', function (event) {
  const link = event.notification.data?.link || '/'

  event.notification.close()
  event.waitUntil(self.clients.openWindow(link))
})
