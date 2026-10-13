<script setup lang="ts">
import { UIButton, UIDialog, UIInput, UISelect, useToast, type UISelectOption } from '@slowpoke/ui'
import { computed, ref, watch } from 'vue'
import { Icon } from '#components'
import { SCOPE_FIELDS, composeScope, detectBroadScope } from '@slowpoke/database/exclusion-scope'

// DÉCLARER UNE LISTE BLANCHE depuis la fiche de l'incident qui la motive.
//
// Les critères sont proposés SELON L'OUTIL et se COMBINENT : en pratique on exclut un
// chemin, une empreinte ou une règle, presque toujours restreint à une machine. Un « type
// d'exclusion » unique aurait forcé à choisir, et fait perdre la restriction qui limite
// justement la portée.

const props = defineProps<{ incidentId: string }>()
const emit = defineEmits<{ created: [] }>()

const eden = useEden()
const open = defineModel<boolean>({ default: false })

const OUTILS: UISelectOption[] = [
  { value: 'harfanglab', label: 'HarfangLab' },
  { value: 'wazuh', label: 'Wazuh' },
  { value: 'pare_feu', label: 'Pare-feu' },
  { value: 'autre', label: 'Autre' },
]

const outil = ref<'harfanglab' | 'wazuh' | 'pare_feu' | 'autre'>('harfanglab')
const outilAutre = ref('')
const criteres = ref<Record<string, string>>({})
const motif = ref('')
const dateRevue = ref(dans(12))
// Vrai dès que la date a été choisie à la main : on cesse alors de la corriger.
const dateChoisie = ref(false)
const submitting = ref(false)
const erreur = ref('')

function dans(mois: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + mois)
  return d.toISOString().slice(0, 10)
}

// Un an : c'est la règle écrite de la cellule, « revue annuelle de l'ensemble ». Une
// portée large descend à trois mois — c'est précisément celle qu'il faut revoir vite.
const ECHEANCES = [
  { mois: 1, libelle: '1 mois' },
  { mois: 3, libelle: '3 mois' },
  { mois: 6, libelle: '6 mois' },
  { mois: 12, libelle: '1 an' },
] as const

const champs = computed(() => SCOPE_FIELDS[outil.value] ?? SCOPE_FIELDS.autre!)

// Changer d'outil vide les critères : ceux de l'outil précédent n'ont plus de sens.
watch(outil, () => {
  criteres.value = {}
})

/** Aperçu de ce qui sera enregistré — le libellé se compose à mesure qu'on saisit. */
const apercu = computed(() => composeScope(criteres.value, outil.value))
const alertesLargeur = computed(() => detectBroadScope(criteres.value, outil.value))

// Une portée large ramène l'échéance à trois mois, tant que personne n'a fixé de date
// lui-même : proposer un an sur une exclusion très large serait incohérent.
watch(alertesLargeur, (large) => {
  if (!dateChoisie.value) dateRevue.value = dans(large.length ? 3 : 12)
})
const auMoinsUnCritere = computed(() => Object.values(criteres.value).some(v => v?.trim()))

const submit = async () => {
  if (submitting.value) return
  erreur.value = ''
  if (!auMoinsUnCritere.value) {
    erreur.value = 'Renseignez au moins un critère de portée.'
    return
  }
  if (!motif.value.trim()) {
    erreur.value = 'Le motif est obligatoire.'
    return
  }

  submitting.value = true
  const { error } = await eden.api.exclusions.post({
    incidentId: props.incidentId,
    tool: outil.value,
    toolOther: outil.value === 'autre' ? outilAutre.value : undefined,
    scopeDetails: criteres.value,
    reason: motif.value,
    reviewDate: dateRevue.value,
    // La confirmation est donnée ici : l'avertissement est affiché juste au-dessus.
    acknowledgeBroadScope: alertesLargeur.value.length > 0,
  })
  submitting.value = false

  if (error) {
    erreur.value = String((error.value as { message?: string })?.message ?? 'Création impossible.')
    return
  }
  useToast().newToast({ title: 'Liste blanche enregistrée', message: 'Elle apparaît dans « Listes blanches ».', type: 'success', duration: 3000 })
  criteres.value = {}
  motif.value = ''
  outilAutre.value = ''
  open.value = false
  emit('created')
}
</script>

