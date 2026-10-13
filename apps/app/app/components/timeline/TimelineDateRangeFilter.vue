<script setup lang="ts">
import { UIInput } from '@slowpoke/ui'

const dateFrom = defineModel<string>('dateFrom', { default: '' })
const dateTo = defineModel<string>('dateTo', { default: '' })
</script>

<template>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <UIInput
      v-model="dateFrom"
      type="date"
      label="Date de début"
    />

    <UIInput
      v-model="dateTo"
      type="date"
      label="Date de fin"
    />
  </div>
</template>
