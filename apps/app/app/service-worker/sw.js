// Register event listener for the 'push' event.
self.addEventListener('push', function (event) {
  let payload

  if (event.data) {
    const payloadText = event.data.text()

    try {
      const jsonpayload = JSON.parse(payloadText)
      payload = jsonpayload
    }
    catch {
      console.error('Failed to parse push event data as JSON:', payloadText)
      payload = { message: payloadText }
    }
  }

  // Keep the service worker alive until the notification is created.
  event.waitUntil(
    self.registration.showNotification('Slowpoke', {
      body: payload?.message,
      data: {
        link: payload?.link || '/',
      },
    }),
  )
})

self.addEventListener('notificationclick', function (event) {
  const link = event.notification.data?.link || '/'

  event.notification.close()
  event.waitUntil(
    // eslint-disable-next-line no-undef
    clients.openWindow(link),
  )
})
