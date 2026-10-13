<script setup lang="ts">
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { computed } from 'vue'

const props = defineProps<{
  items?: {
    code: string
    composante: string
    count: number
  }[]
  /** Incidents rattachés à aucune composante : jamais répartis sur les autres. */
  sansComposante?: number
  /** Incidents rattachés à une unité de recherche : un rattachement connu, pas une lacune. */
  laboratoires?: number
}>()

const maxCount = computed(() => {
  if (!props.items?.length) return 0
  return Math.max(...props.items.map(i => Number(i.count)))
})
</script>

<template>
  <Card class="flex flex-col relative overflow-hidden border-border/50 shadow-sm">
    <CardHeader class="pb-2 relative z-10">
      <CardTitle class="text-xl font-bold tracking-tight">
        Composantes impactées
      </CardTitle>
    </CardHeader>

    <CardContent class="relative z-10 flex-1 pt-6">
      <ul class="space-y-6">
        <li
          v-for="(item, index) in items"
          :key="item.composante ?? index"
          class="relative"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-semibold tracking-tight flex items-center gap-2.5">
              <span class="text-xs text-muted-foreground font-mono opacity-50">{{ (index + 1).toString().padStart(2, '0') }}</span>
              <span>{{ item.composante }}</span>
              <span class="text-[10px] text-muted-foreground font-mono opacity-60">{{ item.code }}</span>
            </span>
            <span class="text-sm font-mono font-medium bg-secondary/50 px-2 py-0.5 rounded-md">{{ item.count }}</span>
          </div>
          <div class="h-1 w-full bg-secondary/40 rounded-full overflow-hidden">
            <div
              class="h-full bg-primary rounded-full transition-all duration-1000 ease-out relative"
              :style="{ width: `${(item.count / maxCount) * 100}%` }"
            />
          </div>
        </li>

        <!-- Un laboratoire a un rattachement CONNU, qui n'est simplement pas une
             composante : une UMR n'a pas de tutelle d'UFR à lui inventer. Le ranger avec
             les lacunes ferait passer un quart du parc pour une donnée manquante. -->
        <li
          v-if="laboratoires"
          class="pt-2 border-t border-border/40"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">
              Unités de recherche
              <span class="opacity-60">— comptées à part, hors composantes</span>
            </span>
            <span class="text-sm font-mono font-medium bg-secondary/30 px-2 py-0.5 rounded-md text-muted-foreground">{{ laboratoires }}</span>
          </div>
        </li>

        <!-- Ce qui reste : rattachement réellement inconnu. -->
        <li
          v-if="sansComposante"
          :class="laboratoires ? '' : 'pt-2 border-t border-border/40'"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">
              Sans rattachement connu
              <span class="opacity-60">— directions internes, saisie absente</span>
            </span>
            <span class="text-sm font-mono font-medium bg-secondary/30 px-2 py-0.5 rounded-md text-muted-foreground">{{ sansComposante }}</span>
          </div>
        </li>

        <div
          v-if="!items?.length"
          class="text-muted-foreground text-sm italic py-8 text-center flex flex-col items-center gap-2"
        >
          <div
            class="w-8 h-8 rounded-full border border-dashed border-muted-foreground/30 flex items-center justify-center"
          >
            <span class="opacity-30">/</span>
          </div>
          Aucune donnée recensée.
        </div>
      </ul>
    </CardContent>
  </Card>
</template>

<style scoped>
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
