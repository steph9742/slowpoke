<script setup lang="ts">
import type { Eden, Treaty } from '@slowpoke/eden'

type Timeline = Treaty.Data<Eden['api']['timeline']['get']>

const props = defineProps<{
  items: Timeline
}>()

const groupedItems = computed(() => {
  const groups: Record<string, Timeline[number][]> = {}

  props.items.forEach((item) => {
    const date = new Date(item.createdAt).toDateString()
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(item)
  })

  return groups
})
</script>

<template>
  <div>
    <TimelineGroup
      v-for="(groupItems, date) in groupedItems"
      :key="date"
      :date="date"
      :items="groupItems"
    />
  </div>
</template>
