<script setup lang="ts">
import { UIInput, UISelect } from '@slowpoke/ui'
import IncidentUserForm from './IncidentUserForm.vue'
import MultiInput from './MultiInput.vue'
import KVEditor from '~/components/metadata/KVEditor.vue'

export interface DataBreachData {
  detectedAt: string | null
  dataCategories: string[]
  exfilDestinations: string[] | null
  recordsAffected: number | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  additionalInfo: Record<string, any>
  users: Array<{
    fullName: string
    email: string
    affiliation?: string | null
    composante?: string | null
  }>
}

const dataCategoriesOptions = [
  { label: 'Données d\'identité (Noms, prénoms, dates de naissance...)', value: 'identite' },
  { label: 'Coordonnées (Adresses, emails, numéros de téléphone...)', value: 'coordonnees' },
  { label: 'Données de santé (Dossiers médicaux, numéros de sécu...)', value: 'sante' },
  { label: 'Données financières (RIB, numéros de CB, salaires...)', value: 'financier' },
  { label: 'Identifiants de connexion (Mots de passe, tokens...)', value: 'identifiants' },
  { label: 'Données professionnelles / Scolaires (Notes, diplômes...)', value: 'pro_scolaire' },
  { label: 'Propriété intellectuelle (Brevets, codes sources, recherches...)', value: 'prop_intellectuelle' },
  { label: 'Autre', value: 'autre' },
]

const model = defineModel<DataBreachData>({
  default: () => ({
    detectedAt: '', // Ou une ISO string vide
    dataCategories: [],
    exfilDestinations: [],
    recordsAffected: null,
    additionalInfo: {},
    users: [],
  }),
})
</script>

<template>
  <div class="space-y-8">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Date de détection</label>
        <UIInput
          v-model="model.detectedAt"
          type="datetime-local"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Catégories de données compromises</label>
        <UISelect
          v-model="model.dataCategories"
          :items="dataCategoriesOptions"
          :multi-select="true"
          placeholder="Sélectionner des catégories"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Destinations d'exfiltration</label>
        <MultiInput
          v-model="model.exfilDestinations"
          placeholder="IP, domaine ou service destinataire…"
        />
      </div>

      <div class="col-span-1 space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Nombre d'enregistrements affectés</label>
        <UIInput
          v-model="model.recordsAffected"
          type="number"
          placeholder="Ex: 1000"
        />
      </div>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Informations complémentaires</label>
      <p class="text-xs text-secondary-500">
        Champs libres (source du signalement, TLP…) affichés tels quels sur la fiche.
      </p>
      <KVEditor v-model="model.additionalInfo" />
    </div>

    <div class="space-y-4">
      <h3 class="text-base font-medium text-secondary-900 border-b border-secondary-200 pb-2">
        Utilisateurs victimes / concernés
      </h3>
      <IncidentUserForm
        v-model:users="model.users"
        :multiple="true"
      />
    </div>
  </div>
</template>
