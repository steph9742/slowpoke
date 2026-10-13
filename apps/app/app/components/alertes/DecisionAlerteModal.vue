<script setup lang="ts">
import { UIButton, UIDialog, UIInput, useToast } from '@slowpoke/ui'
import { ref, watch } from 'vue'

// DÉCIDER D'UNE ALERTE — l'écarter, ou en faire un incident.
//
// Les deux décisions exigent quelque chose de l'humain qui la prend : un motif pour
// l'écartement, un type pour l'incident. Une alerte écartée sans motif est une décision
// qu'on ne peut ni défendre ni compter six mois plus tard.

type Alerte = {
  id: string
  ruleId: string
  ruleDescription: string
  level: number
  machine: string
  occurrences: number
  firstSeen: string | Date
}

const props = defineProps<{ alerte: Alerte | null, mode: 'ecarter' | 'escalader' }>()
const emit = defineEmits<{ decide: [] }>()
const open = defineModel<boolean>({ default: false })

const eden = useEden()
const toast = useToast()

const MOTIFS = [
  { value: 'faux_positif', label: 'Faux positif', aide: 'La détection s\'est trompée : il n\'y avait rien. Alimente le réglage des règles.' },
  { value: 'benin', label: 'Bénin', aide: 'Activité réelle, sans conséquence.' },
  { value: 'bruit_connu', label: 'Bruit connu', aide: 'Série déjà identifiée, attendue sur ce périmètre.' },
  { value: 'doublon', label: 'Doublon', aide: 'Déjà traité ailleurs, dans une autre alerte ou un incident.' },
  { value: 'hors_perimetre', label: 'Hors périmètre', aide: 'Ne relève pas de la cellule.' },
] as const

const TYPES = [
  { value: 'network_intrusion', label: 'Intrusion réseau' },
  { value: 'malware', label: 'Malware' },
  { value: 'ransomware', label: 'Ransomware' },
  { value: 'phishing', label: 'Phishing' },
  { value: 'data_breach', label: 'Fuite de données' },
  { value: 'ddos', label: 'DDoS' },
  { value: 'other', label: 'Autre' },
] as const

const PERIMETRES = [
  { value: 'inconnu', label: 'Inconnu' },
  { value: 'composante', label: 'Composante' },
  { value: 'laboratoire', label: 'Laboratoire' },
  { value: 'service_central', label: 'Service central' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'etablissement_raccorde', label: 'Établissement raccordé' },
] as const

const motif = ref<typeof MOTIFS[number]['value'] | ''>('')
const note = ref('')
// Faire taire la série, et jusqu'à quand. Le panier est journalier : sans silence, la même
// série revient demain matin en « nouvelle », et la file se vide de ses lecteurs.
const faireTaire = ref(false)
const porteeMachine = ref(true)
const echeanceSilence = ref(dansJours(30))
const type = ref<typeof TYPES[number]['value']>('network_intrusion')
const perimetre = ref<typeof PERIMETRES[number]['value']>('inconnu')
const rattacherA = ref('')
const envoi = ref(false)
const erreur = ref('')

function dansJours(j: number): string {
  const d = new Date()
  d.setDate(d.getDate() + j)
  return d.toISOString().slice(0, 10)
}
const ECHEANCES_SILENCE = [7, 30, 90] as const

watch(open, (ouvert) => {
  if (!ouvert) return
  erreur.value = ''
  motif.value = ''
  note.value = ''
  faireTaire.value = false
  porteeMachine.value = true
  echeanceSilence.value = dansJours(30)
  type.value = 'network_intrusion'
  perimetre.value = 'inconnu'
  rattacherA.value = ''
})

