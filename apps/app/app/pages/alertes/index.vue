<script setup lang="ts">
import { UIButton, useToast } from '@slowpoke/ui'
import { computed, ref } from 'vue'

// FILE DE TRIAGE — ce qui mérite un regard, à côté du registre d'incidents.
//
// Une alerte n'est pas un incident : un incident porte des échéances réglementaires, un
// pilote et une procédure. Cette page existe pour que tout ce qui mérite un regard arrive
// quelque part, et que seul ce qui mérite un suivi devienne un dossier.

const eden = useEden()
const { canWrite } = await useRoles()
const session = await useSSRAuth()
const moi = computed(() => session.value?.user?.id ?? null)

useHead({ title: 'Alertes' })

const FILTRES_STATUT = [
  { v: 'nouvelle,en_cours', l: 'À trier' },
  { v: 'nouvelle', l: 'Nouvelles' },
  { v: 'ecartee', l: 'Écartées' },
  { v: 'escaladee', l: 'Escaladées' },
  { v: '', l: 'Toutes' },
] as const

const filtreStatut = ref<string>('nouvelle,en_cours')
const filtreMachine = ref('')
const filtreNiveau = ref<number | undefined>(undefined)
// Vues enregistrées : les trois questions qu'on se pose en arrivant.
const vue = ref<'file' | 'miennes' | 'ecartees'>('file')

const { data: file, refresh, pending } = await useAsyncData('alertes', async () => {
  const semaine = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data } = await eden.api.alerts.get({
    query: {
      ...(vue.value === 'ecartees'
        ? { status: 'ecartee', since: semaine }
        : filtreStatut.value ? { status: filtreStatut.value } : {}),
      ...(vue.value === 'miennes' && moi.value ? { assignee: moi.value } : {}),
      ...(filtreMachine.value.trim() ? { machine: filtreMachine.value.trim() } : {}),
      ...(filtreNiveau.value ? { level_min: filtreNiveau.value } : {}),
      limit: 100,
    },
  })
  return data ?? { total: 0, resultats: [] }
}, { watch: [filtreStatut, filtreNiveau, vue], getCachedData: () => undefined })

const { data: stats } = await useAsyncData('alertes-stats', async () => {
  const { data } = await eden.api.alerts.stats.get({ query: { jours: 30 } })
  return data ?? null
}, { getCachedData: () => undefined })

const { data: silences, refresh: rafraichirSilences } = await useAsyncData('alertes-silences', async () => {
  const { data } = await eden.api.alerts.silences.get({ query: { etat: 'active' } })
  return data ?? []
}, { getCachedData: () => undefined })

const { data: etat, refresh: rafraichirEtat } = await useAsyncData('alertes-etat', async () => {
  const { data } = await eden.api.alerts.etat.get()
  return data ?? null
}, { getCachedData: () => undefined })

type Alerte = NonNullable<typeof file.value>['resultats'][number]

