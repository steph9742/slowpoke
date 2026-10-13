<script setup lang="ts">
import { UIButton, UIInput, useToast } from '@slowpoke/ui'
import { ref, computed, onMounted } from 'vue'

// Réglages des archives Wazuh, en LECTURE SEULE. Le compte ne doit pouvoir que lire l'index
// des archives : Slowpoke y cherche les authentifications d'un compte pendant une enquête.
// Le mot de passe est chiffré et ne repart jamais vers le navigateur ; seule une adresse
// https:// est acceptée.

const eden = useEden()
const toast = useToast()

const chargement = ref(true)
const enCours = ref(false)
const url = ref('')
const utilisateur = ref('')
const index = ref('')
const indexDefaut = ref('')
const ca = ref('')
type Acces = 'indexeur' | 'tableau_de_bord'
const acces = ref<Acces>('indexeur')
const nomCertificat = ref('')
const motDePasse = ref('')
const motDePasseDefini = ref(false)
const actif = ref(false)
type Essai
  = | { ok: true, index: string, premier: string | null, dernier: string | null, typesFullLog: string[] }
    | { ok: false, message: string }
const essai = ref<Essai | null>(null)

type Etat = {
  url: string | null
  utilisateur: string | null
  index: string | null
  indexDefaut: string
  ca: string | null
  acces: Acces
  nomCertificat: string | null
  motDePasseDefini: boolean
  actif: boolean
}

function appliquer(d: Etat) {
  url.value = d.url ?? ''
  utilisateur.value = d.utilisateur ?? ''
  index.value = d.index ?? ''
  indexDefaut.value = d.indexDefaut
  ca.value = d.ca ?? ''
  acces.value = d.acces
  nomCertificat.value = d.nomCertificat ?? ''
  motDePasseDefini.value = d.motDePasseDefini
  actif.value = d.actif
  motDePasse.value = ''
}

const dateHeureFr = (d: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))

// Une recherche par phrase ne trouve rien dans un champ qui n'est pas indexé en texte.
const avertissementFullLog = computed(() => {
  if (!essai.value?.ok) return null
  const types = essai.value.typesFullLog
  if (!types.length) return 'Le champ full_log est absent des index : la recherche par compte ne trouvera rien.'
  if (!types.includes('text')) return `Le champ full_log n'est pas indexé en texte (${types.join(', ')}) : la recherche par compte ne trouvera rien.`
  return null
})

onMounted(async () => {
  const { data } = await eden.api.settings.wazuh.get()
  if (data) appliquer(data)
  chargement.value = false
})

async function enregistrer() {
  if (enCours.value) return
  enCours.value = true
  essai.value = null
  const { data, error } = await eden.api.settings.wazuh.put({
    url: url.value,
    utilisateur: utilisateur.value,
    index: index.value,
    ca: ca.value,
    acces: acces.value,
    nomCertificat: nomCertificat.value,
    ...(motDePasse.value ? { motDePasse: motDePasse.value } : {}),
  })
  enCours.value = false
  if (error || !data) {
    const detail = (error?.value as { message?: string } | undefined)?.message
    toast.newToast({ duration: 5000, title: 'Enregistrement impossible', message: detail ?? '', type: 'error' })
    return
  }
  appliquer(data as Etat)
  toast.newToast({ duration: 2500, title: 'Réglages enregistrés', message: '', type: 'success' })
}

async function tester() {
  if (enCours.value) return
  enCours.value = true
  essai.value = null
  const { data, error } = await eden.api.settings.wazuh.test.post()
  enCours.value = false
  if (error) {
    essai.value = { ok: false, message: (error.value as { message?: string } | undefined)?.message ?? 'Essai impossible.' }
    return
  }
  essai.value = (data ?? null) as Essai | null
}
</script>

