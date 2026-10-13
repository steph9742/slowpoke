<script setup lang="ts">
import { UIButton, useToast } from '@slowpoke/ui'
import { computed, ref, onMounted } from 'vue'
// Import explicite : dans `components/incidents/`, l'auto-import de Nuxt nommerait ce
// composant `IncidentsIncidentChat`. Sans lui, `<IncidentChat>` ne résout rien et Vue
// rend un élément vide, sans rien signaler.
import IncidentChat from '../IncidentChat.vue'

// CONDUITE À TENIR — la checklist, appliquée à cet incident.
//
// Rien n'est engendré : c'est la checklist du dépôt de documentation, telle qu'écrite, plus
// l'avancement de CET incident et la date d'où courent ses compteurs. L'avancement appartient
// à l'incident, pas à la personne : deux analystes voient les mêmes cases cochées.

// `canWrite` vient du parent : le calculer ici demanderait un `await` en <script setup>,
// qui rend le composant asynchrone — et le rendu serveur d'un <component :is> dans un
// <KeepAlive> échoue alors au rafraîchissement de la page.
const props = defineProps<{
  incidentId: string
  canWrite: boolean
  incident?: { knowledgeAt?: string | null, pilot?: string | null }
}>()
const canWrite = computed(() => props.canWrite)
const eden = useEden()
const toast = useToast()

const chargement = ref(true)
const donnees = ref<Awaited<ReturnType<typeof charger>> | null>(null)
const checklistImposee = ref<string | undefined>(undefined)
const enCours = ref<string | null>(null)

async function charger() {
  const { data } = await eden.api.incidents({ id: props.incidentId }).conduite.get({
    query: checklistImposee.value ? { checklist: checklistImposee.value } : {},
  })
  return data
}

async function rafraichir() {
  chargement.value = true
  donnees.value = await charger()
  chargement.value = false
}

onMounted(async () => {
  await rafraichir()
  await chargerAnalyses()
})

async function changerProcedure(checklist: string) {
  checklistImposee.value = checklist
  await rafraichir()
}

async function basculer(cle: string, fait: boolean) {
  const ref_ = donnees.value?.procedure.checklist
  if (!ref_ || enCours.value) return
  enCours.value = cle

  // Optimiste : la case répond au clic, on rétablit si le serveur refuse.
  const c = donnees.value?.cases.find(x => x.cle === cle)
  const avant = c?.fait ?? false
  if (c) c.fait = fait

  const { error } = await eden.api.incidents({ id: props.incidentId })
    .conduite.cases({ cle }).patch({ fait, checklist: ref_ })

  if (error) {
    if (c) c.fait = avant
    toast.newToast({ duration: 4000, title: 'Erreur', message: 'Enregistrement impossible.', type: 'error' })
  }
  enCours.value = null
}

/** Les cases regroupées par section, dans l'ordre de la checklist. */
type CaseAffichee = NonNullable<typeof donnees.value>['cases'][number]

const sections = computed(() => {
  const ordre: string[] = []
  const par = new Map<string, CaseAffichee[]>()
  for (const c of donnees.value?.cases ?? []) {
    if (!par.has(c.section)) {
      par.set(c.section, [])
      ordre.push(c.section)
    }
    par.get(c.section)!.push(c)
  }
  return ordre.map(titre => ({ titre, cases: par.get(titre)! }))
})

const avancement = computed(() => {
  const t = donnees.value?.cases ?? []
  return { faites: t.filter(c => c.fait).length, total: t.length }
})

/** « dans 18 h », « dépassée de 5 h ». Le signe porte l'information, pas la couleur seule. */
function delai(heures: number | null): string {
  if (heures === null) return 'sans date de connaissance'
  const h = Math.abs(heures)
  const forme = h >= 48 ? `${Math.round(h / 24)} j` : h >= 1 ? `${Math.round(h)} h` : `${Math.round(h * 60)} min`
  return heures >= 0 ? `dans ${forme}` : `dépassée de ${forme}`
}

// Assistance : le modèle propose, rien n'est appliqué automatiquement. Les suggestions
// s'affichent à côté des cases, l'analyste coche lui-même.
type EtatSuggere = { cle: string, etat: string, justification: string }
const analyses = ref<Record<string, unknown>>({})
const iaEnCours = ref<string | null>(null)
const iaErreur = ref<string | null>(null)

