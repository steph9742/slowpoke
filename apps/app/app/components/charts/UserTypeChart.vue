<script setup lang="ts">
import type {
  ChartConfig,
} from '@/components/ui/chart'

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

type Bucket = 'student' | 'staff' | 'teacher' | 'researcher' | 'other'

const props = defineProps<{
  items?: {
    affiliation: string | null
    count: number
  }[]
}>()

// Le champ affiliation est saisi librement (aucun formulaire n'impose les codes 'student'/'staff'/…),
// donc on reconnaît aussi bien les codes que les libellés FR/accentués, insensible à la casse.
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

const SYNONYMS: Record<string, Bucket> = {
  'student': 'student', 'etudiant': 'student', 'etudiante': 'student',
  'staff': 'staff', 'personnel': 'staff', 'employee': 'staff', 'employe': 'staff', 'membre': 'staff',
  'teacher': 'teacher', 'enseignant': 'teacher', 'enseignante': 'teacher', 'professeur': 'teacher',
  'enseignant-chercheur': 'teacher', 'enseignante-chercheuse': 'teacher', 'faculty': 'teacher',
  'emeritus': 'teacher', 'emerite': 'teacher', 'professeur emerite': 'teacher',
  'researcher': 'researcher', 'chercheur': 'researcher', 'chercheuse': 'researcher',
}

const BUCKETS: Bucket[] = ['student', 'staff', 'teacher', 'researcher', 'other']

const chartData = computed(() => {
  const counts: Record<Bucket, number> = { student: 0, staff: 0, teacher: 0, researcher: 0, other: 0 }
  for (const item of props.items ?? []) {
    const key = item.affiliation ? normalize(item.affiliation) : ''
    const bucket = SYNONYMS[key] ?? 'other'
    counts[bucket] += item.count
  }
  return BUCKETS.map(type => ({ type, count: counts[type] }))
})

type Data = typeof chartData.value[number]

const chartConfig = {
  count: {
    label: 'Utilisateurs',
    color: undefined,
  },
  student: {
    label: 'Étudiant',
    color: 'var(--chart-1)',
  },
  staff: {
    label: 'Personnel',
    color: 'var(--chart-2)',
  },
  teacher: {
    label: 'Enseignant',
    color: 'var(--chart-3)',
  },
  researcher: {
    label: 'Chercheur',
    color: 'var(--chart-4)',
  },
  other: {
    label: 'Autre',
    color: 'var(--chart-5)',
  },
} satisfies ChartConfig
</script>

<template>
  <Card class="flex flex-col relative overflow-hidden border-border/50 shadow-sm">
    <CardHeader class="pb-2 relative z-10">
      <CardTitle class="text-xl font-bold tracking-tight">
        Types d'utilisateurs
      </CardTitle>
      <CardDescription class="text-sm text-muted-foreground">
        Profil des comptes impactés par les incidents.
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
            :color="(d: Data) => chartConfig[d.type as keyof typeof chartConfig].color"
            :arc-width="25"
          />
          <ChartTooltip
            :triggers="{
              [Donut.selectors.segment]: componentToString(
                chartConfig,
                ChartTooltipContent,
                {
                  hideLabel: true,
                  nameKey: 'type',
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
