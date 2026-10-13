<script setup lang="ts">
import { ref } from 'vue'
import { UIInput, UIButton } from '@slowpoke/ui'

import IncidentUserForm from './IncidentUserForm.vue'
import PhishingConnectionLogForm from './PhishingConnectionLogForm.vue'
import type { ConnectionLog } from './PhishingConnectionLogForm.vue'

export interface PhishingIdentity {
  identity_name: string
  fromDisplayName?: string | null
  fromAddress?: string | null
  replyDisplayName?: string | null
  replyAddress?: string | null
}

export interface PhishingData {
  detectedAt: string
  user: {
    fullName: string
    email: string
    affiliation?: string | null
    composante?: string | null
  }
  identities: PhishingIdentity[]
  logs: ConnectionLog[]
}

const model = defineModel<PhishingData>({
  default: () => ({
    detectedAt: new Date(),
    user: { fullName: '', email: '', affiliation: '', composante: '' },
    identities: [],
    logs: [],
  }),
})

const identityForm = ref<PhishingIdentity>({
  identity_name: '',
  fromDisplayName: '',
  fromAddress: '',
  replyDisplayName: '',
  replyAddress: '',
})

const addIdentity = () => {
  if (identityForm.value.identity_name) {
    model.value.identities.push({ ...identityForm.value })
    identityForm.value = {
      identity_name: '',
      fromDisplayName: '',
      fromAddress: '',
      replyDisplayName: '',
      replyAddress: '',
    }
  }
}

const removeIdentity = (idx: number) => {
  model.value.identities.splice(idx, 1)
}
</script>

<template>
  <div class="space-y-12">
    <!-- Section 1 : Info principales & Victime -->
    <div class="space-y-6">
      <div class="space-y-1.5 w-full md:w-1/2">
        <label class="text-sm font-medium text-secondary-700">Date de détection</label>
        <UIInput
          v-model="model.detectedAt"
          type="datetime-local"
        />
      </div>

      <div class="space-y-4">
        <h3 class="text-base font-medium text-secondary-900 border-b border-secondary-200 pb-2">
          Victime du Phishing
        </h3>
        <IncidentUserForm
          v-model="model.user"
          :multiple="false"
        />
      </div>
    </div>

    <!-- Section 2 : Identités Usurpées (Expéditeurs) -->
    <div class="space-y-4">
      <h3 class="text-base font-medium text-secondary-900 border-b border-secondary-200 pb-2">
        Identités compromises / utilisées
      </h3>

      <div
        class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end bg-secondary-50/50 p-4 rounded-xl border border-secondary-200"
      >
        <div class="space-y-1.5 sm:col-span-2">
          <label class="text-sm font-medium text-secondary-700">Nom de l'identité <span
            class="text-error-500"
          >*</span></label>
          <UIInput
            v-model="identityForm.identity_name"
            placeholder="Ex: Support IT"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Nom de l'expéditeur (From)</label>
          <UIInput
            v-model="identityForm.fromDisplayName"
            placeholder="Ex: Équipe technique"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Adresse de l'expéditeur (From)</label>
          <UIInput
            v-model="identityForm.fromAddress"
            type="email"
            placeholder="ex : attacker@domain.tld"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Nom de réponse (Reply-to)</label>
          <UIInput
            v-model="identityForm.replyDisplayName"
            placeholder="Ex: Admin Système"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Adresse de réponse (Reply-to)</label>
          <UIInput
            v-model="identityForm.replyAddress"
            type="email"
            placeholder="ex : evil@domain.tld"
          />
        </div>
        <div class="sm:col-span-2 pt-2">
          <UIButton
            type="button"
            variant="secondary"
            :disabled="!identityForm.identity_name"
            class="w-full sm:w-auto flex items-center justify-center gap-2"
            @click.prevent="addIdentity"
          >
            <Icon
              name="lucide:plus"
              class="w-4 h-4"
            />
            Ajouter cette identité
          </UIButton>
        </div>
      </div>

      <div
        v-if="model.identities.length > 0"
        class="mt-4"
      >
        <ul class="space-y-2">
          <li
            v-for="(id, idx) in model.identities"
            :key="idx"
            class="flex items-center justify-between p-3 bg-white border border-secondary-200 rounded-lg shadow-sm"
          >
            <div class="flex flex-col">
              <span class="text-sm font-medium text-secondary-900">{{ id.identity_name }}</span>
              <span class="text-xs text-secondary-500">
                From: {{ id.fromDisplayName || '-' }} &lt;{{ id.fromAddress || '-' }}&gt;
                | Reply-to: {{ id.replyDisplayName || '-' }} &lt;{{ id.replyAddress || '-' }}&gt;
              </span>
            </div>
            <UIButton
              variant="ghost"
              class="text-error-500 hover:text-error-600 hover:bg-error-50 h-8 w-8 px-0 flex justify-center items-center"
              @click="removeIdentity(idx)"
            >
              <Icon
                name="lucide:trash"
                class="w-4 h-4"
              />
            </UIButton>
          </li>
        </ul>
      </div>
    </div>

    <!-- Section 3 : Logs d'activité -->
    <div class="space-y-4">
      <h3 class="text-base font-medium text-secondary-900 border-b border-secondary-200 pb-2">
        Logs d'activité associés & actions
      </h3>
      <PhishingConnectionLogForm v-model="model.logs" />
    </div>
  </div>
</template>