/**
 * Version courte et plate d'une case, pour le bandeau : le Markdown y ferait trois lignes
 * là où on veut lire l'action d'un coup d'œil. Le libellé entier reste au survol, et
 * intégralement lisible dans la checklist juste en dessous.
 */
const LONGUEUR_BANDEAU = 90

function actionCourte(texte: string): string {
  const plat = texte
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()

  // La première phrase suffit souvent — mais pas si elle est trop courte pour se
  // comprendre seule. On ne coupe PAS aux « · » : ils relient les éléments d'une même
  // consigne, les séparer la rend inintelligible.
  const phrase = plat.split(/\.\s+/)[0]!.trim()
  const retenu = phrase.length >= 30 ? phrase : plat

  return retenu.length > LONGUEUR_BANDEAU ? `${retenu.slice(0, LONGUEUR_BANDEAU).trimEnd()}…` : retenu
}

/** Une suggestion n'a d'intérêt que si le modèle a trouvé quelque chose. */
function suggestion(cle: string): EtatSuggere | null {
  const s = suggestions.value.get(cle)
  return s && s.etat !== 'sans_element' ? s : null
}

const suggestions = computed(() => {
  const a = analyses.value.avancement as { checklist?: string, cases?: EtatSuggere[] } | undefined
  if (!a?.cases || a.checklist !== donnees.value?.procedure.checklist) return new Map<string, EtatSuggere>()
  return new Map(a.cases.map(c => [c.cle, c]))
})

async function chargerAnalyses() {
  const { data } = await eden.api.incidents({ id: props.incidentId }).analyses.get()
  if (data) analyses.value = Object.fromEntries(data.map(a => [a.genre, a.contenu]))
}

async function demander(genre: 'resume' | 'iocs' | 'avancement' | 'procedure') {
  if (iaEnCours.value) return
  iaEnCours.value = genre
  iaErreur.value = null
  const { data, error } = await eden.api.incidents({ id: props.incidentId })
    .analyses({ genre }).post(genre === 'avancement' ? { checklist: donnees.value?.procedure.checklist } : {})
  if (!error && data) {
    analyses.value = { ...analyses.value, [genre]: data.contenu }
  }
  else {
    // La connexion peut tomber pendant que le serveur travaille encore : le résultat est
    // alors bel et bien en base. On relit avant de conclure à un échec.
    const avant = analyses.value[genre]
    await chargerAnalyses()
    if (analyses.value[genre] && analyses.value[genre] !== avant) {
      iaErreur.value = null
    }
    else {
      iaErreur.value = (error?.value as { message?: string })?.message
        ?? 'Pas de réponse dans le temps imparti. Le calcul se poursuit peut-être : rouvrez l\'onglet dans une minute.'
    }
  }
  iaEnCours.value = null
}

const LIBELLE_ETAT: Record<string, string> = {
  faite: 'semble faite',
  en_cours: 'semble en cours',
  sans_element: 'aucun élément',
}

// Saisie du dépôt, par compteur : la date et la référence rendue par l'autorité.
const depotOuvert = ref<string | null>(null)
const saisieDepot = ref<{ deposeLe: string, reference: string }>({ deposeLe: '', reference: '' })

function ouvrirDepot(e: { cle: string, deposeLe: string | null, reference: string | null }) {
  // `deposeLe` arrive en `Date` et non en `string` : Eden convertit les dates ISO.
  depotOuvert.value = depotOuvert.value === e.cle ? null : e.cle
  saisieDepot.value = {
    deposeLe: pourChampDate(e.deposeLe, true) || new Date().toISOString().slice(0, 16),
    reference: e.reference ?? '',
  }
}

async function enregistrerDepot(cle: string) {
  const { deposeLe, reference } = saisieDepot.value
  if (!deposeLe) return
  const { error } = await eden.api.incidents({ id: props.incidentId }).echeances({ cle }).depot.patch({
    deposeLe: new Date(deposeLe).toISOString(),
    reference: reference.trim() || null,
  })
  if (error) {
    useToast().newToast({ title: 'Échec', message: 'Dépôt non enregistré.', type: 'error', duration: 4000 })
    return
  }
  depotOuvert.value = null
  await charger()
}

