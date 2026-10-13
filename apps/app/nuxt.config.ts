import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/fonts', '@nuxt/icon', '@vueuse/nuxt'/* , '@vite-pwa/nuxt' */],
  devtools: { enabled: true },
  css: ['~/assets/css/tailwind.css'],
  runtimeConfig: {
    public: {
      serverBaseUrl: process.env.NUXT_PUBLIC_SERVER_BASE_URL,
    },
  },
  compatibilityDate: '2025-07-15',
  vite: {
    plugins: [
      tailwindcss(),
    ],
    optimizeDeps: {
      include: ['better-auth/client', 'better-auth/vue', 'better-auth/client/plugins', 'better-auth', 'better-auth/api', 'better-auth/crypto', 'zod', 'better-auth/adapters', '@paralleldrive/cuid2'],
    },
  },
  eslint: {
    config: {
      stylistic: true,
    },
  },
  icon: {
    mode: 'svg',
    serverBundle: {
      collections: ['lucide'],
    },
    localApiEndpoint: '/_nuxt-icon',
  },
  /* pwa: {
    manifest: false,
    strategies: 'injectManifest',
    injectRegister: false,
    injectManifest: {
      injectionPoint: undefined,
    },
    filename: 'sw.js',
    srcDir: 'service-worker',
    devOptions: {
      enabled: true,
      type: 'classic',
    },
  }, */
})
