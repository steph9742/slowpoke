<script setup lang="ts">
import type { IncidentLogType } from './TimelineLogType'
import { TIMELINE_LOG_TYPE_OPTIONS } from './TimelineLogType'
import { UIButton, UISelect } from '@slowpoke/ui'

const logTypes = defineModel<IncidentLogType[]>('logTypes', { default: () => [] })
const incidentId = defineModel<string>('incidentId', { default: '' })
const userId = defineModel<string>('userId', { default: '' })
const dateFrom = defineModel<string>('dateFrom', { default: '' })
const dateTo = defineModel<string>('dateTo', { default: '' })

withDefaults(defineProps<{
  invalidDateRange?: boolean
  isOpen?: boolean
}>(), {
  invalidDateRange: false,
  isOpen: false,
})

const emit = defineEmits<{
  apply: []
  reset: []
}>()

const handleReset = () => {
  logTypes.value = []
  incidentId.value = ''
  userId.value = ''
  dateFrom.value = ''
  dateTo.value = ''

  emit('reset')
}
</script>

<template>
  <div
    v-if="isOpen"
    class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
  >
    <div class="mb-3 flex items-center gap-2">
      <UIButton
        variant="outline"
        size="sm"
        @click="handleReset"
      >
        Réinitialiser
      </UIButton>
      <UIButton
        size="sm"
        :disabled="invalidDateRange"
        @click="emit('apply')"
      >
        Appliquer
      </UIButton>
    </div>

    <div class="space-y-4">
      <div class="space-y-1.5">
        <p class="text-sm font-mono font-medium tracking-tighter text-gray-800">
          Types de log
        </p>
        <UISelect
          v-model="logTypes"
          :items="TIMELINE_LOG_TYPE_OPTIONS"
          :multi-select="true"
          :searchable="true"
          placeholder="Tous les types"
        />
      </div>

      <TimelineIdentityFilter
        v-model:incident-id="incidentId"
        v-model:user-id="userId"
      />

      <TimelineDateRangeFilter
        v-model:date-from="dateFrom"
        v-model:date-to="dateTo"
      />

      <p
        v-if="invalidDateRange"
        class="text-sm font-sans text-red-600"
      >
        La date de début doit être antérieure ou égale à la date de fin.
      </p>
    </div>
  </div>
</template>
