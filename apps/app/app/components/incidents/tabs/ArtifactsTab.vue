<script setup lang="ts">
import type { Artifact } from '~/types/elysia'
import ArtifactUploadModal from '../../artifacts/ArtifactUploadModal.vue'

const props = defineProps<{
  incidentId: string
}>()

const { data: artifacts, refresh } = await useAsyncData<Artifact[]>(`artifacts-${props.incidentId}`, async () => {
  const { data } = await useEden().api.artifacts({ incidentId: props.incidentId }).get()
  return data ?? []
}, { getCachedData: () => undefined })
</script>

<template>
  <div class="animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div class="flex items-center justify-between mb-6">
      <UITitle
        level="3"
        class="font-sans tracking-tight text-primary"
      >
        Artéfacts et fichiers
      </UITitle>
      <ArtifactUploadModal
        :incident-id="incidentId"
        @artifact-uploaded="refresh"
      />
    </div>

    <div class="rounded-xl border border-primary-200/50 bg-card/30 backdrop-blur-md shadow-sm p-6 min-h-[300px]">
      <ArtifactsList
        v-if="artifacts && artifacts.length > 0"
        :incident-id="incidentId"
        :artifacts="artifacts"
        class="font-sans"
      />

      <div
        v-else
        class="flex flex-col items-center justify-center h-full py-16 text-center"
      >
        <div class="w-16 h-16 rounded-2xl bg-muted/50 border border-primary-200 flex items-center justify-center mb-4 transform rotate-3">
          <Icon
            name="lucide:file-search"
            class="w-8 h-8 text-muted-foreground/70"
          />
        </div>
        <h4 class="text-base font-medium text-foreground mb-1 font-sans">
          Base d'artéfacts vide
        </h4>
        <p class="text-sm text-muted-foreground max-w-sm">
          Aucune capture réseau, log ou fichier binaire n'a été rattaché à cet incident pour le moment.
        </p>
      </div>
    </div>
  </div>
</template>
