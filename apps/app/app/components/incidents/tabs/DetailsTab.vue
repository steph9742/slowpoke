<script setup lang="ts">
import type { IncidentGetData } from '~/types/elysia'
import { typeDisplayNames, statusDisplayNames, severityDisplayNames, resolutionDisplayNames } from '~/types/incident'
import PhishingDetails from '../phishing/PhishingDetails.vue'
import MalwareDetails from '../malware/MalwareDetails.vue'
import DdosDetails from '../ddos/DdosDetails.vue'
import NetworkDetails from '../network/NetworkDetails.vue'
import DatabreachDetails from '../databreach/DatabreachDetails.vue'
import RansomDetails from '../ransom/RansomDetails.vue'
import ExtensionDetails from '../ExtensionDetails.vue'
import { computed } from 'vue'
import type { Component } from 'vue'
// Import explicite : dans `components/incidents/`, l'auto-import nommerait ce composant
// `IncidentsIncidentMachines`.
import IncidentMachines from '../IncidentMachines.vue'
import DejaVu from '../DejaVu.vue'

// `canWrite` vient du parent : un `await` ici rendrait le composant asynchrone, et cet
// onglet étant celui par défaut, le rendu serveur échouerait à chaque rafraîchissement.
const props = defineProps<{
  incident: IncidentGetData
  canWrite: boolean
}>()

const detailPresent = computed(() => ({
  phishing: props.incident.phishingDetails,
  malware: props.incident.malwareDetails,
  ransomware: props.incident.ransomwareDetails,
  ddos: props.incident.ddosDetails,
  network_intrusion: props.incident.intrusionDetails,
  data_breach: props.incident.dataBreachDetails,
} as Record<string, unknown>)[props.incident.type] != null)

const dateFr = (d?: string | Date | null) => d
  ? new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'long', timeStyle: 'short' }).format(new Date(d))
  : null

// Le motif de clôture du SOC, quand la cellule n'a pas encore posé sa résolution. Ses mots
// décrivent SA clôture : « sans risque de sécurité » a déjà voulu dire « la machine a été
// éteinte ». Les afficher tels quels vaut mieux qu'en déduire « bénin » à sa place.
const motifSoc = computed(() => {
  const champs = props.incident.extension?.customFields as Record<string, string> | null | undefined
  return champs?.motif_cloture_soc ?? null
})

// Sans date de connaissance (incident antérieur au champ), on le dit — plutôt que d'afficher
// une autre date à sa place, ce qui reproduirait exactement le défaut qu'on corrige.
const knowledgeAtLabel = computed(() => dateFr(props.incident.knowledgeAt) ?? 'Non renseignée')
const referredAtLabel = computed(() => dateFr(props.incident.referredAt))

