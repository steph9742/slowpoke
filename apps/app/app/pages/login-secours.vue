<script setup lang="ts">
import { ref } from 'vue'
import { UIButton } from '@slowpoke/ui'
import { authClient } from '~/lib/auth-client'
import { Icon } from '#components'

// CONNEXION DE SECOURS — e-mail et mot de passe, quand le SSO ne répond pas.
//
// Sans elle, une panne d'annuaire ou un claim `groups` absent enferment tout le monde dehors,
// administrateurs compris — personne ne peut plus corriger quoi que ce soit.
//
// Séparée de /login à dessein : un formulaire de mot de passe affiché en permanence invite à
// contourner l'annuaire au quotidien. Son usage est TRACÉ au journal d'audit.
definePageMeta({
  layout: 'auth',
})

const eden = useEden()

// Si la connexion par mot de passe est fermée (AUTH_SECOURS=false), la page n'a pas lieu
// d'être : on renvoie vers la connexion normale plutôt que d'offrir un formulaire dont
// chaque tentative sera refusée.
const { data: authConfig } = await useFetch<{ sso: boolean, secours: boolean }>('/api/auth-config', {
  baseURL: useRuntimeConfig().public.serverBaseUrl,
  default: () => ({ sso: true, secours: true }),
})
if (authConfig.value && !authConfig.value.secours) {
  await navigateTo('/login', { replace: true })
}

const email = ref('')
const password = ref('')
const enCours = ref(false)
const erreur = ref('')

const seConnecter = async () => {
  if (enCours.value) return
  enCours.value = true
  erreur.value = ''

  const { error } = await authClient().signIn.email({ email: email.value, password: password.value })
  if (error) {
    erreur.value = error.message ?? 'Identifiants incorrects.'
    enCours.value = false
    return
  }

  // Trace de l'usage. La route exige une session : elle n'est donc appelable qu'après une
  // connexion réussie, et pas par un visiteur anonyme. En cas d'échec de l'écriture, on
  // n'empêche pas la connexion — le secours doit fonctionner même dégradé.
  try {
    await eden.api.secours.trace.post()
  }
  catch { /* la traçabilité ne doit jamais bloquer la reprise en main */ }

  // Rechargement COMPLET, pas une navigation interne : la session est lue par `useFetch`
  // (useSSRAuth), dont la réponse est mise en cache. Une navigation SPA relirait « aucune
  // session » et le middleware nous renverrait aussitôt sur /login. Le retour du SSO fait
  // de même — il repasse par un chargement de page entier.
  window.location.href = '/'
}

useHead({ title: 'Connexion de secours' })
</script>

<template>
  <section class="relative w-full max-w-md overflow-hidden rounded-3xl border border-gray-200/80 bg-white/85 p-8 shadow-xl shadow-gray-400/15 backdrop-blur-md sm:p-10">
    <div class="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" />

    <div class="relative flex flex-col gap-6">
      <header class="space-y-2">
        <h1 class="font-sans text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
          Connexion de secours
        </h1>
        <p class="text-sm text-gray-600">
          À utiliser uniquement lorsque l'authentification unique est indisponible.
        </p>
      </header>

      <div class="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
        <Icon
          name="lucide:shield-alert"
          class="mt-0.5 size-4 shrink-0"
        />
        <p>
          Cette connexion contourne l'annuaire de l'établissement. <strong>Son usage est enregistré</strong>
          au journal d'audit. Si le SSO fonctionne, passez par la
          <NuxtLink
            to="/login"
            class="underline underline-offset-2"
          >connexion habituelle</NuxtLink>.
        </p>
      </div>

      <form
        class="flex flex-col gap-4"
        @submit.prevent="seConnecter"
      >
        <div class="flex flex-col gap-1.5">
          <label
            for="email-secours"
            class="text-sm font-medium text-gray-700"
          >E-mail</label>
          <input
            id="email-secours"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          >
        </div>
        <div class="flex flex-col gap-1.5">
          <label
            for="mdp-secours"
            class="text-sm font-medium text-gray-700"
          >Mot de passe</label>
          <input
            id="mdp-secours"
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          >
        </div>

        <UIButton
          type="submit"
          class="w-full"
          size="lg"
          :disabled="enCours"
        >
          <Icon
            :name="enCours ? 'lucide:loader-circle' : 'lucide:key-round'"
            class="size-5"
            :class="enCours ? 'animate-spin' : ''"
          />
          {{ enCours ? 'Connexion…' : 'Se connecter' }}
        </UIButton>
      </form>

      <p
        v-if="erreur"
        class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ erreur }}
      </p>

      <p class="text-center text-xs text-gray-400">
        Le mot de passe du compte de secours est affiché <strong>une seule fois</strong>, à l'installation.
        Il se trouve normalement dans le coffre de l'équipe.
      </p>
    </div>
  </section>
</template>
