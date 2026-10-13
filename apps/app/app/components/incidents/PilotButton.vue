<script setup lang="ts">
import { UIButton, UIDialog, UIDropdownMenu, UISelect, useToast, type UISelectOption } from '@slowpoke/ui'
import type { UIDropdownMenuSection } from '@slowpoke/ui/src/components/dropdown/UIDropdownMenu'
import { computed, ref } from 'vue'
import { Icon } from '#components'
import { authClient } from '~/lib/auth-client'

// PRISE EN CHARGE — « je prends en charge » / « ne plus suivre ».
//
// Séparé du statut : passer un incident en « En cours » ne dit pas QUI le suit. L'état et
// l'action tiennent dans UN SEUL contrôle, une pastille d'état à côté d'un bouton doublant la
// place occupée pour une seule information.

const props = defineProps<{
  incidentId: string
  pilot?: string | null
  pilotName?: string | null
}>()

const emit = defineEmits<{ changed: [] }>()

const eden = useEden()
const enCours = ref(false)

const session = await useSSRAuth()
const moi = computed(() => session.value?.user?.id)
const roles = computed(() => String(session.value?.user?.role ?? '').split(',').map(r => r.trim()))
const estAdmin = computed(() => roles.value.includes('admin'))
const peutAgir = computed(() => estAdmin.value || roles.value.includes('gestionnaire'))

const jeSuisPilote = computed(() => props.pilot && props.pilot === moi.value)
// Un gestionnaire ne prend la main que sur un incident libre ; un admin peut réattribuer.
const peutPrendre = computed(() => peutAgir.value && (!props.pilot || estAdmin.value))
const peutRetirer = computed(() => Boolean(props.pilot) && (jeSuisPilote.value || estAdmin.value))

// ATTRIBUTION À UN TIERS — réservée aux admins côté API comme ici.
//
// Le cas réel est l'absence : quelqu'un part en congés, son incident doit continuer d'être
// suivi. Un gestionnaire ne peut que se désigner lui-même, sinon n'importe qui pourrait se
// décharger d'un incident sur un collègue absent.
const attributionOuverte = ref(false)
const cibleChoisie = ref('')

// Chargée seulement à l'ouverture : la liste des comptes n'intéresse que ce cas de figure,
// et `listUsers` est une route d'administration.
const candidats = ref<UISelectOption[]>([])
const chargementCandidats = ref(false)

const ouvrirAttribution = async () => {
  cibleChoisie.value = ''
  attributionOuverte.value = true
  if (candidats.value.length || chargementCandidats.value) return

  chargementCandidats.value = true
  try {
    const { data } = await authClient().admin.listUsers({ query: { limit: 200 }, fetchOptions: { credentials: 'include' } })
    const bruts = (Array.isArray(data) ? data : (data as { users?: unknown[] } | null)?.users ?? []) as Record<string, unknown>[]
    candidats.value = bruts
      .filter(u => typeof u.id === 'string' && u.id !== moi.value && !u.banned)
      // Un pilote doit pouvoir AGIR sur l'incident : proposer un lecteur, qui ne peut rien
      // modifier, reviendrait à confier le suivi à quelqu'un sans les moyens de l'assurer.
      .filter(u => String(u.role ?? '').split(',').map(r => r.trim()).some(r => WRITE_ROLES.includes(r)))
      .map(u => ({
        value: u.id as string,
        label: `${(typeof u.name === 'string' && u.name.trim()) || u.email} — ${String(u.role ?? '').includes('admin') ? 'administrateur' : 'gestionnaire'}`,
      }))
  }
  catch {
    useToast().newToast({ title: 'Échec', message: 'Impossible de charger la liste des comptes.', type: 'error', duration: 4000 })
  }
  finally {
    chargementCandidats.value = false
  }
}

const attribuer = async () => {
  if (enCours.value || !cibleChoisie.value) return
  enCours.value = true
  const { error } = await eden.api.incidents({ id: props.incidentId }).pilot.post({ pilotId: cibleChoisie.value })
  enCours.value = false
  if (error) {
    useToast().newToast({ title: 'Échec', message: String((error.value as { message?: string })?.message ?? 'Attribution impossible.'), type: 'error', duration: 4000 })
    return
  }
  const nom = candidats.value.find(c => c.value === cibleChoisie.value)?.label ?? 'la personne choisie'
  useToast().newToast({ title: 'Incident attribué', message: `Le suivi revient à ${nom.split(' — ')[0]}.`, type: 'success', duration: 3000 })
  attributionOuverte.value = false
  emit('changed')
}

