<script setup lang="ts">
import { ref, onMounted } from 'vue'

// DÉJÀ VU AILLEURS — les valeurs de cet incident retrouvées dans d'autres : ce compte ou cette
// IP sont-ils déjà apparus ? La question se pose à la clôture, donc la réponse est ici et pas
// seulement dans une page de statistiques.
//
// Chargé au montage : au rendu serveur l'appel n'aurait pas la session.

const props = defineProps<{ incidentId: string }>()
const eden = useEden()

type Reponse = NonNullable<Awaited<ReturnType<ReturnType<typeof eden.api.indicateurs.incident>['get']>>['data']>
const donnees = ref<Reponse | null>(null)
const echec = ref(false)
const chargement = ref(true)

const dateFr = (d: string | Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'medium' }).format(new Date(d))

onMounted(async () => {
  const { data, error } = await eden.api.indicateurs.incident({ id: props.incidentId }).get()
  if (error) echec.value = true
  else donnees.value = data
  chargement.value = false
})
</script>

<template>
  <section class="space-y-3">
    <h3 class="text-sm font-semibold uppercase tracking-wider text-secondary-600">
      Déjà vu dans d'autres incidents
    </h3>
    <p
      v-if="chargement"
      class="text-sm text-secondary-400"
    >
      Recherche…
    </p>
    <p
      v-else-if="echec"
      class="text-sm text-red-700"
    >
      La recherche a échoué : impossible de dire si ces valeurs sont déjà apparues.
    </p>
    <p
      v-else-if="!donnees?.valeurs.length"
      class="text-sm text-secondary-600"
    >
      Aucune IP, compte, empreinte ou machine de cet incident n'apparaît dans un autre.
    </p>
    <ul
      v-else
      class="space-y-3"
    >
      <li
        v-for="v in donnees.valeurs"
        :key="v.valeur"
        class="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3"
      >
        <div class="flex flex-wrap items-baseline gap-x-2">
          <NuxtLink
            :to="{ path: '/indicateurs', query: { valeur: v.valeur } }"
            class="font-mono text-sm text-secondary-900 hover:underline break-all"
          >
            {{ v.valeur }}
          </NuxtLink>
          <span class="text-xs text-secondary-500">
            dans {{ v.autres.length }} autre{{ v.autres.length > 1 ? 's' : '' }} incident{{ v.autres.length > 1 ? 's' : '' }}
          </span>
        </div>
        <ul class="mt-2 flex flex-wrap gap-2">
          <li
            v-for="a in v.autres"
            :key="a.incidentId"
          >
            <NuxtLink
              :to="`/incidents/${a.incidentId}`"
              class="inline-flex items-center gap-1.5 rounded-full border border-secondary-200 bg-white px-2.5 py-0.5 text-xs hover:border-primary-300"
            >
              <span class="font-mono">{{ a.incidentId }}</span>
              <span class="font-semibold">{{ a.niveau }}</span>
              <span class="text-secondary-500">{{ dateFr(a.createdAt) }}</span>
              <span
                v-if="a.archive"
                class="text-secondary-400"
              >· archivé</span>
            </NuxtLink>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>