/** Retirer un dépôt relance le compteur : c'est une correction de saisie. */
async function retirerDepot(cle: string) {
  if (!confirm('Retirer ce dépôt ? Le compte à rebours repartira.')) return
  await eden.api.incidents({ id: props.incidentId }).echeances({ cle }).depot.patch({ deposeLe: null })
  depotOuvert.value = null
  await charger()
}

async function trancher(cle: string, applicable: boolean | null) {
  // « défaut » revient à la règle de la grille : on efface la décision plutôt que d'en
  // poser une autre, sinon on ne distingue plus « choisi » de « jamais examiné ».
  if (applicable === null) {
    await eden.api.incidents({ id: props.incidentId }).echeances({ cle }).delete()
  }
  else {
    await eden.api.incidents({ id: props.incidentId }).echeances({ cle }).patch({ applicable })
  }
  await rafraichir()
}

/**
 * Ce qui presse, calculé et non engendré : l'échéance la plus proche, les premières cases
 * non cochées dans l'ordre de la checklist, et les manques qui bloquent le reste.
 */
const NB_ACTIONS = 3

const urgent = computed(() => {
  const armees = (donnees.value?.echeances ?? []).filter(e => e.court && e.heuresRestantes !== null)
  const echeance = armees.length
    ? armees.reduce((a, b) => (a.heuresRestantes! <= b.heuresRestantes! ? a : b))
    : null

  const restantes = (donnees.value?.cases ?? []).filter(c => !c.fait)
  // La première section non terminée : les checklists ouvrent sur ce qui se joue en premier.
  const section = restantes[0]?.section ?? ''
  const dansSection = restantes.filter(c => c.section === section)

  // « À évaluer » n'arme aucun compteur — on n'invente pas d'échéance — mais l'oublier
  // reviendrait à décider par défaut. La grille dit « le doute conduit à alerter » :
  // encore faut-il avoir regardé.
  const aTrancher = (donnees.value?.echeances ?? [])
    .filter(e => e.applicable === null && e.defaut === 'a_evaluer')

  const manques: string[] = []
  if (aTrancher.length) {
    manques.push(`${aTrancher.length} compteur(s) à évaluer : ${aTrancher.map(e => e.nom).join(', ')}.`)
  }
  if (props.incident && !props.incident.knowledgeAt) {
    manques.push('Date de connaissance non renseignée — aucun compteur réglementaire ne court.')
  }
  if (props.incident && !props.incident.pilot) manques.push('Aucun pilote désigné.')

  return {
    echeance,
    actions: dansSection.slice(0, NB_ACTIONS),
    section,
    restantes: dansSection.length,
    manques,
    grave: (echeance?.heuresRestantes ?? Infinity) < 6,
  }
})

function tonEcheance(heures: number | null): string {
  if (heures === null) return 'border-secondary-200/60 bg-secondary-50/40 text-secondary-600'
  if (heures < 0) return 'border-red-200/70 bg-red-50/60 text-red-800'
  if (heures < 6) return 'border-amber-200/70 bg-amber-50/60 text-amber-800'
  return 'border-secondary-200/60 bg-secondary-50/40 text-secondary-700'
}
</script>

