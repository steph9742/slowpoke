<script setup lang="ts">
import { UIButton, useToast } from '@slowpoke/ui'
import { computed, ref } from 'vue'

// LISTES BLANCHES — l'inventaire des angles morts volontaires.
//
// Une exclusion, c'est la décision de ne plus voir quelque chose. Cette page existe pour
// que cette décision reste visible et révisable : sans elle, un « on met en liste blanche
// le temps de vérifier » devient permanent par oubli.

const eden = useEden()
const { canWrite } = await useRoles()

const filtreEtat = ref<'active' | 'revoquee' | 'toutes'>('active')

// Tout est chargé une fois, le filtre travaille en mémoire. Refiltrer côté serveur
// obligeait à relancer la requête à chaque clic — et le compteur de revues dépassées
// changeait avec l'onglet affiché, alors qu'il porte sur l'ensemble.
const { data: toutes, refresh, pending } = await useAsyncData('exclusions-liste', async () => {
  const { data } = await eden.api.exclusions.get({ query: {} })
  return data ?? []
}, { getCachedData: () => undefined })

const exclusions = computed(() => {
  const l = toutes.value ?? []
  return filtreEtat.value === 'toutes' ? l : l.filter(e => e.state === filtreEtat.value)
})

const nombreParEtat = computed(() => {
  const l = toutes.value ?? []
  return {
    active: l.filter(e => e.state === 'active').length,
    revoquee: l.filter(e => e.state === 'revoquee').length,
    toutes: l.length,
  }
})

const OUTILS: Record<string, { label: string, classes: string }> = {
  harfanglab: { label: 'HarfangLab', classes: 'bg-purple-50 text-purple-700 border-purple-200/70' },
  wazuh: { label: 'Wazuh', classes: 'bg-blue-50 text-blue-700 border-blue-200/70' },
  pare_feu: { label: 'Pare-feu', classes: 'bg-cyan-50 text-cyan-700 border-cyan-200/70' },
  autre: { label: 'Autre', classes: 'bg-secondary-50 text-secondary-600 border-secondary-200/70' },
}
const outilDe = (t: string) => OUTILS[t] ?? OUTILS.autre!

const dateFr = (d?: string | Date | null) => d
  ? new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'long' }).format(new Date(d))
  : '—'

/** Une revue dépassée est un angle mort qu'on a cessé de surveiller sans l'avoir décidé. */
const estDepassee = (e: { state: string, reviewDate: string | Date }) =>
  e.state === 'active' && new Date(e.reviewDate).getTime() <= Date.now()

const depassees = computed(() => (toutes.value ?? []).filter(estDepassee))

const revoquer = async (id: string) => {
  if (!confirm('Révoquer cette exclusion ? Elle restera consultable dans l\'historique.')) return
  const { error } = await eden.api.exclusions({ id }).revoke.patch()
  if (error) {
    useToast().newToast({ title: 'Échec', message: 'Révocation impossible.', type: 'error', duration: 4000 })
    return
  }
  useToast().newToast({ title: 'Exclusion révoquée', message: 'Elle reste consultable dans l\'historique.', type: 'success', duration: 3000 })
  await refresh()
}

const reporter = async (id: string) => {
  const saisie = prompt('Nouvelle date de revue (AAAA-MM-JJ) :')
  if (!saisie) return
  const { error } = await eden.api.exclusions({ id }).review.patch({ reviewDate: saisie })
  if (error) {
    useToast().newToast({ title: 'Échec', message: 'Date invalide ou report impossible.', type: 'error', duration: 4000 })
    return
  }
  useToast().newToast({ title: 'Revue reportée', message: 'La nouvelle échéance est enregistrée.', type: 'success', duration: 3000 })
  await refresh()
}

const FILTRES = [
  { v: 'active', l: 'Actives' },
  { v: 'revoquee', l: 'Révoquées' },
  { v: 'toutes', l: 'Toutes' },
] as const

// LA SECONDE MOITIÉ DU REGISTRE : les règles de l'outil posées hors incident.
//
// Elles n'ont pas d'incident à citer — besoin métier, exploitation, exception technique —
// mais elles portent la même obligation : un motif et une date de revue.
const { data: revues, refresh: rafraichirRevues } = await useAsyncData('revues-regles', async () => {
  const { data } = await eden.api.exclusions.revues.get({ query: { etat: 'active' } })
  return data ?? []
}, { getCachedData: () => undefined })

const revuesDepassees = computed(() =>
  (revues.value ?? []).filter(r => new Date(r.echeance).getTime() <= Date.now()))

const reporterRevue = async (id: string) => {
  const saisie = prompt('Nouvelle échéance de revue (AAAA-MM-JJ) :')
  if (!saisie) return
  const { error } = await eden.api.exclusions.revues({ id }).patch({ echeance: saisie })
  if (error) {
    useToast().newToast({ title: 'Échec', message: 'Date invalide ou report impossible.', type: 'error', duration: 4000 })
    return
  }
  useToast().newToast({ title: 'Revue reportée', message: 'La nouvelle échéance est enregistrée.', type: 'success', duration: 3000 })
  await rafraichirRevues()
}

