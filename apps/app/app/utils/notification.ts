export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function subscribeUserToPush() {
  const eden = useEden()
  const registration = await navigator.serviceWorker.ready

  if (!registration.pushManager) {
    throw new Error('Push manager not available')
  }

  if (await registration.pushManager.getSubscription()) {
    return
  }

  const { data: pk } = await eden.api.notifications['public-key'].get()

  if (!pk) {
    throw new Error('No VAPID public key found')
  }

  const publicKey = urlBase64ToUint8Array(pk)

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: publicKey,
  })

  await eden.api.notifications.activate.post({
    subscription: subscription.toJSON() as { endpoint: string, keys: { p256dh: string, auth: string } },
  })
}

export async function subscribeToIncident(incidentId: string) {
  const eden = useEden()
  return await eden.api.notifications['subscribe-to']({ incidentId }).post()
}

export async function removeSubscription() {
  const eden = useEden()
  const registration = await navigator.serviceWorker.ready

  if (!registration.pushManager) {
    throw new Error('Push manager not available')
  }

  const subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    return new Error('No subscription found')
  }

  await eden.api.notifications.unsubscribe.delete({}, { query: { endpoint: subscription.endpoint } })

  await subscription.unsubscribe()
}
