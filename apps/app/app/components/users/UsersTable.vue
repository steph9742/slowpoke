<script setup lang="ts">
import { UIButton } from '@slowpoke/ui'
import type { AdminAction, AppRole, ManagedUser } from './user-management.types'
import { ROLE_OPTIONS, normalizeRole } from './user-management.types'

const props = defineProps<{
  users: ManagedUser[]
  currentUserId?: string
}>()

const emit = defineEmits<{
  action: [payload: { action: AdminAction, user: ManagedUser }]
  setRole: [payload: { user: ManagedUser, role: AppRole }]
}>()

const canDelete = (user: ManagedUser) => user.id !== props.currentUserId

const roleLabel = (role: string) => ROLE_OPTIONS.find(o => o.value === normalizeRole(role))?.label ?? role
const roleBadge = (role: string) => {
  switch (normalizeRole(role)) {
    case 'admin': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'gestionnaire': return 'bg-purple-50 text-purple-700 border-purple-200'
    case 'lecteur': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    default: return 'bg-gray-100 text-gray-500 border-gray-200'
  }
}

const formatDate = (value: string | Date | null) => {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleDateString('fr-FR')
}
</script>

<template>
  <!-- Mobile (< md) : cartes empilées -->
  <div class="md:hidden space-y-3">
    <div
      v-for="user in users"
      :key="user.id"
      class="rounded-xl border border-gray-200 bg-white p-4 space-y-3"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="font-medium text-gray-900 truncate">
            {{ user.name }}
          </div>
          <div class="text-sm text-gray-500 truncate">
            {{ user.email }}
          </div>
          <div
            v-if="user.id === currentUserId"
            class="text-xs text-gray-400"
          >
            Vous
          </div>
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">
          <span
            :class="[
              'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-mono border',
              roleBadge(user.role),
            ]"
          >
            {{ roleLabel(user.role) }}
          </span>
          <span
            v-if="user.banned"
            class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-mono bg-amber-50 text-amber-700 border border-amber-200"
          >
            Banni
          </span>
        </div>
      </div>
      <div class="text-xs text-gray-500">
        Créé le {{ formatDate(user.createdAt) }}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select
          :value="normalizeRole(user.role)"
          :disabled="user.id === currentUserId"
          class="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-mono text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Rôle applicatif"
          @change="emit('setRole', { user, role: ($event.target as HTMLSelectElement).value as AppRole })"
        >
          <option
            v-for="opt in ROLE_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
        <UIButton
          size="sm"
          variant="outline"
          @click="emit('action', { action: 'revoke', user })"
        >
          Révoquer
        </UIButton>
        <UIButton
          size="sm"
          variant="danger"
          :disabled="!canDelete(user)"
          @click="emit('action', { action: 'delete', user })"
        >
          Supprimer
        </UIButton>
      </div>
    </div>
  </div>

  <!-- Desktop (md+) : tableau -->
  <div class="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
    <table class="w-full min-w-205 text-sm">
      <thead class="bg-gray-50 text-left text-gray-600 font-mono tracking-tight">
        <tr>
          <th class="px-4 py-3">
            Utilisateur
          </th>
          <th class="px-4 py-3">
            Email
          </th>
          <th class="px-4 py-3">
            Rôle
          </th>
          <th class="px-4 py-3">
            Créé le
          </th>
          <th class="px-4 py-3 text-right">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="user in users"
          :key="user.id"
          class="border-t border-gray-100 align-top"
        >
          <td class="px-4 py-3 font-sans">
            <div class="font-medium text-gray-900">
              {{ user.name }}
            </div>
            <div
              v-if="user.id === currentUserId"
              class="text-xs text-gray-500"
            >
              Vous
            </div>
          </td>
          <td class="px-4 py-3 font-sans text-gray-700">
            {{ user.email }}
          </td>
          <td class="px-4 py-3">
            <span
              :class="[
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-mono border',
                roleBadge(user.role),
              ]"
            >
              {{ roleLabel(user.role) }}
            </span>
            <span
              v-if="user.banned"
              class="ml-2 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-mono bg-amber-50 text-amber-700 border border-amber-200"
            >
              Banni
            </span>
          </td>
          <td class="px-4 py-3 font-sans text-gray-700">
            {{ formatDate(user.createdAt) }}
          </td>
          <td class="px-4 py-3">
            <div class="flex justify-end items-center gap-2">
              <select
                :value="normalizeRole(user.role)"
                :disabled="user.id === currentUserId"
                class="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-mono text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-300 focus:border-primary-400 focus:outline-none"
                title="Rôle applicatif"
                @change="emit('setRole', { user, role: ($event.target as HTMLSelectElement).value as AppRole })"
              >
                <option
                  v-for="opt in ROLE_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>

              <UIButton
                size="sm"
                variant="outline"
                @click="emit('action', { action: 'revoke', user })"
              >
                Révoquer sessions
              </UIButton>

              <UIButton
                size="sm"
                variant="danger"
                :disabled="!canDelete(user)"
                @click="emit('action', { action: 'delete', user })"
              >
                Supprimer
              </UIButton>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
