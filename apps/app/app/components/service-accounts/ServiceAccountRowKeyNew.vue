<script setup lang="ts">
import { UIButton, UIButtonGroup } from '@slowpoke/ui'
import CodeEditor from '../editor/CodeEditor.vue'
import { authClient } from '~/lib/auth-client'

const jsonMeta = ref<string>('{\n  \n}')
const selectedExpiration = ref<number | null>(null)
const creating = ref(false)
const errorMessage = ref('')

const props = defineProps<{
  accountId: string
}>()

const model = defineModel<boolean>()
const emit = defineEmits<{
  created: []
}>()

const expirationOptions = [
  {
    label: '1 jour',
    value: 60 * 60 * 24,
  },
  {
    label: '7 jours',
    value: 60 * 60 * 24 * 7,
  },
  {
    label: '30 jours',
    value: 60 * 60 * 24 * 30,
  },
  {
    label: 'Jamais',
    value: null,
  },
]

const onSubmit = async () => {
  if (creating.value) {
    return
  }

  creating.value = true
  errorMessage.value = ''

  let metadata: unknown

  try {
    metadata = JSON.parse(jsonMeta.value)
  }
  catch {
    creating.value = false
    errorMessage.value = 'Les métadonnées JSON sont invalides.'
    return
  }

  const payload: {
    accountId: string
    metadata: unknown
    expiresAt?: number
    fetchOptions: {
      credentials: 'include'
    }
  } = {
    accountId: props.accountId,
    metadata,
    fetchOptions: {
      credentials: 'include',
    },
  }

  if (selectedExpiration.value !== null) {
    payload.expiresAt = selectedExpiration.value
  }

  const { error } = await authClient().serviceKeys.createKey(payload)

  creating.value = false

  if (error) {
    errorMessage.value = error.message || 'Impossible de créer la clé de service.'
    return
  }

  jsonMeta.value = '{\n  \n}'
  selectedExpiration.value = null
  model.value = false
  emit('created')
}
</script>

<template>
  <div class="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
    <div class="mb-3 flex items-center justify-between gap-3">
      <p class="text-sm font-semibold font-sans tracking-tight text-gray-800">
        Nouvelle clé de service
      </p>
      <UIButton
        type="button"
        variant="ghost"
        size="icon"
        @click="model = false"
      >
        <Icon name="lucide:x" />
      </UIButton>
    </div>

    <form
      class="space-y-4"
      @submit.prevent="onSubmit"
    >
      <div>
        <p class="mb-2 text-sm font-medium font-mono tracking-tight text-gray-800">
          Métadonnées (JSON)
        </p>
        <CodeEditor
          v-model="jsonMeta"
          language="json"
        />
      </div>

      <div>
        <p class="mb-2 text-sm font-medium font-mono tracking-tight text-gray-800">
          Expiration
        </p>
        <UIButtonGroup>
          <UIButton
            v-for="option in expirationOptions"
            :key="option.label"
            type="button"
            variant="outline"
            :class="selectedExpiration === option.value ? 'bg-primary-700! text-white hover:bg-primary-800' : ''"
            @click="selectedExpiration = option.value"
          >
            {{ option.label }}
          </UIButton>
        </UIButtonGroup>
      </div>

      <p
        v-if="errorMessage"
        class="text-sm text-red-500"
      >
        {{ errorMessage }}
      </p>

      <div class="flex items-center justify-end gap-2">
        <UIButton
          type="button"
          variant="ghost"
          :disabled="creating"
          @click="model = false"
        >
          Annuler
        </UIButton>
        <UIButton
          type="submit"
          :disabled="creating"
        >
          {{ creating ? 'Création...' : 'Créer la clé' }}
        </UIButton>
      </div>
    </form>
  </div>
</template>
