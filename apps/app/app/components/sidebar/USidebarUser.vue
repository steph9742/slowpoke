<script setup lang="ts">
import { UISkeleton, UIDropdownMenu, type UIDropdownMenuSection } from '@slowpoke/ui'
import type { User } from 'better-auth'
import { authClient } from '~/lib/auth-client'

defineProps<{
  user: User | null
}>()

const items: UIDropdownMenuSection[] = [
  {
    title: 'Mon compte',
    icon: 'lucide:user',
    items: [
      {
        label: 'Se déconnecter',
        onClick: async () => {
          await authClient().signOut()
          // Rechargement COMPLET, pas une navigation interne : la session est lue par
          // `useFetch` (useSSRAuth), dont la réponse est mise en cache. Une navigation SPA
          // relirait l'ancienne session — l'utilisateur resterait apparemment connecté
          // jusqu'à ce qu'il rafraîchisse la page lui-même.
          window.location.href = '/login'
        },
        destructive: true,
      },
    ],
  },
]
</script>

<template>
  <UIDropdownMenu
    v-if="user"
    :items="items"
  >
    <div class="bg-white rounded-xl p-2.5 w-full hover:bg-gray-50 cursor-pointer transition-colors duration-75">
      <div class="flex items-center gap-3">
        <img
          :src="$props.user?.image || 'https://ui-avatars.com/api/?name=' + encodeURIComponent($props.user?.name || 'User') + '&background=random&color=fff&size=128'"
          :alt="'Avatar de ' + $props.user?.name"
          class="size-10 rounded-full"
        >
        <div class="w-full flex flex-col gap-px grow-0 font-sans">
          <p class="text-sm font-semibold">
            {{ $props.user?.name }}
          </p>
          <p class="text-xs text-gray-500">
            {{ $props.user?.email }}
          </p>
        </div>
      </div>
    </div>
  </UIDropdownMenu>
  <div
    v-else
    class="bg-white rounded-xl p-2.5"
  >
    <div class="flex items-center gap-3">
      <UISkeleton class="shrink-0 size-10 rounded-full!" />
      <div class="w-full flex flex-col gap-3 grow-0">
        <UISkeleton class="h-3 rounded-full" />
        <UISkeleton class="w-26 h-3 rounded-full" />
      </div>
    </div>
  </div>
</template>
