<script setup lang="ts">
import type { IncidentGetData } from '~/types/elysia'
import { UITitle } from '#components'
import { computed } from 'vue'
import MetadataGrid from '../MetadataGrid.vue'

const props = defineProps<{
  networkDetails: NonNullable<IncidentGetData['intrusionDetails']>
}>()

// Libellés FR des types d'intrusion (mêmes valeurs que NetworkIntrusionForm)
const INTRUSION_TYPE_LABELS: Record<string, string> = {
  port_scan: 'Scan de ports',
  brute_force: 'Brute force',
  vulnerability_exploit: 'Exploitation de vulnérabilité',
  defacement: 'Défiguration de site',
  other: 'Autre',
}

const intrusionTypeLabel = computed(() => {
  const t = props.networkDetails.intrusionType
  return (t && INTRUSION_TYPE_LABELS[t]) || t || 'Type non précisé'
})

const detectedAtLabel = computed(() => {
  if (!props.networkDetails.detectedAt) return null
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'long', timeStyle: 'short' })
    .format(new Date(props.networkDetails.detectedAt))
})

// Groupes techniques : on n'affiche que ceux qui sont renseignés
const groups = computed(() => [
  { key: 'sourceIps', label: 'IP sources', icon: 'lucide:globe', values: props.networkDetails.sourceIps },
  { key: 'compromisedAccounts', label: 'Comptes compromis', icon: 'lucide:user-x', values: props.networkDetails.compromisedAccounts },
  { key: 'machines', label: 'Machines', icon: 'lucide:server', values: props.networkDetails.machines },
  { key: 'networkLocations', label: 'Localisations réseau', icon: 'lucide:map-pin', values: props.networkDetails.networkLocations },
].filter(g => g.values?.length))

const perimeterSummary = computed(() => {
  const parts = groups.value.map(g => `${g.label} (${g.values!.length})`)
  return parts.length ? parts.join(' · ') : null
})
</script>

<template>
  <div class="mt-6 space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div class="flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
        <Icon
          name="lucide:network"
          class="size-5"
        />
      </div>
      <UITitle
        level="2"
        class="mb-0! text-xl font-bold tracking-tight"
      >
        Analyse de l'intrusion
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
            name="lucide:shield-alert"
            class="size-4 shrink-0 text-purple-500"
          /> Caractéristiques
        </UITitle>
        <div class="rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md overflow-hidden shadow-sm">
          <div class="px-4 py-3 sm:px-5 sm:py-4 border-b border-primary-200/40 bg-primary-50/20 flex items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100/60 text-purple-600 border border-purple-200/60 ring-2 ring-purple-50/30">
              <Icon
                name="lucide:shield-alert"
                class="size-5"
              />
            </div>
            <h3 class="font-medium text-text break-words min-w-0">
              {{ intrusionTypeLabel }}
            </h3>
          </div>
          <div class="p-3 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600">Date de détection</span>
              <div class="flex items-center gap-2 min-w-0">
                <Icon
                  name="lucide:calendar-clock"
                  class="size-4 shrink-0 text-primary-400"
                />
                <span class="text-sm text-text/90 break-words min-w-0">{{ detectedAtLabel || 'N/D' }}</span>
              </div>
            </div>
            <div class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600">Périmètre</span>
              <div class="flex items-center gap-2 min-w-0">
                <Icon
                  name="lucide:crosshair"
                  class="size-4 shrink-0 text-primary-400"
                />
                <span class="text-sm text-text/90 break-words min-w-0">{{ perimeterSummary || 'Non renseigné' }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="groups.length"
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
          <div
            v-for="g in groups"
            :key="g.key"
            class="rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md p-3 sm:p-4 shadow-sm min-w-0"
          >
            <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600 flex items-center gap-1.5 mb-2">
              <Icon
                :name="g.icon"
                class="size-3.5 shrink-0 text-primary-400"
              /> {{ g.label }}
            </span>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="(v, i) in g.values"
                :key="i"
                class="inline-flex rounded-md border border-secondary-200/60 bg-secondary-100 px-2 py-0.5 text-xs font-mono text-secondary-700 break-all"
              >{{ v }}</span>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="networkDetails.additionalInfo"
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
        <MetadataGrid :info="networkDetails.additionalInfo" />
      </section>
    </div>
  </div>
</template>
