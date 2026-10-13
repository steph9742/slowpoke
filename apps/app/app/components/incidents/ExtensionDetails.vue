<script setup lang="ts">
import { computed } from 'vue'
import type { IncidentGetData } from '~/types/elysia'
import MetadataGrid from './MetadataGrid.vue'
import { metadataKeyLabel } from '~/types/metadata'

const props = defineProps<{
  extension: NonNullable<IncidentGetData['extension']>
}>()

// Un texte long ou multiligne — la description détaillée d'un SOC, une liste de postes —
// ne se lit pas dans une grille clé/valeur : il y devient une colonne illisible. On le
// sort donc en bloc, en préservant ses retours à la ligne, et la grille garde ce qui se
// parcourt d'un coup d'œil.
const EST_UN_BLOC = (v: unknown) => typeof v === 'string' && (v.includes('\n') || v.length > 120)

const champs = computed(() => (props.extension.customFields ?? {}) as Record<string, unknown>)
const blocs = computed(() => Object.entries(champs.value).filter(([, v]) => EST_UN_BLOC(v)) as [string, string][])
const grille = computed(() => Object.fromEntries(Object.entries(champs.value).filter(([, v]) => !EST_UN_BLOC(v))))
</script>

<template>
  <div class="p-6 rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md shadow-sm">
    <UITitle
      level="3"
      class="mb-4 text-primary-600 font-sans tracking-tight"
    >
      Attributs étendus
    </UITitle>
    <div
      v-if="extension && Object.keys(extension).length > 0"
      class="space-y-4"
    >
      <div class="flex flex-col gap-1 border-b border-primary-200/40 pb-2 last:border-0">
        <span class="text-secondary-600 text-xs uppercase tracking-wider font-semibold">Type</span>
        <span class="font-mono text-sm break-all text-text/90">{{ extension.customType }}</span>
      </div>

      <div
        v-if="extension.tags"
        class="flex flex-col gap-1 border-b border-primary-200/40 pb-2 last:border-0"
      >
        <span class="text-secondary-600 text-xs uppercase tracking-wider font-semibold">Tags</span>
        <ul>
          <li
            v-for="tag in extension.tags"
            :key="tag"
            class="font-mono text-sm break-all rounded-full px-1.5 py-0.5 bg-primary-50 text-primary-700 inline-block border border-primary-200/50"
          >
            {{ tag }}
          </li>
        </ul>
      </div>
      <div
        v-if="Object.keys(grille).length > 0"
        class="flex flex-col gap-2 border-b border-primary-200/40 pb-4 last:border-0 mt-2"
      >
        <span class="text-secondary-600 text-xs uppercase tracking-wider font-semibold mb-2">Champs</span>
        <div class="max-h-75 overflow-y-auto overflow-x-hidden p-1 -m-1">
          <MetadataGrid :info="grille" />
        </div>
      </div>

      <div
        v-for="[cle, texte] in blocs"
        :key="cle"
        class="flex flex-col gap-1.5 border-b border-primary-200/40 pb-4 last:border-0"
      >
        <span class="text-secondary-600 text-xs uppercase tracking-wider font-semibold">
          {{ metadataKeyLabel(cle) }}
        </span>
        <div class="max-h-96 overflow-y-auto">
          <MarkdownText :texte="texte" />
        </div>
      </div>
    </div>
    <div
      v-else
      class="text-sm text-secondary-600 italic mt-4"
    >
      Aucune métadonnée étendue fournie.
    </div>
  </div>
</template>
