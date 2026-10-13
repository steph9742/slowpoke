<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { VisAxis, VisArea, VisXYContainer, VisLine } from '@unovis/vue'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartCrosshair,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from '@/components/ui/chart'

const props = withDefaults(defineProps<{
  config?: ChartConfig
  data: Record<string, unknown>[]
  title?: string
  description?: string
  valueKey?: string
  nameKey?: string
}>(), {
  config: () => ({}),
  valueKey: 'value',
  nameKey: 'date',
})

const chartData = computed(() => {
  if (!props.data || props.data.length === 0) return []

  return props.data.map((i) => {
    let dateValue = i[props.nameKey]
    if (typeof dateValue === 'string') {
      dateValue = new Date(dateValue).getTime()
    }
    else if (dateValue instanceof Date) {
      dateValue = dateValue.getTime()
    }
    return {
      ...i,
      dateValue,
      [props.valueKey]: i[props.valueKey] ?? 0,
    }
  }).sort((a, b) => Number(a.dateValue) - Number(b.dateValue))
})

type Data = typeof chartData.value[number]
</script>

<template>
  <Card class="flex flex-col relative overflow-hidden border-border/50 shadow-sm max-h-100">
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
          height="250px"
        >
          <VisArea
            :x="(d: Data) => d.dateValue"
            :y="(d: Data) => d[valueKey]"
            :color="config[valueKey]?.color ?? 'var(--color-primary)'"
            :opacity="0.2"
          />
          <VisLine
            :x="(d: Data) => d.dateValue"
            :y="(d: Data) => d[valueKey]"
            :color="config[valueKey]?.color ?? 'var(--color-primary)'"
            :attributes="{ 'stroke-width': 2 }"
          />
          <VisAxis
            type="x"
            :x="(d: Data) => d.dateValue"
            :tick-line="false"
            :domain-line="false"
            :grid-line="false"
            :num-ticks="5"
            :tick-format="(d: number) => {
              try {
                const date = new Date(d)
                return date.toLocaleDateString('fr-FR', {
                  month: 'short',
                  day: 'numeric',
                })
              }
              catch (e) {
                return d
              }
            }"
          />
          <VisAxis
            type="y"
            :tick-line="false"
            :domain-line="false"
          />
          <ChartTooltip />
          <ChartCrosshair
            :template="componentToString(config, ChartTooltipContent, {
              indicator: 'line',
              labelFormatter(d) {
                try {
                  const date = new Date(d)
                  return date.toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                }
                catch (e) {
                  return d.toString()
                }
              },
            })"
            :color="config[valueKey]?.color ?? 'var(--color-primary)'"
          />
        </VisXYContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
