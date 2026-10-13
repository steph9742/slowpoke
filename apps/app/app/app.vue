<script setup lang="ts">
// TITRE DE L'ONGLET.
//
// Sans titre, le navigateur affiche l'URL brute : une poignée d'onglets Slowpoke deviennent
// indistinguables, et l'historique comme les favoris ne disent plus rien. Chaque page pose
// le sien ; celle qui l'oublie retombe sur le nom de l'application plutôt que sur « · Slowpoke ».
useHead({
  titleTemplate: (titre?: string) => (titre ? `${titre} · Slowpoke` : 'Slowpoke — gestion des incidents'),
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
