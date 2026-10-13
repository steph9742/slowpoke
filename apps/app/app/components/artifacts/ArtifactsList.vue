<script setup lang="ts">
import type { Artifact } from '~/types/elysia'
import ArtifactItem from './ArtifactItem.vue'

defineProps<{
  incidentId: string
  artifacts: Artifact[]
}>()
</script>

<template>
  <ul class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-fit">
    <ArtifactItem
      v-for="artifact in artifacts"
      :key="artifact.id"
      :incident-id="incidentId"
      :artifact="artifact"
    />
  </ul>
</template>
