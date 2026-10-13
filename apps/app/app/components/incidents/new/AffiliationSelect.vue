<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { UISelect, UIInput, type UISelectOption } from '@slowpoke/ui'
import { affiliationTypes, AFFILIATION_OTHER } from '~/types/affiliation'

const model = defineModel<string | null | undefined>({ default: '' })

const options: UISelectOption[] = [
  { value: '', label: 'Non renseigné' },
  ...affiliationTypes.map(t => ({ value: t.value, label: t.label })),
  { value: AFFILIATION_OTHER, label: 'Autre…' },
]

const knownValues = new Set<string>(affiliationTypes.map(t => t.value))

// État UI du mode « Autre », indépendant du modèle : évite la boucle où un customValue
// vide (au moment de choisir « Autre ») réécrit model.value = '' puis re-dérive
// selectValue = '' à partir du modèle, annulant aussitôt la sélection de l'utilisateur.
const initialValue = model.value ?? ''
const isOther = ref(!!initialValue && !knownValues.has(initialValue))
const customValue = ref(isOther.value ? initialValue : '')

const selectValue = computed<string>({
  get: () => isOther.value ? AFFILIATION_OTHER : (model.value ?? ''),
  set: (v) => {
    if (v === AFFILIATION_OTHER) {
      isOther.value = true
      model.value = customValue.value
    }
    else {
      isOther.value = false
      customValue.value = ''
      model.value = v
    }
  },
})

watch(customValue, (v) => {
  if (isOther.value) model.value = v
})

// Si le modèle change depuis l'extérieur (ex. reset de formulaire) vers une valeur connue/vide,
// on quitte le mode « Autre » ; on l'ignore tant qu'on est nous-mêmes en train d'écrire dedans.
watch(() => model.value, (v) => {
  const value = v ?? ''
  if (isOther.value && value === customValue.value) return
  if (!value) {
    isOther.value = false
    customValue.value = ''
  }
  else if (knownValues.has(value)) {
    isOther.value = false
    customValue.value = ''
  }
})
</script>

<template>
  <div class="space-y-2">
    <UISelect
      v-model="selectValue"
      :items="options"
      :multi-select="false"
      placeholder="Sélectionner une affiliation"
    />
    <UIInput
      v-if="isOther"
      v-model="customValue"
      placeholder="Préciser l'affiliation"
    />
  </div>
</template>
