<script setup lang="ts">
import type { ServiceAccount } from '@slowpoke/better-auth-plugins/service-accounts'
import { UIButton } from '@slowpoke/ui'
import ServiceAccountDeleteDialog from '~/components/service-accounts/ServiceAccountDeleteDialog.vue'
import ServiceAccountList from '~/components/service-accounts/ServiceAccountList.vue'
import ServiceAccountListSkeleton from '~/components/service-accounts/ServiceAccountListSkeleton.vue'
import { authClient } from '~/lib/auth-client'

// Comptes de service réservés aux admins (création + gestion)
definePageMeta({
  middleware: 'admin',
})

const { data, pending, refresh } = await useAsyncData('service-accounts-list', async () => {
  const { data } = await authClient().serviceAccounts.listAccounts({
    query: {},
    fetchOptions: {
      credentials: 'include',
      headers: useRequestHeaders(['cookie']),
    },
  })
  return data
}, { getCachedData: () => undefined })

const displayNewForm = ref(false)
const displayDeleteDialog = ref(false)
const selectedServiceAccountId = ref<ServiceAccount['id'] | ''>('')

const openDeleteDialog = (accountId: ServiceAccount['id']) => {
  selectedServiceAccountId.value = accountId
  displayDeleteDialog.value = true
}

const refreshAfterDelete = async () => {
  await refresh()
}

useHead({ title: 'Comptes de service' })
</script>

<template>
  <div class="space-y-6">
    <UITitle level="1">
      Comptes de service
    </UITitle>
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-500 font-sans">{{ data?.total }} compte{{ data?.total !== 1 ? 's' : '' }}</span>
      <UIButton @click="displayNewForm = !displayNewForm">
        <Icon name="lucide:plus" />
        Créer un compte de service
      </UIButton>
    </div>
    <ServiceAccountListSkeleton v-if="pending && !data" />
    <ServiceAccountList
      v-else
      v-model="displayNewForm"
      :service-accounts="data?.service_accounts"
      @created="refresh"
      @delete="openDeleteDialog"
    />
    <ServiceAccountDeleteDialog
      v-model="displayDeleteDialog"
      :account-id="selectedServiceAccountId"
      @deleted="refreshAfterDelete"
    />
  </div>
</template>
