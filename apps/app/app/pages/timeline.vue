<script setup lang="ts">
import type { IncidentLogType } from '../components/timeline/TimelineLogType'
import { UIButton } from '@slowpoke/ui'

const eden = useEden()

type TimelineFilters = {
  logTypes: IncidentLogType[]
  incidentId: string
  userId: string
  dateFrom: string
  dateTo: string
}

const createEmptyFilters = (): TimelineFilters => ({
  logTypes: [],
  incidentId: '',
  userId: '',
  dateFrom: '',
  dateTo: '',
})

const draftFilters = reactive<TimelineFilters>(createEmptyFilters())
const appliedFilters = ref<TimelineFilters>(createEmptyFilters())
const isFiltersPanelOpen = ref(false)

const hasInvalidDateRange = computed(() => {
  if (!draftFilters.dateFrom || !draftFilters.dateTo) {
    return false
  }

  return new Date(draftFilters.dateFrom).getTime() > new Date(draftFilters.dateTo).getTime()
})

const { data, pending, error, refresh } = await useAsyncData('timeline', async () => {
  const query = {
    limit: 200,
    ...(appliedFilters.value.logTypes.length > 0 ? { logTypes: appliedFilters.value.logTypes.join(',') } : {}),
    ...(appliedFilters.value.incidentId ? { incidentId: appliedFilters.value.incidentId } : {}),
    ...(appliedFilters.value.userId ? { userId: appliedFilters.value.userId } : {}),
    ...(appliedFilters.value.dateFrom ? { dateFrom: new Date(appliedFilters.value.dateFrom).toISOString() } : {}),
    ...(appliedFilters.value.dateTo ? { dateTo: new Date(appliedFilters.value.dateTo).toISOString() } : {}),
  }

  const { data } = await eden.api.timeline.get({ query })

  return data ?? []
}, { getCachedData: () => undefined })

const handleApplyFilters = async () => {
  if (hasInvalidDateRange.value) {
    return
  }

  appliedFilters.value = {
    logTypes: [...draftFilters.logTypes],
    incidentId: draftFilters.incidentId.trim(),
    userId: draftFilters.userId.trim(),
    dateFrom: draftFilters.dateFrom,
    dateTo: draftFilters.dateTo,
  }

  await refresh()
}

const handleResetFilters = async () => {
  Object.assign(draftFilters, createEmptyFilters())
  appliedFilters.value = createEmptyFilters()

  await refresh()
}

useHead({ title: 'Chronologie' })
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <UITitle>Timeline</UITitle>

      <UIButton
        variant="outline"
        @click="isFiltersPanelOpen = !isFiltersPanelOpen"
      >
        <span class="text-sm font-sans font-semibold text-gray-900 group-hover:text-primary-600 transition-colors duration-150">
          Filtres
        </span>
        <Icon
          name="lucide:chevron-down"
          :class="[
            'w-4 h-4 text-gray-600 transition-transform duration-200 group-hover:text-primary-600',
            isFiltersPanelOpen ? 'rotate-180' : '',
          ]"
        />
      </UIButton>
    </div>

    <TimelineFilters
      v-model:log-types="draftFilters.logTypes"
      v-model:incident-id="draftFilters.incidentId"
      v-model:user-id="draftFilters.userId"
      v-model:date-from="draftFilters.dateFrom"
      v-model:date-to="draftFilters.dateTo"
      :is-open="isFiltersPanelOpen"
      :invalid-date-range="hasInvalidDateRange"
      @apply="handleApplyFilters"
      @reset="handleResetFilters"
    />

    <p
      v-if="pending"
      class="font-sans text-sm text-gray-500"
    >
      Chargement des logs...
    </p>

    <p
      v-else-if="error"
      class="font-sans text-sm text-red-600"
    >
      Impossible de charger la timeline.
    </p>

    <TimelineRoot
      v-else
      :items="data ?? []"
    />
  </div>
</template>
