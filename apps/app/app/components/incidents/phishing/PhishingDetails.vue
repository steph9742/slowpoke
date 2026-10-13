<script setup lang="ts">
import type { IncidentGetData } from '~/types/elysia'
import { inject } from 'vue'
import IdentitiesList from './IdentitiesList.vue'
import PhishingTimeline from './PhishingTimeline.vue'
import { affiliationLabel } from '~/types/affiliation'
import { composanteLabel } from '~/types/incident'

const props = defineProps<{
  phishingDetails: NonNullable<IncidentGetData['phishingDetails']>
  affectedUsers?: IncidentGetData['affectedUsers']
}>()

const detectedAtLabel = computed(() => {
  if (!props.phishingDetails.detectedAt) return null
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'long', timeStyle: 'short' }).format(new Date(props.phishingDetails.detectedAt))
})

const users = computed(() => props.affectedUsers ?? [])

// Navigation vers l'onglet Utilisateurs (fournie par IncidentTabContent)
const setIncidentTab = inject<(tab: string) => void>('setIncidentTab', () => {})
</script>

<template>
  <div class="mt-6 space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div class="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
        <Icon
          name="lucide:fish-symbol"
          class="size-5"
        />
      </div>
      <UITitle
        level="2"
        class="mb-0! text-xl font-bold tracking-tight"
      >
        Analyse de phishing
      </UITitle>
    </div>

    <p
      v-if="detectedAtLabel"
      class="text-sm text-zinc-600 dark:text-zinc-400"
    >
      Détecté le <span class="font-medium">{{ detectedAtLabel }}</span>.
    </p>

    <div
      v-if="users.length"
      class="space-y-6 sm:space-y-8"
    >
      <div
        v-for="u in users"
        :key="u.id"
        class="space-y-6 rounded-2xl border border-primary-200/40 bg-background/20 p-3 sm:p-6 shadow-sm"
      >
        <section class="space-y-4">
          <UITitle
            level="3"
            class="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
          >
            <Icon
              name="lucide:user-search"
              class="size-4 text-emerald-500"
            /> Utilisateur concerné
          </UITitle>
          <div class="rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md overflow-hidden shadow-sm">
            <div class="px-4 py-3 sm:px-5 sm:py-4 border-b border-primary-200/40 bg-primary-50/20 flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100/50 text-primary-600 border border-primary-200/60 ring-2 ring-primary-50/30">
                <Icon
                  name="lucide:user"
                  class="size-5"
                />
              </div>
              <h3 class="font-medium text-text">
                {{ u.fullName || 'Utilisateur inconnu' }}
              </h3>
            </div>
            <div class="p-3 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div class="space-y-1">
                <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600">Adresse e-mail</span>
                <div class="flex items-center gap-2 min-w-0">
                  <Icon
                    name="lucide:mail"
                    class="size-4 shrink-0 text-primary-400"
                  />
                  <span class="text-sm font-mono text-text/90 break-all min-w-0">{{ u.email || 'N/D' }}</span>
                </div>
              </div>
              <div class="space-y-1">
                <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600">Affiliation</span>
                <div class="flex items-center gap-2 min-w-0">
                  <Icon
                    name="lucide:briefcase"
                    class="size-4 shrink-0 text-primary-400"
                  />
                  <span class="text-sm text-text/90 break-words min-w-0">{{ affiliationLabel(u.affiliation) || 'Inconnue' }}</span>
                </div>
              </div>
              <div class="space-y-1 md:col-span-2">
                <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600">Composante / Département</span>
                <div class="flex items-center gap-2 min-w-0">
                  <Icon
                    name="lucide:building-2"
                    class="size-4 shrink-0 text-primary-400"
                  />
                  <span class="text-sm text-text/90 break-words min-w-0">{{ composanteLabel(u.composante) || 'Non spécifié' }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-4">
          <UITitle
            level="3"
            class="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
          >
            <Icon
              name="lucide:venetian-mask"
              class="size-4 text-purple-500"
            /> Identités compromises / utilisées
          </UITitle>
          <IdentitiesList :identities="u.phishingIdentities" />
        </section>

        <section class="space-y-6">
          <UITitle
            level="3"
            class="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
          >
            <Icon
              name="lucide:activity-square"
              class="size-4 text-rose-500"
            /> Logs d'activité &amp; actions
          </UITitle>
          <PhishingTimeline :logs="u.connectionLogs" />
        </section>
      </div>
    </div>
    <p
      v-else
      class="text-sm text-zinc-400 italic"
    >
      Aucun utilisateur concerné pour le moment.
    </p>

    <p class="text-xs text-zinc-400 flex items-center gap-1.5">
      <Icon
        name="lucide:info"
        class="size-3.5 shrink-0"
      />
      <span>
        Ajout, modification et suppression dans l'onglet
        <button
          type="button"
          class="font-semibold text-primary-600 hover:underline"
          @click="setIncidentTab('users')"
        >Utilisateurs</button>.
      </span>
    </p>
  </div>
</template>
