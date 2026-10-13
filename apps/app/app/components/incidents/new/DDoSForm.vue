<script setup lang="ts">
import { UIInput } from '@slowpoke/ui'
import MultiInput from './MultiInput.vue'

export interface DDoSData {
  durationMinutes?: number | null
  targets: string[] | null
  sourceIps: string[] | null
  vectors: string[] | null
  targetPorts?: string[] | null
  peakBandwidthMbps?: number | null
  startedAt?: string | null
  endedAt?: string | null
}

const model = defineModel<DDoSData>({
  default: () => ({
    durationMinutes: null,
    targets: [],
    sourceIps: [],
    vectors: [],
    targetPorts: [],
    peakBandwidthMbps: null,
    startedAt: new Date(),
    endedAt: '',
  }),
})
</script>

<template>
  <div class="space-y-8">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Cibles</label>
        <MultiInput
          v-model="model.targets"
          placeholder="IP ou domaine ciblé…"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">IP sources</label>
        <MultiInput
          v-model="model.sourceIps"
          placeholder="IP ou plage source…"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Vecteurs d'attaque</label>
        <MultiInput
          v-model="model.vectors"
          placeholder="SYN flood, UDP amplification…"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Ports visés</label>
        <MultiInput
          v-model="model.targetPorts"
          placeholder="ex : 443, 80, 22…"
        />
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Bande Passante Max (Mbps)</label>
        <UIInput
          v-model="model.peakBandwidthMbps"
          type="number"
          placeholder="ex : 5000"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Durée (Minutes)</label>
        <UIInput
          v-model="model.durationMinutes"
          type="number"
          placeholder="ex : 120"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Début de l'attaque</label>
        <UIInput
          v-model="model.startedAt"
          type="datetime-local"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Fin de l'attaque</label>
        <UIInput
          v-model="model.endedAt"
          type="datetime-local"
        />
      </div>
    </div>
  </div>
</template>
