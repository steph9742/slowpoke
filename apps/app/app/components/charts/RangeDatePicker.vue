<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import { DateFormatter, getLocalTimeZone, today } from '@internationalized/date'

import { CalendarIcon } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RangeCalendar } from '@/components/ui/range-calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { DateRange } from 'reka-ui'

const dateRange = defineModel<DateRange>() as unknown as Ref<DateRange>

const df = new DateFormatter('fr-FR', {
  dateStyle: 'long',
})

const t = today(getLocalTimeZone()) as unknown as DateValue

defineEmits<{
  updated: []
}>()
</script>

<template>
  <Popover v-slot="{ close }">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        :class="cn('w-auto min-w-60 whitespace-nowrap justify-start text-left font-normal', !dateRange && 'text-muted-foreground')"
      >
        <CalendarIcon />
        {{ dateRange ? (dateRange.start ? df.format(dateRange.start.toDate(getLocalTimeZone())) : '') + ' - ' + (dateRange.end ? df.format(dateRange.end.toDate(getLocalTimeZone())) : '') : "Choisir une date" }}
      </Button>
    </PopoverTrigger>
    <PopoverContent
      class="w-auto p-0"
      align="start"
    >
      <RangeCalendar
        v-model="dateRange"
        locale="fr-FR"
        :number-of-months="2"
        :max-value="t"
        disable-days-outside-current-view
        @update:valid-model-value="close; $emit('updated')"
      />
    </PopoverContent>
  </Popover>
</template>
