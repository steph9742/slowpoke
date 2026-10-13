<script setup lang="ts">
import { ref } from 'vue'
import { UIButton, UIDialog, UIInput, useToast } from '@slowpoke/ui'

const props = defineProps<{
  incidentId: string
  userId: string
}>()

const eden = useEden()

const { data: identities, refresh } = useAsyncData(`phishing-identities-${props.incidentId}-${props.userId}`, async () => {
  const { data } = await eden.api.phishing({ incidentId: props.incidentId }).users({ userId: props.userId }).identities.get()
  return data ?? []
}, { getCachedData: () => undefined })

type Identity = NonNullable<typeof identities.value>[number]

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const submitting = ref(false)
const form = ref({ identity_name: '', fromDisplayName: '', fromAddress: '', replyDisplayName: '', replyAddress: '' })

function reset() {
  form.value = { identity_name: '', fromDisplayName: '', fromAddress: '', replyDisplayName: '', replyAddress: '' }
}
function openAdd() {
  editingId.value = null
  reset()
  modalOpen.value = true
}
function openEdit(i: Identity) {
  editingId.value = i.id
  form.value = {
    identity_name: i.identity_name,
    fromDisplayName: i.fromDisplayName ?? '',
    fromAddress: i.fromAddress ?? '',
    replyDisplayName: i.replyDisplayName ?? '',
    replyAddress: i.replyAddress ?? '',
  }
  modalOpen.value = true
}

async function submit() {
  if (submitting.value || !form.value.identity_name) return
  submitting.value = true
  try {
    const body = {
      identity_name: form.value.identity_name,
      fromDisplayName: form.value.fromDisplayName || null,
      fromAddress: form.value.fromAddress || null,
      replyDisplayName: form.value.replyDisplayName || null,
      replyAddress: form.value.replyAddress || null,
    }
    const res = editingId.value
      ? await eden.api.phishing({ incidentId: props.incidentId }).users({ userId: props.userId }).identities({ id: editingId.value }).patch(body)
      : await eden.api.phishing({ incidentId: props.incidentId }).users({ userId: props.userId }).identities.post(body)

    if (res.error) {
      useToast().newToast({ duration: 4000, title: 'Erreur', message: 'L\'enregistrement a échoué.', type: 'error' })
      return
    }
    modalOpen.value = false
    await refresh()
  }
  finally {
    submitting.value = false
  }
}

async function remove(i: Identity) {
  if (!confirm(`Supprimer l'identité « ${i.identity_name} » ?`)) return
  const res = await eden.api.phishing({ incidentId: props.incidentId }).users({ userId: props.userId }).identities({ id: i.id }).delete()
  if (res.error) {
    useToast().newToast({ duration: 4000, title: 'Erreur', message: 'La suppression a échoué.', type: 'error' })
    return
  }
  await refresh()
}
</script>

<template>
  <div class="space-y-3">
    <ul
      v-if="identities?.length"
      class="space-y-2"
    >
      <li
        v-for="i in identities"
        :key="i.id"
        class="flex items-center justify-between gap-4 p-3.5 rounded-xl border border-zinc-200 bg-white shadow-sm"
      >
        <div class="min-w-0">
          <p class="font-medium text-zinc-900 truncate">
            {{ i.identity_name }}
          </p>
          <p class="text-xs text-zinc-500 truncate font-mono">
            <template v-if="i.fromAddress">
              De : {{ i.fromDisplayName ? `${i.fromDisplayName} ` : '' }}&lt;{{ i.fromAddress }}&gt;
            </template>
            <template v-if="i.replyAddress">
              · Réponse : {{ i.replyAddress }}
            </template>
          </p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <UIButton
            variant="ghost"
            size="icon"
            class="text-zinc-500 hover:text-primary-600"
            @click="openEdit(i)"
          >
            <Icon
              name="lucide:pencil"
              class="size-4"
            />
          </UIButton>
          <UIButton
            variant="ghost"
            size="icon"
            class="text-zinc-500 hover:text-red-600"
            @click="remove(i)"
          >
            <Icon
              name="lucide:trash-2"
              class="size-4"
            />
          </UIButton>
        </div>
      </li>
    </ul>

    <p
      v-else
      class="text-sm text-zinc-400 italic py-3 text-center"
    >
      Aucune identité enregistrée.
    </p>

    <button
      type="button"
      class="w-full rounded-lg border border-dashed border-zinc-300 py-2 text-sm text-zinc-500 hover:border-primary-400 hover:text-primary-600 transition-colors flex items-center justify-center gap-1.5"
      @click="openAdd"
    >
      <Icon
        name="lucide:plus"
        class="size-4"
      />
      Ajouter une identité
    </button>

    <UIDialog
      v-model="modalOpen"
      :title="editingId ? 'Modifier l\'identité' : 'Ajouter une identité'"
    >
      <template #content>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1.5 sm:col-span-2">
            <label class="text-sm font-medium text-secondary-700">Nom de l'identité *</label>
            <UIInput
              v-model="form.identity_name"
              placeholder="Ex : Support Microsoft"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-secondary-700">Nom de l'expéditeur (From)</label>
            <UIInput
              v-model="form.fromDisplayName"
              placeholder="Ex : IT Support"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-secondary-700">Adresse de l'expéditeur (From)</label>
            <UIInput
              v-model="form.fromAddress"
              placeholder="support@exemple.com"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-secondary-700">Nom de réponse (Reply-to)</label>
            <UIInput
              v-model="form.replyDisplayName"
              placeholder="Optionnel"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-secondary-700">Adresse de réponse (Reply-to)</label>
            <UIInput
              v-model="form.replyAddress"
              placeholder="Optionnel"
            />
          </div>
        </div>
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
          :disabled="submitting || !form.identity_name"
          @click="submit"
        >
          {{ submitting ? 'Enregistrement…' : 'Enregistrer' }}
        </UIButton>
      </template>
    </UIDialog>
  </div>
</template>
