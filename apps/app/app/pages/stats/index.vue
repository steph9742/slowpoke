<script setup lang="ts">
import type { DateRange } from 'reka-ui'
import { getLocalTimeZone, today } from '@internationalized/date'

const eden = useEden()

const dateRange = ref({
  start: today(getLocalTimeZone()).subtract({ days: 30 }),
  end: today(getLocalTimeZone()),
}) as unknown as Ref<DateRange>

const { data: timelineData, refresh: refreshTimelineData } = await useAsyncData('stats_timeline', async () => {
  const { data } = await eden.api.stats.timeline.get({ query: { from: dateRange.value.start!.toString(), to: dateRange.value.end!.toString() } })
  return data
}, { getCachedData: () => undefined })

const { data: typesData, refresh: refreshTypesData } = await useAsyncData('stats_types', async () => {
  const { data } = await eden.api.stats.types.get({ query: { from: dateRange.value.start!.toString(), to: dateRange.value.end!.toString() } })
  return data
}, { getCachedData: () => undefined })

const { data: severityData, refresh: refreshSeverityData } = await useAsyncData('stats_severity', async () => {
  const { data } = await eden.api.stats.severity.get({ query: { from: dateRange.value.start!.toString(), to: dateRange.value.end!.toString() } })
  return data
}, { getCachedData: () => undefined })

const { data: userTypeData, refresh: refreshUserTypeData } = await useAsyncData('stats_user_types', async () => {
  const { data } = await eden.api.stats.users.get({ query: { from: dateRange.value.start!.toString(), to: dateRange.value.end!.toString() } })
  return data
}, { getCachedData: () => undefined })

const { data: composantesData, refresh: refreshComposantesData } = await useAsyncData('stats_composantes', async () => {
  const { data } = await eden.api.stats.composantes.get({ query: { from: dateRange.value.start!.toString(), to: dateRange.value.end!.toString() } })
  return data
}, { getCachedData: () => undefined })

function handleDateRangeUpdate() {
  refreshTimelineData()
  refreshTypesData()
  refreshSeverityData()
  refreshUserTypeData()
  refreshComposantesData()
}

useHead({ title: 'Statistiques' })
</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div class="flex flex-col gap-4 md:flex-row md:items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">
          Statistiques globales
        </h1>
        <p class="text-muted-foreground mt-1">
          Supervision de l'historique et des impacts des incidents.
        </p>
      </div>
      <ChartsRangeDatePicker
        v-model="dateRange"
        @updated="handleDateRangeUpdate"
      />
    </div>

    <ClientOnly>
      <div class="w-full relative shadow-sm border border-border/50 rounded-xl overflow-hidden bg-card/50">
        <ChartsTimelineAreaChart
          :items="timelineData ?? []"
          :debut="dateRange.start?.toString()"
          :fin="dateRange.end?.toString()"
          class="border-0 shadow-none bg-transparent"
        />
      </div>

      <!-- Mobile : carrousel horizontal (swipe) ; md+ : grille 2 colonnes (inchangé) -->
      <div class="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible md:pb-0">
        <ChartsIncidentTypesBarChart
          :items="typesData ?? []"
          class="snap-center shrink-0 w-[85%] md:w-auto"
        />
        <ChartsSeverityDonutChart
          :items="severityData ?? []"
          class="snap-center shrink-0 w-[85%] md:w-auto"
        />
        <ChartsUserTypeChart
          :items="userTypeData ?? []"
          class="snap-center shrink-0 w-[85%] md:w-auto"
        />
        <ChartsComposantesList
          :items="composantesData?.resultats ?? []"
          :sans-composante="composantesData?.sansComposante ?? 0"
          :laboratoires="composantesData?.laboratoires ?? 0"
          class="snap-center shrink-0 w-[85%] md:w-auto"
        />
      </div>
    </ClientOnly>
  </div>
</template>
