<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWebWorkerFn } from '@vueuse/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { UIButton as Button, UIInput as Input, UISelect, type UISelectOption } from '@slowpoke/ui'
import type { ChartConfig } from '@/components/ui/chart'

import PieChart from '@/components/charts/blank/PieChart.vue'
import BarChart from '@/components/charts/blank/BarChart.vue'
import AreaChart from '@/components/charts/blank/AreaChart.vue'
import CodeEditor from '@/components/editor/CodeEditor.vue'

definePageMeta({ middleware: ['admin'] })

const chartOptions = [
  { label: 'Diagramme à barres', value: 'bar' },
  { label: 'Camembert', value: 'pie' },
  { label: 'Zone chronologique', value: 'area' },
] as UISelectOption[]

const eden = useEden()
const title = ref('')
const description = ref('')
const chartType = ref<'pie' | 'bar' | 'area'>('bar')
const sqlQuery = ref('SELECT incident.status from incident;')
const jsTransformer = ref('')
const jsTransformerHasErrors = ref(false)

const nameKey = ref('name')
const valueKey = ref('value')

// Array of { name: string, color: string, label: string }
const manualColors = ref<{ name: string, color: string, label: string }[]>([])

const queryResult = ref<Record<string, unknown>[]>([])
const queryLoading = ref(false)

const handleTestQuery = async () => {
  queryLoading.value = true
  try {
    const { data, error } = await eden.api.query.post({
      query: sqlQuery.value,
    })
    if (data && Array.isArray(data.rows)) {
      queryResult.value = data.rows
    }
    else {
      console.error(error)
    }
  }
  catch (err) {
    console.error(err)
  }
  finally {
    queryLoading.value = false
  }
}

const addColorMapping = () => {
  manualColors.value.push({ name: '', label: '', color: '#000000' })
}

const removeColorMapping = (index: number) => {
  manualColors.value.splice(index, 1)
}

const config = computed(() => {
  const result: ChartConfig = {}
  for (const item of manualColors.value) {
    if (item.name) {
      result[item.name] = {
        label: item.label || item.name,
        color: item.color,
      }
    }
  }
  return result
})

const transformedData = ref<Record<string, unknown>[] | null>(null)
const isTransforming = ref(false)

const { workerFn } = useWebWorkerFn((data: Record<string, unknown>[], code: string) => {
  const transformer = new Function('data', code)
  return transformer(data)
})

const handleApplyTransformer = async () => {
  const result = JSON.parse(JSON.stringify(queryResult.value))
  if (jsTransformer.value) {
    isTransforming.value = true
    try {
      transformedData.value = await workerFn(result, jsTransformer.value)
    }
    catch (e) {
      console.warn('Error running JS transformer', e)
    }
    finally {
      isTransforming.value = false
    }
  }
  else {
    transformedData.value = null
  }
}

const mappedData = computed(() => {
  return transformedData.value !== null ? transformedData.value : [...queryResult.value]
})

const handleSave = async () => {
  try {
    await eden.api.charts.post({
      title: title.value,
      description: description.value,
      chartType: chartType.value,
      sqlQuery: sqlQuery.value,
      jsTransformer: jsTransformer.value || undefined,
      mappingConfig: {
        config: config.value,
        nameKey: nameKey.value,
        valueKey: valueKey.value,
      },
    })
    navigateTo('/stats')
  }
  catch (e) {
    console.error(e)
  }
}

useHead({ title: 'Nouveau widget' })
</script>