const prendreEnCharge = async () => {
  if (enCours.value) return
  enCours.value = true
  const { error } = await eden.api.incidents({ id: props.incidentId }).pilot.post({})
  enCours.value = false
  if (error) {
    useToast().newToast({ title: 'Échec', message: String((error.value as { message?: string })?.message ?? 'Action impossible.'), type: 'error', duration: 4000 })
    return
  }
  useToast().newToast({ title: 'Incident pris en charge', message: 'Vous en êtes désormais le pilote.', type: 'success', duration: 3000 })
  emit('changed')
}

const retirer = async () => {
  if (enCours.value) return
  enCours.value = true
  const { error } = await eden.api.incidents({ id: props.incidentId }).pilot.delete()
  enCours.value = false
  if (error) {
    useToast().newToast({ title: 'Échec', message: String((error.value as { message?: string })?.message ?? 'Action impossible.'), type: 'error', duration: 4000 })
    return
  }
  useToast().newToast({ title: 'Prise en charge retirée', message: 'L\'incident n\'a plus de pilote.', type: 'success', duration: 3000 })
  emit('changed')
}

/** Ce que le contrôle affiche : l'état, jamais l'action — l'action est dans le menu. */
const libelle = computed(() => {
  if (jeSuisPilote.value) return 'Vous pilotez'
  if (props.pilot) return props.pilotName || 'Pris en charge'
  return 'Sans pilote'
})
const icone = computed(() => props.pilot ? 'lucide:user-check' : 'lucide:user-x')

const sections = computed<UIDropdownMenuSection[]>(() => {
  const items = []
  if (peutPrendre.value && !jeSuisPilote.value) {
    items.push({ label: props.pilot ? 'Me l\'attribuer' : 'Je prends en charge', onClick: prendreEnCharge, disabled: enCours.value })
  }
  if (estAdmin.value) {
    items.push({ label: props.pilot ? 'Attribuer à quelqu\'un d\'autre…' : 'Attribuer à…', onClick: ouvrirAttribution, disabled: enCours.value })
  }
  if (peutRetirer.value) {
    items.push({ label: 'Retirer la prise en charge', onClick: retirer, disabled: enCours.value, destructive: true })
  }
  if (!items.length) items.push({ label: 'Aucune action disponible', disabled: true })

  return [{
    title: props.pilot ? (jeSuisPilote.value ? 'Vous suivez cet incident' : `Suivi par ${props.pilotName || 'un gestionnaire'}`) : 'Personne ne suit cet incident',
    icon: 'ph:user-focus-duotone',
    items,
  }]
})
</script>

<template>
  <!-- Lecteur : l'information reste visible, sans laisser croire à une action possible. -->
  <span
    v-if="!peutAgir"
    class="inline-flex items-center gap-1.5 rounded-lg border border-gray-400/30 px-3 py-1.5 text-sm text-gray-500 font-sans tracking-tighter"
  >
    <Icon
      :name="icone"
      class="size-4 shrink-0"
    />
    {{ libelle }}
  </span>

  <UIDropdownMenu
    v-else
    :items="sections"
  >
    <UIButton
      variant="outline"
      size="md"
      :disabled="enCours"
      :class="jeSuisPilote ? 'text-primary-700 border-primary-300/60' : ''"
    >
      <Icon
        :name="enCours ? 'ph:spinner-gap-duotone' : icone"
        :class="['size-4', enCours ? 'animate-spin' : '']"
      />
      <span class="ml-1.5 font-medium tracking-tight">{{ libelle }}</span>
    </UIButton>
  </UIDropdownMenu>

  <UIDialog
    v-if="estAdmin"
    v-model="attributionOuverte"
    title="Attribuer l'incident"
    description="Désigner qui en assure le suivi — en cas d'absence ou de rééquilibrage."
  >
    <template #content>
      <div class="space-y-2">
        <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
          Nouveau pilote
        </label>
        <p
          v-if="chargementCandidats"
          class="text-sm text-gray-500 font-sans"
        >
          Chargement des comptes…
        </p>
        <p
          v-else-if="!candidats.length"
          class="text-sm text-gray-500 font-sans"
        >
          Aucun autre compte gestionnaire ou administrateur.
        </p>
        <UISelect
          v-else
          v-model="cibleChoisie"
          :items="candidats"
          :multi-select="false"
          class="h-11"
        />
        <p class="text-[11px] text-gray-500">
          Seuls les gestionnaires et administrateurs sont proposés : un lecteur ne pourrait
          pas agir sur l'incident dont il aurait la charge.
        </p>
      </div>
    </template>

    <template #footer>
      <UIButton
        variant="outline"
        @click="attributionOuverte = false"
      >
        Annuler
      </UIButton>
      <UIButton
        variant="primary"
        :disabled="enCours || !cibleChoisie"
        @click="attribuer"
      >
        {{ enCours ? 'Attribution…' : 'Attribuer' }}
      </UIButton>
    </template>
  </UIDialog>
</template>
