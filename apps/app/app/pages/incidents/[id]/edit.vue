<script setup lang="ts">
import { isCuid } from '@paralleldrive/cuid2'
import { UIButton, useToast } from '@slowpoke/ui'
import BaseIncidentForm from '~/components/incidents/new/BaseIncidentForm.vue'
import ExtensionForm from '~/components/incidents/new/ExtensionForm.vue'
import DDoSForm from '~/components/incidents/new/DDoSForm.vue'
import PhishingForm from '~/components/incidents/new/PhishingForm.vue'
import RansomwareForm from '~/components/incidents/new/RansomwareForm.vue'
import NetworkIntrusionForm from '~/components/incidents/new/NetworkIntrusionForm.vue'
import MalwareForm from '~/components/incidents/new/MalwareForm.vue'
import DataBreachForm from '~/components/incidents/new/DataBreachForm.vue'
import { typeDisplayNames } from '~/types/incident'

definePageMeta({
  validate: (route) => {
    const id = route.params.id
    return typeof id === 'string' && isCuid(id.toLowerCase())
  },
})

const eden = useEden()
const { id } = useRoute().params as { id: string }

useHead({ title: `Modifier l'incident ${id}` })

// Accès en écriture requis (gestionnaire/admin) — un lecteur est redirigé
const { canWrite } = await useRoles()
if (!canWrite.value) {
  await navigateTo(`/incidents/${id}`)
}

const { data: incident } = await useAsyncData(`incident-edit-${id}`, async () => {
  const { data } = await eden.api.incidents({ id }).get({ query: { with: ['details', 'extension'] } })
  return data
}, { getCachedData: () => undefined })

if (!incident.value) {
  throw createError({ statusCode: 404, statusMessage: 'Incident non trouvé' })
}

const inc = incident.value!

