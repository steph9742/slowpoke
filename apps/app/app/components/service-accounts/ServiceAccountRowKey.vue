<script setup lang="ts">
import type { ServiceKey } from '@slowpoke/better-auth-plugins/service-accounts'
import { UIButton, useToast } from '@slowpoke/ui'
import CodeEditor from '../editor/CodeEditor.vue'
import { authClient } from '~/lib/auth-client'

const props = defineProps<{
  serviceKey: ServiceKey
}>()

const model = defineModel<ServiceKey['id'] | ''>()
const emit = defineEmits<{
  updated: []
  deleted: []
}>()

const displayMetadataEdit = ref(false)
// Révélation explicite de la clé : le survol ne suffit pas sur écran tactile.
const revealed = ref(false)
const deleting = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const metadataJson = ref('')

const isOpen = computed(() => model.value === props.serviceKey.id)

const formatMetadata = (metadata: ServiceKey['metadata']) => {
  if (metadata === null || metadata === undefined) {
    return '{\n  \n}'
  }

  try {
    return JSON.stringify(metadata, null, 2)
  }
  catch {
    return '{\n  \n}'
  }
}

const expirationLabel = computed(() => {
  const expiresAt = props.serviceKey.expiresAt

  if (!expiresAt) {
    return 'Jamais'
  }

  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) {
    return 'Inconnue'
  }

  return date.toLocaleString('fr-FR')
})

const createdAtLabel = computed(() => {
  const date = new Date(props.serviceKey.created_at)

  if (Number.isNaN(date.getTime())) {
    return 'Inconnue'
  }

  return date.toLocaleString('fr-FR')
})

watch(
  () => props.serviceKey,
  (value) => {
    metadataJson.value = formatMetadata(value.metadata)
  },
  { immediate: true, deep: true },
)

const toggleAccordion = () => {
  model.value = model.value === props.serviceKey.id ? '' : props.serviceKey.id
}

const toggleMetadataEditor = () => {
  displayMetadataEdit.value = !displayMetadataEdit.value
  errorMessage.value = ''

  if (displayMetadataEdit.value) {
    metadataJson.value = formatMetadata(props.serviceKey.metadata)
  }
}

const saveMetadata = async () => {
  if (saving.value) {
    return
  }

  saving.value = true
  errorMessage.value = ''

  let metadata: unknown

  try {
    metadata = JSON.parse(metadataJson.value)
  }
  catch {
    saving.value = false
    errorMessage.value = 'Les métadonnées JSON sont invalides.'
    return
  }

  const { error } = await authClient().serviceKeys.updateKey({
    keyId: props.serviceKey.id,
    metadata,
    fetchOptions: {
      credentials: 'include',
    },
  })

  saving.value = false

  if (error) {
    errorMessage.value = error.message || 'Impossible de mettre à jour la clé.'
    return
  }

  displayMetadataEdit.value = false
  emit('updated')
}

const deleteKey = async () => {
  if (deleting.value) {
    return
  }

  deleting.value = true
  errorMessage.value = ''

  const { error } = await authClient().serviceKeys.deleteKey({
    keyId: props.serviceKey.id,
    fetchOptions: {
      credentials: 'include',
    },
  })

  deleting.value = false

  if (error) {
    errorMessage.value = error.message || 'Impossible de supprimer la clé.'
    return
  }

  if (model.value === props.serviceKey.id) {
    model.value = ''
  }

  emit('deleted')
}

const copyKey = () => {
  useClipboard().copy(props.serviceKey.key)
  useToast().newToast({
    title: 'Clé copiée',
    message: 'La clé de service a été copiée dans le presse-papiers.',
    type: 'success',
    duration: 3000,
  })
}
</script>

<template>
  <li class="rounded-md border border-gray-200 bg-white">
    <div class="flex items-start justify-between gap-2 px-3 py-2">
      <button
        type="button"
        class="group flex min-w-0 flex-1 items-start gap-3 text-left"
        @click.stop="toggleAccordion"
      >
        <Icon
          :name="isOpen ? 'lucide:chevron-down' : 'lucide:chevron-right'"
          class="mt-0.5 size-4 text-gray-500"
        />
        <div class="min-w-0">
          <p class="text-xs text-gray-500">
            Clé de service
          </p>
          <p
            class="relative z-20 mt-1 max-w-full truncate rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700 transition-[filter] duration-150"
            :class="revealed ? '' : 'blur-sm group-hover:blur-none group-focus-within:blur-none'"
            :title="serviceKey.key"
            @click.stop="copyKey"
          >
            {{ serviceKey.key }}
          </p>
          <p class="mt-1 text-[11px] text-gray-400">
            <span class="hidden sm:inline">Survoler ou appuyer sur l'œil pour révéler</span>
            <span class="sm:hidden">Appuyer sur l'œil pour révéler</span>
            · cliquer sur la clé pour la copier
          </p>
          <div class="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
            <span>Expire : {{ expirationLabel }}</span>
            <span>Créée : {{ createdAtLabel }}</span>
          </div>
        </div>
      </button>

      <div class="flex shrink-0 items-center gap-1">
        <!-- Sur tactile il n'y a pas de survol : ce bouton est le seul moyen de révéler la clé. -->
        <UIButton
          type="button"
          variant="ghost"
          size="icon"
          :aria-label="revealed ? 'Masquer la clé' : 'Révéler la clé'"
          :aria-pressed="revealed"
          @click.stop="revealed = !revealed"
        >
          <Icon
            :name="revealed ? 'lucide:eye-off' : 'lucide:eye'"
            class="text-gray-500"
          />
        </UIButton>

        <UIButton
          type="button"
          variant="ghost"
          size="icon"
          class="hover:bg-red-200/50"
          :disabled="deleting"
          aria-label="Supprimer la clé"
          @click.stop="deleteKey"
        >
          <Icon
            name="lucide:trash-2"
            class="text-red-500"
          />
        </UIButton>
      </div>
    </div>

    <Transition name="accordion">
      <div
        v-if="isOpen"
        class="border-t border-gray-200 px-3 py-3"
      >
        <div class="mb-3 flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-gray-800">
            Métadonnées
          </p>
          <UIButton
            type="button"
            size="sm"
            variant="outline"
            @click="toggleMetadataEditor"
          >
            {{ displayMetadataEdit ? 'Fermer' : 'Modifier les métadonnées' }}
          </UIButton>
        </div>

        <pre
          v-if="!displayMetadataEdit"
          class="max-h-48 overflow-auto rounded-md bg-gray-50 p-2 text-xs text-gray-700"
        >{{ formatMetadata(serviceKey.metadata) }}</pre>

        <div
          v-else
          class="space-y-3"
        >
          <CodeEditor
            v-model="metadataJson"
            language="json"
          />

          <div class="flex items-center justify-end gap-2">
            <UIButton
              type="button"
              variant="ghost"
              :disabled="saving"
              @click="toggleMetadataEditor"
            >
              Annuler
            </UIButton>
            <UIButton
              type="button"
              :disabled="saving"
              @click="saveMetadata"
            >
              {{ saving ? 'Enregistrement...' : 'Enregistrer' }}
            </UIButton>
          </div>
        </div>

        <p
          v-if="errorMessage"
          class="mt-2 text-sm text-red-500"
        >
          {{ errorMessage }}
        </p>
      </div>
    </Transition>
  </li>
</template>

<style scoped>
.accordion-enter-active,
.accordion-leave-active {
  transition: all 0.2s ease;
}

.accordion-enter-from,
.accordion-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
