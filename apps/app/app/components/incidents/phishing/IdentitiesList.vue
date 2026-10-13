<script setup lang="ts">
import type { IncidentGetData } from '~/types/elysia'

type AffectedUser = NonNullable<IncidentGetData['affectedUsers']>[number]

defineProps<{
  identities: AffectedUser['phishingIdentities']
}>()
</script>

<template>
  <div
    v-if="identities && identities.length > 0"
    class="grid gap-5 lg:grid-cols-2"
  >
    <div
      v-for="identity in identities"
      :key="identity.id"
      class="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md p-5 transition-all hover:border-primary-300 hover:shadow-lg shadow-sm"
    >
      <div
        class="absolute inset-x-0 inset-y-0 opacity-0 group-hover:opacity-10 pointer-events-none transition-opacity bg-linear-to-br from-primary-400 to-transparent blur-2xl"
      />

      <div class="mb-4 relative z-10">
        <div class="mb-6 flex items-start justify-between">
          <div class="flex items-center gap-4">
            <div
              class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-100/50 text-primary-600 border border-primary-200/60 ring-2 ring-primary-50/30"
            >
              <Icon
                name="lucide:fingerprint"
                class="size-5"
              />
            </div>
            <div>
              <h4 class="font-semibold text-text tracking-tight">
                {{ identity.identity_name || 'Identité Non Nommée' }}
              </h4>
              <p class="text-xs font-mono text-secondary-500 mt-0.5">
                Créée le : <span class="text-secondary-600 font-medium">{{ new
                  Date(identity.createdAt).toLocaleDateString('fr-FR') }}</span>
              </p>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <div
            class="flex flex-col gap-1.5 rounded-lg border border-primary-200/30 bg-primary-50/10 p-3.5 transition-colors group-hover:bg-primary-50/20"
          >
            <div class="flex items-center gap-2 mb-1 text-secondary-600">
              <Icon
                name="lucide:arrow-right-from-line"
                class="size-4 shrink-0"
              />
              <span class="text-xs font-bold uppercase tracking-wider">Expéditeur (From)</span>
            </div>
            <div class="flex flex-col text-sm text-text/90 ml-6">
              <span class="font-semibold truncate">{{ identity.fromDisplayName || 'Aucun nom d\'affichage' }}</span>
              <span class="font-mono text-xs text-secondary-500 mt-0.5 truncate select-all">{{ identity.fromAddress
                || 'N/D' }}</span>
            </div>
          </div>

          <div
            class="flex flex-col gap-1.5 rounded-lg border border-primary-200/30 bg-primary-50/10 p-3.5 transition-colors group-hover:bg-primary-50/20"
          >
            <div class="flex items-center gap-2 mb-1 text-secondary-600">
              <Icon
                name="lucide:reply"
                class="size-4 shrink-0"
              />
              <span class="text-xs font-bold uppercase tracking-wider">Réponse (Reply-to)</span>
            </div>
            <div class="flex flex-col text-sm text-text/90 ml-6">
              <span class="font-semibold truncate">{{ identity.replyDisplayName || 'Identique à l\'expéditeur' }}</span>
              <span class="font-mono text-xs text-secondary-500 mt-0.5 mb-0.5 truncate select-all">{{
                identity.replyAddress || identity.fromAddress || 'N/D' }}</span>
              <span
                v-if="identity.replyAddress && identity.replyAddress !== identity.fromAddress"
                class="mt-1 text-[10px] font-semibold text-rose-500 uppercase tracking-widest flex items-center gap-1.5"
              >
                <Icon
                  name="lucide:alert-triangle"
                  class="size-3"
                /> Divergence d'adresses
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div
    v-else
    class="rounded-xl border border-dashed border-primary-200/50 p-8 flex flex-col items-center justify-center text-secondary-500 bg-background/20 backdrop-blur-sm shadow-sm"
  >
    <div class="p-3 bg-secondary-100/50 rounded-full mb-3">
      <Icon
        name="lucide:ghost"
        class="size-6 text-secondary-400"
      />
    </div>
    <span class="text-sm font-medium tracking-tight">Aucune identité enregistrée</span>
  </div>
</template>
