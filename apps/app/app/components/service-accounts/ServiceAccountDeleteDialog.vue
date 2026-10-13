<script setup lang="ts">
import type { ServiceAccount } from '@slowpoke/better-auth-plugins/service-accounts'
import { UIButton, UIDialog } from '@slowpoke/ui'
import { authClient } from '~/lib/auth-client'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  accountId: ServiceAccount['id'] | ''
}>()
const emit = defineEmits<{
  deleted: []
}>()

const deleting = ref(false)
const errorMessage = ref('')

const deleteServiceAccount = async () => {
  if (!props.accountId || deleting.value) {
    return
  }

  deleting.value = true
  errorMessage.value = ''

  const { error } = await authClient().serviceAccounts.deleteAccount({
    accountId: props.accountId,
    fetchOptions: {
      credentials: 'include',
    },
  })

  deleting.value = false

  if (error) {
    errorMessage.value = error.message || 'Impossible de supprimer ce compte de service.'
    return
  }

  open.value = false
  emit('deleted')
}

watch(open, (value) => {
  if (value) {
    errorMessage.value = ''
  }
})
</script>

<template>
  <UIDialog
    v-model="open"
    title="Supprimer le compte de service"
  >
    <template #content>
      <p class="text-lg font-semibold">
        Voulez-vous vraiment supprimer ce compte de service ?
      </p>
      <p class="mt-2 text-sm text-gray-600">
        Cette action est irréversible.
      </p>
    </template>

    <template #footer>
      <p
        v-if="errorMessage"
        class="w-full text-sm text-red-600"
      >
        {{ errorMessage }}
      </p>
      <UIButton
        variant="outline"
        :disabled="deleting"
        @click="open = false"
      >
        Annuler
      </UIButton>
      <UIButton
        variant="danger"
        :disabled="deleting || !accountId"
        @click="deleteServiceAccount"
      >
        {{ deleting ? 'Suppression...' : 'Supprimer' }}
      </UIButton>
    </template>
  </UIDialog>
</template>
