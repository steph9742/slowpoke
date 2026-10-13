import { createEden } from '@slowpoke/eden'

const useEden = () => {
  const headers = useRequestHeaders()
  const baseURL = useRuntimeConfig().public.serverBaseUrl

  const eden = createEden(baseURL, headers)

  return eden
}

export default useEden