<template>
  <div class="flex flex-col gap-6 w-full">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold tracking-tight">
        Créer un graphique
      </h1>
      <Button @click="handleSave">
        Sauvegarder le widget
      </Button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="flex flex-col gap-6">
        <Card class="overflow-visible">
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent class="flex flex-col gap-4">
            <div class="grid gap-2">
              <Input
                v-model="title"
                placeholder="Ex: Répartition des incidents"
                label="Titre du graphique"
              />
            </div>
            <div class="grid gap-2">
              <Input
                v-model="description"
                placeholder="Optionnel"
                label="Description"
              />
            </div>
            <div class="grid gap-2">
              <label class="block text-sm font-mono font-medium tracking-tighter text-gray-800">Type de
                graphique</label>
              <UISelect
                v-model="chartType"
                :items="chartOptions"
                :multi-select="false"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requête SQL</CardTitle>
          </CardHeader>
          <CardContent class="grid gap-4">
            <div class="border rounded-md overflow-hidden bg-card">
              <CodeEditor
                v-model="sqlQuery"
                language="sql"
                height="200px"
              />
            </div>
            <Button
              variant="secondary"
              :disabled="queryLoading"
              @click="handleTestQuery"
            >
              Tester la requête
            </Button>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div class="grid gap-2">
                <Input
                  v-model="nameKey"
                  placeholder="Ex: type_incident"
                  label="Clé catégorie / Nom (Axe X)"
                />
              </div>
              <div class="grid gap-2">
                <Input
                  v-model="valueKey"
                  placeholder="Ex: total"
                  label="Clé valeur (Axe Y / Count)"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration & couleurs</CardTitle>
            <CardDescription>
              Associez les catégories de vos données à des couleurs ou des libellés spécifiques
            </CardDescription>
          </CardHeader>
          <CardContent class="flex flex-col gap-3">
            <div
              v-for="(col, i) in manualColors"
              :key="i"
              class="flex items-center gap-2"
            >
              <Input
                v-model="col.name"
                placeholder="Valeur brute de la requête"
                class="flex-1"
              />
              <Input
                v-model="col.label"
                placeholder="Libellé à afficher"
                class="flex-1"
              />
              <div class="w-12 h-10 border rounded-md overflow-hidden relative">
                <input
                  v-model="col.color"
                  type="color"
                  class="absolute -inset-2.5 w-12.5 h-12.5 cursor-pointer"
                >
              </div>
              <Button
                size="icon"
                variant="ghost"
                @click="removeColorMapping(i)"
              >
                &times;
              </Button>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              size="md"
              class="w-full"
              @click="addColorMapping"
            >
              Ajouter une correspondance
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transformateur</CardTitle>
            <CardDescription>
              Écrivez une fonction Javascript pour manipuler la variable "data"
            </CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4">
            <div class="border rounded-md overflow-hidden bg-card">
              <CodeEditor
                v-model="jsTransformer"
                v-model:has-errors="jsTransformerHasErrors"
                language="javascript"
                height="150px"
              />
            </div>
            <Button
              variant="secondary"
              :disabled="jsTransformerHasErrors || isTransforming"
              @click="handleApplyTransformer"
            >
              {{ isTransforming ? 'Exécution en cours...' : 'Exécuter le transformateur' }}
            </Button>
          </CardContent>
        </Card>
      </div>

      <!-- Preview -->
      <div class="flex flex-col gap-6">
        <h2 class="text-xl font-semibold">
          Prévisualisation
        </h2>

        <div class="w-full">
          <ClientOnly>
            <PieChart
              v-if="chartType === 'pie'"
              :title="title"
              :description="description"
              :data="mappedData"
              :config="config"
              :name-key="nameKey"
              :value-key="valueKey"
            />
            <BarChart
              v-if="chartType === 'bar'"
              :title="title"
              :description="description"
              :data="mappedData"
              :config="config"
              :name-key="nameKey"
              :value-key="valueKey"
            />
            <AreaChart
              v-if="chartType === 'area'"
              :title="title"
              :description="description"
              :data="mappedData"
              :config="config"
              :name-key="nameKey"
              :value-key="valueKey"
            />
          </ClientOnly>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Données brutes retournées</CardTitle>
          </CardHeader>
          <CardContent>
            <pre class="bg-muted p-4 rounded-md text-xs font-mono overflow-auto max-h-75">{{ mappedData }}</pre>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
