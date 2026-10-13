<script setup lang="ts">
import { ref } from 'vue'
import type { Eden, Treaty } from '@slowpoke/eden'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { UIButton } from '@slowpoke/ui'
import TimelineRoot from '~/components/timeline/TimelineRoot.vue'

defineProps<{
  items: Treaty.Data<Eden['api']['timeline']['get']>
}>()

// Replié par défaut sur mobile ; sur desktop (lg) le contenu reste toujours visible
const open = ref(false)
</script>

<template>
  <Card class="lg:absolute lg:inset-0 lg:flex lg:flex-col">
    <CardHeader>
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 border-0 bg-transparent p-0 text-left lg:cursor-default"
        @click="open = !open"
      >
        <CardTitle class="text-lg font-medium">
          Timeline
        </CardTitle>
        <Icon
          name="lucide:chevron-down"
          class="size-5 shrink-0 text-gray-400 transition-transform lg:hidden"
          :class="{ 'rotate-180': open }"
        />
      </button>
    </CardHeader>
    <CardContent :class="[open ? 'block' : 'hidden', 'lg:block lg:flex-1 lg:min-h-0 lg:overflow-y-auto']">
      <TimelineRoot
        class="overflow-auto"
        :items="items ?? []"
      />
      <NuxtLink href="/timeline">
        <UIButton
          variant="secondary"
          class="w-full"
        >
          Voir la timeline complète
        </UIButton>
      </NuxtLink>
    </CardContent>
  </Card>
</template>
