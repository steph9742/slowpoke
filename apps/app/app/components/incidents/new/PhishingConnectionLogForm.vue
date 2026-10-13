<script setup lang="ts">
import { UIInput, UIButton } from '@slowpoke/ui'

import PhishingLogActionForm from './PhishingLogActionForm.vue'
import type { LogAction } from './PhishingLogActionForm.vue'

export interface ConnectionLog {
  activityStart: string
  activityEnd?: string | null
  ipAddress: string
  countryCode?: string | null
  countryName?: string | null
  actions: LogAction[]
}

const model = defineModel<ConnectionLog[]>({ default: () => [] })

const form = ref<ConnectionLog>({
  activityStart: '',
  ipAddress: '',
  countryCode: '',
  countryName: '',
  actions: [],
})

const addLog = () => {
  if (form.value.ipAddress && form.value.activityStart) {
    model.value.push({ ...form.value, actions: [...form.value.actions] })
    form.value = {
      activityStart: '',
      ipAddress: '',
      countryCode: '',
      countryName: '',
      actions: [],
    }
  }
}

const removeLog = (index: number) => {
  model.value.splice(index, 1)
}

const expandedIndex = ref<number | null>(null)
const toggleExpand = (index: number) => {
  expandedIndex.value = expandedIndex.value === index ? null : index
}
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-4 rounded-xl border border-secondary-200 shadow-sm space-y-4">
      <h4 class="text-sm font-medium text-secondary-900">
        Nouvelle activité suspecte
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="space-y-1.5 lg:col-span-1">
          <label class="text-sm font-medium text-secondary-700">Adresse IP</label>
          <UIInput
            v-model="form.ipAddress"
            placeholder="Ex: 192.168.1.100"
          />
        </div>
        <div class="space-y-1.5 lg:col-span-1">
          <label class="text-sm font-medium text-secondary-700">Début d'activité</label>
          <UIInput
            v-model="form.activityStart"
            type="datetime-local"
          />
        </div>
        <div class="space-y-1.5 lg:col-span-1">
          <label class="text-sm font-medium text-secondary-700">Code Pays</label>
          <UIInput
            v-model="form.countryCode"
            placeholder="Ex: FR"
          />
        </div>
        <div class="space-y-1.5 lg:col-span-1">
          <label class="text-sm font-medium text-secondary-700">Nom Pays</label>
          <UIInput
            v-model="form.countryName"
            placeholder="Ex: France"
          />
        </div>
      </div>

      <div class="space-y-1.5 pt-2">
        <label class="text-sm font-medium text-secondary-700">Actions réalisées au cours de cette activité</label>
        <PhishingLogActionForm v-model="form.actions" />
      </div>

      <div class="flex justify-end pt-2 border-t border-secondary-100">
        <UIButton
          type="button"
          variant="secondary"
          :disabled="!form.ipAddress || !form.activityStart"
          class="flex items-center gap-2"
          @click.prevent="addLog"
        >
          <Icon
            name="lucide:plus"
            class="w-4 h-4"
          />
          Ajouter ce log d'activité
        </UIButton>
      </div>
    </div>

    <!-- Liste des logs ajoutés -->
    <div
      v-if="model.length > 0"
      class="space-y-3"
    >
      <h4 class="text-sm font-medium text-secondary-900 border-b border-secondary-200 pb-2">
        Logs enregistrés ({{
          model.length }})
      </h4>
      <ul class="space-y-3">
        <li
          v-for="(log, i) in model"
          :key="i"
          class="bg-white border border-secondary-200 rounded-lg overflow-hidden"
        >
          <div
            class="flex items-center justify-between p-3.5 bg-secondary-50 cursor-pointer"
            @click="toggleExpand(i)"
          >
            <div class="flex items-center gap-4">
              <div class="font-mono text-sm bg-white px-2 py-1 rounded !text-secondary-800 border border-secondary-200">
                {{ log.ipAddress }}
              </div>
              <span class="text-sm text-secondary-600">Actions : <span class="font-medium text-secondary-900">{{
                log.actions.length }}</span></span>
            </div>
            <div class="flex items-center gap-2">
              <UIButton
                variant="ghost"
                class="text-error-500 hover:text-error-600 hover:bg-error-50 h-8 w-8 px-0 flex justify-center items-center"
                @click.stop="removeLog(i)"
              >
                <Icon
                  name="lucide:trash"
                  class="w-4 h-4"
                />
              </UIButton>
              <button
                type="button"
                class="text-secondary-400 hover:text-secondary-600 h-8 w-8 flex justify-center items-center rounded hover:bg-secondary-100 transition-colors"
              >
                <Icon
                  v-if="expandedIndex === i"
                  name="lucide:chevron-up"
                  class="w-5 h-5"
                />
                <Icon
                  v-else
                  name="lucide:chevron-down"
                  class="w-5 h-5"
                />
              </button>
            </div>
          </div>
          <div
            v-if="expandedIndex === i"
            class="p-4 border-t border-secondary-200 space-y-4"
          >
            <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 mb-4">
              <div>
                <span class="block text-xs font-medium text-secondary-500">Début</span>
                <span class="block text-sm text-secondary-900">{{ new Date(log.activityStart).toLocaleString() }}</span>
              </div>
              <div v-if="log.countryCode || log.countryName">
                <span class="block text-xs font-medium text-secondary-500">Localisation</span>
                <span class="block text-sm text-secondary-900">{{ log.countryCode }}<template
                  v-if="log.countryCode && log.countryName"
                > - </template>{{
                  log.countryName }}</span>
              </div>
            </div>

            <div>
              <span class="block text-xs font-medium text-secondary-700 mb-2 uppercase tracking-wide">Actions
                associées</span>
              <PhishingLogActionForm v-model="model[i]!.actions" />
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
