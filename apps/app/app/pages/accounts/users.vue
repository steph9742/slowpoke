<script setup lang="ts">
import { computed, ref } from 'vue'
import UsersActionDialog from '~/components/users/UsersActionDialog.vue'
import UsersFilters from '~/components/users/UsersFilters.vue'
import UsersTable from '~/components/users/UsersTable.vue'
import type { AdminAction, AppRole, Feedback, ManagedUser, RoleFilter, SortBy } from '~/components/users/user-management.types'
import { authClient } from '~/lib/auth-client'
import { UIButton } from '@slowpoke/ui'

definePageMeta({
  middleware: 'admin',
})

const session = await useSSRAuth()
const currentUser = computed(() => session.value?.user ?? null)

if (!currentUser.value || currentUser.value.role !== 'admin') {
  await navigateTo('/')
}

const feedback = ref<Feedback | null>(null)
const eden = useEden()

const search = ref('')
const roleFilter = ref<RoleFilter>('all')
const adminsOnly = ref(false)
const sortBy = ref<SortBy>('created-desc')

const dialogOpen = ref(false)
const dialogAction = ref<AdminAction | null>(null)
const dialogUser = ref<ManagedUser | null>(null)
const actionPending = ref(false)

const mapUsers = (payload: unknown): ManagedUser[] => {
  const rawUsers = Array.isArray(payload)
    ? payload
    : (payload as { users?: unknown[] } | null)?.users ?? []

  return rawUsers
    .map((raw) => {
      const user = raw as Record<string, unknown>

      if (typeof user.id !== 'string') {
        return null
      }

      return {
        id: user.id,
        name: typeof user.name === 'string' && user.name.trim().length > 0 ? user.name : 'Sans nom',
        email: typeof user.email === 'string' ? user.email : '-',
        role: typeof user.role === 'string' ? user.role : 'user',
        banned: Boolean(user.banned),
        createdAt: user.createdAt instanceof Date || typeof user.createdAt === 'string' ? user.createdAt : null,
      }
    })
    .filter((item): item is ManagedUser => item !== null)
}

const {
  data: users,
  pending: isLoading,
  error: usersError,
  refresh: refreshUsers,
} = await useAsyncData<ManagedUser[]>(
  'admin-users-list',
  async () => {
    const { data, error } = await authClient().admin.listUsers({
      query: {
        limit: 200,
      },
      fetchOptions: {
        credentials: 'include',
        headers: useRequestHeaders(['cookie']),
      },
    })

    if (error) {
      throw new Error(error.message || 'Impossible de charger la liste des utilisateurs.')
    }

    return mapUsers(data)
  },
  {
    default: () => [],
    getCachedData: () => undefined,
  },
)

const loadError = computed(() => usersError.value?.message || '')

const filteredUsers = computed(() => {
  const searchValue = search.value.trim().toLowerCase()

  const filtered = users.value.filter((user) => {
    if (adminsOnly.value && user.role !== 'admin') {
      return false
    }

    if (roleFilter.value !== 'all' && user.role !== roleFilter.value) {
      return false
    }

    if (!searchValue) {
      return true
    }

    return user.name.toLowerCase().includes(searchValue) || user.email.toLowerCase().includes(searchValue)
  })

  const sorted = [...filtered]

  sorted.sort((a, b) => {
    if (sortBy.value === 'name-asc') {
      return a.name.localeCompare(b.name, 'fr')
    }

    if (sortBy.value === 'name-desc') {
      return b.name.localeCompare(a.name, 'fr')
    }

    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0

    return sortBy.value === 'created-asc' ? dateA - dateB : dateB - dateA
  })

  return sorted
})

const canDelete = (user: ManagedUser) => user.id !== currentUser.value?.id

const openActionDialog = (action: AdminAction, user: ManagedUser) => {
  feedback.value = null

  if (action === 'delete' && !canDelete(user)) {
    feedback.value = {
      type: 'error',
      message: 'Vous ne pouvez pas supprimer votre propre compte.',
    }
    return
  }

  dialogAction.value = action
  dialogUser.value = user
  dialogOpen.value = true
}

const closeDialog = () => {
  if (actionPending.value) {
    return
  }

  dialogOpen.value = false
  dialogAction.value = null
  dialogUser.value = null
}

