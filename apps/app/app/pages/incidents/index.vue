<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { UISelect, type UISelectOption, UIButton, UIInput } from '@slowpoke/ui'
import { statusDisplayNames, severityDisplayNames, typeDisplayNames, resolutionDisplayNames } from '~/types/incident'

const eden = useEden()
const { canWrite } = await useRoles()

// Form state for our filters
const filters = ref({
  id: '',
  status: '',
  // Plusieurs statuts à la fois, séparés par des virgules : posé par les raccourcis.
  statuts: '',
  type: '',
  severity: '',
  // `updatedAt` est le tri par défaut de l'API : les derniers MODIFIÉS d'abord, ce qui
  // n'est pas l'ordre de signalement. Le rendre visible évite de prendre l'un pour l'autre.
  sort: 'updatedAt',
  order: 'desc',
})

const sortItems: UISelectOption[] = [
  { value: 'updatedAt', label: 'Dernière modification' },
  { value: 'createdAt', label: 'Date de signalement' },
  { value: 'knowledgeAt', label: 'Date de connaissance' },
  { value: 'severity', label: 'Gravité' },
]
const orderItems: UISelectOption[] = [
  { value: 'desc', label: 'Décroissant' },
  { value: 'asc', label: 'Croissant' },
]

// Build options arrays with 'All' as the default empty choice
const statusItems: UISelectOption[] = [
  { value: '', label: 'Tous les statuts' },
  ...Object.entries(statusDisplayNames).map(([value, label]) => ({ value, label })),
]
const severityItems: UISelectOption[] = [
  { value: '', label: 'Toutes les sévérités' },
  ...Object.entries(severityDisplayNames).map(([value, label]) => ({ value, label })),
]
const typeItems: UISelectOption[] = [
  { value: '', label: 'Tous les types' },
  ...Object.entries(typeDisplayNames).map(([value, label]) => ({ value, label })),
]

// Raccourcis de la cellule. « À traiter » n'écarte que ce qui est clos ; « en cours » écarte
// en plus ce qui est ouvert sans être pris en charge. Un incident sous surveillance a encore
// une échéance à suivre : il reste dans les deux.
type Raccourci = { cle: string, libelle: string, statuts: string[] }
const RACCOURCIS: Raccourci[] = [
  { cle: 'a-traiter', libelle: 'Incidents à traiter', statuts: ['open', 'investigating', 'in_progress', 'surveillance'] },
  { cle: 'en-cours', libelle: 'En cours de traitement', statuts: ['investigating', 'in_progress', 'surveillance'] },
]
const raccourciActif = computed(() => RACCOURCIS.find(r => r.statuts.join(',') === filters.value.statuts)?.cle ?? null)
const libellesStatuts = (r: Raccourci) => r.statuts.map(s => statusDisplayNames[s as keyof typeof statusDisplayNames]).join(', ')

function basculerRaccourci(r: Raccourci) {
  filters.value = { ...filters.value, status: '', statuts: raccourciActif.value === r.cle ? '' : r.statuts.join(',') }
}

// Choisir un statut précis remplace le raccourci : les deux ensemble se combineraient par ET.
watch(() => filters.value.status, (s) => {
  if (s) filters.value.statuts = ''
})

const PAGE_SIZE = 30
const page = ref(1)
const hasMore = ref(true)
const loadingMore = ref(false)

const buildQuery = (p: number) => {
  const query: Record<string, string> = {
    page: String(p),
    pageSize: String(PAGE_SIZE),
    sort: filters.value.sort,
    order: filters.value.order,
  }
  if (filters.value.id) query.id = filters.value.id
  if (filters.value.status) query.status = filters.value.status
  if (filters.value.statuts) query.statuts = filters.value.statuts
  if (filters.value.severity) query.severity = filters.value.severity
  if (filters.value.type) query.type = filters.value.type
  return query
}

const { data: incidents, refresh, pending } = await useAsyncData('incidents', async () => {
  const { data } = await eden.api.incidents.get({ query: buildQuery(1) })
  const list = data ?? []
  hasMore.value = list.length === PAGE_SIZE
  return list
}, { getCachedData: () => undefined })

type IncidentItem = NonNullable<typeof incidents.value>[number]
const moreIncidents = ref<IncidentItem[]>([])
const allIncidents = computed(() => [...(incidents.value ?? []), ...moreIncidents.value])

