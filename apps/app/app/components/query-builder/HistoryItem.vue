<script setup lang="ts">
type QueryHistoryEntry = {
  id: string
  query: string
  createdAt: number
}

const props = defineProps<{
  entry: QueryHistoryEntry
}>()

const emit = defineEmits<{
  select: [query: string]
}>()

const formattedDate = computed(() => {
  return new Date(props.entry.createdAt).toLocaleString('fr-FR')
})
</script>

<template>
  <li
    class="border border-neutral-200 rounded px-3 py-2 bg-white cursor-pointer hover:bg-neutral-50"
    :title="entry.query"
    @dblclick="emit('select', entry.query)"
  >
    <p class="text-sm font-medium truncate font-mono tracking-tighter">
      {{ entry.query }}
    </p>
    <p class="text-xs text-neutral-500">
      {{ formattedDate }}
    </p>
  </li>
</template>
