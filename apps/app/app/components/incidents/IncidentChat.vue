<script setup lang="ts">
import { UIButton, useToast } from '@slowpoke/ui'
import { ref, watch, onMounted, nextTick } from 'vue'

// Conversation à propos d'un incident : une aide, pas une source.
//
// Hors de la chronologie, délibérément — le journal est une pièce de dossier. Deux fils :
// un partagé, pour que celui qui reprend l'incident voie ce qui a déjà été demandé, et
// celui de chacun pour ses questions tâtonnantes.

const props = defineProps<{ incidentId: string, actif: boolean }>()
const eden = useEden()
const toast = useToast()

type Message = { role: string, contenu: string, auteur: string | null, modele: string | null, creeLe: string }

const partagee = ref(true)
const messages = ref<Message[]>([])
const question = ref('')
const enCours = ref(false)
const fil = ref<HTMLElement | null>(null)

// Un champ vide invite à demander « est-ce grave ? », auquel le modèle répondra avec
// assurance sans en savoir rien. Ces amorces orientent vers ce qu'il peut faire.
const AMORCES = [
  'Que dit la procédure sur la préservation des preuves ?',
  'Quelles étapes restent d\'après la procédure ?',
  'Qu\'est-ce qui manque dans cette fiche ?',
]

async function charger() {
  const { data } = await eden.api.incidents({ id: props.incidentId })
    .chat.get({ query: { partagee: String(partagee.value) } })
  messages.value = data ?? []
  await nextTick()
  if (fil.value) fil.value.scrollTop = fil.value.scrollHeight
}

onMounted(charger)
watch(partagee, charger)

async function envoyer(texte?: string) {
  const q = (texte ?? question.value).trim()
  if (!q || enCours.value) return
  enCours.value = true
  question.value = ''

  // Affichée tout de suite : la réponse peut prendre une minute sur un modèle local.
  messages.value = [...messages.value, { role: 'user', contenu: q, auteur: null, modele: null, creeLe: new Date().toISOString() }]
  await nextTick()
  if (fil.value) fil.value.scrollTop = fil.value.scrollHeight

  const { data, error } = await eden.api.incidents({ id: props.incidentId })
    .chat.post({ question: q, partagee: partagee.value })

  if (error || !data) {
    messages.value = messages.value.slice(0, -1)
    question.value = q
    toast.newToast({
      duration: 5000,
      title: 'Sans réponse',
      message: (error?.value as { message?: string })?.message ?? 'Le modèle n\'a pas répondu.',
      type: 'error',
    })
  }
  else {
    await charger()
  }
  enCours.value = false
}

async function effacer() {
  if (!confirm(`Effacer ${partagee.value ? 'la conversation partagée' : 'votre conversation'} ? Cette action est définitive.`)) return
  await eden.api.incidents({ id: props.incidentId }).chat.delete({ query: { partagee: String(partagee.value) } })
  await charger()
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <div class="inline-flex gap-1 rounded-lg border border-secondary-200 bg-white p-0.5">
        <button
          v-for="f in [{ v: true, l: 'Partagée' }, { v: false, l: 'La mienne' }]"
          :key="String(f.v)"
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-sans transition-colors"
          :class="partagee === f.v ? 'bg-primary-500 text-white font-medium' : 'text-secondary-600 hover:bg-secondary-50'"
          @click="partagee = f.v"
        >
          {{ f.l }}
        </button>
      </div>
      <span class="text-xs text-secondary-500">
        {{ partagee ? 'Visible de toute la cellule.' : 'Visible de vous seul.' }}
        Cette conversation n'apparaît pas dans la chronologie.
      </span>
      <button
        v-if="messages.length"
        type="button"
        class="ml-auto text-xs text-secondary-400 hover:text-red-600 hover:underline"
        @click="effacer"
      >
        Effacer
      </button>
    </div>

    <div
      v-if="messages.length"
      ref="fil"
      class="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-secondary-200/60 bg-white p-3"
    >
      <div
        v-for="(m, i) in messages"
        :key="i"
        class="text-sm"
        :class="m.role === 'user' ? 'text-secondary-900' : 'text-secondary-700'"
      >
        <p class="text-[11px] font-semibold uppercase tracking-wider font-mono mb-0.5"
           :class="m.role === 'user' ? 'text-secondary-400' : 'text-primary-500'"
        >
          {{ m.role === 'user' ? 'Question' : `Réponse${m.modele ? ` · ${m.modele}` : ''}` }}
        </p>
        <div
          class="rounded-lg px-2.5 py-1.5"
          :class="m.role === 'user' ? 'bg-secondary-50' : 'bg-primary-50/40'"
        >
          <MarkdownText :texte="m.contenu" />
        </div>
      </div>

      <p
        v-if="enCours"
        class="text-xs text-secondary-400 italic"
      >
        Le modèle réfléchit — jusqu'à une minute selon la taille de la procédure.
      </p>
    </div>

    <div
      v-if="!messages.length"
      class="flex flex-wrap gap-1.5"
    >
      <button
        v-for="a in AMORCES"
        :key="a"
        type="button"
        class="rounded-full border border-secondary-200 bg-white px-2.5 py-1 text-xs text-secondary-600 hover:border-primary-300 hover:text-primary-700 transition-colors"
        :disabled="enCours || !actif"
        @click="envoyer(a)"
      >
        {{ a }}
      </button>
    </div>

    <div class="flex items-end gap-2">
      <textarea
        v-model="question"
        rows="2"
        :disabled="enCours || !actif"
        class="flex-1 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm font-sans focus:border-primary-400 focus:outline-none disabled:opacity-50"
        :placeholder="actif ? 'Une question sur cet incident ou sa procédure…' : 'Assistance non configurée.'"
        @keydown.enter.exact.prevent="envoyer()"
      />
      <UIButton
        class="h-10"
        :disabled="enCours || !actif || !question.trim()"
        @click="envoyer()"
      >
        <Icon
          :name="enCours ? 'lucide:loader-circle' : 'lucide:send'"
          class="size-4"
          :class="enCours ? 'animate-spin' : ''"
        />
      </UIButton>
    </div>

    <p class="text-xs text-secondary-400">
      Le modèle répond à partir de cet incident et de sa procédure. Il ne juge ni la gravité,
      ni l'applicabilité d'un délai réglementaire — et ce qu'il dit reste à vérifier.
    </p>
  </div>
</template>
