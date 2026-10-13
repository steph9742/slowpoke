<script setup lang="ts">
import type { ServiceAccount } from '@slowpoke/better-auth-plugins/service-accounts'
import { UIButton, UIButtonGroup, UIInput } from '@slowpoke/ui'
import { authClient } from '~/lib/auth-client'

const newsvc = reactive<Pick<ServiceAccount, 'name' | 'scopes'>>({
  name: '',
  scopes: [],
})

const model = defineModel<boolean>()
const emit = defineEmits<{
  created: []
}>()
const creating = ref(false)
const errorMessage = ref('')

const scopes = [
  {
    displayName: 'Lecture',
    value: 'read',
  },
  {
    displayName: 'Écriture',
    value: 'write',
  },
  {
    displayName: 'Suppression',
    value: 'delete',
  },
  {
    displayName: 'Admin',
    value: 'admin',
  },
]

const addToScopes = (scope: string) => {
  if (!newsvc.scopes.includes(scope)) {
    newsvc.scopes.push(scope)
  }
  else {
    newsvc.scopes = newsvc.scopes.filter(s => s !== scope)
  }
}

const onSubmit = async () => {
  if (creating.value) {
    return
  }

  const name = newsvc.name.trim()

  if (!name) {
    errorMessage.value = 'Le nom du compte de service est requis.'
    return
  }

  creating.value = true
  errorMessage.value = ''

  const { error } = await authClient().serviceAccounts.createAccount({
    name,
    scopes: newsvc.scopes,
    fetchOptions: {
      credentials: 'include',
    },
  })

  creating.value = false

  if (error) {
    errorMessage.value = error.message || 'Impossible de créer le compte de service.'
    return
  }

  newsvc.name = ''
  newsvc.scopes = []
  model.value = false
  emit('created')
}
</script>

<template>
  <li class="bg-white rounded-xl border border-gray-200 shadow px-3 py-2 text-sm">
    <div class="mb-3 flex items-center justify-between gap-3">
      <p class="font-semibold text-gray-800 font-sans">
        Nouveau compte de service
      </p>
      <UIButton
        type="button"
        variant="ghost"
        size="icon"
        @click="model = !model"
      >
        <Icon name="lucide:x" />
      </UIButton>
    </div>
    <form @submit.prevent="onSubmit">
      <div class="space-y-4">
        <div>
          <UIInput
            id="name"
            v-model="newsvc.name"
            type="text"
            label="Nom du compte"
            name="name"
            size="sm"
          />
        </div>
        <div>
          <label
            for="scopes"
            class="block text-sm font-medium font-mono tracking-tigher text-gray-800 mb-2"
          >
            Permissions
          </label>
          <div>
            <UIButtonGroup>
              <UIButton
                v-for="scope in scopes"
                :key="scope.value"
                type="button"
                variant="outline"
                :class="newsvc.scopes.includes(scope.value) ? 'bg-primary-700! text-white hover:bg-primary-800' : ''"
                @click="addToScopes(scope.value)"
              >
                {{ scope.displayName }}
              </UIButton>
            </UIButtonGroup>
          </div>
        </div>
        <p
          v-if="errorMessage"
          class="text-sm text-red-500"
        >
          {{ errorMessage }}
        </p>
        <UIButton
          type="submit"
          :disabled="creating"
          class="ml-auto block"
        >
          {{ creating ? 'Création...' : 'Créer le compte de service' }}
        </UIButton>
      </div>
    </form>
  </li>
</template>
