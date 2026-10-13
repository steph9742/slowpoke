<script setup lang="ts">
import { UIInput } from '@slowpoke/ui'

const incidentId = defineModel<string>('incidentId', { default: '' })
const userId = defineModel<string>('userId', { default: '' })
</script>

<template>
  <div class="space-y-4">
    <div>
      <label class="text-sm font-mono font-medium tracking-tighter text-gray-800 block mb-2">
        ID incident
      </label>
      <UIInput
        v-model="incidentId"
      />
    </div>

    <TimelineUserSelect
      v-model:user-id="userId"
    />
  </div>
</template>
