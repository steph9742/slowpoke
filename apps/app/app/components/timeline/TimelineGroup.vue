<script setup lang="ts">
import type { Eden } from '@slowpoke/eden'
import type { EdenItem } from '../../types/elysia'

defineProps<{
  date: string
  items: Array<EdenItem<Eden['api']['timeline']['get']>>
}>()
</script>

<template>
  <div class="mb-6">
    <TimelineGroupDate :date="date" />
    <ul class="space-y-4 sm:space-y-0">
      <TimelineGroupItem
        v-for="item in items"
        :key="item.id"
        :item="item"
      />
    </ul>
  </div>
</template>
