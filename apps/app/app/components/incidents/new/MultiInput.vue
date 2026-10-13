<script setup lang="ts">
import { ref } from 'vue'

// Saisie multi-valeurs à puces (free-text) : machines, IP, IOC, vecteurs…
// Entrée ou virgule valide une valeur ; × ou Backspace (champ vide) la retire.
const model = defineModel<string[] | null>({ default: () => [] })
defineProps<{ placeholder?: string }>()

const draft = ref('')

function commit(raw: string) {
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (!parts.length) return
  const current = model.value ?? []
  const merged = [...current]
  for (const p of parts) if (!merged.includes(p)) merged.push(p)
  model.value = merged
}
function addDraft() {
  commit(draft.value)
  draft.value = ''
}
function onInput() {
  // gère la frappe ou le collage d'une virgule (« a, b, c »)
  if (draft.value.includes(',')) {
    commit(draft.value)
    draft.value = ''
  }
}
function remove(i: number) {
  model.value = (model.value ?? []).filter((_, idx) => idx !== i)
}
function onBackspace() {
  if (!draft.value && (model.value ?? []).length) remove((model.value ?? []).length - 1)
}
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-1.5 rounded-lg border border-secondary-200 bg-white px-2 py-1.5 min-h-[42px] focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 transition"
  >
    <span
      v-for="(v, i) in (model ?? [])"
      :key="i"
      class="inline-flex items-center gap-1 rounded-md bg-secondary-100 px-2 py-0.5 text-sm text-secondary-700 max-w-full"
    >
      <span class="truncate">{{ v }}</span>
      <button
        type="button"
        class="text-secondary-400 hover:text-red-600 shrink-0"
        @click="remove(i)"
      >
        <Icon
          name="lucide:x"
          class="size-3"
        />
      </button>
    </span>
    <input
      v-model="draft"
      type="text"
      :placeholder="placeholder ?? 'Ajouter une valeur…'"
      class="flex-1 min-w-32 bg-transparent border-0 outline-none text-sm py-0.5 px-1 text-secondary-900 placeholder:text-secondary-400"
      @keydown.enter.prevent="addDraft"
      @keydown.backspace="onBackspace"
      @input="onInput"
      @blur="addDraft"
    >
  </div>
</template>
