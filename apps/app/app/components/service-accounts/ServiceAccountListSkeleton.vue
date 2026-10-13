<script setup lang="ts">
import { UISkeleton } from '@slowpoke/ui'
</script>

<template>
  <ul class="space-y-3">
    <li
      v-for="i in 8"
      :key="i"
    >
      <UISkeleton class="w-full h-20" />
    </li>
  </ul>
</template>
