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
import { useMediaQuery } from '@vueuse/core'

const props = defineProps<{
  items?: {
    date: string
    total: number
  }[]
  /** Premier jour affiché, `AAAA-MM-JJ`. Sans lui : les derniers jours jusqu'à aujourd'hui. */
  debut?: string
  /** Dernier jour affiché, inclus. */
  fin?: string
}>()

const isMobile = useMediaQuery('(max-width: 640px)')
// La valeur mobile n'est prise en compte qu'après le montage → pas de décalage d'hydratation SSR
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

// Fenêtre resserrée sur mobile : moins de barres → des barres assez larges pour être touchées au doigt
const windowDays = computed(() => (mounted.value && isMobile.value) ? 10 : 30)
const barPadding = computed(() => (mounted.value && isMobile.value) ? 0.1 : 0.3)

const toYMD = (date: string | Date | number) => {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Jour local construit à midi : un changement d'heure ne fait ni sauter ni doubler un jour.
const jourLocal = (ymd: string) => {
  const [a, m, j] = ymd.split('-').map(Number)
  return new Date(a!, m! - 1, j!, 12)
}

// La période est celle CHOISIE quand la page en fournit une. La fenêtre fixe des 30 derniers
// jours ignorait le sélecteur : choisir une autre période changeait les données récupérées,
// jamais les jours affichés — et le sous-titre annonçait « 30 derniers jours » quoi qu'il en soit.
const periodeChoisie = computed(() => Boolean(props.debut && props.fin))

// Compte par jour (NON cumulé), chaque jour de la période rempli à 0 s'il est vide.
const chartData = computed(() => {
  const byDay = new Map<string, number>()
  for (const i of props.items ?? []) {
    const ymd = toYMD(i.date)
    byDay.set(ymd, (byDay.get(ymd) ?? 0) + Number(i.total))
  }

  let start: Date
  let end: Date
  if (periodeChoisie.value) {
    start = jourLocal(props.debut!)
    end = jourLocal(props.fin!)
  }
  else {
    end = new Date()
    end.setHours(12, 0, 0, 0)
    start = new Date(end)
    start.setDate(start.getDate() - (windowDays.value - 1))
  }

  const out: { id: number, dateValue: number, dateLabel: string, total: number }[] = []
  let id = 0
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push({
      id: id++,
      dateValue: d.getTime(),
      dateLabel: new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
      total: byDay.get(toYMD(d)) ?? 0,
    })
  }
  return out
})

type Data = typeof chartData.value[number]

const totalPeriod = computed(() => chartData.value.reduce((s, d) => s + d.total, 0))

const libellePeriode = computed(() => {
  if (!periodeChoisie.value) return `sur les ${windowDays.value} derniers jours`
  const f = (ymd: string) => jourLocal(ymd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return `du ${f(props.debut!)} au ${f(props.fin!)}`
})

const chartConfig = {
  total: {
    label: 'Incidents',
    color: 'var(--primary)',
  },
} satisfies ChartConfig
</script>

<template>
  <Card class="flex flex-col relative overflow-hidden border-border/50 shadow-sm max-h-100">
    <CardHeader class="pb-2 relative z-10">
      <CardTitle class="text-xl font-bold tracking-tight">
        Incidents par jour
      </CardTitle>
      <CardDescription class="text-sm text-muted-foreground">
        Nombre d'incidents signalés chaque jour · {{ totalPeriod }} au total {{ libellePeriode }}.
      </CardDescription>
    </CardHeader>
    <CardContent class="relative z-10 pt-4">
      <ChartContainer
        :config="chartConfig"
        class="aspect-auto h-[240px] sm:h-[300px]"
      >
        <VisXYContainer
          :data="chartData"
          :padding="{ top: 10, bottom: 10, left: 10, right: 10 }"
          height="250px"
        >
          <VisStackedBar
            :x="(d: Data) => d.id"
            :y="(d: Data) => d.total"
            :color="chartConfig.total.color"
            :rounded-corners="3"
            :bar-padding="barPadding"
          />
          <VisAxis
            type="x"
            :x="(d: Data) => d.id"
            :tick-line="false"
            :domain-line="false"
            :grid-line="false"
            :num-ticks="6"
            :tick-format="(d: number) => {
              const item = chartData.find(c => c.id === Math.round(d))
              return item ? new Date(item.dateValue).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }) : ''
            }"
          />
          <VisAxis
            type="y"
            :tick-line="false"
            :domain-line="false"
            :num-ticks="4"
            :tick-format="(d: number) => Number.isInteger(d) ? String(d) : ''"
          />
          <ChartTooltip
            :triggers="{
              [StackedBar.selectors.bar]: componentToString(chartConfig, ChartTooltipContent, {
                labelKey: 'dateLabel',
                hideIndicator: true,
              })!,
            }"
          />
        </VisXYContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
