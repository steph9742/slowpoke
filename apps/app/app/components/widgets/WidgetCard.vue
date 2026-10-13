<script setup lang="ts">
import { computed } from 'vue'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const props = withDefaults(defineProps<{
  title: string
  editMode?: boolean
  cId: string
  colSpan?: number
  isActive?: boolean
}>(), {
  editMode: false,
  colSpan: 1,
  isActive: true,
})

const emit = defineEmits<{
  (e: 'update:colSpan', value: number): void
  (e: 'update:isActive', value: boolean): void
}>()

const colSpanOptions = [
  { label: '1 colonne', value: 1 },
  { label: '2 colonnes', value: 2 },
  { label: '3 colonnes', value: 3 },
  { label: '4 colonnes', value: 4 },
]

const colSpanClass = computed(() => {
  switch (props.colSpan) {
    case 1: return 'md:col-span-1'
    case 2: return 'md:col-span-2'
    case 3: return 'md:col-span-3'
    case 4: return 'md:col-span-4'
    default: return 'md:col-span-1'
  }
})
</script>

<template>
  <Card
    :class="[
      'col-span-1 flex flex-col',
      colSpanClass,
      !isActive && editMode ? 'opacity-50 grayscale' : '',
      !isActive && !editMode ? 'hidden' : '',
      !editMode ? 'p-0' : '',
    ]"
  >
    <CardHeader
      v-if="editMode"
      class="flex flex-row justify-between items-start gap-4"
    >
      <div class="flex gap-5">
        <Icon
          v-if="editMode"
          name="lucide:grip-vertical"
          class="drag-handle cursor-move text-muted-foreground w-5 h-5 hover:text-foreground transition-colors"
        />
        <CardTitle
          v-if="editMode && !isActive"
          class="text-base font-medium text-muted-foreground"
        >
          {{ title }}
        </CardTitle>
      </div>

      <div
        v-if="editMode"
        class="flex items-center space-x-4"
      >
        <div class="flex items-center gap-2">
          <Icon
            name="lucide:columns"
            class="w-4 h-4 text-muted-foreground"
          />
          <select
            class="bg-background border border-input rounded-md text-sm p-1"
            :value="colSpan"
            @change="emit('update:colSpan', Number(($event.target as HTMLSelectElement).value))"
          >
            <option
              v-for="opt in colSpanOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <Icon
            :name="isActive ? 'lucide:eye' : 'lucide:eye-off'"
            class="w-4 h-4 text-muted-foreground"
          />
          <input
            type="checkbox"
            :checked="isActive"
            class="w-4 h-4"
            @change="emit('update:isActive', ($event.target as HTMLInputElement).checked)"
          >
        </div>
      </div>
    </CardHeader>

    <CardContent
      :class="['flex-1 w-full bg-card relative min-h-75', !editMode ? 'p-0' : 'p-4']"
    >
      <slot />
    </CardContent>
  </Card>
</template>
