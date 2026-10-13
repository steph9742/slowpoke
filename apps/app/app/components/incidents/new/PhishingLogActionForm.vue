<script setup lang="ts">
import { UIInput, UIButton, UISelect } from '@slowpoke/ui'

export interface LogAction {
  actionType: 'messages_sent' | 'contacts_added' | 'identity_modified' | 'other' | null
  amount?: number | null
  additionalInfo?: Record<string, unknown> | null
}

const model = defineModel<LogAction[]>({ default: () => [] })

const form = ref<LogAction>({
  actionType: null,
  amount: null,
  additionalInfo: {},
})

const actionTypes = [
  { label: 'Messages envoyés', value: 'messages_sent' },
  { label: 'Contacts ajoutés', value: 'contacts_added' },
  { label: 'Identité modifiée', value: 'identity_modified' },
  { label: 'Autre', value: 'other' },
]

const addAction = () => {
  if (form.value.actionType) {
    model.value.push({ ...form.value })
    form.value = { actionType: null, amount: null, additionalInfo: {} }
  }
}

const removeAction = (index: number) => {
  model.value.splice(index, 1)
}

const getActionLabel = (val: string) => actionTypes.find(a => a.value === val)?.label || val
</script>

<template>
  <div class="space-y-4 bg-secondary-50/50 p-4 rounded-xl border border-secondary-100">
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
      <div class="space-y-1.5 sm:col-span-1">
        <label class="text-sm font-medium text-secondary-700">Type d'action</label>
        <UISelect
          v-model="form.actionType"
          :items="actionTypes"
          :multi-select="false"
        />
      </div>
      <div class="space-y-1.5 sm:col-span-1">
        <label class="text-sm font-medium text-secondary-700">Quantité (Optionnel)</label>
        <UIInput
          v-model="form.amount"
          type="number"
          min="0"
          placeholder="Ex: 500"
        />
      </div>
      <div class="sm:col-span-1 pt-2">
        <UIButton
          type="button"
          variant="secondary"
          :disabled="!form.actionType"
          class="w-full flex items-center justify-center gap-2"
          @click.prevent="addAction"
        >
          <Icon
            name="lucide:plus"
            class="w-4 h-4"
          />
          Ajouter une action
        </UIButton>
      </div>
    </div>

    <div
      v-if="model.length > 0"
      class="mt-4"
    >
      <ul class="space-y-2">
        <li
          v-for="(act, i) in model"
          :key="i"
          class="flex items-center justify-between p-2.5 bg-white border border-secondary-200 rounded-lg shadow-sm"
        >
          <div class="flex flex-col">
            <span class="text-sm font-medium text-secondary-900">{{ getActionLabel(act.actionType || '') }}</span>
            <span
              v-if="act.amount"
              class="text-xs text-secondary-500"
            >Quantité : {{ act.amount }}</span>
          </div>
          <UIButton
            variant="ghost"
            class="text-error-500 hover:text-error-600 hover:bg-error-50 h-8 w-8 px-0 flex justify-center items-center"
            @click="removeAction(i)"
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
</template>
