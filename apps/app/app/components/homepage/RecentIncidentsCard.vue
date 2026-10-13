<script setup lang="ts">
import type { Eden, Treaty } from '@slowpoke/eden'
import { UIButton } from '@slowpoke/ui'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/components/ui/card'
import { statusDisplayNames, severityDisplayNames, typeDisplayNames, resolutionDisplayNames } from '~/types/incident'

defineProps<{
  incidents: Treaty.Data<Eden['api']['incidents']['get']>
}>()

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical': return 'bg-red-50 text-red-700 border-red-200/60'
    case 'high': return 'bg-orange-50 text-orange-700 border-orange-200/60'
    case 'medium': return 'bg-amber-50 text-amber-700 border-amber-200/60'
    case 'low': return 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
    default: return 'bg-secondary-50 text-secondary-600 border-secondary-200/60'
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'open': return 'bg-primary-50 text-primary-700 border-primary-200/60'
    case 'investigating': return 'bg-blue-50 text-blue-700 border-blue-200/60'
    case 'in_progress': return 'bg-purple-50 text-purple-700 border-purple-200/60'
    case 'resolved': return 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
    case 'closed': return 'bg-secondary-50 text-secondary-600 border-secondary-200/60'
    default: return 'bg-secondary-50 text-secondary-600 border-secondary-200/60'
  }
}

const getResolutionColor = (resolution: string | null | undefined) => {
  switch (resolution) {
    case 'false_positive': return 'bg-amber-50 text-amber-700 border-amber-200/60'
    case 'true_positive': return 'bg-red-50 text-red-700 border-red-200/60'
    case 'benign': return 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
    default: return 'bg-secondary-50 text-secondary-600 border-secondary-200/60'
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-lg font-medium">
        Incidents récents
      </CardTitle>
    </CardHeader>
    <CardContent class="flex-1 min-h-0 overflow-y-auto">
      <ul class="space-y-4">
        <li
          v-for="i in incidents"
          :key="i.id"
          class="p-4 shadow rounded-xl border border-gray-300"
        >
          <NuxtLink
            :href="{ name: 'incidents-id', params: { id: i.id } }"
            class="flex justify-between"
          >
            <div class="min-w-0">
              <p class="font-medium">
                <!-- Mobile : ID court + type (lisible, pas de débordement) -->
                <span class="lg:hidden block truncate">ID-{{ i.id.slice(0, 6) }} · {{ typeDisplayNames[i.type] }}</span>
                <!-- Desktop : identifiant complet (inchangé) -->
                <span class="hidden lg:inline">{{ i.id }}</span>
              </p>
              <span class="text-sm text-muted-foreground">
                {{ new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, day: 'numeric', month: 'long', year: 'numeric' }).format(new
                  Date(i.updatedAt)) }}
              </span>
            </div>
            <div class="flex flex-wrap items-start justify-start gap-1.5 max-w-[60%] shrink-0">
              <span :class="['px-2 py-1 rounded-full text-xs font-medium border whitespace-nowrap', getStatusColor(i.status)]">
                {{ statusDisplayNames[i.status] }}
              </span>
              <span :class="['px-2 py-1 rounded-full text-xs font-medium border whitespace-nowrap', getSeverityColor(i.severity)]">
                {{ severityDisplayNames[i.severity] }}
              </span>
              <span
                v-if="i.resolution"
                :class="['px-2 py-1 rounded-full text-xs font-medium border whitespace-nowrap', getResolutionColor(i.resolution)]"
              >
                {{ i.resolution ? resolutionDisplayNames[i.resolution] : '' }}
              </span>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </CardContent>
    <CardFooter>
      <NuxtLink
        href="/incidents"
        class="w-full"
      >
        <UIButton
          variant="secondary"
          class="w-full"
        >
          Voir tous les incidents
        </UIButton>
      </NuxtLink>
    </CardFooter>
  </Card>
</template>
