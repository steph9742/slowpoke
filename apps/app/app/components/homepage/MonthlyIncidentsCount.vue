<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

withDefaults(defineProps<{
  count: number
  month?: Date | string
  previousCount?: number
  previousMonth?: Date | string
}>(), {
  month: new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, month: 'long' }).format(new Date()),
  previousMonth: new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, month: 'long' }).format(new Date(new Date().setMonth(new Date().getMonth() - 1))),
})
</script>

<template>
  <Card class="col-span-1 h-full">
    <CardHeader>
      <CardTitle class="text-lg font-medium">
        Nombre d'incidents ce mois-ci
      </CardTitle>
    </CardHeader>
    <CardContent class="divide-y-2 divide-gray-300">
      <div class="py-3">
        <p class="text-7xl font-bold">
          {{ count }}
        </p>
        <p class="text-lg text-muted-foreground">
          sur le mois de {{ month }}
        </p>
      </div>
      <div
        v-if="previousCount !== undefined"
        class="py-5"
      >
        <p class="text-xl">
          {{ previousCount }}
        </p>
        <p class="text-base text-muted-foreground">
          sur le mois de {{ previousMonth }}
        </p>
      </div>
    </CardContent>
  </Card>
</template>
