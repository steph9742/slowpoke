<script setup lang="ts">
import RecentIncidentsCard from '~/components/homepage/RecentIncidentsCard.vue'
import TimelineCard from '~/components/homepage/TimelineCard.vue'
import DashboardKpis from '~/components/homepage/DashboardKpis.vue'
import { UIButton } from '@slowpoke/ui'

const eden = useEden()
const { canWrite } = await useRoles()

// Fenêtre couvrant à la fois les 30 derniers jours ET le mois courant, jusqu'à aujourd'hui
// inclus : le serveur compte désormais le dernier jour en entier.
const now = new Date()
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
const from = new Date(Math.min(monthStart.getTime(), Date.now() - 30 * 864e5)).toISOString().slice(0, 10)
const to = now.toISOString().slice(0, 10)

// Rafraîchit à chaque visite du dashboard (sinon useAsyncData ressert le cache → chiffres figés)
const alwaysFresh = { getCachedData: () => undefined }

const [{ data: timeline }, { data: incidents }, { data: statsTimeline }, { data: overview }] = await Promise.all([
  useAsyncData('dashboard-timeline', async () => {
    const { data } = await eden.api.timeline.get({ query: { limit: 10 } })
    return data ?? []
  }, alwaysFresh),
  useAsyncData('dashboard-incidents', async () => {
    const { data } = await eden.api.incidents.get({ query: { pageSize: 4, order: 'desc' } })
    return data ?? []
  }, alwaysFresh),
  useAsyncData('dash_stats_timeline', async () => {
    const { data } = await eden.api.stats.timeline.get({ query: { from, to } })
    return data ?? []
  }, alwaysFresh),
  useAsyncData('dashboard-overview', async () => {
    const { data } = await eden.api.stats.overview.get()
    return data ?? { inTreatment: 0, active: 0, critical: 0, month: 0, lastMonth: 0 }
  }, alwaysFresh),
])

// La file de triage : deux chiffres disent si le dispositif vit — ce qui attend, et depuis
// quand. Un troisième dit s'il respire : la dernière alerte reçue. Une file calme peut
// vouloir dire « rien ne se passe » ou « plus personne n'envoie ».
const { data: fileAlertes } = await useAsyncData('dashboard-alertes', async () => {
  const { data } = await eden.api.alerts.etat.get()
  return data ?? null
}, alwaysFresh)

const ageEnHeures = (iso: string | Date | null | undefined) =>
  iso ? Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000) : null

const ageTexte = (iso: string | Date | null | undefined) => {
  const h = ageEnHeures(iso)
  if (h === null) return null
  if (h < 1) return 'moins d\'une heure'
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} jours`
}

// Une source arrêtée donne une file calme, qu'on lit comme une situation saine.
const sourceMuette = computed(() => {
  const h = ageEnHeures(fileAlertes.value?.derniereRecue)
  return h === null || h > 24
})

// Compte du mois courant dérivé de la même source que le graphe → cohérent avec le total 30 j.
// On parse via `new Date` (comme le graphe) : e.date peut arriver en Date/ISO, pas en "YYYY-MM-…".
const monthlyCount = computed(() =>
  (statsTimeline.value ?? []).reduce((s, e) => {
    const d = new Date(e.date)
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth()
      ? s + Number(e.total)
      : s
  }, 0),
)

useHead({ title: 'Tableau de bord' })
</script>

<template>
  <div class="p-4 flex flex-col gap-5">
    <div class="flex items-center justify-between gap-4">
      <UITitle>Tableau de bord</UITitle>
      <NuxtLink
        v-if="canWrite"
        to="/incidents/new"
      >
        <UIButton
          variant="primary"
          size="md"
          class="group shadow-sm hover:shadow-md transition-all duration-300"
        >
          <Icon
            name="lucide:plus"
            class="text-base group-hover:scale-110 transition-transform"
          />
          <span class="ml-1.5 font-medium tracking-tight">Créer un incident</span>
        </UIButton>
      </NuxtLink>
    </div>

    <!-- La file de triage, avant les compteurs d'incidents : c'est ce qui attend une décision. -->
    <NuxtLink
      v-if="fileAlertes"
      to="/alertes"
      class="block rounded-xl border bg-white p-4 shadow-sm transition-colors sm:p-5"
      :class="fileAlertes.nouvelles > 0 ? 'border-primary-300 hover:border-primary-400' : 'border-gray-200 hover:border-primary-300'"
    >
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p class="text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">
            Alertes à trier
          </p>
          <div class="mt-1 flex items-baseline gap-2">
            <span
              class="text-3xl font-bold sm:text-4xl"
              :class="fileAlertes.nouvelles > 0 ? 'text-primary-700' : 'text-gray-900'"
            >{{ fileAlertes.nouvelles }}</span>
            <span
              v-if="fileAlertes.enCours"
              class="text-xs font-medium text-gray-400"
            >+ {{ fileAlertes.enCours }} en cours</span>
          </div>
        </div>
        <p
          v-if="fileAlertes.plusAncienneNonTriee"
          class="text-xs text-gray-500"
        >
          La plus ancienne attend depuis <span class="font-semibold text-gray-700">{{ ageTexte(fileAlertes.plusAncienneNonTriee) }}</span>
        </p>
        <p
          v-if="sourceMuette"
          class="ml-auto rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-800"
        >
          {{ fileAlertes.derniereRecue ? `Dernière alerte reçue il y a ${ageTexte(fileAlertes.derniereRecue)}` : 'Aucune alerte reçue à ce jour' }} — la source est-elle branchée ?
        </p>
      </div>
    </NuxtLink>

    <DashboardKpis
      :month="overview?.month ?? monthlyCount"
      :last-month="overview?.lastMonth ?? 0"
      :in-treatment="overview?.inTreatment ?? 0"
      :active="overview?.active ?? 0"
      :critical="overview?.critical ?? 0"
    />

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- Colonne gauche : récents (compact) + graphe -->
      <div class="flex flex-col gap-4">
        <RecentIncidentsCard :incidents="incidents ?? []" />
        <ChartsTimelineAreaChart :items="statsTimeline ?? []" />
      </div>
      <!-- Colonne droite : timeline plafonnée à la hauteur de gauche (défilement interne) -->
      <div class="lg:relative">
        <TimelineCard :items="timeline ?? []" />
      </div>
    </div>
  </div>
</template>
