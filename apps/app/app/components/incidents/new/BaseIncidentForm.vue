<script setup lang="ts">
import type { IncidentGetData } from '~/types/elysia'
import { UISelect, UIInput, type UISelectOption } from '@slowpoke/ui'
import { statusDisplayNames, severityDisplayNames, typeDisplayNames, perimeterDisplayNames } from '~/types/incident'

const model = defineModel<Pick<IncidentGetData, 'status' | 'type' | 'severity' | 'description' | 'source'> & {
  knowledgeAt?: string
  knowledgeEstimated?: boolean
  perimeter?: string
}>({ default: () => ({
  status: '',
  type: '',
  severity: '',
  description: '',
  source: '',
  knowledgeAt: '',
  knowledgeEstimated: false,
  perimeter: '',
}) })

const { lockType = false } = defineProps<{ lockType?: boolean }>()

const statusItems: UISelectOption[] = Object.entries(statusDisplayNames).map(([value, label]) => ({ value, label }))
const severityItems: UISelectOption[] = Object.entries(severityDisplayNames).map(([value, label]) => ({ value, label }))
const typeItems: UISelectOption[] = Object.entries(typeDisplayNames).map(([value, label]) => ({ value, label }))
const perimeterItems: UISelectOption[] = Object.entries(perimeterDisplayNames).map(([value, label]) => ({ value, label }))
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-y-7 gap-x-8">
    <div class="space-y-2">
      <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
        Statut de l'incident
      </label>
      <UISelect
        v-model="model.status"
        :items="statusItems"
        :multi-select="false"
        class="h-11 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
      />
    </div>

    <div class="space-y-2">
      <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
        Sévérité estimée
      </label>
      <UISelect
        v-model="model.severity"
        :items="severityItems"
        :multi-select="false"
        class="h-11 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
      />
    </div>

    <div class="space-y-2 md:col-span-2">
      <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
        Catégorie Principale
      </label>
      <UISelect
        v-if="!lockType"
        v-model="model.type"
        :items="typeItems"
        :multi-select="false"
        class="h-11 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
      />
      <div
        v-else
        class="h-11 flex items-center px-3 rounded-md border border-gray-200/80 bg-gray-50/60 text-sm text-gray-500 font-sans"
      >
        {{ typeDisplayNames[model.type] ?? model.type }}
        <span class="ml-2 text-[11px] text-gray-400">(non modifiable)</span>
      </div>
    </div>

    <div class="space-y-2">
      <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
        Périmètre
      </label>
      <UISelect
        v-model="model.perimeter"
        :items="perimeterItems"
        :multi-select="false"
        placeholder="Où se situe l'incident"
      />
    </div>

    <!-- DATE DE CONNAISSANCE — point de départ des échéances réglementaires, donc
         obligatoire. Ce n'est ni la date de saisie, ni la date de détection technique :
         c'est le moment où l'établissement a su. -->
    <div class="space-y-2 md:col-span-2">
      <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
        Connaissance par l'établissement <span class="text-red-500">*</span>
      </label>
      <UIInput
        v-model="model.knowledgeAt"
        type="datetime-local"
        required
        class="h-11 border-gray-200/80 bg-gray-50/30 font-sans focus:bg-white transition-colors"
      />
      <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
        <input
          v-model="model.knowledgeEstimated"
          type="checkbox"
          class="rounded border-gray-300"
        >
        Date estimée (non connue avec certitude)
      </label>
      <p class="text-[11px] text-gray-400">
        Quand l'établissement a su — détection interne, ou réception d'un signalement extérieur.
        Les échéances réglementaires courent à partir de cette date, pas de la saisie.
      </p>
    </div>

    <div class="space-y-2 md:col-span-2">
      <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
        Description technique
      </label>
      <div class="relative">
        <UIInput
          v-model="model.description"
          placeholder="Résumé initial (ex: Tentative de phishing au niveau C-Level...)"
          class="pl-4 h-12 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] border-gray-200/80 bg-gray-50/30 font-sans focus:bg-white transition-colors"
        />
      </div>
    </div>

    <div class="space-y-2 md:col-span-2">
      <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
        Source liée
      </label>
      <div class="relative">
        <span class="absolute inset-y-0 text-gray-400 left-3 flex items-center pt-px">
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </span>
        <UIInput
          v-model="model.source"
          placeholder="Lien vers IP, domaine, ou artefact"
          class="pl-10 h-11 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] border-gray-200/80 bg-gray-50/30 text-sm font-mono focus:bg-white transition-colors"
        />
      </div>
    </div>
  </div>
</template>
