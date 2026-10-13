<script setup lang="ts">
import { UIButton, useToast } from '@slowpoke/ui'
import { ref, computed, onMounted } from 'vue'

// ENQUÊTE — les cases outillées de la checklist, une question à la fois.
//
// Chaque étape dit pourquoi elle existe, où elle cherche, lance la recherche en lecture
// seule, aide à lire le résultat et garde le verdict. « Impossible à vérifier » porte
// toujours son motif : une étape sans source ne doit jamais se lire comme vérifiée.
//
// Chargé au montage : au rendu serveur l'appel n'aurait pas la session.

const props = defineProps<{ incidentId: string, canWrite: boolean }>()
const eden = useEden()
const toast = useToast()

type Cellule = string | number | boolean | null
type Execution
  = | { etat: 'execute', nombre: number, colonnes: string[], lignes: Record<string, Cellule>[], note: string | null }
    | { etat: 'guidee', commande: string }
    | { etat: 'indisponible', motif: string }

async function lire() {
  const { data, error } = await eden.api.incidents({ id: props.incidentId }).enquete.get()
  return error ? null : data
}

const donnees = ref<Awaited<ReturnType<typeof lire>>>(null)
const chargement = ref(true)
const enCours = ref<string | null>(null)
const recents = ref<Record<string, Execution>>({})
const motifs = ref<Record<string, string>>({})

type Etape = NonNullable<typeof donnees.value>['etapes'][number]

const SOURCES: Record<string, string> = {
  slowpoke: 'Slowpoke',
  ldap: 'Annuaire',
  glpi: 'Inventaire',
  harfanglab: 'EDR',
  wazuh: 'Journaux (Wazuh)',
  guidee: 'À la main',
}
const VERDICTS: Record<string, string> = {
  aucun: 'Rien trouvé',
  trouve: 'Trouvé',
  impossible: 'Impossible à vérifier',
}

const sections = computed(() => {
  const ordre: string[] = []
  const par = new Map<string, Etape[]>()
  for (const e of donnees.value?.etapes ?? []) {
    if (!par.has(e.section)) {
      par.set(e.section, [])
      ordre.push(e.section)
    }
    par.get(e.section)!.push(e)
  }
  return ordre.map(titre => ({ titre, etapes: par.get(titre)! }))
})

// Une case peut porter plusieurs recherches : son libellé n'est répété que sous forme de rappel.
const suites = computed(() => {
  const s = new Set<string>()
  let precedente: string | null = null
  for (const e of donnees.value?.etapes ?? []) {
    if (e.caseCle === precedente) s.add(e.cle)
    precedente = e.caseCle
  }
  return s
})

const executionDe = (e: Etape): Execution | null =>
  recents.value[e.cle] ?? (e.etat?.resultat as Execution | null | undefined) ?? null

const dateHeureFr = (d: string | Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d))
const courtCommit = (c: string | null | undefined) => (c ? c.slice(0, 8) : null)
const celluleTexte = (v: Cellule) => (v === null ? '—' : typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v))

const messageErreur = (error: unknown) =>
  (error as { value?: { message?: string } } | undefined)?.value?.message ?? 'Le serveur a refusé la demande.'

onMounted(async () => {
  donnees.value = await lire()
  chargement.value = false
})

async function lancer(e: Etape) {
  if (enCours.value) return
  enCours.value = e.cle
  const { data, error } = await eden.api.incidents({ id: props.incidentId }).enquete({ cle: e.cle }).lancer.post({})
  enCours.value = null
  if (error) {
    toast.newToast({ title: 'Recherche impossible', message: messageErreur(error), type: 'error', duration: 5000 })
    return
  }
  if (data) recents.value[e.cle] = data.execution as Execution
  donnees.value = await lire()
}

async function juger(e: Etape, verdict: 'aucun' | 'trouve' | 'impossible') {
  const motif = motifs.value[e.cle]?.trim()
  if (verdict === 'impossible' && !motif) {
    toast.newToast({ title: 'Motif obligatoire', message: 'Dites pourquoi la vérification est impossible.', type: 'error', duration: 4000 })
    return
  }
  const { error } = await eden.api.incidents({ id: props.incidentId }).enquete({ cle: e.cle }).verdict.put({ verdict, motif: motif || undefined })
  if (error) {
    toast.newToast({ title: 'Verdict non enregistré', message: messageErreur(error), type: 'error', duration: 5000 })
    return
  }
  toast.newToast({ title: 'Verdict enregistré', message: VERDICTS[verdict] ?? verdict, type: 'success', duration: 2500 })
  donnees.value = await lire()
}