const STATUTS: Record<string, { label: string, classes: string }> = {
  nouvelle: { label: 'Nouvelle', classes: 'bg-primary-50 text-primary-700 border-primary-200/60' },
  en_cours: { label: 'En cours', classes: 'bg-blue-50 text-blue-700 border-blue-200/60' },
  ecartee: { label: 'Écartée', classes: 'bg-secondary-50 text-secondary-600 border-secondary-200/60' },
  escaladee: { label: 'Escaladée', classes: 'bg-red-50 text-red-700 border-red-200/60' },
}
const MOTIFS: Record<string, string> = {
  faux_positif: 'Faux positif', benin: 'Bénin', bruit_connu: 'Bruit connu',
  doublon: 'Doublon', hors_perimetre: 'Hors périmètre',
}
const GRAVITES: Record<string, { label: string, classes: string }> = {
  critical: { label: 'P1', classes: 'bg-red-50 text-red-700 border-red-200/60' },
  high: { label: 'P2', classes: 'bg-orange-50 text-orange-700 border-orange-200/60' },
  medium: { label: 'P3', classes: 'bg-amber-50 text-amber-700 border-amber-200/60' },
  low: { label: 'P4', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200/60' },
}

const alerteChoisie = ref<Alerte | null>(null)
const mode = ref<'ecarter' | 'escalader'>('ecarter')
const modaleOuverte = ref(false)

function decider(a: Alerte, m: 'ecarter' | 'escalader') {
  alerteChoisie.value = a
  mode.value = m
  modaleOuverte.value = true
}

// Prendre une alerte, c'est deux choses : elle passe « en cours » ET elle porte un nom.
// Sans le second, « Mes alertes » ne montrerait jamais rien, et personne ne saurait qui
// regarde quoi — deux analystes peuvent trier la même file en même temps.
async function prendreEnCharge(a: Alerte) {
  await eden.api.alerts({ id: a.id }).patch({ status: 'en_cours', assignee: moi.value })
  await rafraichir()
}

/** Rendre une alerte à la file : elle redevient « nouvelle » et perd son preneur. */
async function rendre(a: Alerte) {
  await eden.api.alerts({ id: a.id }).patch({ status: 'nouvelle', assignee: null })
  await rafraichir()
}

async function rafraichir() {
  await Promise.all([refresh(), rafraichirEtat(), rafraichirSilences()])
}

// --- Écartement en masse, annulable -------------------------------------------------------
//
// Le jour où une règle part en vrille, c'est la seule action tenable. Elle n'est osable que
// parce qu'elle s'annule : le bandeau porte « Annuler » pendant dix secondes.
const selection = ref<string[]>([])
const motifMasse = ref<'faux_positif' | 'benin' | 'bruit_connu' | 'doublon' | 'hors_perimetre'>('faux_positif')
const toast = useToast()

const basculer = (id: string) => {
  const i = selection.value.indexOf(id)
  if (i === -1) selection.value.push(id)
  else selection.value.splice(i, 1)
}

async function ecarterLaSelection() {
  const ids = [...selection.value]
  if (!ids.length) return
  const { data, error } = await eden.api.alerts['dismiss-bulk'].post({ ids, dismissReason: motifMasse.value })
  if (error) {
    toast.newToast({ title: 'Échec', message: 'Écartement impossible.', type: 'error' })
    return
  }
  const ecartees = data?.ecartees ?? []
  selection.value = []
  await rafraichir()
  toast.newToast({
    title: `${ecartees.length} alerte(s) écartée(s)`,
    message: 'Elles restent consultables, avec leur motif.',
    type: 'success',
    action: {
      label: 'Annuler',
      run: async () => {
        await eden.api.alerts['reopen-bulk'].post({ ids: ecartees })
        await rafraichir()
        toast.newToast({ title: 'Écartement annulé', message: 'Les alertes sont revenues dans la file.', type: 'neutral' })
      },
    },
  })
}

async function leverSilence(id: string) {
  const motif = prompt('Pourquoi lever ce silence ? La série reviendra dans la file.')
  if (!motif?.trim()) return
  const { error } = await eden.api.alerts.silences({ id }).lever.patch({ motif })
  if (error) {
    toast.newToast({ title: 'Échec', message: 'Levée impossible.', type: 'error' })
    return
  }
  await rafraichir()
}

const depuis = (iso: string | Date | null | undefined) => {
  if (!iso) return null
  const heures = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (heures < 1) return 'moins d\'une heure'
  if (heures < 48) return `${heures} h`
  return `${Math.round(heures / 24)} jours`
}

// L'ingestion est POUSSÉE : si la source s'arrête, la file reste calme et tout paraît sain.
// « Aucune alerte » et « plus personne n'envoie » doivent se distinguer.
const silenceSuspect = computed(() => {
  const derniere = etat.value?.derniereRecue
  if (!derniere) return 'Aucune alerte reçue à ce jour : la source est-elle branchée ?'
  const heures = (Date.now() - new Date(derniere).getTime()) / 3_600_000
  return heures > 24 ? `Dernière alerte reçue il y a ${depuis(derniere)} : la source n'envoie peut-être plus.` : null
})
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 relative z-0">
    <header class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <UITitle class="font-sans text-secondary-900 tracking-tight">
          Alertes
        </UITitle>
        <p class="text-sm text-secondary-600/90 font-sans mt-1 max-w-2xl">
          La file de triage : tout ce qui mérite un regard. Seul ce qui mérite un suivi devient un incident.
        </p>
      </div>
      <div
        v-if="etat"
        class="flex flex-wrap items-center gap-2 text-xs font-mono"
      >
        <span class="rounded-full bg-primary-50 border border-primary-200/60 px-3 py-1 font-semibold text-primary-700">
          {{ etat.nouvelles }} à trier
        </span>
        <span
          v-if="etat.plusAncienneNonTriee"
          class="rounded-full border border-secondary-200 px-3 py-1 text-secondary-600"
          title="Âge de la plus ancienne alerte non triée"
        >plus ancienne : {{ depuis(etat.plusAncienneNonTriee) }}</span>
      </div>
    </header>

    <p
      v-if="silenceSuspect"
      class="rounded-2xl border border-amber-200/60 bg-amber-50/50 px-4 py-3 text-sm text-amber-800"
    >
      {{ silenceSuspect }}
    </p>

    <section class="bg-secondary-50/50 p-5 rounded-2xl border border-secondary-200/60 shadow-sm flex flex-col sm:flex-row items-start sm:items-end gap-5 flex-wrap">
      <div>
        <label class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono">Vue</label>
        <div class="inline-flex flex-wrap gap-1 rounded-lg border border-secondary-200 bg-white p-1">
          <button
            v-for="v in [{ v: 'file', l: 'La file' }, { v: 'miennes', l: 'Mes alertes' }, { v: 'ecartees', l: 'Écartées cette semaine' }]"
            :key="v.v"
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-sans transition-colors"
            :class="vue === v.v ? 'bg-primary-500 text-white font-medium shadow-sm' : 'text-secondary-600 hover:bg-secondary-50'"
            @click="vue = v.v as typeof vue"
          >
            {{ v.l }}
          </button>
        </div>
      </div>
      <div v-if="vue === 'file'">
        <label class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono">Statut</label>
        <div class="inline-flex flex-wrap gap-1 rounded-lg border border-secondary-200 bg-white p-1">
          <button
            v-for="f in FILTRES_STATUT"
            :key="f.v"
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-sans transition-colors"
            :class="filtreStatut === f.v ? 'bg-primary-500 text-white font-medium shadow-sm' : 'text-secondary-600 hover:bg-secondary-50'"
            @click="filtreStatut = f.v"
          >
            {{ f.l }}
          </button>
        </div>
      </div>
      <div class="w-full sm:w-56">
        <label
          for="alertes-machine"
          class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono"
        >Machine</label>
        <input
          id="alertes-machine"
          v-model="filtreMachine"
          class="h-10 w-full rounded-lg border border-secondary-200 bg-white px-3 text-sm"
          placeholder="nom exact"
          @keyup.enter="refresh()"
        >
      </div>
      <div class="w-full sm:w-36">
        <label
          for="alertes-niveau"
          class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono"
        >Niveau min.</label>
        <input
          id="alertes-niveau"
          v-model.number="filtreNiveau"
          type="number"
          min="0"
          max="16"
          class="h-10 w-full rounded-lg border border-secondary-200 bg-white px-3 text-sm"
          placeholder="10"
        >
      </div>
      <span class="sm:ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary-50 border border-primary-200/60 px-3 py-1 text-xs font-semibold text-primary-700 font-mono whitespace-nowrap">
        {{ file?.total ?? 0 }} alerte{{ (file?.total ?? 0) > 1 ? 's' : '' }}
      </span>
    </section>

    <!-- Sélection : visible seulement quand elle sert. -->
    <section
      v-if="canWrite && selection.length"
      class="flex flex-wrap items-center gap-3 rounded-2xl border border-primary-200/60 bg-primary-50/40 px-4 py-3"
    >
      <span class="text-sm font-semibold text-primary-800">{{ selection.length }} sélectionnée(s)</span>
      <select
        v-model="motifMasse"
        class="rounded-lg border border-secondary-200 bg-white px-2 py-1 text-sm"
      >
        <option value="faux_positif">
          Faux positif
        </option>
        <option value="benin">
          Bénin
        </option>
        <option value="bruit_connu">
          Bruit connu
        </option>
        <option value="doublon">
          Doublon
        </option>
        <option value="hors_perimetre">
          Hors périmètre
        </option>
      </select>
      <UIButton
        variant="primary"
        class="h-8 text-xs"
        @click="ecarterLaSelection"
      >
        Écarter la sélection
      </UIButton>
      <button
        type="button"
        class="text-xs text-secondary-500 hover:text-secondary-700"
        @click="selection = []"
      >
        tout décocher
      </button>
      <span class="ml-auto text-[11px] text-primary-700">Annulable pendant dix secondes après l'écartement.</span>
    </section>

    <!-- Les silences : ce qu'on a décidé de ne plus voir arriver, et jusqu'à quand. -->
    <section
      v-if="silences?.length"
      class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm space-y-3"
    >
      <h2 class="text-sm font-semibold text-secondary-900 font-sans">
        Séries faites taire — {{ silences.length }}
      </h2>
      <ul class="divide-y divide-secondary-100 rounded-xl border border-secondary-200/60">
        <li
          v-for="s in silences"
          :key="s.id"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
        >
          <span class="font-mono text-xs text-secondary-700">règle {{ s.regleId }}</span>
          <span class="text-xs text-secondary-500">{{ s.machine || 'toutes machines' }}</span>
          <span class="text-xs text-secondary-600">{{ MOTIFS[s.motif] ?? s.motif }}</span>
          <span
            v-if="s.note"
            class="text-xs text-secondary-500"
          >{{ s.note }}</span>
          <span class="ml-auto font-mono text-xs text-secondary-600">jusqu'au {{ new Date(s.echeance).toLocaleDateString('fr-FR') }}</span>
          <UIButton
            v-if="canWrite"
            variant="ghost"
            class="h-7 text-xs text-red-600 hover:bg-red-50/60"
            @click="leverSilence(s.id)"
          >
            Lever
          </UIButton>
        </li>
      </ul>
    </section>

    <!-- Ce que la file apprend : la liste de travail du réglage des règles. -->
    <section
      v-if="stats && stats.total"
      class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm space-y-3"
    >
      <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 class="text-sm font-semibold text-secondary-900 font-sans">
          Sur 30 jours
        </h2>
        <span class="font-mono text-xs text-secondary-600">{{ stats.total }} alertes</span>
        <span class="font-mono text-xs text-secondary-600">{{ stats.tauxEscalade }} % escaladées</span>
        <span
          v-if="stats.delaiMedianTriageHeures !== null"
          class="font-mono text-xs text-secondary-600"
        >triage médian : {{ stats.delaiMedianTriageHeures }} h</span>
      </div>
      <div
        v-if="stats.reglesEcartees.length"
        class="space-y-1"
      >
        <p class="text-xs text-secondary-500">
          Règles les plus écartées — la liste de travail du réglage, directement exploitable dans <span class="font-mono">local_rules.xml</span> :
        </p>
        <ul class="text-xs font-mono text-secondary-700 space-y-0.5">
          <li
            v-for="r in stats.reglesEcartees.slice(0, 5)"
            :key="`${r.regle}-${r.motif}`"
          >
            {{ r.regle }} — {{ r.libelle }} · {{ MOTIFS[r.motif] ?? r.motif }} · {{ r.occurrences }} occurrence(s)
          </li>
        </ul>
      </div>
    </section>

    <section
      v-if="pending"
      class="py-24 flex items-center justify-center bg-primary-50/40 rounded-2xl border border-primary-200/50 border-dashed"
    >
      <div class="animate-pulse flex items-center gap-3 text-primary-600 font-mono text-sm">
        <Icon
          name="lucide:loader-circle"
          class="size-4 animate-spin"
        />
        Lecture de la file…
      </div>
    </section>

    <section
      v-else-if="!file?.resultats.length"
      class="py-24 text-center bg-secondary-50/30 rounded-2xl border border-secondary-200/50 shadow-sm"
    >
      <Icon
        name="lucide:inbox"
        class="mx-auto mb-3 size-8 text-secondary-300"
      />
      <p class="text-secondary-600 font-sans">
        Aucune alerte dans ce filtre.
      </p>
      <p
        v-if="vue === 'miennes'"
        class="mt-1 text-xs text-secondary-400 font-sans"
      >
        Vous n'avez pris aucune alerte en charge. Le bouton « Prendre » d'une ligne la fait apparaître ici.
      </p>
      <p
        v-else
        class="mt-1 text-xs text-secondary-400 font-sans"
      >
        Une file vide est un fait — encore faut-il que la source envoie : le bandeau ci-dessus le dit.
      </p>
    </section>

    <section
      v-else
      class="space-y-3"
    >
      <article
        v-for="a in file.resultats"
        :key="a.id"
        class="bg-white p-4 sm:p-5 rounded-2xl border border-secondary-200/60 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:border-primary-300 transition-colors"
      >
        <div class="flex flex-col md:flex-row md:items-start gap-4">
          <input
            v-if="canWrite && (a.status === 'nouvelle' || a.status === 'en_cours')"
            type="checkbox"
            class="mt-1 size-4 shrink-0 accent-primary-600"
            :checked="selection.includes(a.id)"
            :aria-label="`Sélectionner l'alerte ${a.id}`"
            @change="basculer(a.id)"
          >
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold rounded-md border"
                :class="GRAVITES[a.severity]?.classes"
              >{{ GRAVITES[a.severity]?.label ?? a.severity }}</span>
              <span class="font-mono text-xs text-secondary-500">niveau {{ a.level }}</span>
              <span
                class="px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold rounded-md border"
                :class="STATUTS[a.status]?.classes"
              >{{ STATUTS[a.status]?.label ?? a.status }}</span>
              <span
                v-if="a.dismissReason"
                class="text-[11px] text-secondary-500"
              >{{ MOTIFS[a.dismissReason] ?? a.dismissReason }}</span>
              <span
                v-if="a.assignee"
                class="px-2 py-0.5 text-[11px] rounded-md border"
                :class="a.assignee === moi
                  ? 'border-primary-200/60 bg-primary-50 text-primary-700 font-semibold'
                  : 'border-secondary-200/60 bg-secondary-50 text-secondary-600'"
              >{{ a.assignee === moi ? 'à moi' : `prise par ${a.assigneeNom ?? 'quelqu\'un'}` }}</span>
              <NuxtLink
                v-if="a.incidentId"
                :to="`/incidents/${a.incidentId}`"
                class="font-mono text-xs text-primary-700 hover:underline"
              >
                #{{ a.incidentId }}
              </NuxtLink>
            </div>

            <NuxtLink
              :to="`/alertes/${a.id}`"
              class="block text-sm font-medium text-secondary-900 hover:text-primary-700"
            >
              {{ a.ruleDescription }}
              <span class="ml-1 font-mono text-[11px] text-secondary-400">{{ a.id }}</span>
            </NuxtLink>
            <p class="font-mono text-[11px] text-secondary-600 break-all">
              règle {{ a.ruleId }} · {{ a.machine }}<template v-if="a.sourceIps.length">
                · {{ a.sourceIps.join(', ') }}
              </template><template v-if="a.username">
                · {{ a.username }}
              </template>
            </p>
            <p class="font-mono text-[11px] text-secondary-500">
              {{ a.occurrences }} occurrence(s) · première vue il y a {{ depuis(a.firstSeen) }} · dernière il y a {{ depuis(a.lastSeen) }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <NuxtLink
              :to="`/alertes/${a.id}`"
              class="inline-flex h-8 items-center gap-1 rounded-lg border border-secondary-200 px-2 text-xs text-secondary-600 hover:border-primary-300"
            >
              <Icon
                name="lucide:panel-right-open"
                class="size-3.5"
              />
              Détail
            </NuxtLink>
          </div>
          <div
            v-if="canWrite && a.status !== 'escaladee'"
            class="flex flex-wrap items-center gap-2 shrink-0"
          >
            <UIButton
              v-if="a.status === 'nouvelle' && !a.assignee"
              variant="outline"
              class="h-8 text-xs"
              @click="prendreEnCharge(a)"
            >
              <Icon
                name="lucide:hand"
                class="size-3.5"
              />
              Prendre
            </UIButton>
            <UIButton
              v-if="a.assignee === moi"
              variant="ghost"
              class="h-8 text-xs"
              title="Remettre l'alerte dans la file"
              @click="rendre(a)"
            >
              <Icon
                name="lucide:undo-2"
                class="size-3.5"
              />
              Rendre
            </UIButton>
            <UIButton
              v-if="a.status !== 'ecartee'"
              variant="outline"
              class="h-8 text-xs"
              @click="decider(a, 'ecarter')"
            >
              <Icon
                name="lucide:circle-slash"
                class="size-3.5"
              />
              Écarter
            </UIButton>
            <UIButton
              variant="outline"
              class="h-8 text-xs"
              @click="decider(a, 'escalader')"
            >
              <Icon
                name="lucide:siren"
                class="size-3.5"
              />
              En faire un incident
            </UIButton>
            <a
              v-if="a.dashboardUrl"
              :href="a.dashboardUrl"
              target="_blank"
              rel="noopener noreferrer"
              :title="a.dashboardUrl"
              class="inline-flex h-8 items-center gap-1 rounded-lg border border-secondary-200 px-2 text-xs text-secondary-600 hover:border-primary-300"
            >
              <Icon
                name="lucide:external-link"
                class="size-3.5"
              />
              Dans l'outil
            </a>
          </div>
        </div>
      </article>
    </section>

    <AlertesDecisionAlerteModal
      v-model="modaleOuverte"
      :alerte="alerteChoisie"
      :mode="mode"
      @decide="rafraichir"
    />
  </div>
</template>
