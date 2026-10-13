<script setup lang="ts">
import AreaChart from '@/components/charts/blank/AreaChart.vue'
import BarChart from '@/components/charts/blank/BarChart.vue'
import PieChart from '@/components/charts/blank/PieChart.vue'
import type { ChartConfig } from '../ui/chart'

defineProps<{
  config?: ChartConfig
  data: Record<string, unknown>[]
  title?: string
  description?: string
  valueKey?: string
  nameKey?: string
  type: 'area' | 'bar' | 'pie'
}>()
</script>

<template>
  <div class="h-full w-full">
    <AreaChart
      v-if="type === 'area'"
      :config="config"
      :data="data"
      :title="title"
      :description="description"
      :value-key="valueKey"
      :name-key="nameKey"
    />
    <BarChart
      v-else-if="type === 'bar'"
      :config="config"
      :data="data"
      :title="title"
      :description="description"
      :value-key="valueKey"
      :name-key="nameKey"
    />
    <PieChart
      v-else-if="type === 'pie'"
      :config="config"
      :data="data"
      :title="title"
      :description="description"
      :value-key="valueKey"
      :name-key="nameKey"
    />
  </div>
</template>
