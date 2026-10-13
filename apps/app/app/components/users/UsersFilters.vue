<script setup lang="ts">
import { computed, ref } from 'vue'
import { UIButton, UICheckbox, UIInput, UISelect, type UISelectOption } from '@slowpoke/ui'
import type { RoleFilter, SortBy } from './user-management.types'

const search = defineModel<string>('search', { required: true })
const roleFilter = defineModel<RoleFilter>('roleFilter', { required: true })
const sortBy = defineModel<SortBy>('sortBy', { required: true })
const adminsOnly = defineModel<boolean>('adminsOnly', { required: true })

// Bandeau repliable sur mobile (toujours déployé à partir de md)
const open = ref(false)
const activeCount = computed(() => {
  let n = 0
  if (search.value.trim()) n++
  if (roleFilter.value !== 'all') n++
  if (adminsOnly.value) n++
  return n
})

const emit = defineEmits<{
  refresh: []
}>()

const roleOptions: UISelectOption[] = [
  { label: 'Tous les rôles', value: 'all' },
  { label: 'Administrateurs', value: 'admin' },
  { label: 'Gestionnaires', value: 'gestionnaire' },
  { label: 'Lecteurs', value: 'lecteur' },
  { label: 'Aucun accès', value: 'user' },
]

const sortOptions: UISelectOption[] = [
  { label: 'Date de création (récent)', value: 'created-desc' },
  { label: 'Date de création (ancien)', value: 'created-asc' },
  { label: 'Nom (A -> Z)', value: 'name-asc' },
  { label: 'Nom (Z -> A)', value: 'name-desc' },
]
</script>

<template>
  <div class="space-y-4">
    <!-- Bouton de repli (mobile uniquement) -->
    <button
      type="button"
      class="md:hidden flex items-center justify-between w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700"
      @click="open = !open"
    >
      <span class="flex items-center gap-2">
        <Icon
          name="lucide:sliders-horizontal"
          class="size-4"
        />
        Filtres
        <span
          v-if="activeCount"
          class="inline-flex items-center justify-center rounded-full bg-primary-600 px-1.5 min-w-5 h-5 text-xs font-semibold text-white"
        >{{ activeCount }}</span>
      </span>
      <Icon
        :name="open ? 'lucide:chevron-up' : 'lucide:chevron-down'"
        class="size-4"
      />
    </button>

    <div :class="[open ? 'grid' : 'hidden', 'md:grid gap-4 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4']">
      <UIInput
        v-model="search"
        label="Recherche"
        placeholder="Nom ou email"
        size="sm"
      />

      <div class="space-y-1.5">
        <p class="text-sm font-mono font-medium tracking-tight text-gray-800">
          Rôle
        </p>
        <UISelect
          v-model="roleFilter"
          :items="roleOptions"
          :multi-select="false"
          placeholder="Filtrer par rôle"
        />
      </div>

      <div class="space-y-1.5">
        <p class="text-sm font-mono font-medium tracking-tight text-gray-800">
          Tri
        </p>
        <UISelect
          v-model="sortBy"
          :items="sortOptions"
          :multi-select="false"
          placeholder="Trier"
        />
      </div>

      <div class="flex items-end">
        <UICheckbox
          v-model="adminsOnly"
          label="Afficher uniquement les admins"
        />
      </div>
    </div>

    <div class="flex items-center justify-end">
      <UIButton
        variant="outline"
        size="sm"
        @click="emit('refresh')"
      >
        Actualiser
      </UIButton>
    </div>
  </div>
</template>
