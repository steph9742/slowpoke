<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSortable, type UseSortableOptions } from '@vueuse/integrations/useSortable'
import DynamicChart from '@/components/widgets/DynamicChart.vue'
import WidgetCard from '@/components/widgets/WidgetCard.vue'
import { UIButton } from '@slowpoke/ui'
import type { ChartConfig } from '~/components/ui/chart'

const session = await useSSRAuth()
const eden = useEden()

// mappingConfig est stocké en jsonb (typé `unknown`) ; voici sa forme réelle au runtime
type MappingConfig = { config: unknown, valueKey: string, nameKey: string }

const { data: charts, refresh: refreshCharts } = await useAsyncData('stats_custom_charts', async () => {
  const { data } = await eden.api.charts.get()

  if (!data) return []

  const sortedData = [...data].sort((a, b) => a.gridOrder - b.gridOrder)

  const inactiveCharts = sortedData.filter(chart => chart.isActive === false).map(chart => ({ ...chart, queryData: [] as Record<string, unknown>[] }))
  const activeCharts = sortedData.filter(chart => chart.isActive !== false)

  const chartsWithData = await Promise.all(activeCharts.map(async (chart) => {
    try {
      const { data: res } = await eden.api.query.post({ query: chart.sqlQuery })
      let queryData = Array.isArray(res?.rows) ? res.rows : []
      if (chart.jsTransformer) {
        try {
          const transformer = new Function('data', chart.jsTransformer)
          queryData = transformer(queryData)
        }
        catch (e) {
          console.warn('Transformer error', e)
        }
      }
      return { ...chart, queryData }
    }
    catch {
      return { ...chart, queryData: [] }
    }
  }))
  return [...chartsWithData, ...inactiveCharts]
// `default` garantit un tableau dès le premier rendu : `useSortable` exige `Ref<T[]>` et
// n'accepte pas le `| undefined` que `useAsyncData` renvoie avant résolution.
}, { getCachedData: () => undefined })

const editMode = ref(false)
const gridRef = useTemplateRef('gridRef')
const isSaving = ref(false)

// `useSortable` lit ses options UNE SEULE FOIS, à l'initialisation : passer un `computed`
// revenait à lui donner un objet Ref dont il ne déballait rien — ni `handle`, ni `disabled`
// n'étaient réellement appliqués. Les options fixes sont donc données telles quelles, et
// `disabled` est basculé ensuite par `option()`, la voie prévue pour cela.
const sortableOptions: UseSortableOptions = {
  handle: '.drag-handle',
  animation: 200,
  onUpdate: (e: { oldIndex?: number, newIndex?: number }) => {
    if (e.oldIndex !== undefined && e.newIndex !== undefined && charts.value) {
      const arr = [...charts.value]
      const [moved] = arr.splice(e.oldIndex, 1)
      if (moved) arr.splice(e.newIndex, 0, moved)
      // Update gridOrders
      charts.value = arr.map((item, index) => ({
        ...item,
        gridOrder: index,
      }))
    }
  },
}

// Liste en lecture seule pour `useSortable` : il exige `Ref<T[]>` alors que `useAsyncData`
// renvoie `T[] | undefined` avant résolution. Un `default: () => []` sur `useAsyncData`
// paraissait plus simple, mais VIDE l'affichage à l'hydratation — c'est bien le callback
// `onUpdate` ci-dessus qui réécrit `charts`, pas `useSortable`.
const chartsPourTri = computed(() => charts.value ?? [])

const { option: optionSortable } = useSortable(gridRef, chartsPourTri, sortableOptions)
watch(editMode, actif => optionSortable('disabled', !actif), { immediate: true })

const saveLayout = async () => {
  if (!charts.value) return
  isSaving.value = true

  const layout = charts.value.map(c => ({
    id: c.id,
    isActive: c.isActive ?? true,
    gridOrder: c.gridOrder ?? 0,
    colSpan: c.colSpan ?? 1,
  }))

  try {
    await eden.api.charts.layout.put(layout)
    refreshCharts()
    editMode.value = false
  }
  catch (error) {
    console.error('Failed to save layout:', error)
  }
  finally {
    isSaving.value = false
  }
}

const toggleEditMode = () => {
  if (editMode.value) {
    saveLayout()
  }
  else {
    editMode.value = true
  }
}

const updateChart = (id: string, updates: Partial<{ isActive: boolean, colSpan: number }>) => {
  if (!charts.value) return
  charts.value = charts.value.map((chart) => {
    if (chart.id === id) {
      return { ...chart, ...updates }
    }
    return chart
  })
}

useHead({ title: 'Widgets' })
</script>

<template>
  <div class="flex flex-col gap-6 p-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">
          Widgets
        </h1>
      </div>
      <div
        v-if="session?.user.role === 'admin'"
        class="inline-flex gap-4"
      >
        <UIButton
          :disabled="isSaving"
          :variant="editMode ? 'primary' : 'outline'"
          @click="toggleEditMode"
        >
          <Icon
            :name="editMode ? 'lucide:save' : 'lucide:layout-dashboard'"
            class="w-4 h-4 mr-2"
          />
          {{ editMode ? (isSaving ? 'Sauvegarde...' : 'Enregistrer la disposition') : 'Modifier la disposition' }}
        </UIButton>
        <NuxtLink
          v-if="session?.user.role === 'admin'"
          to="/stats/create"
        >
          <UIButton variant="outline">Créer un widget</UIButton>
        </NuxtLink>
      </div>
    </div>

    <div
      ref="gridRef"
      class="grid grid-cols-1 md:grid-cols-4 gap-6"
    >
      <WidgetCard
        v-for="chart in charts"
        :key="chart.id"
        :col-span="chart.colSpan"
        :is-active="chart.isActive"
        :c-id="chart.id"
        :edit-mode="editMode"
        :title="chart.title"
        @update:is-active="updateChart(chart.id, { isActive: $event })"
        @update:col-span="updateChart(chart.id, { colSpan: $event })"
      >
        <DynamicChart
          v-if="chart.isActive"
          :type="(chart.chartType as 'pie' | 'bar' | 'area')"
          :data="chart.queryData"
          :config="(chart.mappingConfig as MappingConfig).config as ChartConfig"
          :value-key="(chart.mappingConfig as MappingConfig).valueKey"
          :name-key="(chart.mappingConfig as MappingConfig).nameKey"
          :title="chart.title"
          :description="chart.description ?? ''"
        />
      </WidgetCard>

      <div
        v-if="!charts?.length"
        class="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg"
      >
        Aucun widget configuré pour le moment.
      </div>
    </div>
  </div>
</template>
