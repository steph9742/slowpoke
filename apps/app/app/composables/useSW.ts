export const useSW = () => {
  const eden = useEden()
  const isSupported = ref(false)

  onMounted(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      isSupported.value = true
    }
  })

  const isUserSubscribed = async () => {
    if (!isSupported.value) {
      return false
    }

    const registration = await navigator.serviceWorker.ready
    if (!registration.pushManager) {
      return false
    }
    const subscription = await registration.pushManager.getSubscription()
    return {
      onClient: !!subscription,
      onServer: !!(await eden.api.notifications['is-subscribed'].get()).data?.isSubscribed,
    }
  }

  return {
    isSupported,
    isUserSubscribed,
  }
}
