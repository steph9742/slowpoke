<script setup lang="ts">
import { SidebarRoot, ToastProvider } from '@slowpoke/ui'
import USidebar from '~/components/sidebar/USidebar.vue'
import { ref, watch } from 'vue'

// Un compte sans rôle applicatif (role 'user') n'a accès à rien : message dédié, pas de sidebar.
const { canRead } = await useRoles()

// Le tiroir mobile est piloté ici, parce que c'est ici qu'on sait qu'on a navigué. Le
// refermer sur « le clic a touché un lien » ratait les navigations au clavier et celles
// déclenchées par le code, et il restait ouvert par-dessus la page d'arrivée.
const menuOuvert = ref(false)
const route = useRoute()
watch(() => route.fullPath, () => {
  menuOuvert.value = false
})
</script>

<template>
  <SidebarRoot
    v-if="canRead"
    v-model:open="menuOuvert"
  >
    <template #sidebar>
      <USidebar />
    </template>
    <template #rest>
      <slot />
    </template>
  </SidebarRoot>
  <div
    v-else
    class="min-h-dvh flex items-center justify-center p-6"
  >
    <div class="max-w-md text-center space-y-4">
      <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary-100 text-secondary-500">
        <Icon
          name="lucide:lock"
          class="size-7"
        />
      </div>
      <h1 class="text-xl font-semibold text-secondary-900">
        Accès non autorisé
      </h1>
      <p class="text-sm text-secondary-500">
        Votre compte n'a pas encore accès à l'application. Contactez un administrateur pour qu'il vous attribue un rôle (lecteur ou gestionnaire).
      </p>
    </div>
  </div>
  <!-- eslint-disable-next-line vue/no-multiple-template-root -->
  <ToastProvider />
</template>