<template>
  <div class="space-y-4">
    <p
      v-if="chargement"
      class="text-sm text-secondary-400"
    >
      Lecture des réglages…
    </p>
    <template v-else>
      <p class="text-sm text-secondary-600">
        Sert l'enquête « compte compromis » : authentifications Zimbra, LemonLDAP et LDAP d'un compte, lues dans l'index des archives. Le compte ne doit pouvoir que lire cet index.
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-1 sm:col-span-2">
          <label
            for="wazuh-acces"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Accès</label>
          <select
            id="wazuh-acces"
            v-model="acces"
            class="w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm"
          >
            <option value="indexeur">
              Indexeur, port 9200
            </option>
            <option value="tableau_de_bord">
              Tableau de bord, quand l'indexeur n'est pas joignable
            </option>
          </select>
          <p
            v-if="acces === 'tableau_de_bord'"
            class="text-xs text-secondary-500"
          >
            Le tableau de bord relaie la recherche à l'indexeur avec les identifiants du compte : mêmes droits, mêmes limites.
          </p>
        </div>
        <div class="space-y-1">
          <label
            for="wazuh-url"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Adresse (https:// uniquement)</label>
          <UIInput
            id="wazuh-url"
            v-model="url"
            :placeholder="acces === 'tableau_de_bord' ? 'https://wazuh.exemple.fr' : 'https://wazuh-indexer.exemple.fr:9200'"
          />
        </div>
        <div class="space-y-1">
          <label
            for="wazuh-nom-certificat"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Nom ou IP attendu dans le certificat (si l'adresse est traduite)</label>
          <UIInput
            id="wazuh-nom-certificat"
            v-model="nomCertificat"
            placeholder="wazuh.exemple.fr"
          />
        </div>
        <div class="space-y-1">
          <label
            for="wazuh-index"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Index des archives</label>
          <UIInput
            id="wazuh-index"
            v-model="index"
            :placeholder="indexDefaut"
          />
        </div>
        <div class="space-y-1">
          <label
            for="wazuh-utilisateur"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Compte de lecture</label>
          <UIInput
            id="wazuh-utilisateur"
            v-model="utilisateur"
            placeholder="slowpoke-lecture"
          />
        </div>
        <div class="space-y-1">
          <label
            for="wazuh-mdp"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Mot de passe <template v-if="motDePasseDefini">(enregistré — laisser vide pour le garder)</template></label>
          <UIInput
            id="wazuh-mdp"
            v-model="motDePasse"
            type="password"
            autocomplete="new-password"
          />
        </div>
        <div class="space-y-1 sm:col-span-2">
          <label
            for="wazuh-ca"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Autorité de certification (PEM, si le certificat de l'indexeur est interne)</label>
          <textarea
            id="wazuh-ca"
            v-model="ca"
            rows="4"
            spellcheck="false"
            class="w-full rounded-lg border border-secondary-200 px-3 py-2 text-xs font-mono"
            placeholder="-----BEGIN CERTIFICATE-----"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <UIButton
          :disabled="enCours"
          @click="enregistrer"
        >
          Enregistrer
        </UIButton>
        <UIButton
          variant="ghost"
          :disabled="enCours"
          @click="tester"
        >
          Essayer la lecture
        </UIButton>
        <span
          class="text-xs font-semibold rounded-full px-2 py-0.5"
          :class="actif ? 'bg-emerald-50 text-emerald-700' : 'bg-secondary-100 text-secondary-600'"
        >{{ actif ? 'Configuré' : 'Non configuré' }}</span>
      </div>

      <div
        v-if="essai?.ok"
        class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 space-y-1"
      >
        <p>
          Lecture réussie : <span class="font-mono">{{ essai.index }}</span>
        </p>
        <p v-if="essai.premier && essai.dernier">
          Lignes indexées du {{ dateHeureFr(essai.premier) }} au {{ dateHeureFr(essai.dernier) }}.
        </p>
        <p v-else>
          Aucune ligne dans l'index.
        </p>
      </div>
      <p
        v-if="avertissementFullLog"
        class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        {{ avertissementFullLog }}
      </p>
      <p
        v-else-if="essai && !essai.ok"
        class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ essai.message }}
      </p>
    </template>
  </div>
</template>