async function decider() {
  if (envoi.value || !props.alerte) return
  erreur.value = ''
  envoi.value = true

  // Le silence d'abord : il écarte du même coup ce qui attend déjà dans la file, celle-ci
  // comprise. L'écarter avant poserait deux fois la même décision.
  if (props.mode === 'ecarter' && faireTaire.value) {
    const { error: erreurSilence } = await eden.api.alerts.silences.post({
      ruleId: props.alerte.ruleId,
      machine: porteeMachine.value ? props.alerte.machine : null,
      dismissReason: motif.value as 'faux_positif',
      note: note.value || undefined,
      echeance: echeanceSilence.value,
      ecarterLaFile: true,
    })
    envoi.value = false
    if (erreurSilence) {
      erreur.value = String((erreurSilence.value as { message?: string } | undefined)?.message ?? 'Silence impossible.')
      return
    }
    toast.newToast({ title: 'Série faite taire', message: 'Les prochaines alertes de cette série naîtront écartées, jusqu\'à l\'échéance.', type: 'success' })
    open.value = false
    emit('decide')
    return
  }

  const { error } = props.mode === 'ecarter'
    ? await eden.api.alerts({ id: props.alerte.id }).patch({ status: 'ecartee', dismissReason: motif.value || undefined, dismissNote: note.value || undefined })
    : await eden.api.alerts({ id: props.alerte.id }).escalate.post({
        type: type.value,
        perimeter: perimetre.value,
        ...(rattacherA.value.trim() ? { attachToIncidentId: rattacherA.value.trim().toUpperCase() } : {}),
      })
  envoi.value = false

  if (error) {
    erreur.value = String((error.value as { message?: string } | undefined)?.message ?? 'Décision impossible.')
    return
  }
  toast.newToast({
    title: props.mode === 'ecarter' ? 'Alerte écartée' : 'Incident ouvert',
    message: props.mode === 'ecarter' ? 'Elle reste consultable, avec son motif.' : 'La date de connaissance est celle de la première détection.',
    type: 'success',
  })
  open.value = false
  emit('decide')
}
</script>

