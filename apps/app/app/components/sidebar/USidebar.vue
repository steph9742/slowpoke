<script setup lang="ts">
import { SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupItem, SidebarItem, SidebarSection, SidebarSectionLabel } from '@slowpoke/ui'
import USidebarUser from './USidebarUser.vue'

const eden = useEden()
const session = await useSSRAuth()
const { isAdmin } = await useRoles()
const route = useRoute()

// Décompte des alertes à trier, pour la pastille. Une lecture légère, et une file qui se
// remplit sans que personne ne le voie est une file morte.
const { data: etatAlertes } = await useAsyncData('alertes-a-trier', async () => {
  const { data } = await eden.api.alerts.etat.get()
  return data ?? null
}, { getCachedData: () => undefined })
const aTrier = computed(() => {
  const e = etatAlertes.value
  return e ? e.nouvelles + e.enCours : 0
})

const incidentView = computed(() => {
  const view = route.query.view
  return typeof view === 'string' ? view : null
})
</script>

<template>
  <SidebarHeader class="pb-4">
    <div class="flex items-center gap-2 px-2">
      <div class="w-8 h-8 rounded-lg bg-primary-600 shadow-md shadow-primary-500/20 flex items-center justify-center">
        <Icon
          name="lucide:shield"
          class="text-white w-5 h-5"
        />
      </div>
      <h1 class="text-xl font-bold font-sans tracking-tight text-secondary-900">
        Incidents
      </h1>
    </div>
  </SidebarHeader>
  <SidebarContent>
    <SidebarSection>
      <SidebarItem :active="route.path === '/'">
        <NuxtLink href="/">
          <Icon name="lucide:layout-dashboard" />
          Tableau de bord
        </NuxtLink>
      </SidebarItem>
      <SidebarItem :active="route.path === '/timeline'">
        <NuxtLink href="/timeline">
          <Icon name="lucide:shuffle" />
          Timeline
        </NuxtLink>
      </SidebarItem>
    </SidebarSection>
    <SidebarSection>
      <SidebarSectionLabel>Incidents</SidebarSectionLabel>
      <SidebarGroup>
        <SidebarGroupItem :active="route.path === '/alertes'">
          <NuxtLink href="/alertes">
            <Icon name="lucide:inbox" />
            Alertes
            <!-- Le nombre d'alertes à trier : c'est l'indicateur qui fait vivre le dispositif.
                 Sans lui, la file se remplit sans que personne n'ait de raison de l'ouvrir. -->
            <span
              v-if="aTrier"
              class="ml-auto rounded-full bg-primary-600 px-1.5 min-w-5 text-center text-[11px] font-semibold text-white"
            >{{ aTrier }}</span>
          </NuxtLink>
        </SidebarGroupItem>
        <SidebarGroupItem :active="route.path === '/incidents' && !incidentView">
          <NuxtLink href="/incidents">
            <Icon name="lucide:list" />
            Tous les incidents
          </NuxtLink>
        </SidebarGroupItem>
        <SidebarGroupItem :active="route.path === '/exclusions'">
          <NuxtLink href="/exclusions">
            <Icon name="lucide:shield-off" />
            Listes blanches
          </NuxtLink>
        </SidebarGroupItem>
        <SidebarGroupItem :active="route.path === '/indicateurs'">
          <NuxtLink href="/indicateurs">
            <Icon name="lucide:search" />
            Chercher un indicateur
          </NuxtLink>
        </SidebarGroupItem>
      </SidebarGroup>
    </SidebarSection>
    <SidebarSection>
      <SidebarSectionLabel>Statistiques</SidebarSectionLabel>
      <SidebarGroup>
        <SidebarGroupItem :active="route.path === '/stats/correlation'">
          <NuxtLink href="/stats/correlation">
            <Icon name="lucide:git-compare-arrows" />
            Valeurs récurrentes
          </NuxtLink>
        </SidebarGroupItem>
        <SidebarGroupItem :active="route.path === '/stats'">
          <NuxtLink href="/stats">
            <Icon name="lucide:chart-column-increasing" />
            Vue d'ensemble
          </NuxtLink>
        </SidebarGroupItem>
        <SidebarGroupItem>
          <NuxtLink href="/stats/widgets">
            <Icon name="lucide:activity" />
            Widgets
          </NuxtLink>
        </SidebarGroupItem>
        <SidebarGroupItem :active="route.path === '/stats/query-builder'">
          <NuxtLink href="/stats/query-builder">
            <Icon name="lucide:braces" />
            Query Builder
          </NuxtLink>
        </SidebarGroupItem>
      </SidebarGroup>
    </SidebarSection>
    <SidebarSection v-if="isAdmin">
      <SidebarSectionLabel>Comptes</SidebarSectionLabel>
      <SidebarItem :active="route.path === '/accounts/users'">
        <NuxtLink href="/accounts/users">
          <Icon name="lucide:users" />
          Utilisateurs
        </NuxtLink>
      </SidebarItem>
      <SidebarItem :active="route.path === '/accounts/service'">
        <NuxtLink href="/accounts/service">
          <Icon name="lucide:bot" />
          Comptes de service
        </NuxtLink>
      </SidebarItem>
    </SidebarSection>
    <SidebarSection>
      <SidebarSectionLabel>Autres</SidebarSectionLabel>
      <SidebarItem>
        <NuxtLink
          external
          href="/openapi"
        >
          <Icon name="lucide:book-text" />
          Documentation API
        </NuxtLink>
      </SidebarItem>
      <SidebarItem :active="route.path === '/parametres'">
        <NuxtLink href="/parametres">
          <Icon name="lucide:settings" />
          Réglages
        </NuxtLink>
      </SidebarItem>
    </SidebarSection>
  </SidebarContent>
  <SidebarFooter>
    <USidebarUser
      :user="session?.user ?? null"
    />
  </SidebarFooter>
</template>
