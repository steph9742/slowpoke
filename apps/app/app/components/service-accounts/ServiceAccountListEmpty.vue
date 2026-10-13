<script setup lang="ts">
import { UIButton } from '@slowpoke/ui'

defineEmits<{
  (e: 'create'): void
}>()
</script>

<template>
  <div class="p-4 text-gray-500 border-2 border-dashed border-gray-300 rounded-xl h-150 flex flex-col items-center justify-center gap-3">
    <Icon
      name="lucide:file-question-mark"
      class="size-20"
    />
    <p>Aucun compte de service trouvé.</p>
    <UIButton
      variant="primary"
      size="md"
      @click="$emit('create')"
    >
      <Icon name="lucide:plus" />
      Créer un compte
    </UIButton>
  </div>
</template>
