<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { UIButton } from '@slowpoke/ui'
import { Icon } from '#components'

definePageMeta({
  layout: 'auth',
})

const isLoading = ref(false)
const errorMessage = ref('')

// Voies de connexion réellement ouvertes côté serveur : inutile de proposer un secours
// qui sera refusé, ni de le masquer alors qu'il fonctionne. En cas d'échec de l'appel,
// on suppose le secours ouvert — mieux vaut un lien de trop qu'une porte introuvable.
const { data: authConfig } = await useFetch<{ sso: boolean, ssoLibelle: string, secours: boolean }>('/api/auth-config', {
  baseURL: useRuntimeConfig().public.serverBaseUrl,
  default: () => ({ sso: true, ssoLibelle: 'Connexion SSO', secours: true }),
})

const libelleSso = computed(() => authConfig.value?.ssoLibelle || 'Connexion SSO')

const signIn = async () => {
  if (isLoading.value) return

  errorMessage.value = ''
  isLoading.value = true

  try {
    await authClient().signIn.oauth2({
      providerId: 'oidc',
      callbackURL: new URL('/', window.location.origin).href,
    })
  }
  catch {
    errorMessage.value = 'Impossible de lancer la connexion pour le moment. Merci de reessayer.'
    isLoading.value = false
  }
}

useHead({ title: 'Connexion' })
</script>

<template>
  <section class="relative w-full max-w-md overflow-hidden rounded-3xl border border-gray-200/80 bg-white/85 p-8 shadow-xl shadow-gray-400/15 backdrop-blur-md sm:p-10">
    <div class="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary-400/20 blur-3xl" />
    <div class="absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-secondary-300/25 blur-3xl" />

    <div class="relative flex flex-col gap-7">
      <header class="space-y-3">
        <h1 class="font-sans text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          Connexion
        </h1>
      </header>

      <UIButton
        class="w-full"
        size="lg"
        :disabled="isLoading"
        @click="signIn"
      >
        <Icon
          v-if="isLoading"
          name="lucide:loader-circle"
          class="size-5 animate-spin"
        />
        <Icon
          v-else
          name="lucide:log-in"
          class="size-5"
        />
        {{ isLoading ? 'Redirection en cours...' : libelleSso }}
      </UIButton>

      <p
        v-if="errorMessage"
        class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ errorMessage }}
      </p>

      <!-- Lien discret mais PRÉSENT. Le cacher n'apporterait aucune sécurité — l'adresse
           est dans le code public — et rendrait la page introuvable au seul moment où
           elle sert : quand l'annuaire est en panne et qu'on cherche vite. -->
      <NuxtLink
        v-if="authConfig?.secours"
        to="/login-secours"
        class="text-center text-xs text-gray-400 underline underline-offset-2 transition-colors hover:text-gray-600"
      >
        Le SSO est indisponible ? Connexion de secours
      </NuxtLink>
    </div>
  </section>
</template>
