import { createAuthClient } from 'better-auth/vue'
import { serviceAccountsClient } from '@slowpoke/better-auth-plugins/service-accounts'
import { adminClient, genericOAuthClient } from 'better-auth/client/plugins'

export const authClient = () => {
  const baseURL = useRuntimeConfig().public.serverBaseUrl

  return createAuthClient({
    baseURL,
    plugins: [
      serviceAccountsClient(),
      genericOAuthClient(),
      adminClient(),
    ],
  })
}
