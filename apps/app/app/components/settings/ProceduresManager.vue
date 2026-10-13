<script setup lang="ts">
import { UIButton, UIInput, useToast } from '@slowpoke/ui'
import { ref, onMounted } from 'vue'

// DÉPÔT DE PROCÉDURES — d'où Slowpoke lit les fiches et checklists de la cellule.
//
// GitLab reste la source de vérité : Slowpoke ne fait que lire, d'où un jeton en portée
// `read_repository` seulement. Comme pour le SOC, il est chiffré et ne repart jamais vers
// le navigateur.

const eden = useEden()
const toast = useToast()

const chargement = ref(true)
const enCours = ref(false)
const baseUrl = ref('')
const projet = ref('')
const branche = ref('')
const dossiers = ref('')
const jeton = ref('')
const jetonDefini = ref(false)
const jetonApercu = ref<string | null>(null)
const actif = ref(false)
const bilan = ref<{ vues: number, ecrites: number, inchangees: number, echecs: number } | null>(null)
const erreur = ref<string | null>(null)

function appliquer(d: {
  baseUrl: string | null
  projet: string | null
  ref: string | null
  dossiers: string | null
  tokenDefini: boolean
  tokenApercu: string | null
  actif: boolean
}) {
  baseUrl.value = d.baseUrl ?? ''
  projet.value = d.projet ?? ''
  branche.value = d.ref ?? ''
  dossiers.value = d.dossiers ?? ''
  jetonDefini.value = d.tokenDefini
  jetonApercu.value = d.tokenApercu
  actif.value = d.actif
  jeton.value = ''
}

onMounted(async () => {
  const { data } = await eden.api.settings.gitlab.get()
  if (data) appliquer(data)
  chargement.value = false
})

async function enregistrer() {
  if (enCours.value) return
  enCours.value = true
  bilan.value = null
  try {
    const { data, error } = await eden.api.settings.gitlab.put({
      baseUrl: baseUrl.value,
      projet: projet.value,
      ref: branche.value,
      dossiers: dossiers.value,
      ...(jeton.value.trim() ? { token: jeton.value } : {}),
    })
    if (error || !data) throw new Error('échec')
    appliquer(data)
    toast.newToast({ duration: 2500, title: 'Réglages enregistrés', message: '', type: 'success' })
  }
  catch {
    toast.newToast({ duration: 4000, title: 'Erreur', message: 'Enregistrement impossible.', type: 'error' })
  }
  finally {
    enCours.value = false
  }
}

async function synchroniser() {
  if (enCours.value) return
  enCours.value = true
  bilan.value = null
  erreur.value = null
  const { data, error } = await eden.api.settings.gitlab.sync.post()
  if (error || !data) {
    // Le message du serveur porte le code HTTP de GitLab : c'est lui qui dit quoi corriger.
    erreur.value = (error?.value as { message?: string })?.message ?? 'Synchronisation impossible.'
  }
  else {
    bilan.value = data
  }
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
    <div class="flex items-center gap-2">
      <span
        class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono"
        :class="actif
          ? 'border-green-200/70 bg-green-50 text-green-700'
          : 'border-secondary-200/70 bg-secondary-50 text-secondary-500'"
      >
        <Icon
          :name="actif ? 'lucide:book-check' : 'lucide:book-dashed'"
          class="size-3.5"
        />
        {{ actif ? 'Configuré' : 'Non configuré' }}
      </span>
      <span class="text-xs text-secondary-500">Relecture toutes les 6 heures.</span>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Adresse GitLab *</label>
      <UIInput
        v-model="baseUrl"
        placeholder="Racine de l'instance, sans chemin"
      />
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Projet *</label>
      <UIInput
        v-model="projet"
        placeholder="groupe/projet"
      />
      <p class="text-xs text-secondary-500">
        Chemin du projet, tel qu'il apparaît dans l'URL.
      </p>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Branche</label>
      <UIInput
        v-model="branche"
        placeholder="main"
      />
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Dossiers à lire</label>
      <UIInput
        v-model="dossiers"
        placeholder="incidents, annexes"
      />
      <p class="text-xs text-secondary-500">
        Séparés par des virgules. Vide : <span class="font-mono">incidents</span> et <span class="font-mono">annexes</span>.
      </p>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Jeton de lecture *</label>
      <UIInput
        v-model="jeton"
        type="password"
        name="gitlab-token"
        autocomplete="off"
        data-1p-ignore
        data-lpignore="true"
        :placeholder="jetonDefini ? `Inchangé (${jetonApercu})` : 'Jeton de projet en lecture'"
      />
      <p class="text-xs text-secondary-500">
        Portée <span class="font-mono">read_api</span> requise : la liste des fichiers passe par l'API REST,
        que <span class="font-mono">read_repository</span> seul ne couvre pas. Rôle <span class="font-mono">Reporter</span>
        au minimum. Chiffré en base et jamais renvoyé au navigateur.
      </p>
    </div>

    <p
      v-if="erreur"
      class="rounded-xl border border-red-200/70 bg-red-50/60 p-3 text-sm text-red-800 break-words"
    >
      {{ erreur }}
    </p>

    <div
      v-if="bilan"
      class="rounded-xl border border-green-200/70 bg-green-50/60 p-3 text-sm text-green-800"
    >
      {{ bilan.ecrites }} procédure(s) mise(s) à jour, {{ bilan.inchangees }} inchangée(s),
      {{ bilan.echecs }} en échec, sur {{ bilan.vues }} fichier(s) vu(s).
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
        v-if="actif"
        variant="outline"
        :disabled="enCours"
        @click="synchroniser"
      >
        <Icon
          name="lucide:refresh-cw"
          class="size-4"
          :class="enCours ? 'animate-spin' : ''"
        />
        Synchroniser maintenant
      </UIButton>
    </div>
  </div>
</template>
