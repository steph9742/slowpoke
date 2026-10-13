<script setup lang="ts">
import { computed, ref } from 'vue'
import { metadataEntries } from '~/types/metadata'

const props = defineProps<{
  info: unknown
}>()

// Objet plat -> grille clé/valeur formatée ; sinon (texte libre) -> null et on rend un paragraphe.
const entries = computed(() => metadataEntries(props.info))

// Blocs longs (journal réseau…) repliés par défaut, dépliables au clic.
const expanded = ref<Record<string, boolean>>({})
const toggle = (key: string) => {
  expanded.value[key] = !expanded.value[key]
}
</script>

<template>
  <div
    v-if="entries"
    class="grid grid-cols-1 sm:grid-cols-2 gap-3"
  >
    <div
      v-for="e in entries"
      :key="e.key"
      class="flex flex-col rounded-lg border border-primary-200/50 bg-primary-50/40 p-3 shadow-sm min-w-0"
      :class="e.long ? 'sm:col-span-2' : ''"
    >
      <span class="text-[0.65rem] uppercase tracking-wider text-secondary-500 font-semibold truncate">{{ e.label }}</span>

      <!-- Valeur longue : bloc cliquable qui se déplie -->
      <template v-if="e.long">
        <button
          type="button"
          class="mt-1 text-left w-full cursor-pointer group"
          :aria-expanded="!!expanded[e.key]"
          @click="toggle(e.key)"
        >
          <span
            class="block text-sm font-mono text-text/80 whitespace-pre-wrap break-words"
            :class="expanded[e.key] ? 'max-h-96 overflow-y-auto' : 'line-clamp-3'"
          >{{ e.value }}</span>
          <span class="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary-600 group-hover:underline">
            <Icon
              :name="expanded[e.key] ? 'lucide:chevron-up' : 'lucide:chevron-down'"
              class="size-3.5 shrink-0"
            />
            {{ expanded[e.key] ? 'Réduire' : 'Tout afficher' }}
          </span>
        </button>
      </template>

      <span
        v-else
        class="mt-1 text-sm text-text/80 break-words line-clamp-3"
        :class="e.mono ? 'font-mono break-all' : ''"
        :title="e.value"
      >{{ e.value }}</span>
    </div>
  </div>
  <div
    v-else
    class="rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md p-3 sm:p-5 shadow-sm"
  >
    <p class="text-sm text-text/90 whitespace-pre-wrap break-words leading-relaxed">
      {{ info }}
    </p>
  </div>
</template>
