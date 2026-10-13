<script setup lang="ts">
import { composanteLabel } from '~/types/incident'
import { ref } from 'vue'
import { UIButton, UIDialog, useToast } from '@slowpoke/ui'
import IncidentUserForm from '~/components/incidents/new/IncidentUserForm.vue'
import { affiliationLabel } from '~/types/affiliation'
import IdentitiesManager from '~/components/incidents/phishing/IdentitiesManager.vue'
import ConnectionLogsManager from '~/components/incidents/phishing/ConnectionLogsManager.vue'

const props = defineProps<{
  incidentId: string
}>()

const eden = useEden()

const { data: users, refresh } = await useAsyncData(`incident-users-${props.incidentId}`, async () => {
  const { data } = await eden.api.users({ incidentId: props.incidentId }).get()
  return data ?? []
}, { getCachedData: () => undefined })

type IncidentUser = NonNullable<typeof users.value>[number]

const expandedId = ref<string | null>(null)
function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const submitting = ref(false)
const form = ref({ fullName: '', email: '', affiliation: '' as string | null, composante: '' as string | null })

function openAdd() {
  editingId.value = null
  form.value = { fullName: '', email: '', affiliation: '', composante: '' }
  modalOpen.value = true
}

function openEdit(user: IncidentUser) {
  editingId.value = user.id
  form.value = {
    fullName: user.fullName,
    email: user.email ?? '',
    affiliation: user.affiliation ?? '',
    composante: user.composante ?? '',
  }
  modalOpen.value = true
}

async function submit() {
  if (submitting.value || !form.value.fullName || !form.value.email) return
  submitting.value = true
  try {
    const body = {
      fullName: form.value.fullName,
      email: form.value.email,
      affiliation: form.value.affiliation || null,
      composante: form.value.composante || null,
    }
    const res = editingId.value
      ? await eden.api.users({ incidentId: props.incidentId })({ iuid: editingId.value }).patch(body)
      : await eden.api.users({ incidentId: props.incidentId }).post(body)

    if (res.error) {
      useToast().newToast({ duration: 4000, title: 'Erreur', message: 'L\'enregistrement a échoué.', type: 'error' })
      return
    }

    useToast().newToast({ duration: 2500, title: editingId.value ? 'Utilisateur modifié' : 'Utilisateur ajouté', message: '', type: 'success' })
    modalOpen.value = false
    await refresh()
  }
  finally {
    submitting.value = false
  }
}

async function remove(user: IncidentUser) {
  if (!confirm(`Retirer ${user.fullName} de cet incident ? (ses identités et logs seront aussi supprimés)`)) return
  const res = await eden.api.users({ incidentId: props.incidentId })({ iuid: user.id }).delete()
  if (res.error) {
    useToast().newToast({ duration: 4000, title: 'Erreur', message: 'La suppression a échoué.', type: 'error' })
    return
  }
  await refresh()
}
</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div class="flex items-center justify-between border-b border-gray-100 pb-4">
      <UITitle
        level="3"
        class="font-sans tracking-tight text-primary-600"
      >
        Utilisateurs concernés
      </UITitle>
      <UIButton
        variant="secondary"
        size="md"
        @click="openAdd"
      >
        <Icon
          name="lucide:plus"
          class="text-base"
        />
        <span class="ml-1.5 font-medium tracking-tight">Ajouter un utilisateur</span>
      </UIButton>
    </div>

    <ul
      v-if="users?.length"
      class="space-y-3"
    >
      <li
        v-for="user in users"
        :key="user.id"
        class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
      >
        <div
          class="flex items-center justify-between gap-4 p-4 cursor-pointer hover:bg-gray-50/70 transition-colors"
          @click="toggle(user.id)"
        >
          <div class="flex items-center gap-3 min-w-0">
            <Icon
              :name="expandedId === user.id ? 'lucide:chevron-down' : 'lucide:chevron-right'"
              class="size-4 text-gray-400 shrink-0"
            />
            <div class="min-w-0">
              <p class="font-medium text-secondary-900 truncate">
                {{ user.fullName }}
              </p>
              <p class="text-xs text-secondary-500 truncate">
                {{ user.email }}
                <template v-if="user.affiliation">
                  · {{ affiliationLabel(user.affiliation) }}
                </template>
                <template v-if="user.composante">
                  · {{ composanteLabel(user.composante) }}
                </template>
              </p>
            </div>
          </div>
          <div
            class="flex items-center gap-1 shrink-0"
            @click.stop
          >
            <UIButton
              variant="ghost"
              size="icon"
              class="text-secondary-500 hover:text-primary-600"
              @click="openEdit(user)"
            >
              <Icon
                name="lucide:pencil"
                class="size-4"
              />
            </UIButton>
            <UIButton
              variant="ghost"
              size="icon"
              class="text-secondary-500 hover:text-red-600"
              @click="remove(user)"
            >
              <Icon
                name="lucide:x"
                class="size-4"
              />
            </UIButton>
          </div>
        </div>

        <div
          v-if="expandedId === user.id"
          class="border-t border-gray-100 bg-gray-50/40 p-4 space-y-6"
        >
          <div>
            <h4 class="text-xs font-semibold uppercase tracking-wider text-secondary-500 mb-2 flex items-center gap-1.5">
              <Icon
                name="lucide:venetian-mask"
                class="size-3.5 text-purple-500"
              /> Identités compromises / utilisées
            </h4>
            <IdentitiesManager
              :incident-id="incidentId"
              :user-id="user.id"
            />
          </div>
          <div>
            <h4 class="text-xs font-semibold uppercase tracking-wider text-secondary-500 mb-2 flex items-center gap-1.5">
              <Icon
                name="lucide:activity-square"
                class="size-3.5 text-rose-500"
              /> Logs d'activité associés &amp; actions
            </h4>
            <ConnectionLogsManager
              :incident-id="incidentId"
              :user-id="user.id"
            />
          </div>
        </div>
      </li>
    </ul>

    <div
      v-else
      class="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50"
    >
      <span class="text-gray-400 font-geistmono text-sm select-none">Aucun utilisateur concerné</span>
    </div>

    <UIDialog
      v-model="modalOpen"
      :title="editingId ? 'Modifier l\'utilisateur' : 'Ajouter un utilisateur concerné'"
    >
      <template #content>
        <IncidentUserForm
          v-model="form"
          :multiple="false"
        />
      </template>
      <template #footer>
        <UIButton
          variant="outline"
          @click="modalOpen = false"
        >
          Annuler
        </UIButton>
        <UIButton
          variant="primary"
          :disabled="submitting || !form.fullName || !form.email"
          @click="submit"
        >
          {{ submitting ? 'Enregistrement…' : 'Enregistrer' }}
        </UIButton>
      </template>
    </UIDialog>
  </div>
</template>
