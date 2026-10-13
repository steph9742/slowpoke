<script setup lang="ts">
import { UIButton, UIInput } from '@slowpoke/ui'
import { ref } from 'vue'

// CORRÉLATION — ce qui revient d'un incident à l'autre.
//
// Une IP, une empreinte ou un compte qui réapparaît raconte quelque chose qu'aucun
// incident pris isolément ne dit. Volontairement hors du query builder : celui-ci est
// réservé aux admins, alors que cette lecture intéresse d'abord les gestionnaires.

const eden = useEden()
const jours = ref(30)
const seuil = ref(3)

const { data, refresh, status } = await useAsyncData('correlation', async () => {
  const { data } = await eden.api.stats.correlation.get({ query: { days: jours.value, min: seuil.value } })
  return data
}, { getCachedData: () => undefined })

const ORIGINES: Record<string, { label: string, classes: string }> = {
  machines: { label: 'Machine', classes: 'bg-blue-50 text-blue-700 border-blue-200/60' },
  iocs: { label: 'IOC / hash', classes: 'bg-purple-50 text-purple-700 border-purple-200/60' },
  c2: { label: 'Serveur C2', classes: 'bg-red-50 text-red-700 border-red-200/60' },
  sourceIps: { label: 'IP source', classes: 'bg-cyan-50 text-cyan-700 border-cyan-200/60' },
  compromisedAccounts: { label: 'Compte compromis', classes: 'bg-amber-50 text-amber-700 border-amber-200/60' },
}
const origineDe = (o: string) => ORIGINES[o] ?? { label: o, classes: 'bg-secondary-50 text-secondary-600 border-secondary-200/60' }

const dateFr = (d?: string | null) => d
  ? new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'medium' }).format(new Date(d))
  : '—'

useHead({ title: 'Valeurs récurrentes' })
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 relative z-0">
    <header class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <UITitle class="font-sans text-secondary-900 tracking-tight">
          Valeurs récurrentes
        </UITitle>
        <p class="text-sm text-secondary-600/90 font-sans mt-1 max-w-2xl">
          Machines, IOC, IP sources, serveurs C2 et comptes compromis qui reviennent d'un incident à l'autre.
        </p>
      </div>
    </header>

    <section class="bg-secondary-50/50 p-5 rounded-2xl border border-secondary-200/60 shadow-sm shadow-secondary-200/20 flex flex-col sm:flex-row items-start sm:items-end gap-5 relative">
      <div class="absolute -right-20 -top-20 w-40 h-40 bg-primary-200/20 rounded-full blur-3xl pointer-events-none" />

      <div class="relative z-10 w-32">
        <label class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono">Fenêtre (jours)</label>
        <UIInput
          v-model="jours"
          type="number"
          min="1"
          max="365"
          class="border-secondary-200"
        />
      </div>
      <div class="relative z-10 w-32">
        <label class="block text-xs font-semibold text-secondary-500 uppercase tracking-widest mb-2 font-mono">Incidents minimum</label>
        <UIInput
          v-model="seuil"
          type="number"
          min="2"
          class="border-secondary-200"
        />
      </div>

      <div class="relative z-10 sm:ml-auto flex items-center gap-3">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-primary-50 border border-primary-200/60 px-3 py-1 text-xs font-semibold text-primary-700 font-mono whitespace-nowrap">
          <Icon
            name="lucide:git-compare-arrows"
            class="size-3.5"
          />
          {{ data?.results?.length ?? 0 }} valeur{{ (data?.results?.length ?? 0) > 1 ? 's' : '' }}
        </span>
        <UIButton
          variant="outline"
          class="h-10"
          :disabled="status === 'pending'"
          @click="refresh()"
        >
          <Icon
            name="lucide:refresh-cw"
            class="size-4"
            :class="status === 'pending' ? 'animate-spin' : ''"
          />
          Actualiser
        </UIButton>
      </div>
    </section>

    <section
      v-if="!data?.results?.length"
      class="py-24 text-center bg-secondary-50/30 rounded-2xl border border-secondary-200/50 shadow-sm"
    >
      <Icon
        name="lucide:git-compare-arrows"
        class="mx-auto mb-3 size-8 text-secondary-300"
      />
      <p class="text-secondary-600 font-sans">
        Aucune valeur n'apparaît dans au moins {{ seuil }} incidents sur {{ jours }} jours.
      </p>
      <p class="mt-1 text-xs text-secondary-400 font-sans">
        Élargissez la fenêtre ou abaissez le seuil pour ratisser plus large.
      </p>
    </section>

    <section
      v-else
      class="overflow-x-auto rounded-2xl border border-secondary-200/60 bg-white shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]"
    >
      <table class="w-full min-w-[44rem] text-sm">
        <thead class="border-b border-secondary-200/60 bg-secondary-50/50 text-left">
          <tr>
            <th class="px-4 py-3 text-xs font-semibold text-secondary-500 uppercase tracking-widest font-mono">
              Valeur
            </th>
            <th class="px-4 py-3 text-xs font-semibold text-secondary-500 uppercase tracking-widest font-mono">
              Nature
            </th>
            <th class="px-4 py-3 text-xs font-semibold text-secondary-500 uppercase tracking-widest font-mono">
              Incidents
            </th>
            <th class="px-4 py-3 text-xs font-semibold text-secondary-500 uppercase tracking-widest font-mono">
              Dernier
            </th>
            <th class="px-4 py-3 text-xs font-semibold text-secondary-500 uppercase tracking-widest font-mono">
              Références
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-secondary-100">
          <tr
            v-for="(r, i) in data?.results ?? []"
            :key="i"
            class="transition-colors hover:bg-secondary-50/40"
          >
            <td class="px-4 py-3 font-mono text-xs text-secondary-800 break-all max-w-sm">
              {{ r.valeur }}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span
                class="px-2.5 py-0.5 text-[11px] uppercase tracking-wider font-semibold rounded-md border font-sans"
                :class="origineDe(r.origine as string).classes"
              >
                {{ origineDe(r.origine as string).label }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center rounded-full bg-primary-50 border border-primary-200/60 px-2.5 py-0.5 text-xs font-semibold text-primary-700 font-mono">
                {{ r.occurrences }}
              </span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap font-mono text-xs text-secondary-500">
              {{ dateFr(r.dernier_incident as string) }}
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-1.5">
                <NuxtLink
                  v-for="id in (r.incidents as string[] ?? [])"
                  :key="id"
                  :to="`/incidents/${id}`"
                  class="rounded-md border border-secondary-200/70 bg-secondary-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary-500 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                >
                  {{ id }}
                </NuxtLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <p class="text-xs text-secondary-400 font-sans">
      Le comptage porte sur les <strong>incidents distincts</strong> : une même valeur citée plusieurs fois
      dans un seul incident ne constitue pas une récurrence.
    </p>
  </div>
</template>
