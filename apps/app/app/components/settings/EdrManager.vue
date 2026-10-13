<script setup lang="ts">
import { UIButton, UIInput, useToast } from '@slowpoke/ui'
import { ref, onMounted } from 'vue'

// Réglages de l'EDR. LECTURE SEULE : Slowpoke constate les règles de liste blanche pour
// les rapprocher des exclusions consignées, il n'écrit jamais dans l'outil. Le compte de
// service employé n'a donc pas à disposer du moindre droit d'écriture.

const eden = useEden()
const toast = useToast()

const chargement = ref(true)
const enCours = ref(false)
const url = ref('')
const jeton = ref('')
const jetonDefini = ref(false)
const actif = ref(false)

type Essai = { ok: true, regles: number, schema: string } | { ok: false, message: string }
const essai = ref<Essai | null>(null)
const bilan = ref<{ vues: number, ecrites: number, disparues: number } | null>(null)

function appliquer(d: { url: string | null, tokenDefini: boolean, actif: boolean }) {
  url.value = d.url ?? ''
  jetonDefini.value = d.tokenDefini
  actif.value = d.actif
  jeton.value = ''
}

onMounted(async () => {
  const { data } = await eden.api.settings.harfanglab.get()
  if (data) appliquer(data)
  chargement.value = false
})

async function enregistrer() {
  if (enCours.value) return
  enCours.value = true
  essai.value = null
  const { data, error } = await eden.api.settings.harfanglab.put({
    url: url.value,
    ...(jeton.value.trim() ? { token: jeton.value } : {}),
  })
  if (error || !data) toast.newToast({ duration: 4000, title: 'Erreur', message: 'Enregistrement impossible.', type: 'error' })
  else {
    appliquer(data)
    toast.newToast({ duration: 2500, title: 'Réglages enregistrés', message: '', type: 'success' })
  }
  enCours.value = false
}

async function tester() {
  if (enCours.value) return
  enCours.value = true
  essai.value = null
  const { data, error } = await eden.api.settings.harfanglab.test.post()
  essai.value = error
    ? { ok: false, message: 'Renseignez l\'adresse et le jeton avant d\'essayer.' }
    : data as Essai
  enCours.value = false
}

async function synchroniser() {
  if (enCours.value) return
  enCours.value = true
  bilan.value = null
  const { data, error } = await eden.api.settings.harfanglab.sync.post()
  if (error || !data) {
    toast.newToast({
      duration: 5000,
      title: 'Erreur',
      message: (error?.value as { message?: string })?.message ?? 'Lecture impossible.',
      type: 'error',
    })
  }
  else { bilan.value = data }
  enCours.value = false
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
    <div class="flex flex-wrap items-center gap-2">
      <span
        class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono"
        :class="actif
          ? 'border-green-200/70 bg-green-50 text-green-700'
          : 'border-secondary-200/70 bg-secondary-50 text-secondary-500'"
      >
        <Icon
          name="lucide:shield-off"
          class="size-3.5"
        />
        {{ actif ? 'Configuré' : 'Non configuré' }}
      </span>
      <span class="text-xs text-secondary-500">
        Règles relues toutes les 6 heures. <strong>Lecture seule</strong> : Slowpoke n'écrit jamais dans l'EDR.
      </span>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Adresse *</label>
      <UIInput
        v-model="url"
        placeholder="Racine de l'instance, sans chemin"
      />
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Jeton d'API *</label>
      <UIInput
        v-model="jeton"
        type="password"
        name="edr-token"
        autocomplete="off"
        data-1p-ignore
        :placeholder="jetonDefini ? 'Inchangé' : 'Jeton d\'un compte en lecture seule'"
      />
      <p class="text-xs text-secondary-500">
        Un compte <strong>sans aucun droit d'écriture</strong> suffit. Chiffré en base et jamais renvoyé au navigateur.
      </p>
    </div>

    <div
      v-if="essai"
      class="rounded-xl border p-3 text-sm"
      :class="essai.ok ? 'border-green-200/70 bg-green-50/60 text-green-800' : 'border-red-200/70 bg-red-50/60 text-red-800'"
    >
      <template v-if="essai.ok">
        Connexion établie — {{ essai.regles }} règle(s) de liste blanche, authentification « {{ essai.schema }} ».
      </template>
      <template v-else>
        Échec : {{ essai.message }}
      </template>
    </div>

    <div
      v-if="bilan"
      class="rounded-xl border border-green-200/70 bg-green-50/60 p-3 text-sm text-green-800"
    >
      {{ bilan.ecrites }} règle(s) relue(s), {{ bilan.disparues }} disparue(s) de l'EDR.
      L'écart se consulte depuis <NuxtLink
        to="/exclusions"
        class="underline"
      >Listes blanches</NuxtLink>.
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
          name="lucide:plug-zap"
          class="size-4"
        />
        Essayer la connexion
      </UIButton>
      <UIButton
        v-if="actif"
        variant="ghost"
        :disabled="enCours"
        @click="synchroniser"
      >
        <Icon
          name="lucide:refresh-cw"
          class="size-4"
          :class="enCours ? 'animate-spin' : ''"
        />
        Relire maintenant
      </UIButton>
    </div>
  </div>
</template>
