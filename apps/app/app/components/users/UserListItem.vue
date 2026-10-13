<script setup lang="ts">
import { composanteLabel } from '~/types/incident'
import type { Eden, Treaty } from '@slowpoke/eden'
import { affiliationLabel } from '~/types/affiliation'

defineProps<{
  user: Treaty.Data<ReturnType<Eden['api']['users']>['get']>[number]
}>()
</script>

<template>
  <li
    class="group relative flex items-center justify-between p-4 rounded-xl border border-gray-200/60 bg-white hover:bg-gray-50/80 hover:border-gray-300 hover:shadow-sm transition-all duration-300 ease-out overflow-hidden"
  >
    <div
      class="absolute inset-0 bg-linear-to-r from-transparent via-transparent to-gray-50/0 group-hover:to-gray-100/50 transition-colors duration-500 z-0"
    />

    <div class="relative z-10 flex items-center gap-4">
      <div class="relative shrink-0">
        <div
          class="absolute -inset-1 bg-linear-to-b from-gray-200 to-gray-100 rounded-full blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity"
        />
        <UIAvatar
          src=""
          :fallback-name="user.fullName"
          class="relative ring-2 ring-white shadow-sm transition-transform group-hover:scale-105"
        />
      </div>

      <div class="flex flex-col">
        <div class="flex items-center gap-2 mb-0.5">
          <span class="font-semibold text-gray-900 font-sans tracking-tight">{{ user.fullName }}</span>
          <span
            v-if="user.affiliation"
            class="px-2 py-0.5 rounded-full bg-gray-100/80 border border-gray-200 text-gray-600 text-[10px] font-geistmono uppercase tracking-wider font-semibold"
          >
            {{ affiliationLabel(user.affiliation) }}
          </span>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <span class="text-gray-500 font-sans truncate max-w-50 sm:max-w-xs">{{ user.email }}</span>
        </div>
      </div>
    </div>

    <div
      v-if="user.composante"
      class="relative z-10 hidden sm:flex items-center"
    >
      <div class="flex flex-col items-end">
        <span
          class="text-[10px] text-gray-400 font-geistmono uppercase tracking-widest mb-1 select-none"
        >Composante</span>
        <span
          class="text-sm font-medium text-gray-700 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100/80 shadow-sm transition-colors group-hover:bg-white group-hover:border-gray-200"
        >
          {{ composanteLabel(user.composante) }}
        </span>
      </div>
    </div>
  </li>
</template>
