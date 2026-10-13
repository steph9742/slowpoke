<script setup lang="ts">
import BaseIncidentForm from '~/components/incidents/new/BaseIncidentForm.vue'
import ExtensionForm from '~/components/incidents/new/ExtensionForm.vue'
import DDoSForm from '~/components/incidents/new/DDoSForm.vue'
import PhishingForm from '~/components/incidents/new/PhishingForm.vue'
import RansomwareForm from '~/components/incidents/new/RansomwareForm.vue'
import NetworkIntrusionForm from '~/components/incidents/new/NetworkIntrusionForm.vue'
import MalwareForm from '~/components/incidents/new/MalwareForm.vue'
import DataBreachForm from '~/components/incidents/new/DataBreachForm.vue'
import type { IncidentStatus, IncidentType, IncidentSeverity } from '~/types/incident'
import { UIButton } from '@slowpoke/ui'

const eden = useEden()

// Accès en écriture requis (gestionnaire/admin) — un lecteur est redirigé
const { canWrite } = await useRoles()
if (!canWrite.value) {
  await navigateTo('/incidents')
}

// `datetime-local` attend « YYYY-MM-DDTHH:mm » en heure LOCALE : passer par toISOString()
// décalerait la valeur du fuseau.
function toLocalDateTime(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const incidentData = ref({
  // Date de connaissance : obligatoire côté API. Pré-remplie à l'instant présent — le cas
  // courant est la déclaration d'un incident qu'on vient d'apprendre ; l'ajuster reste
  // possible, et c'est indispensable quand on saisit après coup.
  knowledgeAt: toLocalDateTime(new Date()),
  knowledgeEstimated: false,
  status: '' as IncidentStatus,
  type: '' as IncidentType,
  severity: '' as IncidentSeverity,
  description: '',
  source: '',
})

const detailsData = ref<NonNullable<Parameters<typeof eden.api.incidents.post>[0]['details']>>({
  type: 'other',
  data: { tags: [], customType: '', customFields: {} },
})

watch(() => incidentData.value.type, (newType) => {
  switch (newType) {
    case 'malware':
      detailsData.value = {
        data: {
          detectedAt: new Date(),
          malwareType: null,
          rntCertId: '',
          machines: [],
          iocs: [],
          c2: [],
          networkLocations: [],
          additionalInfo: {},
          users: [],
        },
        type: 'malware',
      }
      break
    case 'data_breach':
      detailsData.value = {
        data: {
          detectedAt: new Date(),
          dataCategories: [],
          exfilDestinations: [],
          recordsAffected: 0,
          users: [],
          additionalInfo: {},
        },
        type: 'data_breach',
      }
      break
    case 'ddos':
      detailsData.value = {
        data: {
          durationMinutes: 0,
          targets: [],
          sourceIps: [],
          vectors: [],
          targetPorts: [],
          peakBandwidthMbps: 0,
          startedAt: new Date(),
          endedAt: new Date(),
        },
        type: 'ddos',
      }
      break
    case 'phishing':
      detailsData.value = {
        data: {
          identities: [],
          detectedAt: new Date(),
          logs: [],
          user: {
            fullName: '',
            email: '',
            affiliation: '',
            composante: '',
          },
        },
        type: 'phishing',
      }
      break
    case 'ransomware':
      detailsData.value = {
        data: {
          rntCertId: '',
          ransomCurrency: '',
          ransomAmount: 0,
          detectedAt: new Date(),
          networkLocation: [],
          entrypoint: '',
          additionalInfo: {},
          concernedEntities: [],
          machines: [],
          iocs: [],
        },
        type: 'ransomware',
      }
      break
    case 'network_intrusion':
      detailsData.value = {
        data: {
          detectedAt: new Date(),
          intrusionType: null,
          sourceIps: [],
          compromisedAccounts: [],
          machines: [],
          networkLocations: [],
          additionalInfo: {},
        },
        type: 'network_intrusion',
      }
      break
    default:
      detailsData.value = {
        data: {
          customType: '',
          customFields: {},
          tags: [],
        },
        type: 'other',
      }
      break
  }
})

const isSubmitting = ref(false)

const submitForm = async () => {
  isSubmitting.value = true
  console.log('Submitting incident with data:', {
    ...incidentData.value,
    details: detailsData.value,
  })
  try {
    const payloadDetails = JSON.parse(JSON.stringify(detailsData.value, (key, value) => {
      // Pour les dates ou les champs optionnels qui sont vides, on préfère envoyer `undefined` ou `null`
      if (value === '') return undefined
      return value
    }))

    const res = await eden.api.incidents.post({
      ...incidentData.value,
      details: payloadDetails,
    })

    if (res.error) {
      console.error(res.error)
      alert('Erreur lors de la création de l\'incident.')
    }
    else {
      useRouter().push('/incidents')
    }
  }
  catch (err) {
    console.error(err)
  }
  finally {
    isSubmitting.value = false
  }
}

const renderExtensionForm = computed(() => {
  switch (incidentData.value.type) {
    case 'ddos':
      return DDoSForm
    case 'phishing':
      return PhishingForm
    case 'ransomware':
      return RansomwareForm
    case 'network_intrusion':
      return NetworkIntrusionForm
    case 'data_breach':
      return DataBreachForm
    case 'malware':
      return MalwareForm
    default:
      return ExtensionForm
  }
})

// `<component :is>` monte l'un des sept formulaires selon le type d'incident. TypeScript ne
// peut pas relier le formulaire choisi à la variante correspondante de `details.data` : chaque
// formulaire déclare son propre type local, et l'union renvoyée par l'API n'en est pas un
// sur-ensemble exact (`detectedAt` y est nullable). La corrélation est assurée par
// `renderExtensionForm` juste au-dessus, pas par le typage — d'où ce pont, isolé ici plutôt
// que dispersé en `any` dans chaque formulaire.
const donneesExtension = computed({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (): any => detailsData.value.data,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: (valeur: any) => {
    detailsData.value.data = valeur
  },
})

useHead({ title: 'Déclarer un incident' })
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12 relative z-0">
    <header class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <UITitle class="font-sans text-secondary-950 tracking-tight">
          Déclarer un incident
        </UITitle>
        <NuxtLink to="/incidents">
          <UIButton
            variant="ghost"
            class="text-secondary-500 hover:text-secondary-900 hover:bg-secondary-50/80 font-sans text-sm h-9 transition-colors"
          >
            Retour à la liste
          </UIButton>
        </NuxtLink>
      </div>
      <p class="text-sm text-secondary-600/90 font-sans">
        Renseignez les détails techniques et le contexte pour initier un suivi de sécurité.
      </p>
    </header>

    <div
      class="bg-white rounded-2xl border border-secondary-200/80 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)] overflow-visible relative"
    >
      <section class="p-6 sm:p-8 relative">
        <div class="absolute top-0 right-0 p-32 bg-primary-100/30 rounded-bl-full blur-3xl pointer-events-none" />
        <div class="flex items-center gap-3 mb-6 relative z-10">
          <div
            class="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center border border-primary-200 shadow-sm text-primary-700 font-mono text-xs font-bold"
          >
            01
          </div>
          <h2 class="text-lg font-medium text-secondary-950 font-sans">
            Informations principales
          </h2>
        </div>

        <BaseIncidentForm
          v-model="incidentData"
          class="relative z-10"
        />
      </section>

      <Transition
        enter-active-class="transition duration-400 ease-out"
        enter-from-class="transform -translate-y-4 opacity-0 scale-95"
        enter-to-class="transform translate-y-0 opacity-100 scale-100"
        leave-active-class="transition duration-300 ease-in"
        leave-from-class="transform translate-y-0 opacity-100 scale-100"
        leave-to-class="transform -translate-y-4 opacity-0 scale-95"
      >
        <div
          v-if="incidentData.type"
          class="overflow-visible"
        >
          <div class="h-px w-full bg-linear-to-r from-transparent via-secondary-300 to-transparent opacity-60" />
          <section class="p-6 sm:p-8 bg-secondary-50/40 relative overflow-visible">
            <div class="absolute bottom-0 left-0 p-24 bg-accent-100/20 rounded-tr-full blur-3xl pointer-events-none" />
            <div class="flex items-center gap-3 mb-6 relative z-10">
              <div
                class="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-secondary-200 shadow-sm text-secondary-600 font-mono text-xs font-bold"
              >
                02
              </div>
              <h2 class="text-lg font-medium text-secondary-950 font-sans">
                Détails de l'incident
              </h2>
            </div>

            <div class="relative z-10 transition-all duration-500">
              <component
                :is="renderExtensionForm"
                v-if="detailsData"
                v-model="donneesExtension"
              />
            </div>
          </section>
        </div>
      </Transition>

      <div
        class="p-6 sm:px-8 sm:py-5 border-t border-secondary-100 bg-secondary-50/60 flex items-center justify-end gap-3 rounded-b-2xl"
      >
        <NuxtLink to="/incidents">
          <UIButton variant="outline">
            Annuler
          </UIButton>
        </NuxtLink>
        <UIButton
          variant="primary"
          :disabled="isSubmitting || !incidentData.type || !incidentData.severity || !incidentData.status || !incidentData.knowledgeAt"
          @click="submitForm"
        >
          <span
            v-if="isSubmitting"
            class="flex items-center gap-2"
          >
            <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Création...
          </span>
          <span v-else>Soumettre l'incident</span>
        </UIButton>
      </div>
    </div>
  </div>
</template>
