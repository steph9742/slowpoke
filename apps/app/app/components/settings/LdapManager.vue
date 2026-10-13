<script setup lang="ts">
import { UIButton, UIInput, useToast } from '@slowpoke/ui'
import { ref, onMounted } from 'vue'

// Réglages de l'annuaire, en LECTURE SEULE. Le compte de liaison ne doit disposer d'aucun
// droit d'écriture : Slowpoke ne fait que lire l'état d'un compte pendant une enquête.
// Le mot de passe est chiffré et ne repart jamais vers le navigateur ; seule une adresse
// ldaps:// est acceptée.

const eden = useEden()
const toast = useToast()

const chargement = ref(true)
const enCours = ref(false)
const url = ref('')
const bindDn = ref('')
const base = ref('')
const attrMotDePasse = ref('')
const attrMfa = ref('')
const motDePasse = ref('')
const motDePasseDefini = ref(false)
const actif = ref(false)
const attrMotDePasseDefaut = ref('')
const attrMfaDefaut = ref('')
type Essai = { ok: true, base: string } | { ok: false, message: string }
const essai = ref<Essai | null>(null)

type Etat = {
  url: string | null
  bindDn: string | null
  base: string | null
  attrMotDePasse: string | null
  attrMfa: string | null
  attrMotDePasseDefaut: string
  attrMfaDefaut: string
  motDePasseDefini: boolean
  actif: boolean
}

function appliquer(d: Etat) {
  url.value = d.url ?? ''
  bindDn.value = d.bindDn ?? ''
  base.value = d.base ?? ''
  attrMotDePasse.value = d.attrMotDePasse ?? ''
  attrMfa.value = d.attrMfa ?? ''
  attrMotDePasseDefaut.value = d.attrMotDePasseDefaut
  attrMfaDefaut.value = d.attrMfaDefaut
  motDePasseDefini.value = d.motDePasseDefini
  actif.value = d.actif
  motDePasse.value = ''
}

onMounted(async () => {
  const { data } = await eden.api.settings.ldap.get()
  if (data) appliquer(data)
  chargement.value = false
})

async function enregistrer() {
  if (enCours.value) return
  enCours.value = true
  essai.value = null
  const { data, error } = await eden.api.settings.ldap.put({
    url: url.value,
    bindDn: bindDn.value,
    base: base.value,
    attrMotDePasse: attrMotDePasse.value,
    attrMfa: attrMfa.value,
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
  const { data, error } = await eden.api.settings.ldap.test.post()
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
        Sert l'enquête « compte compromis » : dernier changement de mot de passe, MFA et groupes. Le compte de liaison doit être en lecture seule.
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-1">
          <label
            for="ldap-url"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Adresse (ldaps:// uniquement)</label>
          <UIInput
            id="ldap-url"
            v-model="url"
            placeholder="ldaps://ldap.exemple.fr"
          />
        </div>
        <div class="space-y-1">
          <label
            for="ldap-base"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Base de recherche</label>
          <UIInput
            id="ldap-base"
            v-model="base"
            placeholder="ou=people,dc=exemple,dc=fr"
          />
        </div>
        <div class="space-y-1">
          <label
            for="ldap-bind"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Compte de liaison</label>
          <UIInput
            id="ldap-bind"
            v-model="bindDn"
            placeholder="uid=slowpoke-lecture,ou=services,dc=exemple,dc=fr"
          />
        </div>
        <div class="space-y-1">
          <label
            for="ldap-mdp"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Mot de passe <template v-if="motDePasseDefini">(enregistré — laisser vide pour le garder)</template></label>
          <UIInput
            id="ldap-mdp"
            v-model="motDePasse"
            type="password"
            autocomplete="new-password"
          />
        </div>
        <div class="space-y-1">
          <label
            for="ldap-attr-mdp"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Attribut du changement de mot de passe</label>
          <UIInput
            id="ldap-attr-mdp"
            v-model="attrMotDePasse"
            :placeholder="attrMotDePasseDefaut"
          />
        </div>
        <div class="space-y-1">
          <label
            for="ldap-attr-mfa"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Attribut MFA</label>
          <UIInput
            id="ldap-attr-mfa"
            v-model="attrMfa"
            :placeholder="attrMfaDefaut"
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
          Essayer la liaison
        </UIButton>
        <span
          class="text-xs font-semibold rounded-full px-2 py-0.5"
          :class="actif ? 'bg-emerald-50 text-emerald-700' : 'bg-secondary-100 text-secondary-600'"
        >{{ actif ? 'Configuré' : 'Non configuré' }}</span>
      </div>

      <p
        v-if="essai?.ok"
        class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      >
        Liaison réussie, base lisible : <span class="font-mono">{{ essai.base }}</span>
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
