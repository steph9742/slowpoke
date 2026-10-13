<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  month: number
  lastMonth: number
  inTreatment: number
  active: number
  critical: number
}>()

// Écart vs mois précédent (neutre : tôt dans le mois la comparaison au total complet n'est qu'indicative)
const delta = computed(() => props.month - props.lastMonth)
</script>

<template>
  <div class="grid grid-cols-3 gap-2 sm:gap-4">
    <!-- Ce mois-ci -->
    <div class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 lg:p-5">
      <p class="text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
        Ce mois-ci
      </p>
      <div class="mt-1 flex items-baseline gap-1.5">
        <span class="text-3xl font-bold text-gray-900 sm:text-4xl">{{ month }}</span>
        <span
          v-if="delta !== 0"
          class="text-xs font-semibold text-gray-400"
          :title="`${lastMonth} le mois dernier`"
        >{{ delta > 0 ? '▲' : '▼' }}{{ Math.abs(delta) }}</span>
      </div>
    </div>

    <!-- En traitement (investigation + en cours) rapporté au total « ouverts » (actifs) -->
    <div class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 lg:p-5">
      <p class="text-[11px] font-medium uppercase tracking-wide text-gray-500 leading-tight sm:text-xs">
        En traitement
      </p>
      <span class="mt-1 block text-3xl font-bold text-primary-700 sm:text-4xl">{{ inTreatment }}</span>
      <p class="text-[10px] font-medium text-gray-400 leading-tight sm:text-xs">
        sur {{ active }} ouverts
      </p>
    </div>

    <!-- Critiques (actifs) -->
    <div class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 lg:p-5">
      <p class="text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
        Critiques
      </p>
      <span
        class="mt-1 block text-3xl font-bold sm:text-4xl"
        :class="critical > 0 ? 'text-red-600' : 'text-gray-900'"
      >{{ critical }}</span>
    </div>
  </div>
</template>
