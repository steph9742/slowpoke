<script setup lang="ts">
import { ref } from 'vue'
import KVEditor from '~/components/metadata/KVEditor.vue'
import { UIInput, UIButton } from '@slowpoke/ui'

interface Metadata {
  customFields: Record<string, string>
  customType: string
  tags: string[]
}

const metadata = defineModel<Metadata>({ default: () => ({
  customFields: { '': '' },
  customType: '',
  tags: [],
}) })

const tagInput = ref<string>('')

const addTag = () => {
  if (tagInput.value.trim() === '') return
  if (metadata.value.tags.includes(tagInput.value.trim())) {
    tagInput.value = ''
    return
  }
  metadata.value.tags.push(tagInput.value.trim())
  tagInput.value = ''
}
</script>

<template>
  <div class="grid grid-cols-1 gap-y-8 gap-x-8">
    <div class="space-y-4">
      <div>
        <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
          Sous-catégorie spécifique
        </label>
        <p class="text-xs text-gray-400 font-sans mt-1 mb-3">
          Si la catégorie "Autre" est trop vague, précisez ci-dessous.
        </p>
        <UIInput
          v-model="metadata.customType"
          placeholder="Ex: Supply Chain Attack..."
          class="h-11 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] border-gray-200/80 bg-white"
        />
      </div>
    </div>

    <div class="space-y-4 p-5 sm:p-6 bg-white border border-gray-200/80 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono border-b border-gray-100 pb-3">
        Étiquettes & Mots-clés
      </label>

      <div class="flex flex-col sm:flex-row gap-3 pt-2">
        <UIInput
          v-model="tagInput"
          placeholder="Entrer une tag et appuyer sur Entrée"
          class="flex-1 h-10 text-sm font-sans"
          @keyup.enter="addTag"
        />
        <UIButton
          variant="secondary"
          class="h-10 px-5 text-sm font-sans whitespace-nowrap bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
          @click="addTag"
        >
          + Ajouter
        </UIButton>
      </div>

      <div
        v-if="metadata.tags.length > 0"
        class="flex flex-wrap gap-2 mt-4 max-h-35 overflow-y-auto"
      >
        <TransitionGroup
          enter-active-class="transition duration-300 ease-out transform"
          enter-from-class="scale-95 opacity-0"
          enter-to-class="scale-100 opacity-100"
          leave-active-class="transition duration-200 ease-in transform absolute"
          leave-from-class="scale-100 opacity-100"
          leave-to-class="scale-95 opacity-0"
        >
          <div
            v-for="(tag, index) in metadata.tags"
            :key="tag"
            class="group bg-primary-50 text-primary-700 text-xs font-medium px-3 py-1.5 rounded-md border border-primary-200/50 flex items-center gap-1.5 shadow-sm"
          >
            <span class="font-mono tracking-wide">{{ tag }}</span>
            <button
              class="text-primary-400 hover:text-primary-800 transition-colors w-4 h-4 ml-1 rounded-full flex items-center justify-center hover:bg-primary-200"
              @click="metadata.tags.splice(index, 1)"
            >
              <svg
                class="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <div class="space-y-4 p-5 sm:p-6 bg-white border border-gray-200/80 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono border-b border-gray-100 pb-3">
        Metadonnées
      </label>
      <div class="pt-2">
        <KVEditor v-model="metadata.customFields" />
      </div>
    </div>
  </div>
</template>
