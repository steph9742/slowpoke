<script setup lang="ts">
import { Codemirror } from 'vue-codemirror'
import { javascript, esLint } from '@codemirror/lang-javascript'
import { basicSetup } from 'codemirror'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { linter, diagnosticCount } from '@codemirror/lint'
import { sqlConfig, sqlLinter } from './SQLConfig'
import * as eslint from 'eslint-linter-browserify'
import { config } from './JSEslintConfig'

const props = defineProps<{
  language: 'json' | 'javascript' | 'sql'
  height?: string
}>()

const model = defineModel<string>()
const hasErrors = defineModel<boolean>('hasErrors')

// `@codemirror/view` n'est pas une dépendance directe et `codemirror` ne réexporte pas
// `ViewUpdate` : on ne se sert que de `state`, dont le type se déduit de son consommateur.
const handleUpdate = (update: { state: Parameters<typeof diagnosticCount>[0] }) => {
  const errors = diagnosticCount(update.state) > 0
  if (hasErrors.value !== errors) {
    hasErrors.value = errors
  }
}

const getExtensions = () => {
  const ext = [basicSetup]

  switch (props.language) {
    case 'json':
      ext.push(json())
      ext.push(linter(jsonParseLinter()))
      break
    case 'sql':
      ext.push(sqlConfig)
      ext.push(sqlLinter)
      break
    case 'javascript':
      ext.push(javascript())
      ext.push(linter(esLint(new eslint.Linter(), config)))
      break
  }

  return ext
}

const extensions = getExtensions()
</script>

<template>
  <Codemirror
    v-model="model"
    :extensions="extensions"
    :tab-size="2"
    :indent-with-tab="true"
    :style="{ height: height || '80vh' }"
    @update="(update) => handleUpdate(update)"
  />
</template>
