<script setup lang="ts">
defineProps<{
  date: string
}>()
</script>

<template>
  <div class="text-lg text-gray-700 mb-2 font-sans tracking-tight">
    {{ new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) }}
  </div>
</template>
