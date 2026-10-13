<script setup lang="ts">
import type { ServiceAccount, ServiceKey } from '@slowpoke/better-auth-plugins/service-accounts'
import { UIButton } from '@slowpoke/ui'
import ServiceAccountRowKey from './ServiceAccountRowKey.vue'
import ServiceAccountRowKeyNew from './ServiceAccountRowKeyNew.vue'
import { authClient } from '~/lib/auth-client'

const props = defineProps<{
  account: ServiceAccount
}>()
const emit = defineEmits<{
  delete: [accountId: ServiceAccount['id']]
}>()

const model = defineModel<ServiceAccount['id']>()
const activeKeyId = ref<ServiceKey['id'] | ''>('')
const displayNewKeyForm = ref(false)

const { data: keys, execute, pending } = useAsyncData(
  `service-keys-${props.account.id}`,
  async (): Promise<ServiceKey[]> => {
    const { data } = await authClient().serviceKeys.listKeys({
      query: {
        accountId: props.account.id,
      },
    })

    return (data?.service_keys as ServiceKey[] | undefined) ?? []
  },
  {
    default: () => [],
    immediate: false,
    getCachedData: () => undefined,
  },
)

const openDetails = async () => {
  const shouldFetchKeys = model.value !== props.account.id

  model.value = props.account.id

  if (shouldFetchKeys) {
    await execute()
    activeKeyId.value = ''
    displayNewKeyForm.value = false
  }
}

const refreshKeys = async () => {
  await execute()
}
</script>

<template>
  <li
    :class="['p-3 border border-gray-200 rounded-xl bg-white shadow-sm', model === account.id ? 'border-accent-200!' : 'hover:border-gray-300 cursor-pointer']"
    @click="openDetails"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Icon
          name="lucide:server"
          class="size-5 text-gray-500"
        />
        <div>
          <p class="font-medium text-sm font-sans tracking-tight text-gray-800">
            {{ account.name }}
          </p>
        </div>
      </div>
      <UIButton
        variant="ghost"
        size="icon"
        class="hover:bg-red-200/50"
        @click.stop="emit('delete', account.id)"
      >
        <Icon
          name="lucide:trash-2"
          class="text-red-400"
        />
      </UIButton>
    </div>

    <Transition name="accordion">
      <div
        v-if="model === account.id"
        class="mt-3 rounded-lg border border-gray-200 bg-white p-3"
      >
        <div class="flex items-center justify-between">
          <p class="text-xs font-mono font-semibold tracking-tight text-accent-300">
            Clés de service
          </p>
          <UIButton
            size="sm"
            variant="outline"
            @click.stop="displayNewKeyForm = !displayNewKeyForm"
          >
            <Icon :name="displayNewKeyForm ? 'lucide:x' : 'lucide:plus'" />
            {{ displayNewKeyForm ? 'Fermer' : 'Nouvelle clé de service' }}
          </UIButton>
        </div>

        <ServiceAccountRowKeyNew
          v-if="displayNewKeyForm"
          v-model="displayNewKeyForm"
          :account-id="account.id"
          @created="refreshKeys"
        />

        <p
          v-if="pending"
          class="mt-2 text-sm text-gray-500 font-sans tracking-tight"
        >
          Chargement...
        </p>

        <ul
          v-else-if="keys.length"
          class="mt-2 space-y-2"
        >
          <ServiceAccountRowKey
            v-for="key in keys"
            :key="key.id"
            v-model="activeKeyId"
            :service-key="key"
            @updated="refreshKeys"
            @deleted="refreshKeys"
          />
        </ul>

        <p
          v-else
          class="mt-2 text-sm text-gray-500 font-sans tracking-tight"
        >
          Aucune clé trouvé.
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
