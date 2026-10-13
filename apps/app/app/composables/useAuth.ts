import type { UserWithRole } from 'better-auth/plugins/admin'
import type { authClient } from '~/lib/auth-client'

type UserSession = ReturnType<typeof authClient>['$Infer']['Session']
type SessionResponse = {
  user: UserWithRole
  session: UserSession
} | null

export const useSSRAuth = async () => {
  const baseURL = useRuntimeConfig().public.serverBaseUrl

  const { data: session } = await useFetch<SessionResponse>('/api/auth/get-session', {
    credentials: 'include',
    baseURL,
    headers: useRequestHeaders(['cookie']),
  })

  return session
}
