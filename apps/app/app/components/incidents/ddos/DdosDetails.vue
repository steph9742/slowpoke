<script setup lang="ts">
import type { IncidentGetData } from '~/types/elysia'
import { UITitle } from '#components'
import { computed } from 'vue'
import DetailChips from '../DetailChips.vue'

const props = defineProps<{
  ddosDetails: NonNullable<IncidentGetData['ddosDetails']>
}>()

const format = (date: Date | string | null) => {
  if (!date) return null
  return Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'long', timeStyle: 'short' }).format(new Date(date))
}

const startedAtLabel = computed(() => format(props.ddosDetails.startedAt))
const endedAtLabel = computed(() => format(props.ddosDetails.endedAt))

const chipGroups = computed(() => [
  { key: 'targetPorts', label: 'Ports visés', icon: 'lucide:door-open', values: props.ddosDetails.targetPorts },
  { key: 'targets', label: 'Cibles', icon: 'lucide:crosshair', values: props.ddosDetails.targets },
  { key: 'sourceIps', label: 'IP sources', icon: 'lucide:globe', values: props.ddosDetails.sourceIps },
  { key: 'vectors', label: 'Vecteurs d\'attaque', icon: 'lucide:zap', values: props.ddosDetails.vectors },
].filter(g => g.values?.length))
</script>

<template>
  <div class="mt-6 space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div class="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
        <Icon
          name="lucide:activity"
          class="size-5"
        />
      </div>
      <UITitle
        level="2"
        class="mb-0! text-xl font-bold tracking-tight"
      >
        Analyse du déni de service
      </UITitle>
    </div>

    <div class="space-y-6 rounded-2xl border border-primary-200/40 bg-background/20 p-3 sm:p-6 shadow-sm">
      <section class="space-y-4">
        <UITitle
          level="3"
          class="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
        >
          <Icon
            name="lucide:gauge"
            class="size-4 shrink-0 text-orange-500"
          /> Intensité
        </UITitle>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="rounded-xl border border-orange-200/50 dark:border-orange-900/50 bg-background/30 backdrop-blur-md p-4 sm:p-5 shadow-sm">
            <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600">Pic de bande passante</span>
            <div class="mt-2 flex items-baseline gap-2">
              <span class="text-4xl font-bold tracking-tight text-orange-600 dark:text-orange-400">{{ ddosDetails.peakBandwidthMbps || '0' }}</span>
              <span class="text-sm font-medium text-zinc-500">Mbps</span>
            </div>
          </div>
          <div class="rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md p-4 sm:p-5 shadow-sm">
            <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600">Durée connue</span>
            <div class="mt-2 flex items-baseline gap-2">
              <span class="text-4xl font-bold tracking-tight text-text">{{ ddosDetails.durationMinutes || '0' }}</span>
              <span class="text-sm font-medium text-zinc-500">min</span>
            </div>
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
          /> Périmètre technique
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

      <section class="space-y-4">
        <UITitle
          level="3"
          class="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
        >
          <Icon
            name="lucide:calendar-clock"
            class="size-4 shrink-0 text-primary-500"
          /> Fenêtre d'attaque
        </UITitle>
        <div class="rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md p-4 sm:p-5 shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div class="min-w-0">
            <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600 block mb-1">Début</span>
            <span class="text-sm font-medium text-text break-words">{{ startedAtLabel || 'N/D' }}</span>
          </div>
          <Icon
            name="lucide:arrow-right"
            class="text-zinc-300 dark:text-zinc-700 hidden md:block shrink-0"
          />
          <div class="min-w-0 md:text-right">
            <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600 block mb-1">Fin (estimée / réelle)</span>
            <span class="text-sm font-medium text-text break-words">{{ endedAtLabel || 'N/D' }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
