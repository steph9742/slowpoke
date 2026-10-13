<script setup lang="ts" generic="">
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

withDefaults(defineProps<{
  config?: ChartConfig
  data: Record<string, unknown>[]
  title?: string
  description?: string
  valueKey?: string
  nameKey?: string
}>(), {
  config: () => ({}),
  valueKey: 'value',
  nameKey: 'name',
})
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
    <CardContent class="flex-1 pt-4 pb-4 relative z-10">
      <ChartContainer
        :config="config"
        class="mx-auto aspect-square max-h-75"
      >
        <VisSingleContainer
          :data="data"
          :margin="{ top: 30, bottom: 30 }"
        >
          <VisDonut
            :value="(d: Record<string, any>) => d[valueKey]"
            :color="(d: Record<string, any>) => config[d[nameKey]]?.color ?? 'var(--color-primary)'"
            :arc-width="25"
          />
          <ChartTooltip
            :triggers="{
              [Donut.selectors.segment]: componentToString(
                config,
                ChartTooltipContent,
                {
                  hideLabel: true,
                  nameKey: nameKey,
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
