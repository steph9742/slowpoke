<script setup lang="ts">
import { UIButton, UIInput, useToast } from '@slowpoke/ui'
import { ref, onMounted } from 'vue'

// IMPORT SOC — réglage de la liaison avec l'API du prestataire.
//
// Le jeton n'est jamais renvoyé par le serveur : le champ reste vide et le placeholder
// rappelle les quatre derniers caractères enregistrés. Laisser le champ vide conserve le
// jeton en place — c'est le cas normal quand on ne corrige que l'adresse.

const eden = useEden()
const toast = useToast()

const chargement = ref(true)
const enCours = ref(false)
const baseUrl = ref('')
const customer = ref('')
const jeton = ref('')
const jetonDefini = ref(false)
const jetonApercu = ref<string | null>(null)
const actif = ref(false)

type Essai = { ok: true, tickets: number, retenus: number } | { ok: false, message: string }
const essai = ref<Essai | null>(null)

function appliquer(d: {
  baseUrl: string | null
  customer: string | null
  tokenDefini: boolean
  tokenApercu: string | null
  actif: boolean
}) {
  baseUrl.value = d.baseUrl ?? ''
  customer.value = d.customer ?? ''
  jetonDefini.value = d.tokenDefini
  jetonApercu.value = d.tokenApercu
  actif.value = d.actif
  jeton.value = ''
}

onMounted(async () => {
  const { data } = await eden.api.settings.advens.get()
  if (data) appliquer(data)
  chargement.value = false
})

async function enregistrer() {
  if (enCours.value) return
  enCours.value = true
  essai.value = null
  try {
    const { data, error } = await eden.api.settings.advens.put({
      baseUrl: baseUrl.value,
      customer: customer.value,
      // Champ vide : le jeton en place n'est pas touché.
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

async function retirerJeton() {
  if (!confirm('Retirer le jeton ? L\'import s\'arrêtera jusqu\'à ce qu\'un nouveau soit enregistré.')) return
  enCours.value = true
  try {
    const { data } = await eden.api.settings.advens.put({ token: '' })
    if (data) appliquer(data)
    toast.newToast({ duration: 2500, title: 'Jeton retiré', message: '', type: 'success' })
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
    const { data, error } = await eden.api.settings.advens.test.post()
    essai.value = error
      ? { ok: false, message: 'Renseignez l\'adresse, le client et le jeton avant d\'essayer.' }
      : data as Essai
  }
  finally {
    enCours.value = false
  }
}

async function importerMaintenant() {
  if (enCours.value) return
  enCours.value = true
  try {
    const { data, error } = await eden.api.settings.advens.import.post()
    if (error || !data) throw new Error('échec')
    toast.newToast({
      duration: 5000,
      title: 'Import terminé',
      message: `${data.crees} incident(s) créé(s), ${data.clos} clos, ${data.ignores} écarté(s) sur ${data.examines} examiné(s).`,
      type: 'success',
    })
  }
  catch {
    toast.newToast({ duration: 4000, title: 'Erreur', message: 'Import impossible. Essayez la connexion.', type: 'error' })
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
          :name="actif ? 'lucide:plug-zap' : 'lucide:unplug'"
          class="size-3.5"
        />
        {{ actif ? 'Configuré' : 'Non configuré' }}
      </span>
      <span class="text-xs text-secondary-500">
        Récupération automatique toutes les 30 minutes.
      </span>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Adresse de l'API *</label>
      <UIInput
        v-model="baseUrl"
        placeholder="https://api.exemple.io"
      />
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Nom du client *</label>
      <UIInput
        v-model="customer"
        placeholder="Identifiant du tenant chez le prestataire"
      />
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-secondary-700">Jeton *</label>
      <div class="flex items-center gap-2">
        <!-- `autocomplete="off"` et le nom neutre évitent que le navigateur ou un
             gestionnaire de mots de passe ne remplisse ce champ tout seul : ce n'est pas
             un mot de passe de connexion, et un remplissage silencieux enregistrerait
             autre chose que le jeton du SOC. -->
        <UIInput
          v-model="jeton"
          type="password"
          name="soc-token"
          autocomplete="off"
          data-1p-ignore
          data-lpignore="true"
          class="flex-1"
          :placeholder="jetonDefini ? `Inchangé (${jetonApercu})` : 'Collez le jeton fourni par le prestataire'"
        />
        <UIButton
          v-if="jetonDefini"
          variant="ghost"
          class="h-10 text-xs text-red-600 hover:bg-red-50/60 hover:text-red-700"
          :disabled="enCours"
          @click="retirerJeton"
        >
          Retirer
        </UIButton>
      </div>
      <p class="text-xs text-secondary-500">
        Chiffré en base et jamais renvoyé au navigateur. Laissez vide pour garder celui en place.
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
        Connexion établie : {{ essai.tickets }} ticket(s) chez le prestataire,
        {{ essai.retenus }} retenu(s) par le filtre sur la première page.
      </template>
      <template v-else>
        Échec : {{ essai.message }}
      </template>
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
        @click="importerMaintenant"
      >
        <Icon
          name="lucide:download"
          class="size-4"
        />
        Importer maintenant
      </UIButton>
    </div>
  </div>
</template>