<template>
  <div
    v-if="chargement"
    class="py-16 text-center text-sm text-secondary-500 font-sans"
  >
    Chargement de la procédure…
  </div>

  <div
    v-else-if="!donnees?.sourceConfiguree"
    class="py-16 text-center bg-secondary-50/30 rounded-2xl border border-secondary-200/50"
  >
    <Icon
      name="lucide:book-dashed"
      class="mx-auto mb-3 size-8 text-secondary-300"
    />
    <p class="text-secondary-600 font-sans">
      Le dépôt de procédures n'est pas configuré.
    </p>
    <p class="mt-1 text-xs text-secondary-400 font-sans">
      Réglages → Procédures : adresse GitLab, projet et jeton de lecture.
    </p>
  </div>

  <div
    v-else
    class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
  >
    <!-- Ce qu'il faut faire maintenant. Entièrement calculé : l'échéance vient des dates,
         les actions sont les premières cases non cochées DANS L'ORDRE de la checklist, qui
         est déjà l'ordre du gain. S'affiche sans le modèle, et sans attendre. -->
    <section
      v-if="urgent.echeance || urgent.actions.length || urgent.manques.length"
      class="rounded-2xl border-l-4 p-4 space-y-2.5"
      :class="urgent.grave
        ? 'border-l-red-500 border border-red-200/60 bg-red-50/50'
        : 'border-l-amber-500 border border-amber-200/60 bg-amber-50/40'"
    >
      <div
        v-if="urgent.echeance"
        class="flex flex-wrap items-baseline gap-x-2 gap-y-1"
      >
        <span
          class="font-mono text-xs font-bold uppercase tracking-wider"
          :class="urgent.grave ? 'text-red-700' : 'text-amber-700'"
        >{{ donnees.niveau }}</span>
        <span class="text-sm font-semibold text-secondary-900">
          {{ urgent.echeance.nom }} — {{ delai(urgent.echeance.heuresRestantes) }}
        </span>
        <span class="text-xs text-secondary-600">portée par {{ urgent.echeance.porteur }}</span>
      </div>

      <p
        v-for="m in urgent.manques"
        :key="m"
        class="text-sm text-secondary-700"
      >
        {{ m }}
      </p>

      <div v-if="urgent.actions.length">
        <p class="text-[11px] font-semibold text-secondary-500 uppercase tracking-wider font-mono mb-1">
          À faire maintenant
        </p>
        <ul class="space-y-0.5">
          <li
            v-for="a in urgent.actions"
            :key="a.cle"
            class="flex items-start gap-1.5 text-sm text-secondary-800"
          >
            <Icon
              name="lucide:chevron-right"
              class="mt-1 size-3.5 shrink-0 text-secondary-400"
            />
            <span
              :class="suggestion(a.cle)?.etat === 'faite' ? 'line-through text-secondary-500' : ''"
              :title="a.texte"
            >{{ actionCourte(a.texte) }}</span>
            <span
              v-if="suggestion(a.cle)"
              class="mt-0.5 shrink-0 text-[11px] text-primary-600"
              :title="suggestion(a.cle)!.justification"
            >{{ LIBELLE_ETAT[suggestion(a.cle)!.etat] }}</span>
          </li>
        </ul>
        <p
          v-if="urgent.section"
          class="mt-1 text-xs text-secondary-500"
        >
          {{ urgent.restantes }} case(s) restante(s) — {{ urgent.section }}
        </p>
      </div>
    </section>

    <!-- Les compteurs réglementaires d'abord : c'est ce qui ne se rattrape pas. -->
    <section class="space-y-2">
      <h3 class="text-xs font-semibold text-secondary-500 uppercase tracking-widest font-mono">
        Échéances réglementaires
      </h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div
          v-for="e in donnees.echeances"
          :key="e.cle"
          class="rounded-xl border p-3"
          :class="e.court ? tonEcheance(e.heuresRestantes) : 'border-secondary-200/60 bg-secondary-50/30 text-secondary-500'"
        >
          <div class="flex items-baseline justify-between gap-2">
            <span
              class="text-sm font-semibold"
              :class="e.court ? '' : 'line-through'"
            >{{ e.nom }}</span>
            <span
              v-if="e.court"
              class="font-mono text-xs whitespace-nowrap"
            >{{ e.delaiHeures }} h · {{ delai(e.heuresRestantes) }}</span>
            <span
              v-else-if="e.deposeLe"
              class="font-mono text-xs whitespace-nowrap text-emerald-700"
            >déposé</span>
            <span
              v-else
              class="font-mono text-xs whitespace-nowrap"
            >{{ e.applicable === false ? 'écarté' : 'ne court pas' }}</span>
          </div>
          <p class="mt-1 text-xs opacity-90">
            {{ e.condition }}
          </p>
          <p class="mt-0.5 text-[11px] opacity-70">
            Départ : {{ e.depart }} · Porte : {{ e.porteur }}
          </p>

          <!-- L'ACCOMPLISSEMENT : un jalon déposé ne court plus, et la référence rendue par
               l'autorité se note pendant qu'on l'a sous les yeux. -->
          <p
            v-if="e.deposeLe"
            class="mt-1.5 rounded-lg border border-emerald-200/70 bg-emerald-50/50 px-2 py-1 text-[11px] text-emerald-800"
          >
            Déposé le {{ dateHeure(e.deposeLe) }}
            <span v-if="e.reference">
              — référence <span class="font-mono">{{ e.reference }}</span>
            </span>
            <button
              v-if="canWrite"
              type="button"
              class="ml-1.5 text-emerald-700/70 hover:underline"
              @click="retirerDepot(e.cle)"
            >
              retirer
            </button>
          </p>

          <div
            v-else-if="canWrite && (e.court || e.applicable)"
            class="mt-1.5"
          >
            <button
              v-if="depotOuvert !== e.cle"
              type="button"
              class="text-[11px] font-semibold text-primary-700 hover:underline"
              @click="ouvrirDepot(e)"
            >
              Enregistrer le dépôt
            </button>
            <div
              v-else
              class="space-y-1.5 rounded-lg border border-secondary-200 bg-white p-2"
            >
              <input
                v-model="saisieDepot.deposeLe"
                type="datetime-local"
                class="w-full rounded border border-secondary-200 px-1.5 py-1 text-[11px]"
              >
              <input
                v-model="saisieDepot.reference"
                type="text"
                placeholder="Référence rendue par l'autorité"
                class="w-full rounded border border-secondary-200 px-1.5 py-1 text-[11px]"
              >
              <div class="flex gap-1.5">
                <button
                  type="button"
                  class="rounded border border-primary-300 bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700"
                  @click="enregistrerDepot(e.cle)"
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  class="text-[11px] text-secondary-400 hover:underline"
                  @click="depotOuvert = null"
                >
                  annuler
                </button>
              </div>
            </div>
          </div>

          <!-- La grille laisse « à évaluer » sur NIS2 en P2 et sur le RGPD : c'est une
               décision d'analyste, pas un défaut à combler automatiquement. -->
          <div
            v-if="canWrite"
            class="mt-2 flex items-center gap-1.5"
          >
            <span
              v-if="e.applicable === null && e.defaut === 'a_evaluer'"
              class="text-[11px] font-semibold text-amber-700"
            >À évaluer —</span>
            <button
              v-for="choix in [{ v: true, l: 'applicable' }, { v: false, l: 'non applicable' }]"
              :key="String(choix.v)"
              type="button"
              class="rounded border px-1.5 py-0.5 text-[11px] transition-colors"
              :class="e.applicable === choix.v
                ? 'border-primary-300 bg-primary-50 text-primary-700 font-semibold'
                : 'border-secondary-200 bg-white text-secondary-500 hover:border-primary-300'"
              @click="trancher(e.cle, choix.v)"
            >
              {{ choix.l }}
            </button>
            <button
              v-if="e.applicable !== null"
              type="button"
              class="text-[11px] text-secondary-400 hover:underline"
              @click="trancher(e.cle, null)"
            >
              défaut
            </button>
          </div>
        </div>
      </div>
      <p class="text-xs text-secondary-400 font-sans">
        Comptés depuis la date de <strong>connaissance</strong> — celle de l'établissement, pas celle de la cellule.
        Slowpoke rappelle les conditions, il ne décide pas qu'un délai s'applique.
      </p>
    </section>

    <!-- Assistance : propositions du modèle, jamais appliquées d'elles-mêmes. -->
    <section
      v-if="canWrite && donnees.assistanceConfiguree"
      class="rounded-2xl border border-primary-200/50 bg-primary-50/20 p-4 space-y-3"
    >
      <div class="flex items-center gap-2">
        <Icon
          name="lucide:sparkles"
          class="size-4 text-primary-600"
        />
        <h3 class="text-sm font-semibold text-secondary-900 font-sans">
          Assistance
        </h3>
        <span class="text-xs text-secondary-500">Propositions à vérifier — rien n'est appliqué automatiquement.</span>
      </div>

      <div class="flex flex-wrap gap-2">
        <UIButton
          variant="outline"
          class="h-8 text-xs"
          :disabled="iaEnCours !== null"
          @click="demander('avancement')"
        >
          <Icon
            :name="iaEnCours === 'avancement' ? 'lucide:loader-circle' : 'lucide:list-checks'"
            class="size-3.5"
            :class="iaEnCours === 'avancement' ? 'animate-spin' : ''"
          />
          Situer l'avancement
        </UIButton>
        <UIButton
          variant="outline"
          class="h-8 text-xs"
          :disabled="iaEnCours !== null"
          @click="demander('procedure')"
        >
          <Icon
            :name="iaEnCours === 'procedure' ? 'lucide:loader-circle' : 'lucide:git-branch'"
            class="size-3.5"
            :class="iaEnCours === 'procedure' ? 'animate-spin' : ''"
          />
          Suggérer la procédure
        </UIButton>
        <UIButton
          variant="outline"
          class="h-8 text-xs"
          :disabled="iaEnCours !== null"
          @click="demander('resume')"
        >
          <Icon
            :name="iaEnCours === 'resume' ? 'lucide:loader-circle' : 'lucide:text-quote'"
            class="size-3.5"
            :class="iaEnCours === 'resume' ? 'animate-spin' : ''"
          />
          Résumer
        </UIButton>
        <UIButton
          variant="outline"
          class="h-8 text-xs"
          :disabled="iaEnCours !== null"
          @click="demander('iocs')"
        >
          <Icon
            :name="iaEnCours === 'iocs' ? 'lucide:loader-circle' : 'lucide:fingerprint'"
            class="size-3.5"
            :class="iaEnCours === 'iocs' ? 'animate-spin' : ''"
          />
          Relever les indicateurs
        </UIButton>
      </div>

      <p
        v-if="iaErreur"
        class="rounded-lg border border-red-200/70 bg-red-50/60 p-2 text-xs text-red-800"
      >
        {{ iaErreur }}
      </p>

      <div
        v-if="analyses.resume"
        class="rounded-lg border border-secondary-200/60 bg-white p-3"
      >
        <p class="text-[11px] font-semibold text-secondary-500 uppercase tracking-wider font-mono mb-1">
          Résumé
        </p>
        <p class="text-sm text-secondary-800">
          {{ (analyses.resume as { resume?: string }).resume }}
        </p>
      </div>

      <div
        v-if="analyses.procedure"
        class="rounded-lg border border-secondary-200/60 bg-white p-3"
      >
        <p class="text-[11px] font-semibold text-secondary-500 uppercase tracking-wider font-mono mb-1">
          Procédure suggérée
        </p>
        <p class="text-sm text-secondary-800">
          <span class="font-mono">{{ (analyses.procedure as { checklist?: string }).checklist }}</span>
          — {{ (analyses.procedure as { motif?: string }).motif }}
        </p>
        <UIButton
          variant="ghost"
          class="mt-2 h-7 text-xs"
          @click="changerProcedure((analyses.procedure as { checklist: string }).checklist)"
        >
          Appliquer cette procédure
        </UIButton>
      </div>

      <div class="border-t border-primary-200/40 pt-3">
        <IncidentChat
          :incident-id="incidentId"
          :actif="donnees.assistanceConfiguree"
        />
      </div>

      <div
        v-if="analyses.iocs"
        class="rounded-lg border border-secondary-200/60 bg-white p-3 space-y-1.5"
      >
        <p class="text-[11px] font-semibold text-secondary-500 uppercase tracking-wider font-mono">
          Indicateurs relevés
        </p>
        <div
          v-for="(valeurs, cle) in (analyses.iocs as Record<string, string[]>)"
          :key="cle"
          class="flex flex-wrap items-baseline gap-1.5"
        >
          <template v-if="valeurs.length">
            <span class="text-xs text-secondary-500 font-sans w-24 shrink-0">{{ cle }}</span>
            <span
              v-for="v in valeurs"
              :key="v"
              class="rounded border border-secondary-200 bg-secondary-50 px-1.5 py-0.5 font-mono text-[11px] text-secondary-700 break-all"
            >{{ v }}</span>
          </template>
        </div>
        <p class="text-xs text-secondary-400">
          À reporter à la main dans les champs de l'incident après vérification.
        </p>
      </div>
    </section>

    <!-- La procédure retenue, et de quoi la corriger. -->
    <section class="rounded-2xl border border-secondary-200/60 bg-secondary-50/40 p-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm text-secondary-800 font-sans">
            <strong>{{ donnees.checklist?.titre ?? donnees.procedure.checklist }}</strong>
            <span
              v-if="donnees.checklist?.version"
              class="ml-2 font-mono text-xs text-secondary-500"
            >v{{ donnees.checklist.version }}</span>
            <span
              v-if="donnees.checklist?.statut && donnees.checklist.statut !== 'valide'"
              class="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 uppercase"
            >{{ donnees.checklist.statut }}</span>
          </p>
          <p class="text-xs text-secondary-500 font-sans mt-0.5">
            {{ donnees.procedure.motif }} Incident en {{ donnees.niveau }}.
            <span v-if="donnees.procedure.impose">Procédure choisie manuellement.</span>
          </p>
        </div>
        <span class="font-mono text-xs text-secondary-500 whitespace-nowrap">
          {{ avancement.faites }} / {{ avancement.total }}
        </span>
      </div>

      <div
        v-if="canWrite"
        class="flex flex-wrap items-center gap-1.5"
      >
        <span class="text-xs text-secondary-500 font-sans mr-1">Autre procédure :</span>
        <button
          v-for="p in donnees.alternatives"
          :key="p.checklist"
          type="button"
          class="rounded-md border px-2 py-0.5 text-[11px] font-mono transition-colors"
          :class="p.checklist === donnees.procedure.checklist
            ? 'border-primary-300 bg-primary-50 text-primary-700 font-semibold'
            : 'border-secondary-200 bg-white text-secondary-600 hover:border-primary-300 hover:text-primary-700'"
          :title="p.motif"
          @click="changerProcedure(p.checklist)"
        >
          {{ p.fiche }}
        </button>
      </div>
    </section>

    <!-- La checklist, telle qu'écrite dans le dépôt. -->
    <section
      v-if="sections.length"
      class="space-y-5"
    >
      <div
        v-for="s in sections"
        :key="s.titre"
        class="space-y-1.5"
      >
        <h3
          v-if="s.titre"
          class="text-sm font-semibold text-secondary-900 font-sans border-b border-secondary-200/60 pb-1"
        >
          {{ s.titre }}
        </h3>
        <label
          v-for="c in s.cases"
          :key="c.cle"
          class="flex items-start gap-2.5 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
          :class="[
            canWrite ? 'cursor-pointer hover:bg-secondary-50/70' : 'cursor-default',
            c.fait ? 'opacity-60' : '',
          ]"
        >
          <input
            type="checkbox"
            :checked="c.fait"
            :disabled="!canWrite || enCours === c.cle"
            class="mt-0.5 size-4 shrink-0 rounded border-secondary-300 text-primary-600 focus:ring-primary-500"
            @change="basculer(c.cle, ($event.target as HTMLInputElement).checked)"
          >
          <span
            class="min-w-0 flex-1 text-sm"
            :class="c.fait ? 'line-through text-secondary-500' : 'text-secondary-800'"
          >
            <MarkdownText :texte="c.texte" />
            <span
              v-if="suggestion(c.cle)"
              class="mt-0.5 inline-flex items-start gap-1 rounded-md bg-primary-50/70 px-1.5 py-0.5 text-[11px] text-primary-700 border border-primary-200/50"
              :title="suggestion(c.cle)!.justification"
            >
              <Icon
                name="lucide:sparkles"
                class="mt-0.5 size-3 shrink-0"
              />
              {{ LIBELLE_ETAT[suggestion(c.cle)!.etat] }} — {{ suggestion(c.cle)!.justification }}
            </span>
          </span>
        </label>
      </div>
    </section>

    <div
      v-else
      class="py-10 text-center text-sm text-secondary-500 font-sans bg-secondary-50/30 rounded-xl border border-secondary-200/50"
    >
      Aucune checklist trouvée pour <span class="font-mono">{{ donnees.procedure.checklist }}</span>.
      Vérifiez la synchronisation dans les réglages.
    </div>

    <!-- La fiche porte le raisonnement, la checklist porte les gestes. -->
    <details
      v-if="donnees.fiche"
      class="rounded-2xl border border-secondary-200/60 bg-white p-4"
    >
      <summary class="cursor-pointer text-sm font-semibold text-secondary-800 font-sans">
        {{ donnees.fiche.titre }}
        <span class="ml-1 font-mono text-xs font-normal text-secondary-500">{{ donnees.fiche.reference }}</span>
      </summary>
      <div class="mt-3 border-t border-secondary-200/60 pt-3">
        <MarkdownText :texte="donnees.fiche.corps" />
      </div>
    </details>
  </div>
</template>
