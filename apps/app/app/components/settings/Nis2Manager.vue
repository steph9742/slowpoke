<script setup lang="ts">
import { UIButton, useToast } from '@slowpoke/ui'
import { ref, onMounted } from 'vue'

// ENTRÉE EN VIGUEUR DE NIS 2.
//
// À partir de cette date, un incident P2 arme d'office les compteurs : armer se défait par une
// décision tracée, ne pas armer ne se rattrape que si quelqu'un y pense. Avant elle, et tant
// qu'elle n'est pas réglée, P2 reste « à évaluer ».
//
// Chargé au montage : au rendu serveur l'appel n'a pas la session.

const eden = useEden()
const toast = useToast()

const chargement = ref(true)
const enCours = ref(false)
/** Ce que le serveur a retenu, distinct de ce qui est en cours de saisie. */
const enregistree = ref<string | null>(null)
const saisie = ref('')

function appliquer(v: unknown) {
  const j = pourChampDate(v)
  enregistree.value = j || null
  saisie.value = j
}

onMounted(async () => {
  const { data } = await eden.api.settings.nis2.get()
  appliquer(data?.armeDepuis)
  chargement.value = false
})

async function enregistrer() {
  // Un champ vidé alors qu'une date était réglée efface un réglage réglementaire : ça se
  // confirme, sinon un clic distrait sur un écran mal chargé suffit à le perdre.
  if (!saisie.value.trim() && enregistree.value
    && !confirm('Retirer la date d\'entrée en vigueur ? Les P2 repasseront tous à « à évaluer ».')) {
    return
  }

  enCours.value = true
  const { data, error } = await eden.api.settings.nis2.put({ armeDepuis: saisie.value.trim() || null })
  enCours.value = false

  if (error) {
    // Le serveur dit pourquoi il refuse : le remplacer par « échec » obligerait à deviner.
    const detail = (error.value as { message?: string } | undefined)?.message
    toast.newToast({ title: 'Échec', message: detail || 'Date non enregistrée.', type: 'error', duration: 5000 })
    return
  }

  // Le serveur n'a pas protesté : c'est ce qui a été DEMANDÉ qui fait foi à l'écran. Déduire
  // l'état d'un corps de réponse qu'on ne saurait pas lire annoncerait « date retirée » sur
  // un enregistrement réussi — et inversement.
  const voulu = saisie.value.trim() || null
  appliquer(pourChampDate(data?.armeDepuis) || voulu)

  toast.newToast({
    title: voulu ? 'Entrée en vigueur enregistrée' : 'Date retirée',
    message: voulu
      ? 'Les incidents P2 connus à partir de cette date arment NIS 2 d\'office.'
      : 'Les incidents P2 restent « à évaluer ».',
    type: 'success',
    duration: 4000,
  })
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-col sm:flex-row sm:items-end gap-3">
      <div class="flex-1">
        <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono mb-1.5">
          Armer les P2 à partir du
        </label>
        <input
          v-model="saisie"
          type="date"
          :disabled="chargement"
          class="w-full h-11 rounded-lg border border-secondary-200 px-3 text-sm disabled:opacity-50"
        >
      </div>
      <UIButton
        :disabled="enCours || chargement"
        class="h-11"
        @click="enregistrer"
      >
        Enregistrer
      </UIButton>
    </div>

    <p
      v-if="chargement"
      class="text-xs text-secondary-400 font-mono"
    >
      Lecture du réglage…
    </p>
    <p
      v-else-if="enregistree"
      class="rounded-xl border border-primary-200/60 bg-primary-50/40 p-3 text-xs text-secondary-700"
    >
      Un incident <strong>P2</strong> connu à partir du
      <strong>{{ dateLongue(enregistree) }}</strong> arme les compteurs NIS 2 d'office. C'est
      une <strong>présomption, pas une décision</strong> : le RSSI peut l'écarter, et son
      choix est enregistré avec son nom. Les incidents antérieurs gardent « à évaluer ».
    </p>
    <p
      v-else
      class="rounded-xl border border-amber-200/60 bg-amber-50/40 p-3 text-xs text-secondary-700"
    >
      Aucune date réglée : les incidents <strong>P2</strong> restent <strong>« à évaluer »</strong>,
      compteur par compteur. C'est le comportement prudent tant que la transposition française
      de NIS 2 n'est pas connue — inutile de faire courir un délai qui ne court pas encore.
      Les <strong>P1</strong> arment d'office quoi qu'il arrive.
    </p>
  </div>
</template>
