<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { UIButton, UIDialog, UISelect, UIInput, useToast, type UISelectOption } from '@slowpoke/ui'
import type { IncidentGetData } from '~/types/elysia'
import { statusDisplayNames, severityDisplayNames, typeDisplayNames, resolutionDisplayNames, resolutionHints, type IncidentResolution } from '~/types/incident'

const props = defineProps<{
  incident: IncidentGetData
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const open = defineModel<boolean>({ default: false })

const eden = useEden()
const submitting = ref(false)

const statusItems: UISelectOption[] = Object.entries(statusDisplayNames).map(([value, label]) => ({ value, label }))
const severityItems: UISelectOption[] = Object.entries(severityDisplayNames).map(([value, label]) => ({ value, label }))
const resolutionItems: UISelectOption[] = Object.entries(resolutionDisplayNames).map(([value, label]) => ({ value, label }))

// La résolution ne se renseigne que quand l'incident est résolu ou fermé
const RESOLVED_STATUSES = ['resolved', 'closed']

// Types dont le détail porte une « date de détection » éditable depuis ce modal
const DETECTED_AT_TYPES = ['phishing', 'malware', 'ransomware', 'network_intrusion', 'data_breach']
const hasDetectedAt = computed(() => DETECTED_AT_TYPES.includes(props.incident.type))

const toLocal = (d?: string | Date | null) => {
  if (!d) return ''
  const date = new Date(d)
  // Décale en heure locale pour l'input datetime-local (sinon la date dérive du fuseau à chaque save)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
function currentDetectedAt(): string | Date | null | undefined {
  const i = props.incident
  switch (i.type) {
    case 'phishing': return i.phishingDetails?.detectedAt
    case 'malware': return i.malwareDetails?.detectedAt
    case 'ransomware': return i.ransomwareDetails?.detectedAt
    case 'network_intrusion': return i.intrusionDetails?.detectedAt
    case 'data_breach': return i.dataBreachDetails?.detectedAt
    default: return null
  }
}

const buildForm = () => ({
  status: props.incident.status,
  severity: props.incident.severity,
  description: props.incident.description ?? '',
  source: props.incident.source ?? '',
  detectedAt: toLocal(currentDetectedAt()),
  resolution: props.incident.resolution ?? '',
})

const form = ref(buildForm())
const showResolution = computed(() => RESOLVED_STATUSES.includes(form.value.status))

// Réinitialise depuis l'incident à chaque ouverture (il a pu changer entre-temps)
watch(open, (isOpen) => {
  if (!isOpen) return
  form.value = buildForm()
})

const submit = async () => {
  if (submitting.value) return
  submitting.value = true
  try {
    const payload = {
      status: form.value.status,
      severity: form.value.severity,
      description: form.value.description || null,
      source: form.value.source || null,
      resolution: showResolution.value ? ((form.value.resolution || null) as IncidentResolution | null) : null,
    }
    // Le PATCH details met à jour la date de détection du détail du type courant
    if (hasDetectedAt.value && form.value.detectedAt) {
      const withDetails = payload as Record<string, unknown>
      withDetails.details = {
        type: props.incident.type,
        data: { detectedAt: new Date(form.value.detectedAt).toISOString() },
      }
    }
    const { error } = await eden.api.incidents({ id: props.incident.id }).patch(payload)

    if (error) {
      useToast().newToast({ duration: 4000, title: 'Erreur', message: 'La modification de l\'incident a échoué.', type: 'error' })
      return
    }

    useToast().newToast({ duration: 3000, title: 'Incident modifié', message: 'Les modifications ont été enregistrées.', type: 'success' })
    emit('refresh')
    open.value = false
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UIDialog
    v-model="open"
    title="Modifier l'incident"
    :description="`Type : ${typeDisplayNames[incident.type] ?? incident.type} (non modifiable)`"
  >
    <template #content>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Statut
          </label>
          <UISelect
            v-model="form.status"
            :items="statusItems"
            :multi-select="false"
            class="h-11"
          />
        </div>

        <div class="space-y-2">
          <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Sévérité
          </label>
          <UISelect
            v-model="form.severity"
            :items="severityItems"
            :multi-select="false"
            class="h-11"
          />
        </div>

        <div
          v-if="showResolution"
          class="space-y-2 md:col-span-2"
        >
          <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Résolution
          </label>
          <UISelect
            v-model="form.resolution"
            :items="resolutionItems"
            :multi-select="false"
            class="h-11"
            placeholder="Choisir une résolution (vrai/faux positif…)"
          />
          <!-- Ce que la résolution IMPLIQUE : c'est ce qui distingue « bénin » de
               « activité légitime », pas la nuance de vocabulaire. -->
          <p
            v-if="form.resolution && resolutionHints[form.resolution as IncidentResolution]"
            class="text-[11px] text-gray-500"
          >
            {{ resolutionHints[form.resolution as IncidentResolution] }}
          </p>
          <div
            v-if="form.resolution === 'legitimate'"
            class="flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50/60 p-2.5 text-xs text-primary-900"
          >
            <Icon
              name="lucide:shield-off"
              class="mt-0.5 size-3.5 shrink-0"
            />
            <span>
              Pensez à déclarer la <strong>liste blanche</strong> correspondante depuis la fiche
              de l'incident — sinon l'exclusion posée dans l'outil n'apparaîtra nulle part.
            </span>
          </div>
        </div>

        <div class="space-y-2 md:col-span-2">
          <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Description
          </label>
          <UIInput
            v-model="form.description"
            placeholder="Description technique de l'incident"
            class="h-11"
          />
        </div>

        <div class="space-y-2 md:col-span-2">
          <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Source
          </label>
          <UIInput
            v-model="form.source"
            placeholder="IP, domaine, artefact lié…"
            class="h-11"
          />
        </div>

        <div
          v-if="hasDetectedAt"
          class="space-y-2 md:col-span-2"
        >
          <label class="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest font-mono">
            Date de détection
          </label>
          <UIInput
            v-model="form.detectedAt"
            type="datetime-local"
            class="h-11"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <NuxtLink
        v-if="incident.type !== 'phishing'"
        :to="`/incidents/${incident.id}/edit`"
        class="mr-auto inline-flex items-center gap-1 text-xs text-secondary-500 hover:text-primary-600 font-sans transition-colors"
        @click="open = false"
      >
        <Icon
          name="lucide:sliders-horizontal"
          class="size-3.5"
        />
        Édition avancée
      </NuxtLink>
      <UIButton
        variant="outline"
        @click="open = false"
      >
        Annuler
      </UIButton>
      <UIButton
        variant="primary"
        :disabled="submitting"
        @click="submit"
      >
        {{ submitting ? 'Enregistrement…' : 'Enregistrer' }}
      </UIButton>
    </template>
  </UIDialog>
</template>
