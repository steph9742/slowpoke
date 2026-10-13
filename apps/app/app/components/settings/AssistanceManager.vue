<script setup lang="ts">
import { UIButton, UIInput, useToast } from '@slowpoke/ui'
import { ref, onMounted } from 'vue'

// Réglages du modèle local. Le jeton est chiffré et ne repart jamais vers le navigateur.
// La liste des modèles vient du serveur d'inférence : adresse et jeton suffisent à
// l'obtenir, avant même d'avoir choisi.

const eden = useEden()
const toast = useToast()

const chargement = ref(true)
const enCours = ref(false)
const baseUrl = ref('')
const modele = ref('')
const contexte = ref('')
const jeton = ref('')
const jetonDefini = ref(false)
const jetonApercu = ref<string | null>(null)
const actif = ref(false)

const prompts = ref<{ nom: string, valeur: string, defaut: string }[]>([])
const promptsOuverts = ref(false)
const modeles = ref<{ id: string, nom: string }[]>([])
const erreurModeles = ref<string | null>(null)
type Essai = { ok: true, reponse: string } | { ok: false, message: string }
const essai = ref<Essai | null>(null)

function appliquer(d: {
  baseUrl: string | null
  modele: string | null
  contexte: string | null
  tokenDefini: boolean
  tokenApercu: string | null
  actif: boolean
}) {
  baseUrl.value = d.baseUrl ?? ''
  modele.value = d.modele ?? ''
  contexte.value = d.contexte ?? ''
  jetonDefini.value = d.tokenDefini
  jetonApercu.value = d.tokenApercu
  actif.value = d.actif
  jeton.value = ''
}

onMounted(async () => {
  const { data } = await eden.api.settings.ia.get()
  if (data) appliquer(data)
  chargement.value = false
  if (data?.tokenDefini) chargerModeles()
  const { data: p } = await eden.api.settings.ia.prompts.get()
  if (p) prompts.value = p
})

const LIBELLE_PROMPT: Record<string, string> = {
  systeme: 'Cadre général',
  resume: 'Résumer',
  iocs: 'Relever les indicateurs',
  avancement: 'Situer l\'avancement',
  procedure: 'Suggérer la procédure',
}

async function enregistrerPrompts() {
  if (enCours.value) return
  enCours.value = true
  const corps = Object.fromEntries(prompts.value.map(p => [p.nom, p.valeur]))
  const { error } = await eden.api.settings.ia.prompts.put(corps)
  toast.newToast(error
    ? { duration: 4000, title: 'Erreur', message: 'Enregistrement impossible.', type: 'error' }
    : { duration: 2500, title: 'Consignes enregistrées', message: '', type: 'success' })
  enCours.value = false
}

async function chargerModeles() {
  erreurModeles.value = null
  const { data, error } = await eden.api.settings.ia.modeles.get()
  if (error || !data) {
    modeles.value = []
    erreurModeles.value = (error?.value as { message?: string })?.message ?? 'Liste indisponible.'
    return
  }
  modeles.value = data
}

async function enregistrer() {
  if (enCours.value) return
  enCours.value = true
  essai.value = null
  try {
    const { data, error } = await eden.api.settings.ia.put({
      baseUrl: baseUrl.value,
      modele: modele.value,
      contexte: contexte.value,
      ...(jeton.value.trim() ? { token: jeton.value } : {}),
    })
    if (error || !data) throw new Error('échec')
    appliquer(data)
    toast.newToast({ duration: 2500, title: 'Réglages enregistrés', message: '', type: 'success' })
    await chargerModeles()
  }
  catch {
    toast.newToast({ duration: 4000, title: 'Erreur', message: 'Enregistrement impossible.', type: 'error' })
  }
  finally {
    enCours.value = false
  }
}

async function tester() {
  if (enCours.value) return
  enCours.value = true
  essai.value = null
  try {
    const { data, error } = await eden.api.settings.ia.test.post()
    essai.value = error
      ? { ok: false, message: 'Renseignez l\'adresse, le jeton et le modèle avant d\'essayer.' }
      : data as Essai
  }
  finally {
    enCours.value = false
  }
}
</script>