const handleRowAction = ({ action, user }: { action: AdminAction, user: ManagedUser }) => {
  openActionDialog(action, user)
}

const applyAction = async () => {
  if (!dialogUser.value || !dialogAction.value) {
    return
  }

  actionPending.value = true
  feedback.value = null

  try {
    if (dialogAction.value === 'delete') {
      const { error } = await authClient().admin.removeUser({
        userId: dialogUser.value.id,
      })

      if (error) {
        throw new Error(error.message || 'Suppression impossible.')
      }

      users.value = users.value.filter(user => user.id !== dialogUser.value?.id)
      feedback.value = {
        type: 'success',
        message: 'Le compte utilisateur a été supprimé.',
      }
    }

    if (dialogAction.value === 'revoke') {
      const { error } = await authClient().admin.revokeUserSessions({
        userId: dialogUser.value.id,
      })

      if (error) {
        throw new Error(error.message || 'Révocation impossible.')
      }

      feedback.value = {
        type: 'success',
        message: 'Toutes les sessions de cet utilisateur ont été révoquées.',
      }
    }

    if (dialogAction.value === 'promote') {
      const { error } = await authClient().admin.setRole({
        userId: dialogUser.value.id,
        role: 'admin',
      })

      if (error) {
        throw new Error(error.message || 'Promotion impossible.')
      }

      users.value = users.value.map((user) => {
        if (user.id === dialogUser.value?.id) {
          return {
            ...user,
            role: 'admin',
          }
        }

        return user
      })

      feedback.value = {
        type: 'success',
        message: 'L’utilisateur a été promu administrateur.',
      }
    }

    closeDialog()
  }
  catch (error) {
    feedback.value = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Une erreur est survenue.',
    }
  }
  finally {
    actionPending.value = false
  }
}

// Changement de rôle applicatif (sélecteur du tableau) — endpoint admin dédié
async function handleSetRole({ user, role }: { user: ManagedUser, role: AppRole }) {
  const { error } = await eden.api.accounts({ userId: user.id }).role.patch({ role })
  if (error) {
    feedback.value = { type: 'error', message: 'Changement de rôle impossible.' }
    return
  }
  users.value = (users.value ?? []).map(u => (u.id === user.id ? { ...u, role } : u))
  feedback.value = { type: 'success', message: `Rôle mis à jour pour ${user.name}.` }
}

useHead({ title: 'Utilisateurs' })
</script>

<template>
  <div class="space-y-6">
    <UITitle level="1">
      Gestion des utilisateurs
    </UITitle>

    <div
      v-if="feedback"
      :class="[
        'rounded-lg border px-4 py-3 text-sm font-sans',
        feedback.type === 'success' && 'border-green-200 bg-green-50 text-green-700',
        feedback.type === 'error' && 'border-red-200 bg-red-50 text-red-700',
        feedback.type === 'info' && 'border-blue-200 bg-blue-50 text-blue-700',
      ]"
    >
      {{ feedback.message }}
    </div>

    <UsersFilters
      v-model:search="search"
      v-model:role-filter="roleFilter"
      v-model:sort-by="sortBy"
      v-model:admins-only="adminsOnly"
      @refresh="refreshUsers"
    />

    <div class="flex items-center justify-between gap-2 text-sm text-gray-600 font-sans">
      <p>
        {{ filteredUsers.length }} utilisateur(s) affiché(s)
      </p>
    </div>

    <div
      v-if="isLoading"
      class="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 font-sans"
    >
      Chargement des utilisateurs...
    </div>

    <div
      v-else-if="loadError"
      class="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 space-y-3"
    >
      <p class="font-sans text-sm">
        {{ loadError }}
      </p>
      <UIButton
        variant="danger"
        size="sm"
        @click="refreshUsers"
      >
        Réessayer
      </UIButton>
    </div>

    <div
      v-else-if="filteredUsers.length === 0"
      class="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 font-sans"
    >
      Aucun utilisateur ne correspond aux filtres.
    </div>

    <UsersTable
      v-else
      :users="filteredUsers"
      :current-user-id="currentUser?.id"
      @action="handleRowAction"
      @set-role="handleSetRole"
    />

    <UsersActionDialog
      v-model="dialogOpen"
      :action="dialogAction"
      :user="dialogUser"
      :pending="actionPending"
      @close="closeDialog"
      @confirm="applyAction"
    />
  </div>
</template>
