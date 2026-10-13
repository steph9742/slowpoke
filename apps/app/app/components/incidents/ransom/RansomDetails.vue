<script setup lang="ts">
import type { IncidentGetData } from '~/types/elysia'
import { UITitle } from '#components'
import { computed } from 'vue'
import DetailChips from '../DetailChips.vue'
import MetadataGrid from '../MetadataGrid.vue'

const props = defineProps<{
  ransomwareDetails: NonNullable<IncidentGetData['ransomwareDetails']>
}>()

const detectedAtLabel = computed(() => {
  if (!props.ransomwareDetails.detectedAt) return null
  return Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'long', timeStyle: 'short' }).format(new Date(props.ransomwareDetails.detectedAt))
})

const chipGroups = computed(() => [
  { key: 'machines', label: 'Machines', icon: 'lucide:server', values: props.ransomwareDetails.machines },
  { key: 'iocs', label: 'IOC / hash', icon: 'lucide:fingerprint', values: props.ransomwareDetails.iocs },
  { key: 'concernedEntities', label: 'Entités concernées', icon: 'lucide:building-2', values: props.ransomwareDetails.concernedEntities },
  { key: 'networkLocation', label: 'Localisations réseau', icon: 'lucide:map-pin', values: props.ransomwareDetails.networkLocation },
].filter(g => g.values?.length))
</script>

<template>
  <div class="mt-6 space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div class="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">
        <Icon
          name="lucide:lock"
          class="size-5"
        />
      </div>
      <UITitle
        level="2"
        class="mb-0! text-xl font-bold tracking-tight"
      >
        Analyse du rançongiciel
      </UITitle>
    </div>

    <p
      v-if="detectedAtLabel"
      class="text-sm text-zinc-600 dark:text-zinc-400"
    >
      Détecté le <span class="font-medium">{{ detectedAtLabel }}</span>.
    </p>

    <div class="space-y-6 rounded-2xl border border-primary-200/40 bg-background/20 p-3 sm:p-6 shadow-sm">
      <section class="space-y-4">
        <UITitle
          level="3"
          class="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
        >
          <Icon
            name="lucide:banknote"
            class="size-4 shrink-0 text-red-500"
          /> Rançon &amp; point d'entrée
        </UITitle>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="rounded-xl border-2 border-red-200/50 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 backdrop-blur-md p-5 shadow-sm flex flex-col items-center justify-center text-center">
            <span class="text-xs font-bold uppercase tracking-widest text-red-600/80 dark:text-red-400/80 mb-2">Montant demandé</span>
            <div class="text-4xl font-mono tracking-tight font-black text-red-600 dark:text-red-400 break-all">
              {{ ransomwareDetails.ransomAmount ? ransomwareDetails.ransomAmount.toLocaleString() : 'N/D' }}
              <span class="text-xl text-red-500/70 ml-1">{{ ransomwareDetails.ransomCurrency || '' }}</span>
            </div>
          </div>
          <div class="rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md p-5 shadow-sm flex flex-col justify-center">
            <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600 block mb-2">Point d'entrée identifié</span>
            <span class="text-sm font-medium text-text break-words">{{ ransomwareDetails.entrypoint || 'Non identifié' }}</span>
          </div>
        </div>
      </section>

      <section
        v-if="chipGroups.length"
        class="space-y-4"
      >
        <UITitle
          level="3"
          class="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
        >
          <Icon
            name="lucide:network"
            class="size-4 shrink-0 text-cyan-500"
          /> Indicateurs &amp; périmètre
        </UITitle>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailChips
            v-for="g in chipGroups"
            :key="g.key"
            :label="g.label"
            :icon="g.icon"
            :values="g.values"
          />
        </div>
      </section>

      <section
        v-if="ransomwareDetails.additionalInfo"
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
        <MetadataGrid :info="ransomwareDetails.additionalInfo" />
      </section>
    </div>
  </div>
</template>
