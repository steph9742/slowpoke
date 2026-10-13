<script setup lang="ts">
import { UIInput, UIButton } from '@slowpoke/ui'
import AffiliationSelect from './AffiliationSelect.vue'
import { affiliationLabel } from '~/types/affiliation'
import { composanteLabel } from '~/types/incident'

interface User {
  fullName: string
  email: string
  affiliation?: string | null
  composante?: string | null
}

const props = withDefaults(defineProps<{ multiple?: boolean }>(), { multiple: false })

// Quand multiple = true, on bind sur v-model:users
const modelArray = defineModel<User[]>('users', { default: () => [] })
// Quand multiple = false, on bind sur v-model (défaut)
const modelSingle = defineModel<User>({
  default: () => ({ fullName: '', email: '', affiliation: '', composante: '' }),
})

const form = ref<User>({
  fullName: '',
  email: '',
  affiliation: '',
  composante: '',
})

const addUser = () => {
  if (props.multiple) {
    modelArray.value.push({ ...form.value })
    form.value = { fullName: '', email: '', affiliation: '', composante: '' }
  }
}

const removeUser = (index: number) => {
  if (props.multiple) {
    modelArray.value.splice(index, 1)
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Multiple Mode: Form & List -->
    <template v-if="multiple">
      <div
        class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end bg-white p-4 rounded-xl border border-secondary-200 shadow-sm"
      >
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Nom complet</label>
          <UIInput
            v-model="form.fullName"
            placeholder="Jean Dupont"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Email</label>
          <UIInput
            v-model="form.email"
            type="email"
            placeholder="jean.dupont@univ.fr"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Affiliation (Optionnel)</label>
          <AffiliationSelect v-model="form.affiliation" />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Composante (Optionnel)</label>
          <UIInput
            v-model="form.composante"
            placeholder="Ex: UFR Sciences"
          />
        </div>
        <div class="col-span-1 sm:col-span-2 pt-2">
          <UIButton
            type="button"
            variant="secondary"
            :disabled="!form.fullName || !form.email"
            class="w-full sm:w-auto flex items-center justify-center gap-2"
            @click.prevent="addUser"
          >
            <Icon
              name="lucide:plus"
              class="w-4 h-4"
            />
            Ajouter cet utilisateur
          </UIButton>
        </div>
      </div>

      <div
        v-if="modelArray.length > 0"
        class="mt-4 space-y-2"
      >
        <h4 class="text-sm font-medium text-secondary-900">
          Utilisateurs concernés ({{ modelArray.length }})
        </h4>
        <ul class="space-y-2">
          <li
            v-for="(u, i) in modelArray"
            :key="i"
            class="flex items-center justify-between p-3 bg-secondary-50 border border-secondary-100 rounded-lg"
          >
            <div class="flex flex-col">
              <span class="text-sm font-medium text-secondary-900">{{ u.fullName }}</span>
              <span class="text-xs text-secondary-500">
                {{ u.email }}
                <template v-if="u.affiliation">&bull; {{ affiliationLabel(u.affiliation) }}</template>
                <template v-if="u.composante">&bull; {{ composanteLabel(u.composante) }}</template>
              </span>
            </div>
            <UIButton
              variant="ghost"
              class="text-error-500 hover:text-error-600 hover:bg-error-50 h-8 w-8 px-0 flex justify-center items-center"
              @click="removeUser(i)"
            >
              <Icon
                name="lucide:trash"
                class="w-4 h-4"
              />
            </UIButton>
          </li>
        </ul>
      </div>
      <div
        v-else
        class="text-sm text-secondary-500 italic mt-2"
      >
        Aucun utilisateur ajouté.
      </div>
    </template>

    <!-- Single Mode: Direct Binding -->
    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Nom complet</label>
          <UIInput
            v-model="modelSingle.fullName"
            placeholder="Jean Dupont"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Email</label>
          <UIInput
            v-model="modelSingle.email"
            type="email"
            placeholder="jean.dupont@univ.fr"
          />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Affiliation (Optionnel)</label>
          <AffiliationSelect v-model="modelSingle.affiliation" />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-secondary-700">Composante (Optionnel)</label>
          <UIInput
            v-model="modelSingle.composante"
            placeholder="Ex: UFR Sciences"
          />
        </div>
      </div>
    </template>
  </div>
</template>
