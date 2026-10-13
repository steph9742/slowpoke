<script setup lang="ts">
import { UITabs, UITabsItem } from '@slowpoke/ui'
import { ref, computed, onMounted } from 'vue'

const activeTab = defineModel<string>('activeTab')
const props = defineProps<{ type?: string, incidentId?: string }>()

// Pastille d'échéance : sans elle, il faut ouvrir l'onglet pour découvrir qu'un compteur
// court depuis vingt heures. L'endpoint ne renvoie que les échéances, pas la checklist.
const eden = useEden()
const echeances = ref<{ nom: string, heuresRestantes: number | null, court: boolean }[]>([])

onMounted(async () => {
  if (!props.incidentId) return
  const { data } = await eden.api.incidents({ id: props.incidentId }).echeances.get()
  if (data) echeances.value = data
})

const plusProche = computed(() => {
  const armees = echeances.value.filter(e => e.court && e.heuresRestantes !== null)
  if (!armees.length) return null
  return armees.reduce((a, b) => (a.heuresRestantes! <= b.heuresRestantes! ? a : b))
})

// On n'alerte pas douze heures à l'avance : une pastille permanente cesse d'être vue.
const alerte = computed(() => {
  const h = plusProche.value?.heuresRestantes
  if (h === undefined || h === null) return null
  if (h < 0) return { texte: 'dépassée', classes: 'bg-red-100 text-red-700 border-red-200' }
  if (h < 6) return { texte: `${Math.round(h)} h`, classes: 'bg-amber-100 text-amber-800 border-amber-200' }
  return null
})

// L'onglet Utilisateurs n'a de sens que pour les types qui rattachent des utilisateurs concernés
const TYPES_WITH_USERS = ['phishing', 'malware', 'data_breach']
</script>

<template>
  <UITabs
    v-model="activeTab"
  >
    <UITabsItem
      value="details"
    >
      Détails
    </UITabsItem>
    <UITabsItem
      v-if="type === 'phishing'"
      value="activity"
    >
      Activité
    </UITabsItem>
    <UITabsItem
      value="conduite"
    >
      Conduite à tenir
      <span
        v-if="alerte"
        class="ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold font-mono align-middle"
        :class="alerte.classes"
        :title="plusProche?.nom"
      >{{ alerte.texte }}</span>
    </UITabsItem>
    <UITabsItem
      value="enquete"
    >
      Enquête
    </UITabsItem>
    <UITabsItem
      value="timeline"
    >
      Chronologie
    </UITabsItem>
    <UITabsItem
      v-if="TYPES_WITH_USERS.includes(type ?? '')"
      value="users"
    >
      Utilisateurs
    </UITabsItem>
    <UITabsItem
      value="artifacts"
    >
      Artéfacts
    </UITabsItem>
  </UITabs>
</template>