// ISO/Date → 'YYYY-MM-DDTHH:mm' pour les inputs datetime-local (en heure locale, sinon dérive du fuseau)
const toLocal = (d?: string | Date | null) => {
  if (!d) return ''
  const date = new Date(d)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const incidentData = ref({
  status: inc.status,
  type: inc.type,
  severity: inc.severity,
  description: inc.description ?? '',
  source: inc.source ?? '',
})

// Pré-remplissage des détails par type depuis les relations chargées
function buildDetails() {
  switch (inc.type) {
    case 'malware':
      return { type: 'malware', data: {
        rntCertId: inc.malwareDetails?.rntCertId ?? '',
        malwareType: inc.malwareDetails?.malwareType ?? null,
        detectedAt: toLocal(inc.malwareDetails?.detectedAt),
        machines: inc.malwareDetails?.machines ?? [],
        iocs: inc.malwareDetails?.iocs ?? [],
        c2: inc.malwareDetails?.c2 ?? [],
        networkLocations: inc.malwareDetails?.networkLocations ?? [],
        additionalInfo: inc.malwareDetails?.additionalInfo ?? {},
        users: [],
      } }
    case 'ddos':
      return { type: 'ddos', data: {
        durationMinutes: inc.ddosDetails?.durationMinutes ?? null,
        targets: inc.ddosDetails?.targets ?? [],
        sourceIps: inc.ddosDetails?.sourceIps ?? [],
        vectors: inc.ddosDetails?.vectors ?? [],
        targetPorts: inc.ddosDetails?.targetPorts ?? [],
        peakBandwidthMbps: inc.ddosDetails?.peakBandwidthMbps ?? null,
        startedAt: toLocal(inc.ddosDetails?.startedAt),
        endedAt: toLocal(inc.ddosDetails?.endedAt),
      } }
    case 'ransomware':
      return { type: 'ransomware', data: {
        rntCertId: inc.ransomwareDetails?.rntCertId ?? '',
        detectedAt: toLocal(inc.ransomwareDetails?.detectedAt),
        entrypoint: inc.ransomwareDetails?.entrypoint ?? '',
        ransomAmount: inc.ransomwareDetails?.ransomAmount ?? null,
        ransomCurrency: inc.ransomwareDetails?.ransomCurrency ?? 'BTC',
        networkLocation: inc.ransomwareDetails?.networkLocation ?? [],
        concernedEntities: inc.ransomwareDetails?.concernedEntities ?? [],
        machines: inc.ransomwareDetails?.machines ?? [],
        iocs: inc.ransomwareDetails?.iocs ?? [],
        additionalInfo: inc.ransomwareDetails?.additionalInfo ?? {},
      } }
    case 'data_breach':
      return { type: 'data_breach', data: {
        detectedAt: toLocal(inc.dataBreachDetails?.detectedAt),
        dataCategories: inc.dataBreachDetails?.dataCategories ?? [],
        exfilDestinations: inc.dataBreachDetails?.exfilDestinations ?? [],
        recordsAffected: inc.dataBreachDetails?.recordsAffected ?? null,
        additionalInfo: inc.dataBreachDetails?.additionalInfo ?? {},
        users: [],
      } }
    case 'network_intrusion':
      return { type: 'network_intrusion', data: {
        intrusionType: inc.intrusionDetails?.intrusionType ?? null,
        sourceIps: inc.intrusionDetails?.sourceIps ?? [],
        compromisedAccounts: inc.intrusionDetails?.compromisedAccounts ?? [],
        machines: inc.intrusionDetails?.machines ?? [],
        networkLocations: inc.intrusionDetails?.networkLocations ?? [],
        detectedAt: toLocal(inc.intrusionDetails?.detectedAt),
        additionalInfo: inc.intrusionDetails?.additionalInfo ?? {},
      } }
    case 'phishing':
      return { type: 'phishing', data: {
        detectedAt: toLocal(inc.phishingDetails?.detectedAt),
        identities: [],
        logs: [],
        user: { fullName: '', email: '', affiliation: '', composante: '' },
      } }
    default:
      return { type: 'other', data: {
        customType: inc.extension?.customType ?? '',
        tags: inc.extension?.tags ?? [],
        customFields: inc.extension?.customFields ?? {},
      } }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const detailsData = ref<any>(buildDetails())

const renderForm = computed(() => {
  switch (inc.type) {
    case 'ddos': return DDoSForm
    case 'phishing': return PhishingForm
    case 'ransomware': return RansomwareForm
    case 'network_intrusion': return NetworkIntrusionForm
    case 'data_breach': return DataBreachForm
    case 'malware': return MalwareForm
    default: return ExtensionForm
  }
})

// Types dont les sous-entités ne sont pas encore persistées par le PATCH
const hasUnsavedSubEntities = ['malware', 'data_breach', 'phishing'].includes(inc.type)

const isSubmitting = ref(false)

const submit = async () => {
  if (isSubmitting.value) return
  isSubmitting.value = true
  try {
    const payloadDetails = JSON.parse(JSON.stringify(detailsData.value, (_key, value) => (value === '' ? undefined : value)))

    const { error } = await eden.api.incidents({ id }).patch({
      status: incidentData.value.status,
      severity: incidentData.value.severity,
      description: incidentData.value.description || null,
      source: incidentData.value.source || null,
      details: payloadDetails,
    })

    if (error) {
      useToast().newToast({ duration: 4000, title: 'Erreur', message: 'La modification de l\'incident a échoué.', type: 'error' })
      return
    }

    useToast().newToast({ duration: 3000, title: 'Incident modifié', message: 'Les modifications ont été enregistrées.', type: 'success' })
    await navigateTo(`/incidents/${id}`)
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
    <header class="flex items-center justify-between gap-4">
      <div>
        <UITitle class="font-sans tracking-tight">
          Édition avancée
        </UITitle>
        <p class="text-sm text-secondary-600/90 font-sans mt-1">
          Incident <span class="font-mono">{{ id }}</span> · {{ typeDisplayNames[inc.type] ?? inc.type }}
        </p>
      </div>
      <NuxtLink :to="`/incidents/${id}`">
        <UIButton
          variant="ghost"
          class="text-secondary-500 hover:text-secondary-900 text-sm h-9"
        >
          Retour à l'incident
        </UIButton>
      </NuxtLink>
    </header>

    <div class="bg-white rounded-2xl border border-secondary-200/80 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] overflow-visible">
      <section class="p-6 sm:p-8">
        <h2 class="text-lg font-medium text-secondary-950 font-sans mb-6">
          Informations principales
        </h2>
        <BaseIncidentForm
          v-model="incidentData"
          lock-type
        />
      </section>

      <div class="h-px w-full bg-linear-to-r from-transparent via-secondary-300 to-transparent opacity-60" />

      <section class="p-6 sm:p-8 bg-secondary-50/40">
        <h2 class="text-lg font-medium text-secondary-950 font-sans mb-6">
          Détails techniques
        </h2>
        <div
          v-if="hasUnsavedSubEntities"
          class="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700 font-sans"
        >
          Les champs principaux ci-dessous sont enregistrés. Les sous-entités (utilisateurs concernés, identités usurpées, logs d'activité) se gèrent dans l'onglet <span class="font-semibold">Utilisateurs</span> de l'incident.
        </div>
        <component
          :is="renderForm"
          v-model="detailsData.data"
        />
      </section>

      <div class="p-6 sm:px-8 sm:py-5 border-t border-secondary-100 bg-secondary-50/60 flex items-center justify-end gap-3 rounded-b-2xl">
        <NuxtLink :to="`/incidents/${id}`">
          <UIButton variant="outline">
            Annuler
          </UIButton>
        </NuxtLink>
        <UIButton
          variant="primary"
          :disabled="isSubmitting"
          @click="submit"
        >
          <span v-if="isSubmitting">Enregistrement…</span>
          <span v-else>Enregistrer les modifications</span>
        </UIButton>
      </div>
    </div>
  </div>
</template>