<template>
  <UIDialog
    v-model="open"
    title="Déclarer une liste blanche"
    description="Ce que l'outil ne signalera plus, et jusqu'à quand."
  >
    <template #content>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Outil
          </label>
          <UISelect
            v-model="outil"
            :items="OUTILS"
            :multi-select="false"
            class="h-11"
          />
        </div>

        <div
          v-if="outil === 'autre'"
          class="space-y-2"
        >
          <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Nom de l'outil
          </label>
          <UIInput
            v-model="outilAutre"
            placeholder="Proxy, antispam…"
            class="h-11"
          />
        </div>

        <!-- Critères combinables : on remplit ceux qui s'appliquent, pas un seul type. -->
        <div class="md:col-span-2 space-y-3 rounded-xl border border-gray-200/80 bg-gray-50/40 p-4">
          <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Portée <span class="text-gray-400 normal-case tracking-normal">— au moins un critère</span>
          </p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              v-for="c in champs"
              :key="c.key"
              class="space-y-1.5"
            >
              <label class="block text-xs font-medium text-gray-600 font-sans">{{ c.label }}</label>
              <UIInput
                v-model="criteres[c.key]"
                :placeholder="c.placeholder"
                class="h-10"
              />
              <p
                v-if="c.hint"
                class="text-[11px] text-gray-400"
              >
                {{ c.hint }}
              </p>
            </div>
          </div>

          <p
            v-if="apercu"
            class="rounded-lg border border-gray-200/80 bg-white px-3 py-2 text-xs text-gray-600 font-sans"
          >
            <span class="font-semibold text-gray-700">Sera enregistré :</span> {{ apercu }}
          </p>
        </div>

        <!-- Friction volontaire : une exclusion trop large ne doit pas passer aussi
             discrètement qu'une exclusion précise. -->
        <div
          v-if="alertesLargeur.length"
          class="md:col-span-2 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3"
        >
          <Icon
            name="lucide:triangle-alert"
            class="mt-0.5 size-4 shrink-0 text-amber-600"
          />
          <div class="text-xs text-amber-900 font-sans">
            <p class="font-semibold">
              Portée très large
            </p>
            <ul class="mt-1 space-y-0.5">
              <li
                v-for="(a, i) in alertesLargeur"
                :key="i"
              >
                <span class="font-mono">{{ a.field }} « {{ a.value }} »</span> — {{ a.explanation }}.
              </li>
            </ul>
            <p class="mt-1.5">
              En enregistrant, vous confirmez cette portée. Elle sera signalée à la revue.
            </p>
          </div>
        </div>

        <div class="md:col-span-2 space-y-2">
          <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Motif <span class="text-red-500">*</span>
          </label>
          <UIInput
            v-model="motif"
            placeholder="Pourquoi cette activité est légitime"
            class="h-11"
          />
          <p class="text-[11px] text-gray-500">
            Relu à la revue par quelqu'un qui n'aura pas le contexte d'aujourd'hui.
          </p>
        </div>

        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Date de revue <span class="text-red-500">*</span>
          </label>
          <UIInput
            v-model="dateRevue"
            type="date"
            class="h-11"
            @change="dateChoisie = true"
          />
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="e in ECHEANCES"
              :key="e.mois"
              type="button"
              class="rounded-md border px-2 py-0.5 text-[11px] transition-colors"
              :class="dateRevue === dans(e.mois)
                ? 'border-primary-300 bg-primary-50 text-primary-700 font-semibold'
                : 'border-gray-200 bg-white text-gray-600 hover:border-primary-300'"
              @click="dateRevue = dans(e.mois); dateChoisie = true"
            >
              {{ e.libelle }}
            </button>
          </div>
          <p class="text-[11px] text-gray-500">
            Pas de liste blanche sans échéance : c'est ce qui l'empêche de devenir permanente par oubli.
            <template v-if="alertesLargeur.length">
              Portée large : trois mois plutôt qu'un an, pour la revoir avant qu'elle ne s'installe.
            </template>
            <template v-else>
              Un an par défaut — « le temps de vérifier » mérite bien moins.
            </template>
          </p>
        </div>

        <p
          v-if="erreur"
          class="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 font-sans"
        >
          {{ erreur }}
        </p>
      </div>
    </template>

    <template #footer>
      <NuxtLink
        to="/exclusions"
        class="mr-auto inline-flex items-center gap-1 text-xs text-secondary-500 hover:text-primary-600 font-sans transition-colors"
        @click="open = false"
      >
        <Icon
          name="lucide:shield-off"
          class="size-3.5"
        />
        Voir toutes les listes blanches
      </NuxtLink>
      <UIButton
        variant="outline"
        @click="open = false"
      >
        Annuler
      </UIButton>
      <UIButton
        variant="primary"
        :disabled="submitting"
        @click="submit"
      >
        {{ submitting ? 'Enregistrement…' : 'Enregistrer' }}
      </UIButton>
    </template>
  </UIDialog>
</template>