<template>
  <div
    v-if="chargement"
    class="text-sm text-secondary-500"
  >
    Chargement…
  </div>

  <div
    v-else
    class="space-y-4"
  >
    <div class="flex items-center gap-2">
      <span
        class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono"
        :class="actif
          ? 'border-green-200/70 bg-green-50 text-green-700'
          : 'border-secondary-200/70 bg-secondary-50 text-secondary-500'"
      >
        <Icon
          :name="actif ? 'lucide:sparkles' : 'lucide:sparkles'"
          class="size-3.5"
        />
        {{ actif ? 'Configuré' : 'Non configuré' }}
      </span>
      <span class="text-xs text-secondary-500">
        Le modèle propose, un analyste valide. Rien n'est écrit dans les champs d'un incident.
      </span>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Adresse du serveur d'inférence *</label>
      <UIInput
        v-model="baseUrl"
        placeholder="Racine de l'API, sans chemin ni barre finale"
      />
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Clé d'API *</label>
      <UIInput
        v-model="jeton"
        type="password"
        name="ia-token"
        autocomplete="off"
        data-1p-ignore
        data-lpignore="true"
        :placeholder="jetonDefini ? `Inchangé (${jetonApercu})` : 'Clé fournie par le serveur d\'inférence'"
      />
      <p class="text-xs text-secondary-500">
        Chiffrée en base et jamais renvoyée au navigateur.
      </p>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Modèle *</label>
      <div class="flex items-center gap-2">
        <select
          v-model="modele"
          class="flex-1 h-10 rounded-lg border border-secondary-200 bg-white px-3 text-sm font-sans focus:border-primary-400 focus:outline-none"
        >
          <option value="">
            — choisir —
          </option>
          <!-- Le modèle enregistré peut ne plus être proposé : on le garde visible plutôt
               que de le faire disparaître silencieusement du champ. -->
          <option
            v-if="modele && !modeles.some(m => m.id === modele)"
            :value="modele"
          >
            {{ modele }} (absent de la liste)
          </option>
          <option
            v-for="m in modeles"
            :key="m.id"
            :value="m.id"
          >
            {{ m.nom }}
          </option>
        </select>
        <UIButton
          variant="outline"
          class="h-10"
          :disabled="enCours"
          @click="chargerModeles"
        >
          <Icon
            name="lucide:refresh-cw"
            class="size-4"
          />
          Actualiser
        </UIButton>
      </div>
      <p
        v-if="erreurModeles"
        class="text-xs text-amber-600"
      >
        {{ erreurModeles }}
      </p>
      <p
        v-else-if="modeles.length"
        class="text-xs text-secondary-500"
      >
        {{ modeles.length }} modèle(s) proposé(s) par le serveur.
      </p>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Contexte de l'établissement</label>
      <textarea
        v-model="contexte"
        rows="5"
        class="w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm font-sans focus:border-primary-400 focus:outline-none"
        placeholder="Ce que la cellule fait, ses outils, ses interlocuteurs, ses délais. Ce texte est joint à chaque demande."
      />
      <p class="text-xs text-secondary-500">
        Sans lui, les réponses restent génériques. Les procédures, elles, sont jointes automatiquement.
      </p>
    </div>

    <div
      v-if="essai"
      class="rounded-xl border p-3 text-sm"
      :class="essai.ok
        ? 'border-green-200/70 bg-green-50/60 text-green-800'
        : 'border-red-200/70 bg-red-50/60 text-red-800'"
    >
      <template v-if="essai.ok">
        Le modèle répond : « {{ essai.reponse }} »
      </template>
      <template v-else>
        Échec : {{ essai.message }}
      </template>
    </div>

    <!-- Consignes : la forme de la réponse attendue n'est pas ici, elle est dans le code.
         Une consigne mal réécrite dégrade la réponse, elle ne casse pas l'analyse. -->
    <div class="rounded-xl border border-secondary-200/60 bg-secondary-50/40">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        @click="promptsOuverts = !promptsOuverts"
      >
        <span class="text-sm font-medium text-secondary-700">Consignes envoyées au modèle</span>
        <Icon
          :name="promptsOuverts ? 'lucide:chevron-up' : 'lucide:chevron-down'"
          class="size-4 text-secondary-500"
        />
      </button>

      <div
        v-if="promptsOuverts"
        class="space-y-3 border-t border-secondary-200/60 p-3"
      >
        <div
          v-for="p in prompts"
          :key="p.nom"
          class="space-y-1"
        >
          <div class="flex items-baseline justify-between gap-2">
            <label class="text-xs font-semibold text-secondary-600">{{ LIBELLE_PROMPT[p.nom] ?? p.nom }}</label>
            <button
              v-if="p.valeur.trim()"
              type="button"
              class="text-[11px] text-primary-600 hover:underline"
              @click="p.valeur = ''"
            >
              revenir au défaut
            </button>
          </div>
          <textarea
            v-model="p.valeur"
            rows="4"
            class="w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-xs font-mono focus:border-primary-400 focus:outline-none"
            :placeholder="p.defaut"
          />
        </div>
        <p class="text-xs text-secondary-500">
          Vide = consigne par défaut, affichée en filigrane. Le format de réponse attendu n'est pas modifiable :
          il est ajouté par l'application pour que l'analyse reste exploitable.
        </p>
        <UIButton
          variant="outline"
          class="h-8 text-xs"
          :disabled="enCours"
          @click="enregistrerPrompts"
        >
          Enregistrer les consignes
        </UIButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 pt-1">
      <UIButton
        :disabled="enCours"
        @click="enregistrer"
      >
        <Icon
          name="lucide:save"
          class="size-4"
        />
        Enregistrer
      </UIButton>
      <UIButton
        variant="outline"
        :disabled="enCours"
        @click="tester"
      >
        <Icon
          name="lucide:sparkles"
          class="size-4"
        />
        Essayer le modèle
      </UIButton>
    </div>
  </div>
</template>
