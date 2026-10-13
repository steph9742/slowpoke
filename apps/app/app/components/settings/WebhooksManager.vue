<script setup lang="ts">
import { ref } from 'vue'
import { UIButton, UIDialog, UIInput, useToast } from '@slowpoke/ui'

const eden = useEden()
const toast = useToast()

const { data: webhooks, refresh } = await useAsyncData('webhooks', async () => {
  const { data } = await eden.api.webhooks.get()
  return data ?? []
}, { getCachedData: () => undefined })

type Webhook = NonNullable<typeof webhooks.value>[number]

// Événements déclencheurs proposés (= types de log de la timeline)
const EVENT_OPTIONS = [
  { value: 'created', label: 'Incident créé' },
  { value: 'status_change', label: 'Changement de statut' },
  { value: 'update', label: 'Mise à jour' },
  { value: 'comment', label: 'Commentaire' },
  { value: 'user_added', label: 'Utilisateur ajouté' },
  { value: 'user_removed', label: 'Utilisateur retiré' },
  { value: 'artifact_added', label: 'Artéfact ajouté' },
  { value: 'artifact_removed', label: 'Artéfact retiré' },
  { value: 'closed', label: 'Clôturé' },
  { value: 'exclusion_appariee', label: 'Liste blanche appariée à une règle' },
  { value: 'exclusion_detachee', label: 'Liste blanche détachée de sa règle' },
  { value: 'revue_liste_blanche_proche', label: 'Revue de liste blanche proche (7 jours)' },
  { value: 'revue_liste_blanche_depassee', label: 'Revue de liste blanche dépassée' },
  { value: 'alerte_nouvelle', label: 'Alerte reçue (nouvelle série)' },
  { value: 'alerte_ecartee', label: 'Alerte écartée' },
  { value: 'alerte_escaladee', label: 'Alerte escaladée en incident' },
] as const
const eventLabel = (v: string) => EVENT_OPTIONS.find(e => e.value === v)?.label ?? v

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const submitting = ref(false)
const testingId = ref<string | null>(null)
const form = ref({ name: '', url: '', events: [] as string[], secret: '', enabled: true })

function openAdd() {
  editingId.value = null
  form.value = { name: '', url: '', events: [], secret: '', enabled: true }
  modalOpen.value = true
}
function openEdit(w: Webhook) {
  editingId.value = w.id
  form.value = { name: w.name, url: w.url, events: [...w.events], secret: w.secret ?? '', enabled: w.enabled }
  modalOpen.value = true
}
function toggleEvent(value: string) {
  form.value.events = form.value.events.includes(value)
    ? form.value.events.filter(e => e !== value)
    : [...form.value.events, value]
}

const canSubmit = () => !!form.value.name && /^https?:\/\//.test(form.value.url) && form.value.events.length > 0

async function submit() {
  if (submitting.value || !canSubmit()) return
  submitting.value = true
  try {
    const body = {
      name: form.value.name,
      url: form.value.url,
      events: form.value.events,
      secret: form.value.secret || null,
      enabled: form.value.enabled,
    }
    const res = editingId.value
      ? await eden.api.webhooks({ id: editingId.value }).patch(body)
      : await eden.api.webhooks.post(body)
    if (res.error) {
      toast.newToast({ duration: 4000, title: 'Erreur', message: 'L\'enregistrement a échoué.', type: 'error' })
      return
    }
    modalOpen.value = false
    await refresh()
  }
  finally {
    submitting.value = false
  }
}

async function toggleEnabled(w: Webhook) {
  const res = await eden.api.webhooks({ id: w.id }).patch({ enabled: !w.enabled })
  if (res.error) {
    toast.newToast({ duration: 4000, title: 'Erreur', message: 'Action impossible.', type: 'error' })
    return
  }
  await refresh()
}

async function remove(w: Webhook) {
  if (!confirm(`Supprimer le webhook « ${w.name} » ?`)) return
  const res = await eden.api.webhooks({ id: w.id }).delete()
  if (res.error) {
    toast.newToast({ duration: 4000, title: 'Erreur', message: 'La suppression a échoué.', type: 'error' })
    return
  }
  await refresh()
}

