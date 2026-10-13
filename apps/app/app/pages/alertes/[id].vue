<script setup lang="ts">
import { UIButton, useToast } from '@slowpoke/ui'
import { authClient } from '~/lib/auth-client'
import { computed, nextTick, ref } from 'vue'

// UNE ALERTE, EN ENTIER — ce que la file ne montre pas, faute de place.
//
// La liste donne de quoi décider vite ; cette page donne de quoi décider juste : le contexte
// tel que l'émetteur l'a rendu, le log brut, et le journal de triage — qui a décidé quoi,
// quand. Rien n'est reformulé : ce sont les mots de la source.

const eden = useEden()
const { canWrite } = await useRoles()
const route = useRoute()
const toast = useToast()
const session = await useSSRAuth()
const moi = computed(() => session.value?.user?.id ?? null)

const id = String(route.params.id).toUpperCase()
useHead({ title: `Alerte ${id}` })

const { data: alerte, refresh } = await useAsyncData(`alerte-${id}`, async () => {
  const { data } = await eden.api.alerts({ id }).get()
  return data ?? null
}, { getCachedData: () => undefined })

const STATUTS: Record<string, { label: string, classes: string }> = {
  nouvelle: { label: 'Nouvelle', classes: 'bg-primary-50 text-primary-700 border-primary-200/60' },
  en_cours: { label: 'En cours', classes: 'bg-blue-50 text-blue-700 border-blue-200/60' },
  ecartee: { label: 'Écartée', classes: 'bg-secondary-50 text-secondary-600 border-secondary-200/60' },
  escaladee: { label: 'Escaladée', classes: 'bg-red-50 text-red-700 border-red-200/60' },
}
const GRAVITES: Record<string, { label: string, classes: string }> = {
  critical: { label: 'P1 — Critique', classes: 'bg-red-50 text-red-700 border-red-200/60' },
  high: { label: 'P2 — Majeur', classes: 'bg-orange-50 text-orange-700 border-orange-200/60' },
  medium: { label: 'P3 — Modéré', classes: 'bg-amber-50 text-amber-700 border-amber-200/60' },
  low: { label: 'P4 — Mineur', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200/60' },
}
const MOTIFS: Record<string, string> = {
  faux_positif: 'Faux positif', benin: 'Bénin', bruit_connu: 'Bruit connu',
  doublon: 'Doublon', hors_perimetre: 'Hors périmètre',
}
const GENRES: Record<string, string> = {
  creation: 'Reçue', occurrence: 'Occurrence', statut: 'Triage',
  escalade: 'Escalade', silence: 'Silence', assignation: 'Prise en charge', avis: 'Avis demandé',
}

// Les clés du contexte viennent de l'émetteur : on les rend lisibles sans les interpréter.
const LIBELLES_CONTEXTE: Record<string, string> = {
  url: 'URL', codeHttp: 'Code HTTP', relaisSyslog: 'Relais syslog',
  protocole: 'Protocole', groupes: 'Groupes', agent: 'Agent',
}
const contexte = computed(() => Object.entries(alerte.value?.context ?? {}))

// « Qu'avons-nous fait la dernière fois ? » — la question posée devant une alerte n'est
// presque jamais neuve. Les décisions passées y répondent sans rien deviner.
const LIBELLES_DECISION: Record<string, string> = {
  'nouvelle': 'encore à trier',
  'en_cours': 'en cours de triage',
  'escaladee': 'escaladée en incident',
  'ecartee:faux_positif': 'écartée — faux positif',
  'ecartee:benin': 'écartée — bénin',
  'ecartee:bruit_connu': 'écartée — bruit connu',
  'ecartee:doublon': 'écartée — doublon',
  'ecartee:hors_perimetre': 'écartée — hors périmètre',
  'ecartee:sans motif': 'écartée',
}
const precedents = computed(() => alerte.value?.precedents ?? null)

const roles = computed(() => String(session.value?.user?.role ?? '').split(',').map(r => r.trim()))
const estAdmin = computed(() => roles.value.includes('admin'))

// PRISE EN CHARGE — qui regarde cette alerte, et qui peut la reprendre.
//
// Un gestionnaire ne prend que ce qui est libre ; reprendre ou transférer est réservé aux
// admins, comme pour le pilote d'un incident. Le cas réel est l'absence : quelqu'un part,
// son alerte doit continuer d'être suivie.
const transfertOuvert = ref(false)
const cibleChoisie = ref('')
const candidats = ref<{ value: string, label: string }[]>([])
const chargementCandidats = ref(false)

async function ouvrirTransfert() {
  transfertOuvert.value = true
  cibleChoisie.value = ''
  if (candidats.value.length || chargementCandidats.value) return
  chargementCandidats.value = true
  try {
    const { data } = await authClient().admin.listUsers({ query: { limit: 200 }, fetchOptions: { credentials: 'include' } })
    const bruts = (Array.isArray(data) ? data : (data as { users?: unknown[] } | null)?.users ?? []) as Record<string, unknown>[]
    candidats.value = bruts
      .filter(u => String(u.role ?? '').split(',').some(r => ['gestionnaire', 'admin'].includes(r.trim())))
      .filter(u => u.id !== alerte.value?.assignee)
      .map(u => ({ value: String(u.id), label: String(u.name || u.email || u.id) }))
  }
  finally {
    chargementCandidats.value = false
  }
}

// --- Conversation avec le modèle ---------------------------------------------------------
//
// Fil partagé : ce qu'on apprend au modèle — « cette adresse, c'est notre reverse proxy » —
// vaut pour toute la cellule, et le suivant doit voir ce qui a déjà été dit.
const question = ref('')
const conversationEnCours = ref(false)

async function envoyerQuestion() {
  const q = question.value.trim()
  if (!q || conversationEnCours.value) return
  conversationEnCours.value = true
  const { error } = await eden.api.alerts({ id }).chat.post({ question: q })
  conversationEnCours.value = false
  if (error) {
    toast.newToast({
      title: 'Le modèle n\'a pas répondu',
      message: String((error.value as { message?: string } | undefined)?.message ?? ''),
      type: 'error',
      duration: 6000,
    })
    return
  }
  question.value = ''
  await refresh()
}

// --- Ce que la cellule sait --------------------------------------------------------------
//
// Une note tient à la MACHINE ou à la RÈGLE, jamais à l'alerte : un fait appris aujourd'hui
// doit servir au prochain, sur la prochaine alerte. Sinon on réexplique chaque semaine au
// modèle que telle adresse est le reverse proxy de l'établissement.
const connaissances = computed(() => alerte.value?.connaissances ?? [])
const notePortee = ref<'machine' | 'regle'>('machine')
const noteTexte = ref('')
const noteEnCours = ref(false)
const champNote = ref<HTMLTextAreaElement | null>(null)

async function retenir() {
  const note = noteTexte.value.trim()
  if (!note || noteEnCours.value || !alerte.value) return
  noteEnCours.value = true
  const { error } = await eden.api.alerts.connaissances.post({
    portee: notePortee.value,
    valeur: notePortee.value === 'machine' ? alerte.value.machine : alerte.value.ruleId,
    note,
  })
  noteEnCours.value = false
  if (error) {
    toast.newToast({ title: 'Note non retenue', message: String((error.value as { message?: string } | undefined)?.message ?? ''), type: 'error', duration: 6000 })
    return
  }
  noteTexte.value = ''
  toast.newToast({ title: 'Retenu', message: '', type: 'success' })
  await refresh()
}

// Depuis le fil : ce qu'on vient d'apprendre au modèle ne survit pas à l'alerte tant qu'on
// ne le consigne pas. Un clic reprend le message, l'analyste ajuste et valide.
function retenirDepuis(contenu: string) {
  noteTexte.value = contenu
  nextTick(() => {
    champNote.value?.focus()
    champNote.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

async function retirerNote(noteId: string) {
  const { error } = await eden.api.alerts.connaissances({ id: noteId }).delete()
  if (error) {
    toast.newToast({ title: 'Suppression impossible', message: String((error.value as { message?: string } | undefined)?.message ?? ''), type: 'error' })
    return
  }
  await refresh()
}

const logDeplie = ref(false)

// L'avis du modèle : une aide à la décision, demandée quand on hésite. Il ne coche rien,
// n'écarte rien, et son contenu est stocké à part de l'alerte.
const avisEnCours = ref(false)
type Avis = { lecture: string, pourEcarter: string[], pourApprofondir: string[], aVerifier: string[] }
const avis = computed(() => (alerte.value?.avis?.contenu ?? null) as Avis | null)

async function demanderAvis() {
  if (avisEnCours.value) return
  avisEnCours.value = true
  const { error } = await eden.api.alerts({ id }).avis.post()
  avisEnCours.value = false
  if (error) {
    toast.newToast({
      title: 'Avis impossible',
      message: String((error.value as { message?: string } | undefined)?.message ?? ''),
      type: 'error',
      duration: 6000,
    })
    return
  }
  await refresh()
}
const modaleOuverte = ref(false)
const mode = ref<'ecarter' | 'escalader'>('ecarter')

function decider(m: 'ecarter' | 'escalader') {
  mode.value = m
  modaleOuverte.value = true
}

async function patcher(corps: Record<string, unknown>, titre: string) {
  const { error } = await eden.api.alerts({ id }).patch(corps as never)
  if (error) {
    toast.newToast({ title: 'Échec', message: String((error.value as { message?: string } | undefined)?.message ?? ''), type: 'error' })
    return
  }
  toast.newToast({ title: titre, message: '', type: 'success' })
  await refresh()
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
    <NuxtLink
      to="/alertes"
      class="inline-flex items-center gap-1 text-sm text-secondary-500 hover:text-primary-600"
    >
      <Icon
        name="lucide:arrow-left"
        class="size-4"
      />
      Retour à la file
    </NuxtLink>

    <p
      v-if="!alerte"
      class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      Alerte introuvable. Elle a peut-être été purgée : les alertes non escaladées sont conservées 90 jours.
    </p>

    <template v-else>
      <header class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold rounded-md border"
            :class="GRAVITES[alerte.severity]?.classes"
          >{{ GRAVITES[alerte.severity]?.label ?? alerte.severity }}</span>
          <span class="font-mono text-xs text-secondary-500">niveau {{ alerte.level }}</span>
          <span
            class="px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold rounded-md border"
            :class="STATUTS[alerte.status]?.classes"
          >{{ STATUTS[alerte.status]?.label ?? alerte.status }}</span>
          <span
            v-if="alerte.dismissReason"
            class="text-xs text-secondary-600"
          >{{ MOTIFS[alerte.dismissReason] ?? alerte.dismissReason }}</span>
          <span class="ml-auto font-mono text-xs text-secondary-400">{{ alerte.id }}</span>
        </div>
        <h1 class="text-xl font-semibold text-secondary-900 font-sans">
          {{ alerte.ruleDescription }}
        </h1>
        <p
          v-if="alerte.dismissNote"
          class="text-sm text-secondary-600"
        >
          {{ alerte.dismissNote }}
        </p>
      </header>

      <!-- Les faits, à plat. -->
      <section class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm">
        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div class="flex justify-between gap-3 border-b border-secondary-100 pb-2">
            <dt class="text-secondary-600">
              Règle
            </dt>
            <dd class="font-mono text-right">
              {{ alerte.ruleId }}
            </dd>
          </div>
          <div class="flex justify-between gap-3 border-b border-secondary-100 pb-2">
            <dt class="text-secondary-600">
              Machine
            </dt>
            <dd class="font-mono text-right break-all">
              {{ alerte.machine }}
            </dd>
          </div>
          <div class="flex justify-between gap-3 border-b border-secondary-100 pb-2">
            <dt class="text-secondary-600">
              Occurrences
            </dt>
            <dd class="font-mono text-right">
              {{ alerte.occurrences }}
            </dd>
          </div>
          <div class="flex justify-between gap-3 border-b border-secondary-100 pb-2">
            <dt class="text-secondary-600">
              Source
            </dt>
            <dd class="font-mono text-right">
              {{ alerte.source }}
            </dd>
          </div>
          <div class="flex justify-between gap-3 border-b border-secondary-100 pb-2">
            <dt class="text-secondary-600">
              Première vue
            </dt>
            <dd class="font-mono text-right">
              {{ dateHeure(alerte.firstSeen) }}
            </dd>
          </div>
          <div class="flex justify-between gap-3 border-b border-secondary-100 pb-2">
            <dt class="text-secondary-600">
              Dernière vue
            </dt>
            <dd class="font-mono text-right">
              {{ dateHeure(alerte.lastSeen) }}
            </dd>
          </div>
          <div
            v-if="alerte.sourceIps.length"
            class="flex justify-between gap-3 border-b border-secondary-100 pb-2 sm:col-span-2"
          >
            <dt class="text-secondary-600">
              Adresses à l'origine
            </dt>
            <dd class="font-mono text-right break-all">
              {{ alerte.sourceIps.join(', ') }}
            </dd>
          </div>
          <div
            v-if="alerte.username"
            class="flex justify-between gap-3 border-b border-secondary-100 pb-2"
          >
            <dt class="text-secondary-600">
              Compte
            </dt>
            <dd class="font-mono text-right">
              {{ alerte.username }}
            </dd>
          </div>
          <div
            v-if="alerte.mitre.length"
            class="flex justify-between gap-3 border-b border-secondary-100 pb-2"
          >
            <dt class="text-secondary-600">
              ATT&CK
            </dt>
            <dd class="font-mono text-right">
              {{ alerte.mitre.join(', ') }}
            </dd>
          </div>
          <div
            v-if="alerte.incidentId"
            class="flex justify-between gap-3 border-b border-secondary-100 pb-2"
          >
            <dt class="text-secondary-600">
              Incident
            </dt>
            <dd class="text-right">
              <NuxtLink
                :to="`/incidents/${alerte.incidentId}`"
                class="font-mono text-primary-700 hover:underline"
              >#{{ alerte.incidentId }}</NuxtLink>
            </dd>
          </div>
        </dl>
      </section>

      <!-- Ce que la cellule a déjà décidé pour cette règle. -->
      <section
        v-if="precedents && precedents.total > 1"
        class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm space-y-2"
      >
        <h2 class="text-sm font-semibold text-secondary-900">
          Précédents sur cette règle
        </h2>
        <p class="text-sm text-secondary-700">
          Vue <span class="font-semibold">{{ precedents.total }}</span> fois,
          dont <span class="font-semibold">{{ precedents.surCetteMachine }}</span> sur cette machine.
        </p>
        <ul class="flex flex-wrap gap-2">
          <li
            v-for="d in precedents.decisions"
            :key="d.decision"
            class="rounded-md border border-secondary-200 bg-secondary-50/60 px-2 py-0.5 text-xs text-secondary-700"
          >
            {{ LIBELLES_DECISION[d.decision] ?? d.decision }} — {{ d.n }}
          </li>
        </ul>
        <p class="text-[11px] text-secondary-500">
          Décomptes sur les alertes conservées, plus les décomptes mensuels de celles déjà purgées.
          Ce sont des précédents, pas une consigne : une série écartée dix fois peut être la onzième qui compte.
        </p>
      </section>

      <!-- Le contexte tel que l'émetteur le rend : aucune interprétation. -->
      <section
        v-if="contexte.length"
        class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm space-y-2"
      >
        <h2 class="text-sm font-semibold text-secondary-900">
          Contexte
        </h2>
        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div
            v-for="[cle, valeur] in contexte"
            :key="cle"
            class="flex justify-between gap-3 border-b border-secondary-100 pb-1.5"
          >
            <dt class="text-secondary-600">
              {{ LIBELLES_CONTEXTE[cle] ?? cle }}
            </dt>
            <dd class="font-mono text-right break-all">
              {{ valeur }}
            </dd>
          </div>
        </dl>
      </section>

      <!-- Le log brut : contenu d'attaquant possible, donc du texte et rien d'autre. -->
      <section
        v-if="alerte.rawLog"
        class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm space-y-2"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between text-sm font-semibold text-secondary-900"
          @click="logDeplie = !logDeplie"
        >
          Log brut
          <Icon
            :name="logDeplie ? 'lucide:chevron-up' : 'lucide:chevron-down'"
            class="size-4 text-secondary-400"
          />
        </button>
        <pre
          v-if="logDeplie"
          class="overflow-x-auto rounded-lg bg-secondary-50 border border-secondary-200 p-3 text-xs whitespace-pre-wrap break-all font-mono text-secondary-800"
        >{{ alerte.rawLog }}</pre>
        <p
          v-if="logDeplie"
          class="text-[11px] text-secondary-500"
        >
          Rendu comme texte, jamais comme lien : une ligne de journal peut contenir ce qu'un attaquant y a mis.
        </p>
      </section>

      <!-- CE QUE LA CELLULE SAIT.
           Sous l'assistance, la couche qui dure. Une note est attachée à la machine ou à la
           règle : la source ne dira jamais qu'une adresse est le reverse proxy de
           l'établissement, et le modèle ne doit pas l'apprendre deux fois. -->
      <section class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm space-y-3">
        <div>
          <h2 class="text-sm font-semibold text-secondary-900">
            Ce que la cellule sait
          </h2>
          <p class="text-[11px] text-secondary-500">
            Attaché à la machine <span class="font-mono">{{ alerte.machine }}</span> ou à la règle
            <span class="font-mono">{{ alerte.ruleId }}</span> — pas à cette alerte. Repris sur les suivantes,
            et donné au modèle comme un fait qu'il ne doit pas contredire.
          </p>
        </div>

        <p
          v-if="!connaissances.length"
          class="text-xs text-secondary-500"
        >
          Rien de consigné pour l'instant.
        </p>
        <ul
          v-else
          class="space-y-2"
        >
          <li
            v-for="k in connaissances"
            :key="k.id"
            class="flex items-start justify-between gap-3 rounded-xl border border-secondary-200/60 bg-secondary-50/40 px-3 py-2"
          >
            <div class="min-w-0">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-secondary-500">
                {{ k.portee === 'machine' ? 'Machine' : 'Règle' }}
                <span class="ml-1 font-mono font-normal normal-case tracking-normal text-secondary-600">{{ k.valeur }}</span>
              </p>
              <p class="mt-0.5 whitespace-pre-line text-sm text-secondary-800">
                {{ k.note }}
              </p>
              <p class="mt-0.5 text-[11px] text-secondary-400">
                {{ k.parNom ?? 'La cellule' }} · {{ dateHeure(k.majLe) }}
              </p>
            </div>
            <UIButton
              v-if="canWrite"
              variant="ghost"
              class="h-7 shrink-0 text-xs text-secondary-500"
              @click="retirerNote(k.id)"
            >
              Retirer
            </UIButton>
          </li>
        </ul>

        <div
          v-if="canWrite"
          class="space-y-2 border-t border-secondary-100 pt-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-secondary-500">Ce fait tient à</span>
            <div class="flex overflow-hidden rounded-lg border border-secondary-200">
              <button
                type="button"
                class="px-2.5 py-1 text-xs"
                :class="notePortee === 'machine' ? 'bg-primary-50 font-semibold text-primary-700' : 'bg-white text-secondary-600'"
                @click="notePortee = 'machine'"
              >
                la machine
              </button>
              <button
                type="button"
                class="border-l border-secondary-200 px-2.5 py-1 text-xs"
                :class="notePortee === 'regle' ? 'bg-primary-50 font-semibold text-primary-700' : 'bg-white text-secondary-600'"
                @click="notePortee = 'regle'"
              >
                la règle
              </button>
            </div>
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <textarea
              id="alerte-note"
              ref="champNote"
              v-model="noteTexte"
              rows="2"
              class="min-w-0 flex-1 rounded-lg border border-secondary-200 px-3 py-2 text-sm"
              placeholder="Ex. : cette machine est le reverse proxy de l'université ; les requêtes qu'elle relaie portent l'adresse du visiteur."
            />
            <UIButton
              variant="primary"
              :disabled="noteEnCours || !noteTexte.trim()"
              @click="retenir"
            >
              {{ noteEnCours ? 'En cours…' : 'Retenir' }}
            </UIButton>
          </div>
          <p class="text-[11px] text-secondary-500">
            Une seule note par cible : réécrire remplace la précédente. À réserver aux faits
            d'infrastructure — <strong>pas aux conclusions d'un triage</strong>, qui vivent dans le journal.
          </p>
        </div>
      </section>

      <!-- L'ASSISTANCE, D'UN SEUL TENANT.
           L'avis et le fil étaient deux cartes voisines : on ne voyait pas qu'il s'agit du
           même échange, ni qu'apporter un élément fait relire l'alerte. Une seule carte, une
           seule colonne, dans l'ordre du temps — et une mise en garde, à la fin. -->
      <section
        v-if="canWrite"
        class="rounded-2xl border border-secondary-200/60 bg-white shadow-sm"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-secondary-100 p-5">
          <div class="flex items-center gap-2">
            <span class="flex size-8 items-center justify-center rounded-lg bg-secondary-100 text-secondary-600">
              <Icon
                name="lucide:bot"
                class="size-4"
              />
            </span>
            <div>
              <h2 class="text-sm font-semibold text-secondary-900">
                Assistance
              </h2>
              <p class="text-[11px] text-secondary-500">
                Son avis, et ce que vous lui apprenez — un seul échange, partagé avec la cellule.
              </p>
            </div>
          </div>
          <UIButton
            variant="outline"
            class="h-8 text-xs"
            :disabled="avisEnCours"
            @click="demanderAvis"
          >
            {{ avisEnCours ? 'En cours…' : avis ? 'Refaire son avis' : 'Demander un avis' }}
          </UIButton>
        </div>

        <!-- Colonne unique : le rail de gauche relie l'avis aux échanges qui le suivent. -->
        <ol class="m-5 space-y-4 border-l-2 border-secondary-100 pl-5">
          <li
            v-if="!avis && !alerte.conversation.length"
            class="text-xs text-secondary-500"
          >
            Le modèle met en face ce qui plaide pour écarter et ce qui plaide pour approfondir.
            Demandez son avis, puis apportez-lui ce qui manque — il relira l'alerte avec.
          </li>

          <li
            v-if="avis"
            class="space-y-2"
          >
            <p class="text-[11px] font-semibold uppercase tracking-wider text-secondary-500">
              Avis du modèle
              <span class="ml-1 font-mono font-normal normal-case tracking-normal text-secondary-400">{{ dateHeure(alerte.avis?.creeLe) }}</span>
            </p>
            <p
              v-if="avis.lecture"
              class="text-sm text-secondary-800"
            >
              {{ avis.lecture }}
            </p>
            <div class="grid gap-3 sm:grid-cols-2">
              <div
                v-if="avis.pourEcarter.length"
                class="rounded-xl border border-secondary-200 bg-secondary-50/50 p-3"
              >
                <p class="text-[11px] font-semibold uppercase tracking-wider text-secondary-500">
                  Plaide pour écarter
                </p>
                <ul class="mt-1 space-y-1 text-sm text-secondary-700">
                  <li
                    v-for="(e, i) in avis.pourEcarter"
                    :key="`e-${i}`"
                  >
                    — {{ e }}
                  </li>
                </ul>
              </div>
              <div
                v-if="avis.pourApprofondir.length"
                class="rounded-xl border border-amber-200 bg-amber-50/50 p-3"
              >
                <p class="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  Plaide pour approfondir
                </p>
                <ul class="mt-1 space-y-1 text-sm text-amber-900">
                  <li
                    v-for="(e, i) in avis.pourApprofondir"
                    :key="`a-${i}`"
                  >
                    — {{ e }}
                  </li>
                </ul>
              </div>
            </div>
            <div v-if="avis.aVerifier.length">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-secondary-500">
                À vérifier
              </p>
              <ul class="mt-1 space-y-1 text-sm text-secondary-700">
                <li
                  v-for="(e, i) in avis.aVerifier"
                  :key="`v-${i}`"
                >
                  — {{ e }}
                </li>
              </ul>
            </div>
          </li>

          <li
            v-for="m in alerte.conversation"
            :key="m.id"
          >
            <p class="text-[11px] font-semibold uppercase tracking-wider text-secondary-500">
              {{ m.role === 'user' ? (m.auteurNom ?? 'La cellule') : 'Réponse du modèle' }}
              <span class="ml-1 font-mono font-normal normal-case tracking-normal text-secondary-400">{{ dateHeure(m.creeLe) }}</span>
            </p>
            <p
              class="mt-0.5 whitespace-pre-line rounded-xl border px-3 py-2 text-sm"
              :class="m.role === 'user'
                ? 'border-secondary-200 bg-secondary-50/50 text-secondary-800'
                : 'border-primary-200/60 bg-primary-50/30 text-secondary-800'"
            >
              {{ m.contenu }}
            </p>
            <!-- Un échange meurt avec l'alerte ; une note, non. -->
            <button
              v-if="m.role === 'user'"
              type="button"
              class="mt-1 text-[11px] font-semibold text-primary-700 hover:underline"
              @click="retenirDepuis(m.contenu)"
            >
              Retenir ce fait
            </button>
          </li>
        </ol>

        <div class="space-y-2 border-t border-secondary-100 p-5">
          <label
            for="alerte-question"
            class="block text-[11px] font-semibold uppercase tracking-wider text-secondary-500"
          >Lui donner un élément, ou lui demander autre chose</label>
          <div class="flex flex-wrap items-end gap-2">
            <textarea
              id="alerte-question"
              v-model="question"
              rows="2"
              class="min-w-0 flex-1 rounded-lg border border-secondary-200 px-3 py-2 text-sm"
              placeholder="Ex. : cette adresse est le relais syslog interne, pas une source externe."
            />
            <UIButton
              variant="primary"
              :disabled="conversationEnCours || !question.trim()"
              @click="envoyerQuestion"
            >
              {{ conversationEnCours ? 'En cours…' : 'Envoyer' }}
            </UIButton>
          </div>
          <p class="text-[11px] text-secondary-500">
            Ce que vous lui apprenez reste visible pour le prochain qui ouvrira cette alerte.
            <strong>Rien de tout cela ne vaut décision</strong> : le modèle ne coche rien, n'écrit rien dans l'alerte,
            se trompe sans le dire, et le log brut qu'il a lu peut contenir ce qu'un attaquant y a écrit.
            <template v-if="alerte.avis?.modele">
              Modèle local : <span class="font-mono">{{ alerte.avis.modele }}</span>.
            </template>
          </p>
        </div>
      </section>

      <!-- Le journal de triage : qui a décidé quoi, et quand. -->
      <section class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm space-y-3">
        <h2 class="text-sm font-semibold text-secondary-900">
          Journal de triage
        </h2>
        <ol class="space-y-2">
          <li
            v-for="l in alerte.journal"
            :key="l.id"
            class="flex flex-wrap items-baseline gap-x-2 border-l-2 border-secondary-200 pl-3 text-sm"
          >
            <span class="font-mono text-[11px] text-secondary-400">{{ dateHeure(l.creeLe) }}</span>
            <span class="text-[11px] font-semibold uppercase tracking-wider text-secondary-500">{{ GENRES[l.genre] ?? l.genre }}</span>
            <span class="text-secondary-700">{{ l.message }}</span>
            <span
              v-if="l.parNom"
              class="text-[11px] text-secondary-400"
            >— {{ l.parNom }}</span>
          </li>
        </ol>
        <p class="text-[11px] text-secondary-500">
          Les occurrences ne sont pas journalisées une par une : une règle qui s'emballe en produit des centaines. Elles sont comptées plus haut.
        </p>
      </section>

      <!-- Qui regarde cette alerte. -->
      <section class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-secondary-900">
              Prise en charge
            </p>
            <p class="text-sm text-secondary-600">
              <template v-if="!alerte.assignee">
                Personne ne s'en occupe.
              </template>
              <template v-else-if="alerte.assignee === moi">
                Vous.
              </template>
              <template v-else>
                {{ alerte.assigneeNom ?? 'quelqu\'un' }}
              </template>
            </p>
          </div>
          <div
            v-if="canWrite"
            class="flex flex-wrap items-center gap-2"
          >
            <UIButton
              v-if="!alerte.assignee"
              variant="outline"
              class="h-8 text-xs"
              @click="patcher({ status: alerte.status === 'nouvelle' ? 'en_cours' : alerte.status, assignee: moi }, 'Alerte prise en charge')"
            >
              Prendre
            </UIButton>
            <UIButton
              v-if="alerte.assignee && (alerte.assignee === moi || estAdmin)"
              variant="ghost"
              class="h-8 text-xs"
              @click="patcher({ assignee: null }, 'Prise en charge retirée')"
            >
              Rendre à la file
            </UIButton>
            <UIButton
              v-if="estAdmin && alerte.assignee !== moi"
              variant="outline"
              class="h-8 text-xs"
              @click="ouvrirTransfert"
            >
              {{ alerte.assignee ? 'Reprendre ou transférer' : 'Attribuer' }}
            </UIButton>
          </div>
        </div>

        <div
          v-if="transfertOuvert"
          class="flex flex-wrap items-center gap-2 border-t border-secondary-100 pt-3"
        >
          <select
            v-model="cibleChoisie"
            class="rounded-lg border border-secondary-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">
              {{ chargementCandidats ? 'chargement…' : 'choisir une personne…' }}
            </option>
            <option
              v-for="c in candidats"
              :key="c.value"
              :value="c.value"
            >
              {{ c.label }}
            </option>
          </select>
          <UIButton
            variant="primary"
            class="h-8 text-xs"
            :disabled="!cibleChoisie"
            @click="patcher({ assignee: cibleChoisie }, 'Alerte attribuée'); transfertOuvert = false"
          >
            Attribuer
          </UIButton>
          <UIButton
            variant="ghost"
            class="h-8 text-xs"
            @click="patcher({ assignee: moi }, 'Vous avez repris la main'); transfertOuvert = false"
          >
            Reprendre pour moi
          </UIButton>
          <button
            type="button"
            class="text-xs text-secondary-500 hover:text-secondary-700"
            @click="transfertOuvert = false"
          >
            annuler
          </button>
          <p class="w-full text-[11px] text-secondary-500">
            Seuls les gestionnaires et administrateurs sont proposés : un lecteur ne pourrait pas agir sur l'alerte dont il aurait la charge.
          </p>
        </div>
      </section>

      <!-- Actions, et retour vers l'outil. -->
      <section class="flex flex-wrap items-center gap-2">
        <template v-if="canWrite && alerte.status !== 'escaladee'">
          <UIButton
            v-if="alerte.status === 'nouvelle'"
            variant="outline"
            @click="patcher({ status: 'en_cours', assignee: moi }, 'Alerte prise en charge')"
          >
            Prendre
          </UIButton>
          <UIButton
            v-if="alerte.assignee === moi"
            variant="ghost"
            @click="patcher({ status: 'nouvelle', assignee: null }, 'Alerte rendue à la file')"
          >
            Rendre
          </UIButton>
          <UIButton
            v-if="alerte.status !== 'ecartee'"
            variant="outline"
            @click="decider('ecarter')"
          >
            Écarter
          </UIButton>
          <UIButton
            variant="primary"
            @click="decider('escalader')"
          >
            En faire un incident
          </UIButton>
        </template>

        <a
          v-if="alerte.dashboardUrl"
          :href="alerte.dashboardUrl"
          target="_blank"
          rel="noopener noreferrer"
          :title="alerte.dashboardUrl"
          class="ml-auto inline-flex items-center gap-1 rounded-lg border border-secondary-200 px-3 py-2 text-sm text-secondary-600 hover:border-primary-300"
        >
          <Icon
            name="lucide:external-link"
            class="size-4"
          />
          Ouvrir dans l'outil
        </a>
        <span
          v-else
          class="ml-auto text-xs text-secondary-400"
        >Aucun lien vers l'outil : l'émetteur n'en a pas fourni, ou il n'était pas en https.</span>
      </section>

      <p
        v-if="alerte.dashboardUrl"
        class="text-[11px] text-secondary-400 font-mono break-all"
      >
        {{ alerte.dashboardUrl }}
      </p>

      <AlertesDecisionAlerteModal
        v-model="modaleOuverte"
        :alerte="alerte"
        :mode="mode"
        @decide="refresh"
      />
    </template>
  </div>
</template>
