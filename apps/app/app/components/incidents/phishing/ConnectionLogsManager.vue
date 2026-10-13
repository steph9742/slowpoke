<script setup lang="ts">
import { ref } from 'vue'
import { UIButton, UIDialog, UIInput, UISelect, useToast, type UISelectOption } from '@slowpoke/ui'

const props = defineProps<{
  incidentId: string
  userId: string
}>()

const eden = useEden()

const { data: logs, refresh } = useAsyncData(`phishing-logs-${props.incidentId}-${props.userId}`, async () => {
  const { data } = await eden.api.phishing({ incidentId: props.incidentId }).users({ userId: props.userId }).logs.get()
  return data ?? []
}, { getCachedData: () => undefined })

type Log = NonNullable<typeof logs.value>[number]
type ActionType = 'messages_sent' | 'messages_deleted' | 'contacts_added' | 'identity_modified' | 'other'

const actionTypes: UISelectOption[] = [
  { value: 'messages_sent', label: 'Messages envoyés' },
  { value: 'messages_deleted', label: 'Messages supprimés' },
  { value: 'contacts_added', label: 'Contacts ajoutés' },
  { value: 'identity_modified', label: 'Identité modifiée' },
  { value: 'other', label: 'Autre' },
]
const actionLabel = (t: string) => actionTypes.find(a => a.value === t)?.label ?? t

