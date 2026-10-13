<script setup lang="ts">
import type { IncidentGetData } from '~/types/elysia'
import PhishingTimelineItem from './PhishingTimelineItem.vue'

type AffectedUser = NonNullable<IncidentGetData['affectedUsers']>[number]

defineProps<{
  logs: AffectedUser['connectionLogs']
}>()
</script>

<template>
  <div
    v-if="logs && logs.length > 0"
    class="relative pl-4 sm:pl-8 before:absolute before:inset-y-0 before:-ml-px before:left-4 sm:before:left-8 before:w-0.5 before:bg-gradient-to-b before:from-primary-300 before:via-primary-200 before:to-transparent"
  >
    <div class="space-y-5 sm:space-y-8 relative">
      <PhishingTimelineItem
        v-for="(log, i) in logs"
        :key="log.id"
        :log="log"
        :is-last="i === logs.length - 1"
      />
    </div>
  </div>
  <div
    v-else
    class="rounded-xl border border-dashed border-primary-200/50 p-6 sm:p-10 flex flex-col items-center justify-center text-secondary-500 bg-background/20 backdrop-blur-sm shadow-sm"
  >
    <div class="p-3 bg-secondary-100/50 rounded-full mb-3">
      <Icon
        name="lucide:activity"
        class="size-6 text-secondary-400"
      />
    </div>
    <span class="text-sm font-medium tracking-tight">Aucun log d'activité disponible</span>
  </div>
</template>
