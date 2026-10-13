<script setup lang="ts">
import { UIInput, UISelect } from '@slowpoke/ui'
import MultiInput from './MultiInput.vue'
import KVEditor from '~/components/metadata/KVEditor.vue'

export interface NetworkIntrusionData {
  intrusionType: 'port_scan' | 'brute_force' | 'vulnerability_exploit' | 'defacement' | 'other' | null
  sourceIps: string[] | null
  compromisedAccounts: string[] | null
  machines: string[] | null
  networkLocations: string[] | null
  detectedAt?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  additionalInfo: Record<string, any>
}

const intrusionTypes = [
  { label: 'Scan de ports', value: 'port_scan' },
  { label: 'Brute force', value: 'brute_force' },
  { label: 'Exploitation de vulnérabilité', value: 'vulnerability_exploit' },
  { label: 'Défiguration de site', value: 'defacement' },
  { label: 'Autre', value: 'other' },
]

const model = defineModel<NetworkIntrusionData>({
  default: () => ({
    intrusionType: null,
    sourceIps: [],
    compromisedAccounts: [],
    machines: [],
    networkLocations: [],
    detectedAt: new Date(),
    additionalInfo: {},
  }),
})
</script>

<template>
  <div class="space-y-8">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Type d'intrusion</label>
        <UISelect
          v-model="model.intrusionType"
          :items="intrusionTypes"
          :multi-select="false"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Date de détection</label>
        <UIInput
          v-model="model.detectedAt"
          type="datetime-local"
        />
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">IP sources</label>
        <MultiInput
          v-model="model.sourceIps"
          placeholder="IP source de l'intrusion…"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Comptes compromis</label>
        <MultiInput
          v-model="model.compromisedAccounts"
          placeholder="Login, email…"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Machines</label>
        <MultiInput
          v-model="model.machines"
          placeholder="Hôte, IP…"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Localisations réseau</label>
        <MultiInput
          v-model="model.networkLocations"
          placeholder="VLAN, sous-réseau…"
        />
      </div>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Informations complémentaires</label>
      <p class="text-xs text-secondary-500">
        Champs libres (source du signalement, TLP, ticket…) affichés tels quels sur la fiche.
      </p>
      <KVEditor v-model="model.additionalInfo" />
    </div>
  </div>
</template>