const renderDetails: Partial<Record<IncidentGetData['type'], Component>> = {
  phishing: PhishingDetails,
  malware: MalwareDetails,
  ransomware: RansomDetails,
  ddos: DdosDetails,
  network_intrusion: NetworkDetails,
  data_breach: DatabreachDetails,
}
</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <!-- La description était saisie et stockée, mais ne s'affichait que dans la liste :
         on ouvrait une fiche sans jamais lire ce qui y avait été écrit. -->
    <div
      v-if="incident.description"
      class="p-6 rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md shadow-sm"
    >
      <UITitle
        level="3"
        class="mb-3 text-primary-600 font-sans tracking-tight"
      >
        Description
      </UITitle>
      <MarkdownText :texte="incident.description" />
    </div>

    <div class="p-6 rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md shadow-sm">
      <UITitle
        level="3"
        class="mb-3 text-primary-600 font-sans tracking-tight"
      >
        Machines concernées
      </UITitle>
      <IncidentMachines
        :incident-id="incident.id"
        :modifiable="canWrite"
      />
    </div>

    <!-- Ce que les valeurs de cet incident révèlent ailleurs : même IP, même compte, même
         empreinte. Lecture seule, ouverte à tous les rôles qui voient la fiche. -->
    <div class="p-6 rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md shadow-sm">
      <DejaVu :incident-id="incident.id" />
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="p-6 rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md shadow-sm">
        <UITitle
          level="3"
          class="mb-4 text-primary-600 font-sans tracking-tight"
        >
          Vue d'ensemble
        </UITitle>
        <div class="space-y-4">
          <div class="flex justify-between border-b border-primary-200/40 pb-2">
            <span class="text-secondary-600 text-sm font-medium">Type d'alerte</span>
            <span class="font-mono text-sm tracking-tight text-text">{{ typeDisplayNames[incident.type] || incident.type
            }}</span>
          </div>
          <div class="flex justify-between border-b border-primary-200/40 pb-2">
            <span class="text-secondary-600 text-sm font-medium">État actuel</span>
            <span class="font-mono text-sm tracking-tight flex items-center gap-2">
              <span
                class="w-2 h-2 rounded-full"
                :class="[incident.status === 'open' ? 'bg-red-500' : 'bg-green-500']"
              />
              {{ statusDisplayNames[incident.status] || incident.status }}
            </span>
          </div>
          <div class="flex justify-between border-b border-primary-200/40 pb-2">
            <span class="text-secondary-600 text-sm font-medium">Sévérité technique</span>
            <span
              class="font-mono text-sm tracking-tight"
              :class="[incident.severity === 'critical' ? 'text-red-500 font-bold' : '']"
            >
              {{ severityDisplayNames[incident.severity] || incident.severity }}
            </span>
          </div>
          <!-- CONNAISSANCE PAR L'ÉTABLISSEMENT — point de départ des échéances
               réglementaires. Une date estimée est signalée comme telle : une valeur
               déduite ne doit pas se lire comme un fait établi. -->
          <div class="flex justify-between border-b border-primary-200/40 pb-2 gap-3">
            <span class="text-secondary-600 text-sm font-medium shrink-0">Connaissance</span>
            <span class="font-mono text-sm tracking-tight text-right min-w-0">
              {{ knowledgeAtLabel }}
              <span
                v-if="incident.knowledgeEstimated"
                class="ml-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[11px] font-medium bg-amber-100 text-amber-800 align-middle"
                title="Cette date est une approximation : elle n'est pas connue avec certitude."
              >
                <Icon
                  name="lucide:circle-help"
                  class="size-3"
                /> estimée
              </span>
            </span>
          </div>
          <div
            v-if="referredAtLabel"
            class="flex justify-between border-b border-primary-200/40 pb-2 gap-3"
          >
            <span class="text-secondary-600 text-sm font-medium shrink-0">Saisine de la cellule</span>
            <span class="font-mono text-sm tracking-tight text-right">{{ referredAtLabel }}</span>
          </div>
          <!-- Clos chez le SOC pour un motif qui ne conclut pas à notre place : on montre
               ses mots, et on dit que la résolution manque encore. -->
          <div
            v-if="!incident.resolution && motifSoc"
            class="flex justify-between border-b border-primary-200/40 pb-2 gap-3"
          >
            <span class="text-secondary-600 text-sm font-medium shrink-0">Résolution</span>
            <span class="text-sm text-right text-amber-700">
              à poser — clos chez le SOC pour « {{ motifSoc }} »
            </span>
          </div>
          <div
            v-if="incident.resolution"
            class="flex justify-between border-b border-primary-200/40 pb-2"
          >
            <span class="text-secondary-600 text-sm font-medium">Résolution</span>
            <span
              class="font-mono text-sm tracking-tight"
              :class="[incident.resolution === 'false_positive' ? 'text-amber-600 font-semibold' : 'text-text']"
            >
              {{ incident.resolution ? (resolutionDisplayNames[incident.resolution] || incident.resolution) : '' }}
            </span>
          </div>
        </div>
      </div>

      <ExtensionDetails
        v-if="incident.extension"
        :extension="incident.extension"
      />
    </div>
    <!-- Un incident peut n'avoir aucun détail : import qui n'en a pas produit, création
         sans volet technique. Les composants de détail supposent le leur présent. -->
    <component
      v-if="renderDetails[incident.type] && detailPresent"
      :is="renderDetails[incident.type]"
      :phishing-details="incident.phishingDetails"
      :affected-users="incident.affectedUsers"
      :malware-details="incident.malwareDetails"
      :ddos-details="incident.ddosDetails"
      :network-details="incident.intrusionDetails"
      :databreach-details="incident.dataBreachDetails"
      :ransomware-details="incident.ransomwareDetails"
    />
  </div>
</template>
