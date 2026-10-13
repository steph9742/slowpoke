<script setup lang="ts">
import type { IncidentLogType } from './TimelineLogType'

const props = defineProps<{
  type: IncidentLogType
}>()

const displayedIcon = computed(() => {
  switch (props.type) {
    case 'comment':
      return 'lucide:message-square'
    case 'status_change':
      return 'lucide:refresh-ccw'
    case 'created':
      return 'lucide:plus'
    case 'user_added':
      return 'lucide:user-plus'
    case 'user_removed':
      return 'lucide:user-minus'
    default:
      return 'lucide:activity'
  }
})

const displayedBgColor = computed(() => {
  switch (props.type) {
    case 'comment':
      return 'bg-blue-100'
    case 'status_change':
      return 'bg-yellow-100'
    case 'created':
      return 'bg-green-100'
    case 'user_added':
      return 'bg-purple-100'
    case 'user_removed':
      return 'bg-red-100'
    default:
      return 'bg-gray-100'
  }
})

const displayedTextColor = computed(() => {
  switch (props.type) {
    case 'comment':
      return 'text-blue-500'
    case 'status_change':
      return 'text-yellow-500'
    case 'created':
      return 'text-green-500'
    case 'user_added':
      return 'text-purple-500'
    case 'user_removed':
      return 'text-red-500'
    default:
      return 'text-gray-500'
  }
})
</script>

<template>
  <div :class="['rounded-full p-2.5 sm:p-3.5 mr-3 sm:mr-4 shrink-0', displayedBgColor]">
    <Icon
      :name="displayedIcon"
      :class="['size-4', displayedTextColor]"
    />
  </div>
</template>
