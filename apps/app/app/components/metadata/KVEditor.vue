<script setup lang="ts">
import { ref, watch } from 'vue'
import { UIInput, UIButton } from '@slowpoke/ui'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const model = defineModel<Record<string, any>>({ default: () => ({}) })

// Valeurs éventuellement non-string (nombres du jsonb importé) -> string pour l'input
const entries = ref(Object.entries(model.value || {}).map(([key, value]) => ({ key, value: value == null ? '' : String(value) })))

watch(entries, (newEntries) => {
  const nextModel: Record<string, string> = {}
  newEntries.forEach(({ key, value }) => {
    if (key.trim() === '') return // on ignore les lignes sans clé
    nextModel[key] = value
  })
  model.value = nextModel
}, { deep: true })

const addEntry = () => {
  entries.value.push({ key: '', value: '' })
}

const removeEntry = (index: number) => {
  entries.value.splice(index, 1)
}
</script>

<template>
  <div>
    <ul
      v-if="entries.length"
      class="space-y-2 mb-3"
    >
      <li
        v-for="(entry, index) in entries"
        :key="index"
        class="flex items-center gap-2"
      >
        <UIInput
          v-model="entry.key"
          placeholder="Clé (ex. Source du signalement)"
          class="flex-1 min-w-0"
          size="sm"
        />
        <UIInput
          v-model="entry.value"
          placeholder="Valeur"
          class="flex-1 min-w-0"
          size="sm"
        />
        <UIButton
          variant="ghost"
          size="sm"
          class="shrink-0 text-red-600 hover:bg-red-50"
          :aria-label="`Supprimer le champ ${entry.key || index + 1}`"
          @click="removeEntry(index)"
        >
          <Icon
            name="lucide:trash-2"
            class="size-4"
          />
        </UIButton>
      </li>
    </ul>
    <p
      v-else
      class="text-sm text-secondary-500 italic mb-3"
    >
      Aucun champ. Ajoutez-en un pour documenter une information libre.
    </p>
    <UIButton
      variant="outline"
      size="sm"
      @click="addEntry"
    >
      <Icon
        name="lucide:plus"
        class="size-4 mr-1"
      /> Ajouter un champ
    </UIButton>
  </div>
</template>
