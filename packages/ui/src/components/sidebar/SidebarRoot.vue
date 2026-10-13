<script setup lang="ts">
defineProps<{
    class?: string
    sidebarClass?: string
    contentClass?: string
}>()

/**
 * TIROIR PILOTÉ PAR LE PARENT (mobile ; sur lg+ la barre est toujours visible).
 *
 * Il se refermait sur une heuristique — « le clic a touché un `<a>` » — qui rate les
 * navigations au clavier et celles déclenchées par le code : le tiroir restait ouvert
 * par-dessus la page d'arrivée. Le parent, lui, sait quand la route change. Sans liaison
 * `v-model:open`, l'état reste local et le composant marche comme avant.
 */
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
    <!-- `overflow-x-clip` et SURTOUT PAS `overflow-x-hidden` : `hidden` fait de ce conteneur
         un contexte de défilement. Tout `position: sticky` en descendance colle alors à un bloc
         aussi haut que la page — donc ne colle jamais — et `window.scrollY` reste à zéro, ce qui
         prive tout écouteur de défilement de signal. `clip` coupe le débordement horizontal
         sans créer ce contexte. -->
    <div :class="['min-h-svh bg-gray-100 overflow-x-clip p-2', $props.class]">
        <!-- Fond semi-opaque (mobile, drawer ouvert) -->
        <div
            v-if="open"
            class="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
            @click="open = false"
        />

        <!-- Sidebar : fixe sur desktop, drawer coulissant sur mobile -->
        <aside
            :class="[
                'fixed inset-y-0 left-0 w-80 max-w-[85vw] p-4 flex flex-col max-h-svh overflow-y-auto z-40 bg-gray-100 transition-transform duration-300 ease-out',
                open ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0',
                $props.sidebarClass,
            ]"
        >
            <slot name="sidebar" />
        </aside>

        <div class="flex w-full">
            <!-- Décalage réservé au desktop (sur mobile le drawer est en overlay) -->
            <div class="hidden lg:block w-78 shrink-0" aria-hidden="true"></div>
            <main class="flex-1 min-w-0 max-w-full">
                <!-- Barre haute : le bouton du tiroir (mobile), et ce que la page veut y poser.
                     Sans emplacement `topbar`, elle n'existe que sur mobile. -->
                <div :class="['mb-2 flex items-center gap-2', $slots.topbar ? '' : 'lg:hidden']">
                    <button
                        type="button"
                        aria-label="Ouvrir le menu"
                        class="inline-flex size-10 items-center justify-center rounded-xl bg-white text-gray-700 shadow-sm transition hover:bg-gray-50 active:scale-95"
                        @click="open = true"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="12" x2="21" y2="12" />
                            <line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                    </button>
                    <div
                        v-if="$slots.topbar"
                        class="min-w-0 flex-1"
                    >
                        <slot name="topbar" />
                    </div>
                </div>
                <div :class="['bg-white rounded-xl shadow-sm p-4 min-h-[calc(100svh-1rem)]', $props.contentClass]">
                    <slot name="rest" />
                </div>
            </main>
        </div>
    </div>
</template>
