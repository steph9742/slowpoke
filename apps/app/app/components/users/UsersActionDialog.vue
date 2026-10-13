<script setup lang="ts">
import { UIButton, UIDialog } from '@slowpoke/ui'
import { computed } from 'vue'
import type { AdminAction, ManagedUser } from './user-management.types'

const model = defineModel<boolean>({ required: true })

const props = defineProps<{
  action: AdminAction | null
  user: ManagedUser | null
  pending: boolean
}>()

const emit = defineEmits<{
  confirm: []
  close: []
}>()

const title = computed(() => {
  if (props.action === 'delete') {
    return 'Supprimer le compte'
  }

  if (props.action === 'revoke') {
    return 'Révoquer les sessions'
  }

  return 'Promouvoir administrateur'
})

const description = computed(() => {
  const target = props.user
  if (!target) {
    return ''
  }

  if (props.action === 'delete') {
    return `Le compte de ${target.name} sera supprimé définitivement.`
  }

  if (props.action === 'revoke') {
    return `Toutes les sessions actives de ${target.name} seront invalidées.`
  }

  return `${target.name} recevra le rôle administrateur.`
})

const close = () => {
  emit('close')
}
</script>

<template>
  <UIDialog
    v-model="model"
    :dismissable="!pending"
    :title="title"
    :description="description"
    @close="close"
  >
    <template #content>
      <p class="text-sm text-gray-700">
        Cette action nécessite une confirmation explicite.
      </p>
    </template>

    <template #footer>
      <UIButton
        variant="outline"
        :disabled="pending"
        @click="close"
      >
        Annuler
      </UIButton>
      <UIButton
        :variant="action === 'delete' ? 'danger' : 'primary'"
        :disabled="pending"
        @click="emit('confirm')"
      >
        <span v-if="pending">Traitement...</span>
        <span v-else>Confirmer</span>
      </UIButton>
    </template>
  </UIDialog>
</template>
