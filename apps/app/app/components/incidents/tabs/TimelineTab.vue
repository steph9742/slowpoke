<script setup lang="ts">
const props = defineProps<{
  incidentId: string
}>()

const { data: timelineItems } = await useAsyncData('timelineItems', async () => {
  const { data } = await useEden().api.timeline.get({ query: { incidentId: props.incidentId } })
  return data
}, { getCachedData: () => undefined })
</script>

<template>
  <div class="animate-in fade-in slide-in-from-bottom-2 duration-300">
    <UITitle
      level="3"
      class="font-sans tracking-tight text-primary-600 mb-6"
    >
      Timeline
    </UITitle>

    <div class="p-3 sm:p-6 rounded-xl border border-primary-200/50 bg-background/10 backdrop-blur-sm shadow-sm relative overflow-hidden">
      <div class="absolute top-0 right-0 w-32 h-32 bg-primary-600/5 rounded-bl-full -z-10" />

      <TimelineRoot
        :items="timelineItems ?? []"
        class="font-sans"
      />

      <div
        v-if="!timelineItems || timelineItems.length === 0"
        class="py-12 text-center"
      >
        <div class="inline-flex w-12 h-12 rounded-full bg-secondary-100 items-center justify-center mb-4">
          <Icon
            name="lucide:clock"
            class="w-6 h-6 text-secondary-600"
          />
        </div>
        <p class="text-sm text-secondary-600 font-medium">
          Aucun événement enregistré dans la timeline.
        </p>
      </div>
    </div>
  </div>
</template>
