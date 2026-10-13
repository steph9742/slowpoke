<script setup lang="ts">
import { UIButton } from '@slowpoke/ui'
import HistoryItem from './HistoryItem.vue'

type QueryHistoryEntry = {
  id: string
  query: string
  createdAt: number
}

defineProps<{
  history: QueryHistoryEntry[]
}>()

const emit = defineEmits<{
  clear: []
  select: [query: string]
}>()
</script>

<template>
  <div class="bg-neutral-100 p-4 rounded-md mt-4">
    <div class="flex items-center justify-between mb-3">
      <h2 class="font-semibold font-sans tracking-tight">
        Historique
      </h2>
      <UIButton
        :disabled="history.length === 0"
        @click="emit('clear')"
      >
        Vider
      </UIButton>
    </div>

    <p
      v-if="history.length === 0"
      class="text-sm text-neutral-500"
    >
      Aucune requête enregistrée.
    </p>

    <ul
      v-else
      class="space-y-2 max-h-64 overflow-y-auto"
    >
      <HistoryItem
        v-for="entry in history"
        :key="entry.id"
        :entry="entry"
        @select="emit('select', $event)"
      />
    </ul>
  </div>
</template>
