<script setup lang="ts">
import { UIButton, UIInput, useToast } from '@slowpoke/ui'
import { ref, onMounted, watch } from 'vue'

// Machines concernées par un incident.
//
// La recherche est une AIDE, jamais un passage obligé : le champ reste un champ texte,
// les résultats s'affichent en dessous, et valider sans rien choisir enregistre ce qui est
// tapé. Un incident se saisit dans l'urgence — une machine absente de l'inventaire ou un
// inventaire vide ne doivent rien empêcher.

const props = defineProps<{ incidentId: string, modifiable: boolean }>()
const eden = useEden()
const toast = useToast()

type Machine = {
  nom: string
  glpiId: string | null
  groupe: string | null
  entite: string | null
  lieu: string | null
  type: string | null
  os: string | null
  critique: boolean
  presente: boolean
  url: string | null
}
type Suggestion = Machine & { glpiId: string }

const machines = ref<Machine[]>([])
const saisie = ref('')
const suggestions = ref<Suggestion[]>([])
const cherche = ref(false)
const enCours = ref(false)
let minuteur: ReturnType<typeof setTimeout> | null = null

async function charger() {
  const { data } = await eden.api.incidents({ id: props.incidentId }).machines.get()
  machines.value = data ?? []
}
onMounted(charger)

// Temporisation : on cherche pendant que la personne tape, sans lancer une requête par
// touche. La saisie n'est jamais bloquée par la recherche en cours.
watch(saisie, (q) => {
  if (minuteur) clearTimeout(minuteur)
  if (q.trim().length < 2) {
    suggestions.value = []
    return
  }
  minuteur = setTimeout(async () => {
    cherche.value = true
    const { data } = await eden.api.machines.recherche.get({ query: { q } })
    // La saisie a pu changer pendant l'appel : on ignore un résultat devenu obsolète.
    if (saisie.value === q) suggestions.value = (data ?? []) as Suggestion[]
    cherche.value = false
  }, 250)
})

async function rattacher(nom: string, glpiId?: string) {
  const n = nom.trim()
  if (!n || enCours.value) return
  enCours.value = true
  const { error } = await eden.api.incidents({ id: props.incidentId })
    .machines.post({ nom: n, ...(glpiId ? { glpiId } : {}) })
  if (error) {
    toast.newToast({ duration: 4000, title: 'Erreur', message: 'Rattachement impossible.', type: 'error' })
  }
  else {
    saisie.value = ''
    suggestions.value = []
    await charger()
  }
  enCours.value = false
}

async function detacher(nom: string) {
  await eden.api.incidents({ id: props.incidentId }).machines({ nom: encodeURIComponent(nom) }).delete()
  await charger()
}
</script>

<template>
  <div class="space-y-2">
    <ul
      v-if="machines.length"
      class="space-y-1.5"
    >
      <li
        v-for="m in machines"
        :key="m.nom"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5"
        :class="m.critique ? 'border-red-200/70 bg-red-50/40' : 'border-secondary-200/60 bg-white'"
      >
        <span class="font-mono text-sm text-secondary-900">{{ m.nom }}</span>

        <span
          v-if="m.critique"
          class="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700"
        >critique</span>
        <!-- Rattachée puis sortie de l'inventaire : le nom reste, mais on le signale. -->
        <span
          v-else-if="m.glpiId && !m.presente"
          class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800"
          title="Cette machine n'est plus dans l'inventaire"
        >retirée de l'inventaire</span>
        <span
          v-else-if="!m.glpiId"
          class="rounded bg-secondary-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-secondary-500"
          title="Saisie libre, sans correspondance dans l'inventaire"
        >hors inventaire</span>

        <span
          v-if="m.groupe || m.entite || m.lieu"
          class="text-xs text-secondary-500"
        >
          {{ [m.groupe, m.entite, m.lieu].filter(Boolean).join(' · ') }}
        </span>
        <span
          v-if="m.os"
          class="text-xs text-secondary-400"
        >{{ m.os }}</span>

        <a
          v-if="m.url"
          :href="m.url"
          target="_blank"
          rel="noopener noreferrer"
          class="ml-auto text-xs text-primary-600 hover:underline"
        >inventaire</a>
        <button
          v-if="modifiable"
          type="button"
          class="text-xs text-secondary-400 hover:text-red-600"
          :class="m.url ? '' : 'ml-auto'"
          @click="detacher(m.nom)"
        >
          retirer
        </button>
      </li>
    </ul>

    <div
      v-if="modifiable"
      class="relative"
    >
      <div class="flex items-center gap-2">
        <UIInput
          v-model="saisie"
          placeholder="Nom de la machine — cherché dans l'inventaire, ou saisi librement"
          class="flex-1"
          @keydown.enter.prevent="rattacher(saisie)"
        />
        <UIButton
          variant="outline"
          class="h-10"
          :disabled="enCours || !saisie.trim()"
          @click="rattacher(saisie)"
        >
          Ajouter
        </UIButton>
      </div>

      <!-- Suggestions : proposées, jamais imposées. Valider sans en choisir enregistre
           le texte tel quel. -->
      <ul
        v-if="suggestions.length"
        class="mt-1 max-h-56 overflow-y-auto rounded-lg border border-secondary-200 bg-white shadow-sm"
      >
        <li
          v-for="s in suggestions"
          :key="s.glpiId"
        >
          <button
            type="button"
            class="flex w-full flex-wrap items-baseline gap-x-2 px-2.5 py-1.5 text-left hover:bg-secondary-50"
            @click="rattacher(s.nom, s.glpiId)"
          >
            <span class="font-mono text-sm text-secondary-900">{{ s.nom }}</span>
            <span
              v-if="s.critique"
              class="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700"
            >critique</span>
            <span
              v-if="!s.presente"
              class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800"
            >retirée</span>
            <span class="text-xs text-secondary-500">
              {{ [s.groupe, s.entite, s.lieu].filter(Boolean).join(' · ') }}
            </span>
          </button>
        </li>
      </ul>

      <p
        v-if="cherche"
        class="mt-1 text-xs text-secondary-400"
      >
        Recherche dans l'inventaire… vous pouvez valider sans attendre.
      </p>
      <p
        v-else-if="saisie.trim().length >= 2 && !suggestions.length"
        class="mt-1 text-xs text-secondary-500"
      >
        Rien dans l'inventaire pour « {{ saisie.trim() }} » — <strong>Ajouter</strong> l'enregistre tel quel.
      </p>
    </div>
  </div>
</template>