// Total réel (indépendant de la pagination) pour la pill du bandeau de filtres
const buildCountQuery = () => {
  const query: Record<string, string> = {}
  if (filters.value.id) query.id = filters.value.id
  if (filters.value.status) query.status = filters.value.status
  if (filters.value.statuts) query.statuts = filters.value.statuts
  if (filters.value.severity) query.severity = filters.value.severity
  if (filters.value.type) query.type = filters.value.type
  return query
}
const { data: totalCount, refresh: refreshTotalCount } = await useAsyncData('incidents-count', async () => {
  const { data } = await eden.api.incidents.count.get({ query: buildCountQuery() })
  return data?.total ?? 0
}, { getCachedData: () => undefined })

const loadMore = async () => {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const next = page.value + 1
    const { data } = await eden.api.incidents.get({ query: buildQuery(next) })
    const list = data ?? []
    moreIncidents.value.push(...list)
    page.value = next
    hasMore.value = list.length === PAGE_SIZE
  }
  finally {
    loadingMore.value = false
  }
}

// Réinitialise la pagination + rafraîchit à chaque changement de filtre
watch(filters, () => {
  page.value = 1
  moreIncidents.value = []
  hasMore.value = true
  refresh()
  refreshTotalCount()
}, { deep: true })

// Aesthetic UI helpers for the incident cards
const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'bg-red-50 text-red-700 border-red-200/60'
    case 'high': return 'bg-orange-50 text-orange-700 border-orange-200/60'
    case 'medium': return 'bg-amber-50 text-amber-700 border-amber-200/60'
    case 'low': return 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
    default: return 'bg-secondary-50 text-secondary-600 border-secondary-200/60'
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return 'bg-primary-50 text-primary-700 border-primary-200/60'
    case 'investigating': return 'bg-blue-50 text-blue-700 border-blue-200/60'
    case 'in_progress': return 'bg-purple-50 text-purple-700 border-purple-200/60'
    case 'resolved': return 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
    case 'closed': return 'bg-secondary-50 text-secondary-600 border-secondary-200/60'
    default: return 'bg-secondary-50 text-secondary-600 border-secondary-200/60'
  }
}

const getResolutionColor = (resolution: string | null | undefined) => {
  switch (resolution) {
    case 'false_positive': return 'bg-amber-50 text-amber-700 border-amber-200/60'
    case 'true_positive': return 'bg-red-50 text-red-700 border-red-200/60'
    case 'benign': return 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
    default: return 'bg-secondary-50 text-secondary-600 border-secondary-200/60'
  }
}

