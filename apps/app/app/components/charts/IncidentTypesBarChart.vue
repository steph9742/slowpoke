<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { VisAxis, VisStackedBar, VisXYContainer } from '@unovis/vue'
import { StackedBar } from '@unovis/ts'
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

const props = defineProps<{
  items?: {
    type: string | null
    count: number
  }[]
}>()

const typeLabels: Record<string, string> = {
  phishing: 'Phishing',
  malware: 'Malware',
  ransomware: 'Ransomware',
  data_breach: 'Fuite',
  ddos: 'DDoS',
  network_intrusion: 'Intrusion',
  other: 'Autre',
}

const chartData = computed(() => {
  return (props.items || []).map((i, index) => ({
    id: index,
    typeId: i.type ?? 'unknown',
    label: i.type ? (typeLabels[i.type] ?? i.type) : 'Inconnu',
    count: i.count,
  }))
})

type Data = typeof chartData.value[number]

const chartConfig = {
  count: {
    label: 'Incidents',
    color: 'var(--primary)',
  },
} satisfies ChartConfig
</script>

<template>
  <Card class="flex flex-col relative overflow-hidden border-border/50 shadow-sm">
    <CardHeader class="pb-2 relative z-10">
      <CardTitle class="text-xl font-bold tracking-tight">
        Types d'incidents
      </CardTitle>
      <CardDescription class="text-sm text-muted-foreground">
        Catégories d'incidents les plus fréquentes.
      </CardDescription>
    </CardHeader>
    <CardContent class="relative z-10 pt-4">
      <ChartContainer :config="chartConfig">
        <VisXYContainer
          :data="chartData"
          :padding="{ top: 10, bottom: 10, left: 10, right: 10 }"
          height="300px"
        >
          <VisStackedBar
            :x="(d: Data) => d.id"
            :y="(d: Data) => d.count"
            :color="chartConfig.count.color"
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
              return item ? item.label : ''
            }"
          />
          <VisAxis
            type="y"
            :tick-line="false"
            :domain-line="false"
          />
          <ChartTooltip
            :triggers="{
              [StackedBar.selectors.bar]: componentToString(chartConfig, ChartTooltipContent, {
                labelKey: 'label',
                hideIndicator: true,
              })!,
            }"
          />
        </VisXYContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
