<script setup lang="ts">
import { UIButton, UIInput, useToast } from '@slowpoke/ui'
import { ref, onMounted } from 'vue'

// Réglages de l'inventaire. Les deux jetons sont chiffrés et ne repartent jamais vers le
// navigateur. L'essai renvoie les groupes existants : « groupe critique » saisi de
// mémoire donne un libellé approchant, qui ne correspond à rien.

const eden = useEden()
const toast = useToast()

const chargement = ref(true)
const enCours = ref(false)
const url = ref('')
const groupeCritique = ref('')
const champGroupe = ref('')
const appToken = ref('')
const userToken = ref('')
const appDefini = ref(false)
const userDefini = ref(false)
const actif = ref(false)

type ChampGroupe = { id: number, nom: string, champ: string }
type Essai
  = { ok: true, groupes: string[], champsGroupe: ChampGroupe[], champGroupeRetenu: number | null }
    | { ok: false, message: string }
const essai = ref<Essai | null>(null)
const bilan = ref<{ vues: number, ecrites: number, disparues: number } | null>(null)

function appliquer(d: { url: string | null, groupeCritique: string | null, champGroupe: string | null, appDefini: boolean, userDefini: boolean, actif: boolean }) {
  url.value = d.url ?? ''
  groupeCritique.value = d.groupeCritique ?? ''
  champGroupe.value = d.champGroupe ?? ''
  appDefini.value = d.appDefini
  userDefini.value = d.userDefini
  actif.value = d.actif
  appToken.value = ''
  userToken.value = ''
}

onMounted(async () => {
  const { data } = await eden.api.settings.glpi.get()
  if (data) appliquer(data)
  chargement.value = false
})

async function enregistrer() {
  if (enCours.value) return
  enCours.value = true
  essai.value = null
  const { data, error } = await eden.api.settings.glpi.put({
    url: url.value,
    groupeCritique: groupeCritique.value,
    champGroupe: champGroupe.value,
    ...(appToken.value.trim() ? { appToken: appToken.value } : {}),
    ...(userToken.value.trim() ? { userToken: userToken.value } : {}),
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
  const { data, error } = await eden.api.settings.glpi.test.post()
  essai.value = error
    ? { ok: false, message: 'Renseignez l\'adresse et les deux jetons avant d\'essayer.' }
    : data as Essai
  enCours.value = false
}

async function synchroniser() {
  if (enCours.value) return
  enCours.value = true
  bilan.value = null
  const { data, error } = await eden.api.settings.glpi.sync.post()
  if (error || !data) {
    toast.newToast({
      duration: 5000,
      title: 'Erreur',
      message: (error?.value as { message?: string })?.message ?? 'Synchronisation impossible.',
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
    <div class="flex items-center gap-2">
      <span
        class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono"
        :class="actif
          ? 'border-green-200/70 bg-green-50 text-green-700'
          : 'border-secondary-200/70 bg-secondary-50 text-secondary-500'"
      >
        <Icon
          name="lucide:server"
          class="size-3.5"
        />
        {{ actif ? 'Configuré' : 'Non configuré' }}
      </span>
      <span class="text-xs text-secondary-500">
        Inventaire relu toutes les 12 heures. La recherche interroge la copie locale, donc elle reste disponible si l'inventaire ne l'est pas.
      </span>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Adresse *</label>
      <UIInput
        v-model="url"
        placeholder="Racine de l'instance, sans /apirest.php"
      />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Jeton d'application *</label>
        <UIInput
          v-model="appToken"
          type="password"
          name="glpi-app"
          autocomplete="off"
          data-1p-ignore
          :placeholder="appDefini ? 'Inchangé' : 'App-Token'"
        />
      </div>
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-secondary-700">Jeton utilisateur *</label>
        <UIInput
          v-model="userToken"
          type="password"
          name="glpi-user"
          autocomplete="off"
          data-1p-ignore
          :placeholder="userDefini ? 'Inchangé' : 'user_token d\'un compte dédié en lecture'"
        />
      </div>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Champ « groupe » de l'inventaire</label>
      <UIInput
        v-model="champGroupe"
        placeholder="Vide : détecté automatiquement"
      />
      <p class="text-xs text-secondary-500">
        Une instance expose plusieurs champs de groupe (groupe, groupe technique…) et seule
        la vôtre sait lequel porte le rattachement. <strong>Essayer la connexion</strong> les liste.
      </p>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Groupe critique</label>
      <UIInput
        v-model="groupeCritique"
        placeholder="Nom du groupe qui marque les machines critiques"
      />
      <p class="text-xs text-secondary-500">
        Les machines de ce groupe — sous-groupes compris — sont signalées sur les incidents.
        L'essai ci-dessous liste les groupes existants.
      </p>
    </div>

    <div
      v-if="essai"
      class="rounded-xl border p-3 text-sm"
      :class="essai.ok ? 'border-green-200/70 bg-green-50/60 text-green-800' : 'border-red-200/70 bg-red-50/60 text-red-800'"
    >
      <template v-if="essai.ok">
        <p>Connexion établie.</p>
        <p
          v-if="essai.champsGroupe.length"
          class="mt-1 text-xs"
        >
          Champs de groupe proposés par cette instance — cliquez pour en retenir un :
          <button
            v-for="c in essai.champsGroupe"
            :key="c.id"
            type="button"
            class="ml-1 rounded border border-green-300 bg-white px-1.5 py-0.5 font-mono hover:bg-green-100"
            :class="essai.champGroupeRetenu === c.id ? 'font-bold' : ''"
            @click="champGroupe = String(c.id)"
          >
            {{ c.id }} · {{ c.nom }}
          </button>
        </p>
        <p
          v-if="essai.groupes.length"
          class="mt-1 text-xs"
        >
          Groupes : {{ essai.groupes.slice(0, 40).join(' · ') }}
        </p>
      </template>
      <template v-else>
        Échec : {{ essai.message }}
      </template>
    </div>

    <div
      v-if="bilan"
      class="rounded-xl border border-green-200/70 bg-green-50/60 p-3 text-sm text-green-800"
    >
      {{ bilan.ecrites }} machine(s) à jour, {{ bilan.disparues }} sortie(s) de l'inventaire.
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
        Synchroniser maintenant
      </UIButton>
    </div>
  </div>
</template>