const toLocal = (d?: string | Date | null) => {
  if (!d) return ''
  const date = new Date(d)
  // Décale en heure locale pour l'input datetime-local (sinon la date dérive du fuseau à chaque save)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const fmt = (d?: string | Date | null) => (d ? new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : null)
const period = (start?: string | Date | null, end?: string | Date | null) => {
  const s = fmt(start)
  const e = fmt(end)
  if (s && e) return `du ${s} au ${e}`
  if (s) return `dès le ${s}`
  return ''
}

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const submitting = ref(false)
const form = ref<{
  ipAddress: string
  countryCode: string
  countryName: string
  activityStart: string
  activityEnd: string
  actions: { actionType: ActionType, amount: number | null, label: string }[]
}>({ ipAddress: '', countryCode: '', countryName: '', activityStart: '', activityEnd: '', actions: [] })

function reset() {
  form.value = { ipAddress: '', countryCode: '', countryName: '', activityStart: '', activityEnd: '', actions: [] }
}
function openAdd() {
  editingId.value = null
  reset()
  modalOpen.value = true
}
function openEdit(l: Log) {
  editingId.value = l.id
  form.value = {
    ipAddress: l.ipAddress,
    countryCode: l.countryCode ?? '',
    countryName: l.countryName ?? '',
    activityStart: toLocal(l.activityStart),
    activityEnd: toLocal(l.activityEnd),
    actions: (l.actions ?? []).map(a => ({ actionType: a.actionType, amount: a.amount, label: a.label ?? '' })),
  }
  modalOpen.value = true
}

function addAction() {
  form.value.actions.push({ actionType: 'other', amount: null, label: '' })
}
function removeAction(idx: number) {
  form.value.actions.splice(idx, 1)
}

async function submit() {
  if (submitting.value || !form.value.ipAddress) return
  submitting.value = true
  try {
    const body = {
      ipAddress: form.value.ipAddress,
      countryCode: form.value.countryCode || null,
      countryName: form.value.countryName || null,
      activityStart: form.value.activityStart || undefined,
      activityEnd: form.value.activityEnd || null,
      actions: form.value.actions.map(a => ({ actionType: a.actionType, amount: a.amount, label: a.label || null })),
    }
    const res = editingId.value
      ? await eden.api.phishing({ incidentId: props.incidentId }).users({ userId: props.userId }).logs({ id: editingId.value }).patch(body)
      : await eden.api.phishing({ incidentId: props.incidentId }).users({ userId: props.userId }).logs.post(body)

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

async function remove(l: Log) {
  if (!confirm(`Supprimer le log d'activité ${l.ipAddress} ?`)) return
  const res = await eden.api.phishing({ incidentId: props.incidentId }).users({ userId: props.userId }).logs({ id: l.id }).delete()
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
      v-if="logs?.length"
      class="space-y-2"
    >
      <li
        v-for="l in logs"
        :key="l.id"
        class="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-zinc-200 bg-white shadow-sm"
      >
        <div class="min-w-0 space-y-1">
          <p class="font-mono font-medium text-zinc-900 truncate">
            {{ l.ipAddress }}
            <span
              v-if="l.countryCode"
              class="ml-1 text-xs text-zinc-500"
            >({{ l.countryCode }})</span>
          </p>
          <p
            v-if="period(l.activityStart, l.activityEnd)"
            class="text-xs text-zinc-500"
          >
            {{ period(l.activityStart, l.activityEnd) }}
          </p>
          <div
            v-if="l.actions?.length"
            class="flex flex-wrap gap-1"
          >
            <span
              v-for="(a, ai) in l.actions"
              :key="ai"
              class="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-mono text-zinc-600"
            >
              {{ a.actionType === 'other' && a.label ? a.label : actionLabel(a.actionType) }}<template v-if="a.amount != null"> ({{ a.amount }})</template>
            </span>
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <UIButton
            variant="ghost"
            size="icon"
            class="text-zinc-500 hover:text-primary-600"
            @click="openEdit(l)"
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
            @click="remove(l)"
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
      Aucun log d'activité enregistré.
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
      Ajouter un log d'activité
    </button>

    <UIDialog
      v-model="modalOpen"
      :title="editingId ? 'Modifier le log d\'activité' : 'Ajouter un log d\'activité'"
    >
      <template #content>
        <div class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5 sm:col-span-2">
              <label class="text-sm font-medium text-secondary-700">Adresse IP *</label>
              <UIInput
                v-model="form.ipAddress"
                placeholder="Ex : 203.0.113.42"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-secondary-700">Code pays</label>
              <UIInput
                v-model="form.countryCode"
                placeholder="Ex : FR"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-secondary-700">Pays</label>
              <UIInput
                v-model="form.countryName"
                placeholder="Ex : France"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-secondary-700">Début d'activité</label>
              <UIInput
                v-model="form.activityStart"
                type="datetime-local"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-secondary-700">Fin d'activité</label>
              <UIInput
                v-model="form.activityEnd"
                type="datetime-local"
              />
            </div>
          </div>

          <div class="space-y-2 border-t border-secondary-100 pt-4">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-secondary-700">Actions</span>
              <UIButton
                variant="ghost"
                size="sm"
                class="text-primary-600"
                @click="addAction"
              >
                <Icon
                  name="lucide:plus"
                  class="size-4"
                /> Ajouter
              </UIButton>
            </div>
            <div
              v-for="(a, ai) in form.actions"
              :key="ai"
              class="space-y-1.5"
            >
              <div class="flex items-end gap-2">
                <div class="flex-1 space-y-1">
                  <label class="text-xs text-secondary-500">Type</label>
                  <UISelect
                    v-model="a.actionType"
                    :items="actionTypes"
                    :multi-select="false"
                  />
                </div>
                <div class="w-24 space-y-1">
                  <label class="text-xs text-secondary-500">Nombre</label>
                  <UIInput
                    v-model="a.amount"
                    type="number"
                    placeholder="—"
                  />
                </div>
                <UIButton
                  variant="ghost"
                  size="icon"
                  class="text-secondary-400 hover:text-red-600"
                  @click="removeAction(ai)"
                >
                  <Icon
                    name="lucide:x"
                    class="size-4"
                  />
                </UIButton>
              </div>
              <UIInput
                v-if="a.actionType === 'other'"
                v-model="a.label"
                placeholder="Décrire l'action (ex : 27 messages supprimés)"
              />
            </div>
            <p
              v-if="!form.actions.length"
              class="text-xs text-secondary-400 italic"
            >
              Aucune action.
            </p>
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
          :disabled="submitting || !form.ipAddress"
          @click="submit"
        >
          {{ submitting ? 'Enregistrement…' : 'Enregistrer' }}
        </UIButton>
      </template>
    </UIDialog>
  </div>
</template>