const leverRevue = async (id: string) => {
  const motif = prompt('Pourquoi lever cette revue ? (règle retirée de l\'outil, besoin disparu…)')
  if (!motif?.trim()) return
  const { error } = await eden.api.exclusions.revues({ id }).lever.patch({ motif })
  if (error) {
    useToast().newToast({ title: 'Échec', message: 'Levée impossible.', type: 'error', duration: 4000 })
    return
  }
  useToast().newToast({ title: 'Revue levée', message: 'La ligne reste consultable dans l\'historique.', type: 'success', duration: 3000 })
  await rafraichirRevues()
}

useHead({ title: 'Listes blanches' })
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 relative z-0">
    <header class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <UITitle class="font-sans text-secondary-900 tracking-tight">
          Listes blanches
        </UITitle>
        <p class="text-sm text-secondary-600/90 font-sans mt-1 max-w-2xl">
          Ce que les outils de détection ne signalent plus, volontairement — et jusqu'à quand.
        </p>
      </div>
    </header>

    <!-- Bandeau de filtres, dans le même esprit que la liste des incidents. -->
    <section class="bg-secondary-50/50 p-5 rounded-2xl border border-secondary-200/60 shadow-sm shadow-secondary-200/20 flex flex-col sm:flex-row items-start sm:items-end gap-5 relative">
      <div class="absolute -right-20 -top-20 w-40 h-40 bg-primary-200/20 rounded-full blur-3xl pointer-events-none" />

      <div class="relative z-10">
        <label class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono">État</label>
        <div class="inline-flex gap-1 rounded-lg border border-secondary-200 bg-white p-1">
          <button
            v-for="f in FILTRES"
            :key="f.v"
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-sans transition-colors"
            :class="filtreEtat === f.v
              ? 'bg-primary-500 text-white font-medium shadow-sm'
              : 'text-secondary-600 hover:bg-secondary-50'"
            @click="filtreEtat = f.v"
          >
            {{ f.l }}
            <span class="ml-1 font-mono text-[11px] opacity-70">{{ nombreParEtat[f.v] }}</span>
          </button>
        </div>
      </div>

      <div class="flex h-10 items-center sm:ml-auto relative z-10">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-primary-50 border border-primary-200/60 px-3 py-1 text-xs font-semibold text-primary-700 font-mono whitespace-nowrap">
          <Icon
            name="lucide:shield-off"
            class="size-3.5"
          />
          {{ exclusions.length }} exclusion{{ exclusions.length > 1 ? 's' : '' }}
        </span>
      </div>
    </section>

    <div class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm">
      <ExclusionsRapprochementEdr :modifiable="canWrite" />
    </div>

    <!-- Une revue dépassée est un angle mort qu'on a cessé de surveiller sans l'avoir
         décidé : elle est mise en tête, pas noyée dans la liste. -->
    <section
      v-if="depassees.length"
      class="flex items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/50 p-5 shadow-sm"
    >
      <Icon
        name="lucide:alarm-clock"
        class="mt-0.5 size-5 shrink-0 text-amber-600"
      />
      <div class="text-sm text-secondary-700 font-sans">
        <p class="font-semibold text-secondary-900">
          {{ depassees.length }} revue{{ depassees.length > 1 ? 's' : '' }} dépassée{{ depassees.length > 1 ? 's' : '' }}
        </p>
        <p class="mt-0.5 text-secondary-600">
          Ces exclusions restent actives alors que leur date de revue est passée.
          Confirmez-les en reportant l'échéance, ou révoquez-les.
        </p>
      </div>
    </section>

    <!-- Règles posées hors incident : même exigence d'échéance, autre origine. -->
    <section
      v-if="revues?.length"
      class="rounded-2xl border border-secondary-200/60 bg-white p-5 shadow-sm space-y-3"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-sm font-semibold text-secondary-900 font-sans">
          Règles posées hors incident — {{ revues.length }}
        </h2>
        <span
          v-if="revuesDepassees.length"
          class="rounded-full border border-amber-200/70 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 font-sans"
        >{{ revuesDepassees.length }} dépassée{{ revuesDepassees.length > 1 ? 's' : '' }}</span>
      </div>
      <p class="text-xs text-secondary-500 font-sans">
        Besoin métier, exploitation, exception technique : aucun incident ne les motive, mais
        leur date de revue est rappelée comme celle des exclusions. Elles se décident depuis
        le rapprochement ci-dessus.
      </p>
      <ul class="divide-y divide-secondary-100 rounded-xl border border-secondary-200/60">
        <li
          v-for="r in revues"
          :key="r.id"
          class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5"
          :class="new Date(r.echeance).getTime() <= Date.now() ? 'bg-amber-50/40' : ''"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm text-secondary-800 font-sans">
              {{ r.libelle || r.regleRef }}
            </p>
            <p class="font-mono text-[11px] text-secondary-500 break-all">
              {{ r.regleRef }} · {{ outilDe(r.tool).label }}
            </p>
            <p class="text-xs text-secondary-600 font-sans">
              {{ r.motif }}
            </p>
          </div>
          <div class="md:text-right">
            <span class="block text-[10px] font-semibold text-secondary-400 uppercase tracking-widest font-mono">
              Revue
            </span>
            <span
              class="font-mono text-xs whitespace-nowrap"
              :class="new Date(r.echeance).getTime() <= Date.now() ? 'font-semibold text-amber-700' : 'text-secondary-600'"
            >{{ dateFr(r.echeance) }}</span>
          </div>
          <div
            v-if="canWrite"
            class="flex items-center gap-2"
          >
            <UIButton
              variant="outline"
              class="h-8 text-xs"
              title="Reporter l'échéance après examen"
              @click="reporterRevue(r.id)"
            >
              <Icon
                name="lucide:calendar-clock"
                class="size-3.5"
              />
              Reporter
            </UIButton>
            <UIButton
              variant="ghost"
              class="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50/60"
              title="Lever la revue — règle retirée de l'outil, ou besoin disparu"
              @click="leverRevue(r.id)"
            >
              <Icon
                name="lucide:ban"
                class="size-3.5"
              />
              Lever
            </UIButton>
          </div>
        </li>
      </ul>
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
        Chargement des exclusions…
      </div>
    </section>

    <section
      v-else-if="!exclusions.length"
      class="py-24 text-center bg-secondary-50/30 rounded-2xl border border-secondary-200/50 shadow-sm"
    >
      <Icon
        name="lucide:shield-off"
        class="mx-auto mb-3 size-8 text-secondary-300"
      />
      <p class="text-secondary-600 font-sans">
        Aucune exclusion {{ filtreEtat === 'active' ? 'active' : filtreEtat === 'revoquee' ? 'révoquée' : 'enregistrée' }}.
      </p>
      <p class="mt-1 text-xs text-secondary-400 font-sans">
        Elles se déclarent depuis la fiche d'un incident, bouton « Liste blanche ».
      </p>
    </section>

    <section
      v-else
      class="space-y-3"
    >
      <article
        v-for="e in exclusions"
        :key="e.id"
        class="group relative bg-white p-4 sm:p-5 rounded-2xl border shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] transition-all duration-300"
        :class="estDepassee(e)
          ? 'border-amber-300/70 bg-amber-50/20'
          : 'border-secondary-200/60 hover:border-primary-300'"
      >
        <div class="flex flex-col md:flex-row md:items-start gap-4">
          <div class="min-w-0 flex-1 space-y-2.5">
            <!-- Ligne d'identité : outil, incident d'origine, drapeaux d'état. -->
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold rounded-md border font-sans"
                :class="outilDe(e.tool).classes"
              >
                {{ outilDe(e.tool).label }}<template v-if="e.toolOther"> · {{ e.toolOther }}</template>
              </span>

              <NuxtLink
                :to="`/incidents/${e.incidentId}`"
                class="font-mono text-xs font-semibold text-secondary-400 hover:text-primary-600 uppercase tracking-wider transition-colors"
              >
                #{{ e.incidentId }}
              </NuxtLink>

              <span
                v-if="e.broadScopeAcknowledged"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold rounded-md border border-amber-200/60 bg-amber-50 text-amber-700 font-sans"
                title="Portée très large, confirmée explicitement à la création"
              >
                <Icon
                  name="lucide:triangle-alert"
                  class="size-3"
                />
                Portée large
              </span>

              <span
                v-if="e.state === 'revoquee'"
                class="px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold rounded-md border border-secondary-200/70 bg-secondary-50 text-secondary-500 font-sans"
              >
                Révoquée
              </span>
            </div>

            <!-- La portée : ce que l'outil ne signale plus. C'est l'information centrale. -->
            <p class="font-mono text-sm text-secondary-800 break-words">
              {{ e.scope }}
            </p>

            <p class="text-sm text-secondary-600 font-sans">
              {{ e.reason }}
            </p>
          </div>

          <div class="flex flex-row flex-wrap md:flex-col md:flex-nowrap md:items-end justify-between md:justify-start gap-3 shrink-0">
            <div class="md:text-right">
              <span class="block text-[10px] font-semibold text-secondary-400 uppercase tracking-widest font-mono">
                Revue
              </span>
              <span
                class="font-mono text-xs whitespace-nowrap"
                :class="estDepassee(e) ? 'font-semibold text-amber-700' : 'text-secondary-600'"
              >
                {{ dateFr(e.reviewDate) }}
              </span>
              <span
                v-if="estDepassee(e)"
                class="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 font-sans"
              >dépassée</span>
            </div>

            <div
              v-if="canWrite && e.state === 'active'"
              class="flex items-center gap-2"
            >
              <UIButton
                variant="outline"
                class="h-8 text-xs"
                title="Reporter la date de revue après examen"
                @click="reporter(e.id)"
              >
                <Icon
                  name="lucide:calendar-clock"
                  class="size-3.5"
                />
                Reporter
              </UIButton>
              <UIButton
                variant="ghost"
                class="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50/60"
                title="Lever l'exclusion — l'outil signalera de nouveau"
                @click="revoquer(e.id)"
              >
                <Icon
                  name="lucide:ban"
                  class="size-3.5"
                />
                Révoquer
              </UIButton>
            </div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>