<template>
  <UIDialog
    v-model="open"
    :title="mode === 'ecarter' ? 'Écarter cette alerte' : 'En faire un incident'"
    :description="mode === 'ecarter'
      ? 'Elle reste consultable, et son motif alimente le réglage des règles.'
      : 'Un incident porte des échéances réglementaires, comptées depuis la première détection.'"
  >
    <template #content>
      <div
        v-if="alerte"
        class="space-y-5"
      >
        <div class="rounded-xl border border-gray-200/80 bg-gray-50/40 p-3">
          <p class="text-sm text-secondary-800">
            {{ alerte.ruleDescription }}
          </p>
          <p class="mt-0.5 font-mono text-[11px] text-secondary-500">
            règle {{ alerte.ruleId }} · niveau {{ alerte.level }} · {{ alerte.machine }} · {{ alerte.occurrences }} occurrence(s)
          </p>
        </div>

        <template v-if="mode === 'ecarter'">
          <div class="space-y-2">
            <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
              Motif <span class="text-red-500">*</span>
            </p>
            <button
              v-for="m in MOTIFS"
              :key="m.value"
              type="button"
              class="w-full rounded-xl border p-3 text-left transition-colors"
              :class="motif === m.value ? 'border-primary-300 bg-primary-50/60' : 'border-gray-200 bg-white hover:border-primary-300'"
              @click="motif = m.value"
            >
              <span class="block text-sm font-medium text-secondary-800">{{ m.label }}</span>
              <span class="block text-xs text-secondary-500">{{ m.aide }}</span>
            </button>
          </div>
          <!-- Le panier est journalier : écarter ne vaut que pour aujourd'hui. -->
          <div
            v-if="motif === 'faux_positif' || motif === 'bruit_connu'"
            class="rounded-xl border border-secondary-200 bg-secondary-50/40 p-3 space-y-2"
          >
            <label class="flex items-start gap-2 cursor-pointer">
              <input
                v-model="faireTaire"
                type="checkbox"
                class="mt-0.5 size-4 accent-primary-600"
              >
              <span class="text-sm text-secondary-800">
                Faire taire toute la série
                <span class="block text-xs text-secondary-500">
                  Sinon, la même règle reviendra demain matin : le regroupement est journalier.
                </span>
              </span>
            </label>
            <template v-if="faireTaire">
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="text-secondary-500">Portée :</span>
                <button
                  type="button"
                  class="rounded-md border px-2 py-0.5"
                  :class="porteeMachine ? 'border-primary-300 bg-primary-50 text-primary-700 font-semibold' : 'border-gray-200 bg-white text-gray-600'"
                  @click="porteeMachine = true"
                >
                  cette machine
                </button>
                <button
                  type="button"
                  class="rounded-md border px-2 py-0.5"
                  :class="!porteeMachine ? 'border-amber-300 bg-amber-50 text-amber-800 font-semibold' : 'border-gray-200 bg-white text-gray-600'"
                  @click="porteeMachine = false"
                >
                  toutes les machines
                </button>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <UIInput
                  v-model="echeanceSilence"
                  type="date"
                  class="h-9 w-40"
                />
                <button
                  v-for="j in ECHEANCES_SILENCE"
                  :key="j"
                  type="button"
                  class="rounded-md border px-2 py-0.5 text-[11px]"
                  :class="echeanceSilence === dansJours(j) ? 'border-primary-300 bg-primary-50 text-primary-700 font-semibold' : 'border-gray-200 bg-white text-gray-600'"
                  @click="echeanceSilence = dansJours(j)"
                >
                  {{ j }} jours
                </button>
              </div>
              <p class="text-[11px] text-secondary-500">
                L'échéance est obligatoire, et rappelée comme celle d'une liste blanche : un silence sans date de revue est un angle mort que personne n'a décidé.
              </p>
            </template>
          </div>

          <div class="space-y-2">
            <label
              for="alerte-note"
              class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono"
            >Note</label>
            <UIInput
              id="alerte-note"
              v-model="note"
              placeholder="Ce qu'il faudra savoir au prochain réglage des règles"
              class="h-11"
            />
          </div>
        </template>

        <template v-else>
          <div class="space-y-2">
            <label
              for="alerte-type"
              class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono"
            >Type d'incident <span class="text-red-500">*</span></label>
            <select
              id="alerte-type"
              v-model="type"
              class="w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm"
            >
              <option
                v-for="o in TYPES"
                :key="o.value"
                :value="o.value"
              >
                {{ o.label }}
              </option>
            </select>
          </div>
          <div class="space-y-2">
            <label
              for="alerte-perimetre"
              class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono"
            >Périmètre</label>
            <select
              id="alerte-perimetre"
              v-model="perimetre"
              class="w-full rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm"
            >
              <option
                v-for="o in PERIMETRES"
                :key="o.value"
                :value="o.value"
              >
                {{ o.label }}
              </option>
            </select>
          </div>
          <div class="space-y-2">
            <label
              for="alerte-rattacher"
              class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono"
            >Rattacher à un incident existant</label>
            <UIInput
              id="alerte-rattacher"
              v-model="rattacherA"
              placeholder="Laisser vide pour ouvrir un nouvel incident"
              class="h-11 font-mono"
            />
            <p class="text-[11px] text-gray-500">
              Une campagne sur cinq machines fait un incident, pas cinq. La date de connaissance de l'incident recule si cette alerte est antérieure.
            </p>
          </div>
          <p class="text-[11px] text-gray-500">
            La gravité est déduite du niveau de la source. L'incident ouvert porte sa règle, sa machine, ses adresses et ses techniques ATT&CK.
          </p>
        </template>

        <p
          v-if="erreur"
          class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 font-sans"
        >
          {{ erreur }}
        </p>
      </div>
    </template>

    <template #footer>
      <UIButton
        variant="outline"
        @click="open = false"
      >
        Annuler
      </UIButton>
      <UIButton
        variant="primary"
        :disabled="envoi || (mode === 'ecarter' && !motif)"
        @click="decider"
      >
        {{ envoi ? 'Enregistrement…' : mode === 'ecarter' ? 'Écarter' : 'Ouvrir l\'incident' }}
      </UIButton>
    </template>
  </UIDialog>
</template>