const formatDate = (valeur: string | Date) => {
  const date = new Date(valeur)
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// Le tri n'est pas un filtre : il survit à « Réinitialiser », qui ne vide que ce qui
// restreint la liste.
const resetFilters = () => {
  filters.value = { ...filters.value, id: '', status: '', statuts: '', type: '', severity: '' }
}

// Bandeau de filtres repliable sur mobile (toujours déployé à partir de md)
const filtersOpen = ref(false)
const activeFilterCount = computed(() =>
  [filters.value.id, filters.value.status, filters.value.statuts, filters.value.type, filters.value.severity].filter(Boolean).length)

useHead({ title: 'Incidents' })
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 relative z-0">
    <header class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <UITitle class="font-sans text-secondary-900 tracking-tight">
          Tableau de bord des incidents
        </UITitle>
        <p class="text-sm text-secondary-600/90 font-sans mt-1 max-w-2xl">
          Gérez et suivez l'ensemble de vos incidents de sécurité en cours.
        </p>
      </div>
      <div v-if="canWrite">
        <NuxtLink to="/incidents/new">
          <UIButton
            variant="primary"
            class="font-sans"
          >
            Déclarer un incident
          </UIButton>
        </NuxtLink>
      </div>
    </header>

    <!-- Bouton de repli (mobile uniquement) -->
    <button
      type="button"
      class="md:hidden flex items-center justify-between w-full px-4 py-3 rounded-2xl border border-secondary-200/60 bg-secondary-50/50 text-sm font-medium text-secondary-700 shadow-sm"
      @click="filtersOpen = !filtersOpen"
    >
      <span class="flex items-center gap-2">
        <Icon
          name="lucide:sliders-horizontal"
          class="size-4"
        />
        Filtres
        <span
          v-if="activeFilterCount"
          class="inline-flex items-center justify-center rounded-full bg-primary-600 px-1.5 min-w-5 h-5 text-xs font-semibold text-white"
        >{{ activeFilterCount }}</span>
      </span>
      <span class="flex items-center gap-2">
        <span class="inline-flex items-center rounded-full bg-primary-50 border border-primary-200/60 px-2.5 py-0.5 text-xs font-semibold text-primary-700 font-mono">
          {{ totalCount ?? 0 }} incident{{ (totalCount ?? 0) > 1 ? 's' : '' }}
        </span>
        <Icon
          :name="filtersOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'"
          class="size-4"
        />
      </span>
    </button>

    <section
      :class="[
        filtersOpen ? 'flex' : 'hidden',
        'md:grid bg-secondary-50/50 p-5 rounded-2xl border border-secondary-200/60 shadow-sm shadow-secondary-200/20 flex-col md:grid-cols-3 xl:grid-cols-6 items-end gap-x-5 gap-y-4 relative',
      ]"
    >
      <div class="absolute -right-20 -top-20 w-40 h-40 bg-primary-200/20 rounded-full blur-3xl pointer-events-none" />

      <div class="w-full min-w-0 relative z-10">
        <label class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono truncate">ID d'incident</label>
        <UIInput
          v-model="filters.id"
          placeholder="Rechercher par ID..."
          class="h-10 bg-white text-secondary-900 border-secondary-200 focus:border-primary-400 focus:ring-primary-500/20"
        />
      </div>
      <div class="w-full min-w-0 relative z-10">
        <label class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono truncate">Statut</label>
        <UISelect
          v-model="filters.status"
          :items="statusItems"
          :multi-select="false"
        />
      </div>
      <div class="w-full min-w-0 relative z-10">
        <label class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono truncate">Type d'incident</label>
        <UISelect
          v-model="filters.type"
          :items="typeItems"
          :multi-select="false"
        />
      </div>
      <div class="w-full min-w-0 relative z-10">
        <label class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono truncate">Sévérité</label>
        <UISelect
          v-model="filters.severity"
          :items="severityItems"
          :multi-select="false"
        />
      </div>
      <div class="w-full min-w-0 relative z-10">
        <label class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono truncate">Trier par</label>
        <UISelect
          v-model="filters.sort"
          :items="sortItems"
          :multi-select="false"
        />
      </div>
      <div class="w-full min-w-0 relative z-10">
        <label class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono truncate">Sens</label>
        <UISelect
          v-model="filters.order"
          :items="orderItems"
          :multi-select="false"
        />
      </div>
      <div class="w-full md:col-span-full flex flex-wrap items-center gap-2 relative z-10">
        <span class="text-xs font-semibold text-secondary-500 uppercase tracking-widest font-mono mr-1">Raccourcis</span>
        <button
          v-for="r in RACCOURCIS"
          :key="r.cle"
          type="button"
          :aria-pressed="raccourciActif === r.cle"
          :title="libellesStatuts(r)"
          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
          :class="raccourciActif === r.cle
            ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
            : 'bg-white border-secondary-200 text-secondary-700 hover:border-primary-300 hover:text-primary-700'"
          @click="basculerRaccourci(r)"
        >
          <Icon
            :name="r.cle === 'a-traiter' ? 'lucide:inbox' : 'lucide:loader'"
            class="size-4"
          />
          {{ r.libelle }}
        </button>
        <span
          v-if="raccourciActif"
          class="text-xs text-secondary-500"
        >{{ libellesStatuts(RACCOURCIS.find(r => r.cle === raccourciActif)!) }}</span>
      </div>
      <!-- Total filtré (indépendant de la pagination) — sur mobile il est affiché dans la barre « Filtres » repliée.
           Pastille et bouton occupent toute la largeur de la grille : placés dans la même rangée
           que six colonnes, ils sortaient de la carte. -->
      <div class="hidden md:flex md:col-span-full items-center justify-end gap-3 relative z-10">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-primary-50 border border-primary-200/60 px-3 py-1 text-xs font-semibold text-primary-700 font-mono whitespace-nowrap">
          <Icon
            name="lucide:list-filter"
            class="size-3.5"
          />
          {{ totalCount ?? 0 }} incident{{ (totalCount ?? 0) > 1 ? 's' : '' }}
        </span>
        <UIButton
          variant="ghost"
          class="text-secondary-500 hover:text-accent-600 hover:bg-accent-50/50 h-10 text-sm transition-colors"
          @click="resetFilters"
        >
          Réinitialiser
        </UIButton>
      </div>
      <!-- Sur mobile, le bouton garde toute la largeur. -->
      <UIButton
        variant="ghost"
        class="md:hidden w-full text-secondary-500 hover:text-accent-600 hover:bg-accent-50/50 h-10 text-sm transition-colors"
        @click="resetFilters"
      >
        Réinitialiser
      </UIButton>
    </section>

    <section
      v-if="pending"
      class="py-24 flex items-center justify-center bg-primary-50/40 rounded-2xl border border-primary-200/50 border-dashed"
    >
      <div class="animate-pulse flex items-center gap-3 text-primary-600 font-mono text-sm">
        <div class="h-4 w-4 rounded-full bg-primary-400 animate-ping" />
        Chargement...
      </div>
    </section>

    <section
      v-else-if="!allIncidents.length"
      class="py-24 text-center bg-secondary-50/30 rounded-2xl border border-secondary-200/50 shadow-sm"
    >
      <div class="w-14 h-14 bg-primary-100/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary-200/60 shadow-inner">
        <svg
          class="w-7 h-7 text-primary-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <p class="text-secondary-600 font-medium font-sans flex flex-col gap-1">
        <span>Aucun incident trouvé.</span>
        <span class="text-sm font-normal opacity-80">Ajustez vos filtres ou créez-en un nouveau.</span>
      </p>
    </section>

    <section
      v-else
      class="grid grid-cols-1 gap-3"
    >
      <NuxtLink
        v-for="(incident, index) in allIncidents"
        :key="incident.id"
        :to="`/incidents/${incident.id}`"
        class="group relative block bg-white p-4 sm:p-5 rounded-2xl border border-secondary-200/60 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:border-primary-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)] transition-all duration-300 overflow-hidden"
        :style="{ animationDelay: `${index * 50}ms` }"
      >
        <div class="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-primary-400 to-accent-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div class="flex flex-col md:flex-row md:items-center justify-between gap-5 pl-1 transition-transform duration-300">
          <div class="flex flex-col gap-2 grow min-w-0">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span class="font-mono text-xs font-semibold text-secondary-400 group-hover:text-primary-600 transition-colors uppercase tracking-wider">
                ID-{{ incident.id.slice(0, 6) }}
              </span>
              <span class="h-3 w-px bg-secondary-200/80" />
              <span
                class="px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold rounded-md border"
                :class="getStatusColor(incident.status)"
              >
                {{ statusDisplayNames[incident.status as keyof typeof statusDisplayNames] }}
              </span>
              <span
                class="px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold rounded-md border"
                :class="getSeverityColor(incident.severity)"
              >
                {{ severityDisplayNames[incident.severity as keyof typeof severityDisplayNames] }}
              </span>
              <span
                v-if="incident.resolution"
                class="px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold rounded-md border"
                :class="getResolutionColor(incident.resolution)"
              >
                {{ incident.resolution ? resolutionDisplayNames[incident.resolution as keyof typeof resolutionDisplayNames] : '' }}
              </span>
            </div>

            <div class="flex items-baseline gap-3 mt-1 min-w-0">
              <h3 class="text-base font-medium text-secondary-900 font-sans shrink-0 group-hover:text-primary-950 transition-colors">
                {{ typeDisplayNames[incident.type as keyof typeof typeDisplayNames] }}
              </h3>
              <p
                v-if="incident.description"
                class="text-secondary-500/80 text-sm truncate max-w-lg hidden sm:block font-sans"
              >
                — {{ incident.description }}
              </p>
            </div>
          </div>

          <div class="text-xs text-secondary-400 font-mono shrink-0 pt-1 md:pt-0 group-hover:text-secondary-600 transition-colors">
            {{ formatDate(incident.createdAt) }}
          </div>
        </div>
      </NuxtLink>
    </section>

    <div
      v-if="!pending && hasMore"
      class="flex justify-center pt-2"
    >
      <UIButton
        variant="outline"
        :disabled="loadingMore"
        class="font-sans"
        @click="loadMore"
      >
        {{ loadingMore ? 'Chargement…' : 'Charger plus d\'incidents' }}
      </UIButton>
    </div>
  </div>
</template>
