<script setup lang="ts">
import { UIInput, UISelect, type UISelectOption } from '@slowpoke/ui'
import MultiInput from './MultiInput.vue'
import KVEditor from '~/components/metadata/KVEditor.vue'

export interface RansomwareData {
  rntCertId: string | null
  detectedAt: string | null
  entrypoint: string | null
  ransomAmount?: number | null
  ransomCurrency?: string | null
  machines: string[] | null
  iocs: string[] | null
  networkLocation: string[] | null
  concernedEntities: string[] | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  additionalInfo: Record<string, any>
}

const model = defineModel<RansomwareData>({
  default: () => ({
    rntCertId: '',
    detectedAt: new Date(),
    entrypoint: '',
    ransomAmount: null,
    ransomCurrency: 'BTC',
    machines: [],
    iocs: [],
    networkLocation: [],
    concernedEntities: [],
    additionalInfo: {},
  }),
})

const currencyOptions: UISelectOption[] = [
  { label: 'BTC', value: 'BTC' },
  { label: 'XMR', value: 'XMR' },
  { label: 'ETH', value: 'ETH' },
  { label: 'USD', value: 'USD' },
  { label: 'EUR', value: 'EUR' },
]
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div class="col-span-1 space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Point d'entrée (Vecteur)</label>
      <UIInput
        v-model="model.entrypoint"
        placeholder="ex : Exploited RDP / Phishing Payload"
      />
    </div>

    <div class="col-span-1 space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Horodatage de l'exécution (T0)</label>
      <UIInput
        v-model="model.detectedAt"
        type="datetime-local"
      />
    </div>

    <div class="col-span-1 md:col-span-2 space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Renater CERT</label>
      <UIInput
        v-model="model.rntCertId"
        placeholder="ex : TX-82931-..."
      />
    </div>

    <div
      class="col-span-1 md:col-span-2 bg-secondary-50/50 p-6 rounded-lg border border-secondary-100 grid grid-cols-1 sm:grid-cols-3 gap-6"
    >
      <div class="col-span-full">
        <h4 class="text-sm font-medium text-secondary-900 border-b border-secondary-200 pb-2">
          Détails de la demande
        </h4>
      </div>

      <div class="sm:col-span-2 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Montant demandé</label>
        <UIInput
          v-model="model.ransomAmount"
          type="number"
          placeholder="ex : 50.00"
        />
      </div>

      <div class="sm:col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Devise</label>
        <UISelect
          v-model="model.ransomCurrency"
          :items="currencyOptions"
          :multi-select="false"
        />
      </div>
    </div>

    <div class="col-span-1 space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Machines</label>
      <MultiInput
        v-model="model.machines"
        placeholder="Nom d'hôte, IP…"
      />
    </div>

    <div class="col-span-1 space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">IOC / hash</label>
      <MultiInput
        v-model="model.iocs"
        placeholder="Hash, extension de chiffrement…"
      />
    </div>

    <div class="col-span-1 space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Entités concernées</label>
      <MultiInput
        v-model="model.concernedEntities"
        placeholder="Service, entité…"
      />
    </div>

    <div class="col-span-1 space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Localisations réseau</label>
      <MultiInput
        v-model="model.networkLocation"
        placeholder="VLAN, sous-réseau…"
      />
    </div>

    <div class="col-span-1 md:col-span-2 space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Informations complémentaires</label>
      <p class="text-xs text-secondary-500">
        Champs libres (ticket RENATER, source, TLP…) affichés tels quels sur la fiche.
      </p>
      <KVEditor v-model="model.additionalInfo" />
    </div>
  </div>
</template>
