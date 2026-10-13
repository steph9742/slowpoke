<script setup lang="ts">
import { UIButton, UIDialog, UIInput, useToast } from '@slowpoke/ui'
import { computed, ref, watch } from 'vue'
import { Icon } from '#components'

// CONSIGNER UNE RÈGLE RELEVÉE DANS L'EDR.
//
// Deux issues : soit un incident la motive — elle devient une exclusion rattachée à lui —,
// soit elle a été posée hors incident, et c'est une revue programmée. Dans les deux cas, un
// motif et une échéance : sans date de revue, une règle devient permanente par oubli.

type Regle = { ref: string, libelle: string | null, criteres: string[], cible?: string | null }

const props = defineProps<{ regle: Regle | null }>()
const emit = defineEmits<{ enregistre: [] }>()
const open = defineModel<boolean>({ default: false })

const eden = useEden()
const toast = useToast()

const mode = ref<'incident' | 'revue'>('revue')
const incidentId = ref('')
const motif = ref('')
const echeance = ref(dans(12))
const envoi = ref(false)
const erreur = ref('')
const incidents = ref<{ id: string, type: string, severity: string, status: string }[]>([])

function dans(mois: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + mois)
  return d.toISOString().slice(0, 10)
}

const ECHEANCES = [
  { mois: 1, libelle: '1 mois' },
  { mois: 3, libelle: '3 mois' },
  { mois: 6, libelle: '6 mois' },
  { mois: 12, libelle: '1 an' },
] as const

/** Portée reprise du relevé, telle que l'EDR la rend : rien n'est réécrit ni interprété. */
const portee = computed(() => {
  const r = props.regle
  if (!r) return ''
  return r.criteres.length ? r.criteres.join(' · ') : (r.libelle || r.ref)
})

// Les incidents encore à traiter : une règle se rattache presque toujours à un dossier
// ouvert. Chargés à l'ouverture, pas au montage : la modale vit dans la page du registre.
async function chargerIncidents() {
  const { data } = await eden.api.incidents.get({
    query: { statuts: 'open,investigating,in_progress,surveillance', pageSize: 50, sort: 'createdAt', order: 'desc' },
  })
  incidents.value = (data ?? []) as typeof incidents.value
}

watch(open, (ouvert) => {
  if (!ouvert) return
  erreur.value = ''
  mode.value = 'revue'
  incidentId.value = ''
  motif.value = ''
  echeance.value = dans(12)
  chargerIncidents()
})

async function enregistrer() {
  if (envoi.value || !props.regle) return
  erreur.value = ''
  if (!motif.value.trim()) {
    erreur.value = 'Le motif est obligatoire : il sera relu par quelqu\'un qui n\'aura pas le contexte d\'aujourd\'hui.'
    return
  }
  if (mode.value === 'incident' && !incidentId.value) {
    erreur.value = 'Choisissez l\'incident qui motive cette règle.'
    return
  }

  envoi.value = true
  const { error } = mode.value === 'incident'
    ? await eden.api.exclusions.post({
        incidentId: incidentId.value,
        tool: 'harfanglab',
        scope: portee.value,
        reason: motif.value,
        reviewDate: echeance.value,
        outilRef: props.regle.ref,
      })
    : await eden.api.exclusions.revues.post({
        regleRef: props.regle.ref,
        libelle: props.regle.libelle ?? undefined,
        motif: motif.value,
        echeance: echeance.value,
      })
  envoi.value = false

  if (error) {
    erreur.value = String((error.value as { message?: string } | undefined)?.message ?? 'Enregistrement impossible.')
    return
  }
  toast.newToast({
    title: mode.value === 'incident' ? 'Règle consignée' : 'Revue programmée',
    message: 'Son échéance sera rappelée comme celle des autres listes blanches.',
    type: 'success',
    duration: 3000,
  })
  open.value = false
  emit('enregistre')
}
</script>

