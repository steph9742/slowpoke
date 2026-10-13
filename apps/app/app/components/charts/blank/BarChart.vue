<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { VisAxis, VisStackedBar, VisXYContainer } from '@unovis/vue'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from '@/components/ui/chart'

const props = withDefaults(defineProps<{
  config?: ChartConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[]
  title?: string
  description?: string
  valueKey?: string
  nameKey?: string
}>(), {
  config: () => ({}),
  valueKey: 'value',
  nameKey: 'name',
})

const chartData = computed(() => {
  return (props.data || []).map((i, index) => ({
    id: index,
    [props.nameKey]: i[props.nameKey] ?? 'unknown',
    [props.valueKey]: i[props.valueKey] ?? 0,
  }))
})

type Data = typeof chartData.value[number]
</script>

<template>
  <Card class="flex flex-col relative overflow-hidden border-border/50 shadow-sm">
    <CardHeader
      v-if="title || description"
      class="pb-2 relative z-10"
    >
      <CardTitle
        v-if="title"
        class="text-xl font-bold tracking-tight"
      >
        {{ title }}
      </CardTitle>
      <CardDescription
        v-if="description"
        class="text-sm text-muted-foreground"
      >
        {{ description }}
      </CardDescription>
    </CardHeader>
    <CardContent class="relative z-10 pt-4">
      <ChartContainer :config="config">
        <VisXYContainer
          :data="chartData"
          :padding="{ top: 10, bottom: 10, left: 10, right: 10 }"
          height="300px"
        >
          <VisStackedBar
            :x="(d: Data) => d.id"
            :y="(d: Data) => d[valueKey]"
            :color="(d: Data) => config[d[nameKey]]?.color ?? 'var(--color-primary)'"
            :rounded-corners="4"
            :bar-padding="0.25"
          />
          <VisAxis
            type="x"
            :x="(d: Data) => d.id"
            :tick-line="false"
            :domain-line="false"
            :grid-line="false"
            :tick-format="(d: number) => {
              const item = chartData.find(c => c.id === d)
              return item ? config[item[nameKey]]?.label ?? item[nameKey] : ''
            }"
          />
          <VisAxis
            type="y"
            :tick-line="false"
            :domain-line="false"
          />
          <ChartTooltip
            :selected="componentToString(config, ChartTooltipContent, {
              hideLabel: false,
              nameKey: valueKey,
            })"
          />
        </VisXYContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
