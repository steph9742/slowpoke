<script setup lang="ts">
import type { Component } from 'vue'
import { provide } from 'vue'
import ArtifactsTab from './tabs/ArtifactsTab.vue'
import type { IncidentGetData } from '~/types/elysia'
import TimelineTab from './tabs/TimelineTab.vue'
import DetailsTab from './tabs/DetailsTab.vue'
import UsersTab from './tabs/UsersTab.vue'
import ActivityTab from './tabs/ActivityTab.vue'
import ConduiteTab from './tabs/ConduiteTab.vue'
import EnqueteTab from './tabs/EnqueteTab.vue'

const activeTab = defineModel<string>('activeTab', { default: 'details' })

// Permet aux composants enfants (ex. PhishingDetails) de changer d'onglet actif
provide('setIncidentTab', (tab: string) => {
  activeTab.value = tab
})

defineProps<{
  incident: IncidentGetData
  canWrite: boolean
}>()

const tabsComponents: Record<string, Component | null> = {
  details: DetailsTab,
  activity: ActivityTab,
  conduite: ConduiteTab,
  enquete: EnqueteTab,
  timeline: TimelineTab,
  users: UsersTab,
  artifacts: ArtifactsTab,
}
</script>

<template>
  <div class="mt-4 flex-1 outline-none font-sans">
    <KeepAlive>
      <component
        :is="tabsComponents[activeTab]"
        :incident-id="incident.id"
        :incident="incident"
        :can-write="canWrite"
      />
    </KeepAlive>
  </div>
</template>
