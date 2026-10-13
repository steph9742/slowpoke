<script setup lang="ts">
import { UIButton, UIButtonGroup } from '@slowpoke/ui'
import CodeEditor from '~/components/editor/CodeEditor.vue'
import HistorySection from '~/components/query-builder/HistorySection.vue'

const eden = useEden()

type QueryHistoryEntry = {
  id: string
  query: string
  createdAt: number
}

const HISTORY_STORAGE_KEY = 'query-builder-history'
const HISTORY_LIMIT = 10

const editorcontent = ref<string>('SELECT * FROM incident')
const queryResult = ref<unknown>(null)
const queryHistory = useLocalStorage<QueryHistoryEntry[]>(HISTORY_STORAGE_KEY, [])
const hasErrors = ref(false)

const addQueryToHistory = (query: string) => {
  const normalizedQuery = query.trim()

  if (!normalizedQuery) {
    return
  }

  const newEntry: QueryHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    query: normalizedQuery,
    createdAt: Date.now(),
  }

  queryHistory.value = [
    newEntry,
    ...queryHistory.value.filter(entry => entry.query !== normalizedQuery),
  ].slice(0, HISTORY_LIMIT)
}

const clearHistory = () => {
  queryHistory.value = []
}

const selectHistoryQuery = (query: string) => {
  editorcontent.value = query
}

const runQuery = async () => {
  const { data, error } = await eden.api.query.post({
    query: editorcontent.value,
  })

  if (data) {
    queryResult.value = data
    addQueryToHistory(editorcontent.value)
  }
  else if (error) {
    queryResult.value = error
  }
}

useHead({ title: 'Query builder' })
</script>

<template>
  <div>
    <div class="flex justify-between items-center">
      <UITitle>Query Builder</UITitle>
      <div class="flex items-center gap-4">
        <UIButtonGroup v-if="queryResult">
          <UIButton
            variant="outline"
            @click="exportAsJson(queryResult)"
          >
            JSON
          </UIButton>
          <UIButton
            variant="outline"
            @click="exportAsCsv(queryResult)"
          >
            CSV
          </UIButton>
          <UIButton
            variant="outline"
            @click="exportAsText(queryResult)"
          >
            Texte
          </UIButton>
        </UIButtonGroup>
        <UIButton @click="runQuery">
          Exécuter
        </UIButton>
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
      <CodeEditor
        v-model="editorcontent"
        v-model:has-errors="hasErrors"
        language="sql"
      />
      <pre class="bg-neutral-100 p-5 overflow-scroll max-h-[80vh]">{{ queryResult }}</pre>
    </div>

    <ClientOnly>
      <HistorySection
        :history="queryHistory"
        @clear="clearHistory"
        @select="selectHistoryQuery"
      />
    </ClientOnly>
  </div>
</template>
