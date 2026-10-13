<script setup lang="ts">
import type { ServiceAccount } from '@slowpoke/better-auth-plugins/service-accounts'
import ServiceAccountRow from './ServiceAccountRow.vue'
import ServiceAccountListEmpty from './ServiceAccountListEmpty.vue'
import ServiceAccountRowNew from './ServiceAccountRowNew.vue'

defineProps<{
  serviceAccounts: ServiceAccount[] | null | undefined
}>()
const emit = defineEmits<{
  created: []
  delete: [accountId: ServiceAccount['id']]
}>()

const selectedUser = ref('')
const displayNewForm = defineModel<boolean>()
</script>

<template>
  <ul class="space-y-2">
    <ServiceAccountRowNew
      v-if="displayNewForm"
      v-model="displayNewForm"
      @created="emit('created')"
    />
    <li class="w-full h-px bg-gray-300 my-8" />
    <template v-if="serviceAccounts && serviceAccounts.length > 0">
      <ServiceAccountRow
        v-for="acc in serviceAccounts"
        :key="acc.id"
        v-model="selectedUser"
        :account="acc"
        @delete="emit('delete', $event)"
      />
    </template>
  </ul>
  <ServiceAccountListEmpty v-if="(!serviceAccounts || serviceAccounts.length === 0) && !displayNewForm" />
</template>