async function copier(texte: string) {
  try {
    await navigator.clipboard.writeText(texte)
    toast.newToast({ title: 'Copié', message: '', type: 'success', duration: 1500 })
  }
  catch {
    toast.newToast({ title: 'Copie impossible', message: 'Sélectionnez le texte et copiez-le à la main.', type: 'error', duration: 4000 })
  }
}
</script>

<template>
  <div class="space-y-6 animate-in fade-in duration-300">
    <p
      v-if="chargement"
      class="text-sm text-secondary-400"
    >
      Lecture de l'enquête…
    </p>

    <template v-else-if="!donnees">
      <p class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        L'enquête n'a pas pu être lue.
      </p>
    </template>

    <template v-else>
      <header class="space-y-1">
        <p class="text-sm text-secondary-600">
          Checklist <span class="font-mono text-secondary-900">{{ donnees.procedure.checklist }}</span> · {{ donnees.procedure.motif }}
        </p>
        <p class="text-xs text-secondary-500">
          Seules les cases outillées apparaissent ici. La checklist complète reste dans « Conduite à tenir ».
        </p>
      </header>

      <p
        v-if="!donnees.checklistTrouvee"
        class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        La checklist applicable n'est pas encore synchronisée depuis le dépôt de procédures.
      </p>
      <p
        v-else-if="!donnees.requetesSynchronisees"
        class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        Aucune requête d'enquête n'est synchronisée : la bibliothèque <span class="font-mono">_requetes/</span> du dépôt n'a pas encore été lue. Un administrateur peut lancer la synchronisation dans Réglages.
      </p>
      <p
        v-if="donnees.checklistTrouvee && !donnees.etapes.length"
        class="text-sm text-secondary-600"
      >
        Aucune case de cette checklist n'est encore outillée.
      </p>

      <section
        v-for="s in sections"
        :key="s.titre"
        class="space-y-4"
      >
        <h3 class="text-sm font-semibold uppercase tracking-wider text-secondary-600">
          {{ s.titre || 'Checklist' }}
        </h3>

        <article
          v-for="e in s.etapes"
          :key="e.cle"
          class="rounded-xl border border-secondary-200 bg-white p-5 space-y-4"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <p
              v-if="suites.has(e.cle)"
              class="text-sm text-secondary-500 min-w-0"
            >
              ↳ Même case, autre source : {{ e.texte }}
            </p>
            <p
              v-else
              class="font-medium text-secondary-900 min-w-0"
            >
              ☐ {{ e.texte }}
            </p>
            <div class="flex flex-wrap gap-2">
              <span
                v-if="e.requete"
                class="text-xs font-semibold rounded-full bg-secondary-100 px-2 py-0.5 text-secondary-700"
              >{{ SOURCES[e.requete.source] ?? e.requete.source }}</span>
              <span
                v-if="e.etat?.verdict"
                class="text-xs font-semibold rounded-full px-2 py-0.5"
                :class="e.etat.verdict === 'trouve' ? 'bg-red-50 text-red-700' : e.etat.verdict === 'impossible' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'"
              >{{ VERDICTS[e.etat.verdict] ?? e.etat.verdict }}</span>
            </div>
          </div>

          <p
            v-if="!e.requete"
            class="text-sm text-amber-800"
          >
            Requête « <span class="font-mono">{{ e.bloc.requete }}</span> » absente de la bibliothèque synchronisée.
          </p>

          <template v-else>
            <div class="space-y-1">
              <p class="text-xs font-semibold uppercase tracking-wider text-secondary-500">
                Pourquoi
              </p>
              <p class="text-sm text-secondary-700 whitespace-pre-line">
                {{ e.requete.pourquoi }}
              </p>
            </div>

            <div
              v-if="canWrite"
              class="flex flex-wrap items-center gap-3"
            >
              <UIButton
                v-if="e.executable"
                :disabled="enCours === e.cle"
                @click="lancer(e)"
              >
                {{ enCours === e.cle ? 'Recherche…' : e.requete.source === 'guidee' ? 'Afficher la vérification à faire' : 'Lancer la recherche' }}
              </UIButton>
              <span
                v-else
                class="text-sm text-secondary-500 italic"
              >Slowpoke ne sait pas encore exécuter cette requête : vérification à la main.</span>
              <span
                v-if="e.etat?.lanceLe"
                class="text-xs text-secondary-500"
              >
                Lancée le {{ dateHeureFr(e.etat.lanceLe) }}<template v-if="courtCommit(e.etat.requeteCommit)"> · version <span class="font-mono">{{ courtCommit(e.etat.requeteCommit) }}</span></template>
              </span>
            </div>

            <template v-if="executionDe(e)">
              <div
                v-if="executionDe(e)!.etat === 'guidee'"
                class="space-y-2"
              >
                <pre class="rounded-lg bg-secondary-50 border border-secondary-200 p-3 text-sm whitespace-pre-wrap font-mono text-secondary-800">{{ (executionDe(e) as { commande: string }).commande }}</pre>
                <UIButton
                  variant="ghost"
                  @click="copier((executionDe(e) as { commande: string }).commande)"
                >
                  Copier
                </UIButton>
              </div>
              <p
                v-else-if="executionDe(e)!.etat === 'indisponible'"
                class="text-sm text-secondary-600 italic"
              >
                Non exécutée : {{ (executionDe(e) as { motif: string }).motif }}
              </p>
              <div
                v-else
                class="space-y-2"
              >
                <p class="text-sm text-secondary-700">
                  <span class="font-semibold">{{ (executionDe(e) as { nombre: number }).nombre }}</span> résultat(s)
                </p>
                <p
                  v-if="(executionDe(e) as { note: string | null }).note"
                  class="text-sm text-amber-800 whitespace-pre-line"
                >
                  {{ (executionDe(e) as { note: string | null }).note }}
                </p>
                <div
                  v-if="(executionDe(e) as { lignes: unknown[] }).lignes.length"
                  class="overflow-x-auto rounded-lg border border-secondary-200"
                >
                  <table class="w-full text-sm">
                    <thead class="bg-secondary-50 text-left text-xs uppercase tracking-wider text-secondary-500">
                      <tr>
                        <th
                          v-for="col in (executionDe(e) as { colonnes: string[] }).colonnes"
                          :key="col"
                          class="px-3 py-2 font-medium"
                        >
                          {{ col }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="(ligne, i) in (executionDe(e) as { lignes: Record<string, Cellule>[] }).lignes"
                        :key="i"
                        class="border-t border-secondary-100"
                      >
                        <td
                          v-for="col in (executionDe(e) as { colonnes: string[] }).colonnes"
                          :key="col"
                          class="px-3 py-2 font-mono text-secondary-800"
                        >
                          {{ celluleTexte(ligne[col] ?? null) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>

            <div
              v-if="e.requete.lireLeResultat"
              class="space-y-1"
            >
              <p class="text-xs font-semibold uppercase tracking-wider text-secondary-500">
                Lire le résultat
              </p>
              <p class="text-sm text-secondary-700 whitespace-pre-line">
                {{ e.requete.lireLeResultat }}
              </p>
            </div>
          </template>

          <div
            v-if="canWrite"
            class="space-y-2 border-t border-secondary-100 pt-4"
          >
            <label
              :for="`motif-${e.cle}`"
              class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
            >Motif (obligatoire si impossible à vérifier)</label>
            <input
              :id="`motif-${e.cle}`"
              v-model="motifs[e.cle]"
              type="text"
              class="w-full rounded-lg border border-secondary-200 px-3 py-2 text-sm"
              placeholder="Ex. : pas d'accès à l'administration de la messagerie"
            >
            <div class="flex flex-wrap gap-2">
              <UIButton
                v-for="v in e.bloc.verdicts"
                :key="v"
                variant="ghost"
                @click="juger(e, v as 'aucun' | 'trouve' | 'impossible')"
              >
                {{ VERDICTS[v] ?? v }}
              </UIButton>
            </div>
          </div>

          <p
            v-if="e.etat?.verdict"
            class="text-xs text-secondary-500"
          >
            Verdict du {{ e.etat.verdictLe ? dateHeureFr(e.etat.verdictLe) : '—' }}<template v-if="e.etat.motif">
              · {{ e.etat.motif }}
            </template>
            <template v-if="e.etat.verdict === 'trouve' && e.bloc.siTrouve">
              · Suite : {{ e.bloc.siTrouve }}
            </template>
          </p>
        </article>
      </section>
    </template>
  </div>
</template>
