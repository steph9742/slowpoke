<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { Donut } from '@unovis/ts'
import { VisDonut, VisSingleContainer } from '@unovis/vue'
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
  ChartLegendContent,
  componentToString,
} from '@/components/ui/chart'

const props = defineProps<{
  items?: {
    severity: string | null
    count: number
  }[]
}>()

const severities = ['low', 'medium', 'high', 'critical']

const chartData = computed(() => {
  return severities.map((severity) => {
    const item = props.items?.find(i => i.severity === severity)
    return {
      severity,
      count: item?.count ?? 0,
      fill: `var(--chart-${severity})`,
    }
  })
})

type Data = typeof chartData.value[number]

const chartConfig = {
  count: {
    label: 'Incidents',
    color: undefined,
  },
  low: {
    label: 'Faible',
    color: '#34d399',
  },
  medium: {
    label: 'Moyenne',
    color: '#fbbf24',
  },
  high: {
    label: 'Élevée',
    color: '#fb923c',
  },
  critical: {
    label: 'Critique',
    color: '#ef4444',
  },
} satisfies ChartConfig
</script>

<template>
  <Card class="flex flex-col relative overflow-hidden border-border/50 shadow-sm">
    <CardHeader class="pb-2 relative z-10">
      <CardTitle class="text-xl font-bold tracking-tight">
        Sévérité
      </CardTitle>
      <CardDescription class="text-sm text-muted-foreground">
        Proportion des niveaux de gravité.
      </CardDescription>
    </CardHeader>
    <CardContent class="flex-1 pt-4 pb-4 relative z-10">
      <ChartContainer
        :config="chartConfig"
        class="mx-auto aspect-square max-h-75"
      >
        <VisSingleContainer
          :data="chartData"
          :margin="{ top: 30, bottom: 30 }"
        >
          <VisDonut
            :value="(d: Data) => d.count"
            :color="(d: Data) => chartConfig[d.severity as keyof typeof chartConfig].color"
            :arc-width="25"
          />
          <ChartTooltip
            :triggers="{
              [Donut.selectors.segment]: componentToString(
                chartConfig,
                ChartTooltipContent,
                {
                  hideLabel: true,
                  nameKey: 'severity',
                },
              )!,
            }"
          />
        </VisSingleContainer>
        <ChartLegendContent />
      </ChartContainer>
    </CardContent>
  </Card>
</template>
