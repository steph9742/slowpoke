<script setup lang="ts">
defineProps<{
  label: string
  icon: string
  values: (string | null)[] | null | undefined
  /** couleur de l'icône (classe text-*) */
  tone?: string
}>()
</script>

<template>
  <div
    v-if="values?.length"
    class="rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md p-3 sm:p-4 shadow-sm min-w-0"
  >
    <span class="text-xs font-semibold uppercase tracking-wider text-secondary-600 flex items-center gap-1.5 mb-2">
      <Icon
        :name="icon"
        class="size-3.5 shrink-0"
        :class="tone || 'text-primary-400'"
      /> {{ label }}
    </span>
    <div class="flex flex-wrap gap-1.5">
      <span
        v-for="(v, i) in values"
        :key="i"
        class="inline-flex rounded-md border border-secondary-200/60 bg-secondary-100 px-2 py-0.5 text-xs font-mono text-secondary-700 break-all"
      >{{ v }}</span>
    </div>
  </div>
</template>
