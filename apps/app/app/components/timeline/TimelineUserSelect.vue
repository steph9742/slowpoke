<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { authClient } from '~/lib/auth-client'
import { UISelect } from '@slowpoke/ui'

interface User {
  id: string
  name: string
  image?: string
}

const userId = defineModel<string>('userId', { default: '' })

const users = ref<User[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

const userOptions = computed(() =>
  users.value.map(user => ({
    label: user.name || user.id,
    value: user.id,
  })),
)

const fetchUsers = async () => {
  isLoading.value = true
  error.value = null

  try {
    const { data, error: err } = await authClient().admin.listUsers({
      query: {
        limit: 1000,
      },
      fetchOptions: {
        credentials: 'include',
        headers: useRequestHeaders(['cookie']),
      },
    })

    if (err) {
      error.value = err.message || 'Impossible de charger les utilisateurs.'
      return
    }

    const rawUsers = Array.isArray(data)
      ? data
      : (data as { users?: unknown[] } | null)?.users ?? []

    users.value = rawUsers
      .map((raw): User | null => {
        const user = raw as Record<string, unknown>
        if (typeof user.id !== 'string') return null
        return {
          id: user.id,
          name: typeof user.name === 'string' && user.name.trim().length > 0 ? user.name : user.id,
          image: typeof user.image === 'string' ? user.image : undefined,
        }
      })
      .filter((user): user is User => user !== null)
  }
  catch (e) {
    error.value = 'Erreur lors du chargement des utilisateurs.'
    console.error(e)
  }
  finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <label class="text-sm font-mono font-medium tracking-tighter text-gray-800">
        Créé par (utilisateur)
      </label>
      <button
        v-if="users.length > 0 && !isLoading && !error"
        class="text-xs text-gray-500 hover:text-gray-700 transitions-colors"
        @click="fetchUsers"
      >
        ↻
      </button>
    </div>

    <div
      v-if="isLoading"
      class="text-sm text-gray-500"
    >
      Chargement des utilisateurs...
    </div>

    <div
      v-else-if="error"
      class="text-sm text-red-600"
    >
      {{ error }}
    </div>

    <div
      v-else-if="users.length === 0"
      class="text-sm text-gray-500"
    >
      Aucun utilisateur disponible.
    </div>

    <div v-else>
      <div class="space-y-2">
        <UISelect
          v-model="userId"
          :items="userOptions"
          :multi-select="false"
          :searchable="true"
          placeholder="Sélectionner un utilisateur"
        />
        <div
          v-if="userId"
          class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
        >
          <UIAvatar
            :src="users.find(u => u.id === userId)?.image || ''"
            :alt="users.find(u => u.id === userId)?.name"
            :fallback-name="users.find(u => u.id === userId)?.name"
          />
          <div class="flex-1">
            <p class="text-sm font-sans text-gray-900">
              {{ users.find(u => u.id === userId)?.name }}
            </p>
            <p class="text-xs text-gray-500 font-mono">
              {{ userId }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