<template>
  <UIDialog
    v-model="open"
    title="Consigner cette règle"
    description="Un incident la motive, ou elle a été posée hors incident. Dans les deux cas, un motif et une échéance."
  >
    <template #content>
      <div
        v-if="regle"
        class="space-y-5"
      >
        <div class="rounded-xl border border-gray-200/80 bg-gray-50/40 p-3">
          <p class="text-sm text-secondary-800">
            {{ regle.libelle || '(sans commentaire)' }}
            <span
              v-if="regle.cible"
              class="ml-1 font-mono text-[11px] text-secondary-500"
            >{{ regle.cible }}</span>
          </p>
          <p class="mt-0.5 font-mono text-[11px] text-secondary-600 break-all">
            {{ portee }}
          </p>
          <p class="mt-1 font-mono text-[10px] text-secondary-400">
            {{ regle.ref }}
          </p>
        </div>

        <div class="space-y-2">
          <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Origine
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-xl border p-3 text-left transition-colors"
              :class="mode === 'revue'
                ? 'border-primary-300 bg-primary-50/60'
                : 'border-gray-200 bg-white hover:border-primary-300'"
              @click="mode = 'revue'"
            >
              <span class="block text-sm font-medium text-secondary-800">Posée hors incident</span>
              <span class="block text-xs text-secondary-500">Besoin métier, exploitation, exception technique. Revue programmée, sans incident.</span>
            </button>
            <button
              type="button"
              class="rounded-xl border p-3 text-left transition-colors"
              :class="mode === 'incident'
                ? 'border-primary-300 bg-primary-50/60'
                : 'border-gray-200 bg-white hover:border-primary-300'"
              @click="mode = 'incident'"
            >
              <span class="block text-sm font-medium text-secondary-800">Motivée par un incident</span>
              <span class="block text-xs text-secondary-500">Devient une exclusion rattachée à cet incident, et apparaît dans sa chronologie.</span>
            </button>
          </div>
        </div>

        <div
          v-if="mode === 'incident'"
          class="space-y-2"
        >
          <label
            for="decision-incident"
            class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono"
          >Incident <span class="text-red-500">*</span></label>
          <select
            id="decision-incident"
            v-model="incidentId"
            class="w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">
              choisir un incident à traiter…
            </option>
            <option
              v-for="i in incidents"
              :key="i.id"
              :value="i.id"
            >
              #{{ i.id }} — {{ i.type }} · {{ i.severity }}
            </option>
          </select>
          <p class="text-[11px] text-gray-500">
            Seuls les incidents encore à traiter sont proposés. Pour un dossier clos, déclarez la liste blanche depuis sa fiche.
          </p>
        </div>

        <div class="space-y-2">
          <label
            for="decision-motif"
            class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono"
          >Motif <span class="text-red-500">*</span></label>
          <UIInput
            id="decision-motif"
            v-model="motif"
            placeholder="Pourquoi cette règle existe, et pourquoi elle est légitime"
            class="h-11"
          />
        </div>

        <div class="space-y-2">
          <label
            for="decision-echeance"
            class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono"
          >Date de revue <span class="text-red-500">*</span></label>
          <UIInput
            id="decision-echeance"
            v-model="echeance"
            type="date"
            class="h-11"
          />
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="e in ECHEANCES"
              :key="e.mois"
              type="button"
              class="rounded-md border px-2 py-0.5 text-[11px] transition-colors"
              :class="echeance === dans(e.mois)
                ? 'border-primary-300 bg-primary-50 text-primary-700 font-semibold'
                : 'border-gray-200 bg-white text-gray-600 hover:border-primary-300'"
              @click="echeance = dans(e.mois)"
            >
              {{ e.libelle }}
            </button>
          </div>
          <p class="text-[11px] text-gray-500">
            L'échéance est rappelée sept jours avant, puis tant qu'elle est dépassée — par notification et par webhook.
          </p>
        </div>

        <p
          v-if="erreur"
          class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 font-sans"
        >
          {{ erreur }}
        </p>
      </div>
    </template>

    <template #footer>
      <span class="mr-auto inline-flex items-center gap-1 text-xs text-secondary-400 font-sans">
        <Icon
          name="lucide:shield-off"
          class="size-3.5"
        />
        Lecture seule côté EDR : Slowpoke n'écrit jamais dans l'outil.
      </span>
      <UIButton
        variant="outline"
        @click="open = false"
      >
        Annuler
      </UIButton>
      <UIButton
        variant="primary"
        :disabled="envoi"
        @click="enregistrer"
      >
        {{ envoi ? 'Enregistrement…' : 'Enregistrer' }}
      </UIButton>
    </template>
  </UIDialog>
</template>
