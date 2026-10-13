<script setup lang="ts">
import { isCuid } from '@paralleldrive/cuid2'
import IncidentTabs from '~/components/incidents/IncidentTabs.vue'
import IncidentTabContent from '~/components/incidents/IncidentTabContent.vue'
import { UISkeleton, UIButton, UIDropdownMenu, useToast } from '@slowpoke/ui'
import type { UIDropdownMenuSection } from '@slowpoke/ui/src/components/dropdown/UIDropdownMenu'
import SubscribeOptions from '~/components/incidents/SubscribeOptions.vue'
import PilotButton from '~/components/incidents/PilotButton.vue'
import ExclusionModal from '~/components/incidents/ExclusionModal.vue'
import { typeDisplayNames } from '~/types/incident'
import EditIncidentModal from '~/components/incidents/EditIncidentModal.vue'

definePageMeta({
  validate: (route) => {
    const id = route.params.id
    return typeof id === 'string' && isCuid(id.toLowerCase())
  },
})

const eden = useEden()
const { id } = useRoute().params as { id: string }

// Deux onglets ouverts sur deux incidents doivent se distinguer : l'identifiant d'abord,
// rejoint par le type dès que la fiche est chargée.
useHead({ title: () => (incident.value ? `${typeDisplayNames[incident.value.type as keyof typeof typeDisplayNames] ?? incident.value.type} ${id}` : `Incident ${id}`) })

const { data: incident, refresh: refreshIncident } = await useAsyncData('incident', async () => {
  const { data } = await eden.api.incidents({ id }).get({ query: { with: ['createdByUser', 'createdBySvc', 'extension', 'subscribers', 'details'] } })

  return data
}, { getCachedData: () => undefined })

const tabsValue = ref('details')
const editOpen = ref(false)

// Actions d'écriture (modifier / archiver) réservées aux gestionnaires et admins
const { canWrite } = await useRoles()

const archivage = ref(false)
const exclusionOuverte = ref(false)
// ARCHIVER, et non plus supprimer : l'incident quitte les listes et les statistiques, mais
// son dossier est conservé et un administrateur peut le rétablir. Le motif est exigé.
async function archiverIncident() {
  if (archivage.value) return

  const motif = prompt('Archiver cet incident ?\n\nIl disparaîtra des listes et des statistiques. Son dossier est conservé, et un administrateur pourra le rétablir.\n\nMotif de l\'archivage :')
  if (motif === null) return
  if (!motif.trim()) {
    useToast().newToast({ duration: 4000, title: 'Motif obligatoire', message: 'Indiquez pourquoi l\'incident est archivé.', type: 'error' })
    return
  }

  archivage.value = true
  try {
    const { error } = await eden.api.incidents({ id }).delete({ motif: motif.trim() })
    if (error) {
      const detail = (error.value as { message?: string } | undefined)?.message
      useToast().newToast({ duration: 5000, title: 'Archivage impossible', message: detail || 'Le serveur a refusé la demande.', type: 'error' })
      return
    }
    useToast().newToast({ duration: 3000, title: 'Incident archivé', message: 'Il n\'apparaît plus dans les listes.', type: 'success' })
    await navigateTo('/incidents')
  }
  finally {
    archivage.value = false
  }
}

// Ce qui ne se fait qu'une fois de temps en temps — ou qu'on ne défait pas.
const actionsSecondaires = computed<UIDropdownMenuSection[]>(() => [
  {
    title: 'Suites de l\'incident',
    icon: 'ph:shield-slash-duotone',
    items: [
      { label: 'Déclarer une liste blanche', onClick: () => { exclusionOuverte.value = true } },
    ],
  },
  {
    title: 'Dossier',
    icon: 'ph:archive-duotone',
    items: [
      { label: archivage.value ? 'Archivage…' : 'Archiver l\'incident', onClick: archiverIncident, disabled: archivage.value, destructive: true },
    ],
  },
])
</script>

<template>
  <div class="p-3 sm:p-5">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-3 mb-5 sm:gap-x-5 sm:mb-8">
      <UITitle class="min-w-0 break-all">
        {{ incident?.id }}
      </UITitle>
      <IncidentTabs
        v-model:active-tab="tabsValue"
        :type="incident?.type"
        :incident-id="incident?.id"
      />
      <div
        v-if="incident"
        class="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto"
      >
        <PilotButton
          :incident-id="incident.id"
          :pilot="incident.pilot"
          :pilot-name="incident.pilotUser?.name"
          @changed="refreshIncident"
        />
        <SubscribeOptions
          :incident="incident"
          @refresh="refreshIncident"
        />
        <template v-if="canWrite">
          <UIButton
            variant="outline"
            size="md"
            class="group text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
            @click="editOpen = true"
          >
            <Icon
              name="lucide:pencil-line"
              class="size-4"
            />
            <span class="ml-1.5 font-medium tracking-tight">Modifier</span>
          </UIButton>

          <!-- Actions occasionnelles ou irréversibles derrière un menu : elles n'ont pas à
               peser autant que « Modifier » dans le bandeau. -->
          <UIDropdownMenu :items="actionsSecondaires">
            <UIButton
              variant="outline"
              size="md"
              title="Autres actions"
              aria-label="Autres actions"
            >
              <Icon
                name="lucide:ellipsis"
                class="size-4"
              />
            </UIButton>
          </UIDropdownMenu>
        </template>
      </div>
    </div>

    <IncidentTabContent
      v-if="incident"
      v-model:active-tab="tabsValue"
      :incident="incident"
      :can-write="canWrite"
    />
    <div v-else>
      <UISkeleton class="w-full h-6 mb-4" />
      <UISkeleton class="w-full h-4 mb-2" />
    </div>

    <EditIncidentModal
      v-if="incident"
      v-model="editOpen"
      :incident="incident"
      @refresh="refreshIncident"
    />

    <ExclusionModal
      v-if="incident && canWrite"
      v-model="exclusionOuverte"
      :incident-id="incident.id"
      @created="refreshIncident"
    />
  </div>
</template>
