<script setup lang="ts">
import type { Eden } from '@slowpoke/eden'
import type { EdenItem } from '../../types/elysia'
import type { IncidentLogType } from './TimelineLogType'

const props = defineProps<{
  item: EdenItem<Eden['api']['timeline']['get']>
}>()

const displayString = computed(() => {
  switch (props.item.type as IncidentLogType) {
    case 'update':
      return 'a mis à jour l\'incident'
    case 'comment':
      return 'a commenté sur l\'incident'
    case 'status_change':
      return 'a changé le statut de l\'incident'
    case 'created':
      return 'a créé l\'incident'
    case 'artifact_added':
      return 'a ajouté un artéfact à l\'incident'
    case 'artifact_removed':
      return 'a retiré un artéfact de l\'incident'
    case 'user_added':
      return 'a ajouté un utilisateur à l\'incident'
    case 'user_removed':
      return 'a retiré un utilisateur de l\'incident'
    case 'extension_updated':
      return 'a mis à jour l\'extension d\'incident'
    default:
      return 'a fait une action sur l\'incident'
  }
})

// Auteur du log : utilisateur si présent, sinon compte de service (créé via API/curl)
const author = computed(() => props.item?.createdByUser ?? props.item?.createdBySvc ?? null)
const isService = computed(() => !props.item?.createdByUser && !!props.item?.createdBySvc)
</script>

<template>
  <li class="flex items-center">
    <TimelineItemIcon :type="item.type as IncidentLogType" />
    <div class="hidden sm:block border-r-2 border-dashed border-gray-400 h-24 mr-5 shrink-0" />
    <div class="font-sans border border-gray-300 rounded-xl p-3 sm:p-4 bg-white shadow-sm flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <UIAvatar
          :src="item?.createdByUser?.image ?? ''"
          :fallback-name="author?.name ?? 'Système'"
          :icon="isService ? 'lucide:bot' : undefined"
          class="shrink-0"
        />
        <p class="min-w-0 break-words text-sm text-gray-700">
          <span class="font-semibold mr-1">{{ author?.name ?? 'Système' }}</span>
          <span class="text-gray-600 mr-1">{{ displayString }}</span>
          <NuxtLink
            :to="`/incidents/${item?.incidentId}`"
            class="text-gray-800 font-semibold hover:underline break-all"
          >{{ item?.incidentId }}</NuxtLink>
        </p>
      </div>
      <p
        v-if="item.message"
        class="mt-1.5 ml-0 sm:ml-10 text-xs font-mono text-gray-500 leading-relaxed break-words whitespace-pre-wrap"
      >
        {{ item.message }}
      </p>
    </div>
  </li>
</template>
