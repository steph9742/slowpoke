<script setup lang="ts">
import type { IncidentGetData } from '~/types/elysia'
import { UITitle } from '#components'
import { computed } from 'vue'
import DetailChips from '../DetailChips.vue'
import MetadataGrid from '../MetadataGrid.vue'

const props = defineProps<{
  databreachDetails: NonNullable<IncidentGetData['dataBreachDetails']>
}>()

const detectedAtLabel = computed(() => {
  if (!props.databreachDetails.detectedAt) return null
  return Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'long', timeStyle: 'short' }).format(new Date(props.databreachDetails.detectedAt))
})
</script>

<template>
  <div class="mt-6 space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div class="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400">
        <Icon
          name="lucide:database-zap"
          class="size-5"
        />
      </div>
      <UITitle
        level="2"
        class="mb-0! text-xl font-bold tracking-tight"
      >
        Analyse de la fuite de données
      </UITitle>
    </div>

    <p
      v-if="detectedAtLabel"
      class="text-sm text-zinc-600 dark:text-zinc-400"
    >
      Détectée le <span class="font-medium">{{ detectedAtLabel }}</span>.
    </p>

    <div class="space-y-6 rounded-2xl border border-primary-200/40 bg-background/20 p-3 sm:p-6 shadow-sm">
      <section class="space-y-4">
        <UITitle
          level="3"
          class="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
        >
          <Icon
            name="lucide:database"
            class="size-4 shrink-0 text-primary-500"
          /> Ampleur
        </UITitle>
        <div class="rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md p-5 shadow-sm flex flex-col items-center justify-center text-center">
          <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600 mb-2">Enregistrements compromis</span>
          <div class="text-4xl sm:text-5xl font-mono tracking-tight font-black text-primary-600 dark:text-primary-400 break-all">
            {{ databreachDetails.recordsAffected ? databreachDetails.recordsAffected.toLocaleString() : 'N/D' }}
          </div>
        </div>
      </section>

      <section class="space-y-4">
        <UITitle
          level="3"
          class="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
        >
          <Icon
            name="lucide:tags"
            class="size-4 shrink-0 text-cyan-500"
          /> Nature des données
        </UITitle>
        <div class="rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md p-3 sm:p-4 shadow-sm">
          <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600 block mb-2">Catégories de données compromises</span>
          <div
            v-if="databreachDetails.dataCategories?.length"
            class="flex flex-wrap gap-1.5"
          >
            <span
              v-for="(cat, i) in databreachDetails.dataCategories"
              :key="i"
              class="inline-flex rounded-md border border-secondary-200/60 bg-secondary-100 px-2 py-0.5 text-xs font-mono text-secondary-700 break-all"
            >{{ cat }}</span>
          </div>
          <span
            v-else
            class="text-sm italic text-zinc-500 dark:text-zinc-400"
          >Aucune catégorie renseignée.</span>
        </div>
        <DetailChips
          label="Destinations d'exfiltration"
          icon="lucide:send"
          :values="databreachDetails.exfilDestinations"
        />
      </section>

      <section
        v-if="databreachDetails.additionalInfo"
        class="space-y-4"
      >
        <UITitle
          level="3"
          class="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
        >
          <Icon
            name="lucide:info"
            class="size-4 shrink-0 text-amber-500"
          /> Informations complémentaires
        </UITitle>
        <MetadataGrid :info="databreachDetails.additionalInfo" />
      </section>
    </div>
  </div>
</template>