async function test(w: Webhook) {
  if (testingId.value) return
  testingId.value = w.id
  try {
    const res = await eden.api.webhooks({ id: w.id }).test.post()
    if (res.error) {
      toast.newToast({ duration: 5000, title: 'Échec du test', message: String(res.error.value ?? 'Le webhook n\'a pas répondu.'), type: 'error' })
      return
    }
    const ok = res.data?.ok
    toast.newToast({
      duration: 4000,
      title: ok ? 'Webhook joignable ✓' : `Réponse HTTP ${res.data?.status}`,
      message: ok ? 'Le payload de test a été reçu.' : 'Le endpoint a répondu avec une erreur.',
      type: ok ? 'success' : 'error',
    })
  }
  finally {
    testingId.value = null
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <p class="text-sm font-medium text-secondary-800">
        Webhooks sortants
      </p>
      <UIButton
        variant="secondary"
        size="sm"
        @click="openAdd"
      >
        <Icon
          name="lucide:plus"
          class="size-4"
        />
        <span class="ml-1">Ajouter</span>
      </UIButton>
    </div>

    <ul
      v-if="webhooks?.length"
      class="space-y-2"
    >
      <li
        v-for="w in webhooks"
        :key="w.id"
        class="rounded-xl border border-gray-200 bg-white shadow-sm p-3.5"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium text-secondary-900 flex items-center gap-2">
              <span
                class="size-2 rounded-full shrink-0"
                :class="w.enabled ? 'bg-emerald-500' : 'bg-gray-300'"
              />
              {{ w.name }}
            </p>
            <p class="text-xs text-secondary-500 truncate font-mono">
              {{ w.url }}
            </p>
            <div class="flex flex-wrap gap-1 mt-1.5">
              <span
                v-for="ev in w.events"
                :key="ev"
                class="inline-flex items-center rounded-md bg-secondary-100 px-1.5 py-0.5 text-[11px] text-secondary-600"
              >
                {{ eventLabel(ev) }}
              </span>
              <span
                v-if="w.secret"
                class="inline-flex items-center gap-0.5 rounded-md bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 text-[11px] text-amber-700"
              >
                <Icon
                  name="lucide:lock"
                  class="size-3"
                /> signé
              </span>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <UIButton
              variant="ghost"
              size="sm"
              :disabled="testingId === w.id"
              class="text-secondary-500 hover:text-primary-600"
              @click="test(w)"
            >
              {{ testingId === w.id ? '…' : 'Tester' }}
            </UIButton>
            <UIButton
              variant="ghost"
              size="icon"
              class="text-secondary-500 hover:text-primary-600"
              @click="toggleEnabled(w)"
            >
              <Icon
                :name="w.enabled ? 'lucide:toggle-right' : 'lucide:toggle-left'"
                class="size-4"
              />
            </UIButton>
            <UIButton
              variant="ghost"
              size="icon"
              class="text-secondary-500 hover:text-primary-600"
              @click="openEdit(w)"
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
              @click="remove(w)"
            >
              <Icon
                name="lucide:trash-2"
                class="size-4"
              />
            </UIButton>
          </div>
        </div>
      </li>
    </ul>

    <p
      v-else
      class="text-sm text-secondary-400 italic py-2"
    >
      Aucun webhook. Ajoute une URL n8n pour relayer les événements d'incident.
    </p>

    <UIDialog
      v-model="modalOpen"
      :title="editingId ? 'Modifier le webhook' : 'Nouveau webhook'"
    >
      <template #content>
        <div class="space-y-4">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-secondary-700">Nom *</label>
            <UIInput
              v-model="form.name"
              placeholder="Ex : n8n — alertes incidents"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-secondary-700">URL *</label>
            <UIInput
              v-model="form.url"
              placeholder="https://n8n.exemple.com/webhook/..."
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-secondary-700">Déclencher sur *</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <label
                v-for="ev in EVENT_OPTIONS"
                :key="ev.value"
                class="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 cursor-pointer hover:bg-gray-50 text-sm"
              >
                <input
                  type="checkbox"
                  class="size-4 accent-primary-600"
                  :checked="form.events.includes(ev.value)"
                  @change="toggleEvent(ev.value)"
                >
                {{ ev.label }}
              </label>
            </div>
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-secondary-700">Secret (optionnel)</label>
            <UIInput
              v-model="form.secret"
              placeholder="Signe le payload en HMAC-SHA256 (header X-Slowpoke-Signature)"
            />
          </div>
          <label class="flex items-center gap-2 text-sm text-secondary-700 cursor-pointer">
            <input
              v-model="form.enabled"
              type="checkbox"
              class="size-4 accent-primary-600"
            >
            Actif
          </label>
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
          :disabled="submitting || !canSubmit()"
          @click="submit"
        >
          {{ submitting ? 'Enregistrement…' : 'Enregistrer' }}
        </UIButton>
      </template>
    </UIDialog>
  </div>
</template>
