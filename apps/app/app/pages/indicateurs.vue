<script setup lang="ts">
import { UIButton, UIInput } from '@slowpoke/ui'
import { ref } from 'vue'

// CHERCHER UN INDICATEUR — « est-ce que ceci est connu ? »
//
// Chaque source dit ce qu'elle a trouvé, ou pourquoi elle n'a pas pu répondre. Une source
// non interrogée n'est jamais affichée comme « rien trouvé » : ce serait laisser croire que
// la question a été posée.

const eden = useEden()
const route = useRoute()

const saisie = ref(typeof route.query.valeur === 'string' ? route.query.valeur : '')
const enCours = ref(false)
const erreur = ref<string | null>(null)

type Reponse = NonNullable<Awaited<ReturnType<typeof eden.api.indicateurs.get>>['data']>
const reponse = ref<Reponse | null>(null)

const NATURES: Record<string, string> = {
  ipv4: 'Adresse IPv4', ipv6: 'Adresse IPv6', email: 'Adresse mail', url: 'URL', domaine: 'Domaine',
  md5: 'Empreinte MD5', sha1: 'Empreinte SHA-1', sha256: 'Empreinte SHA-256', compte: 'Identifiant',
}
const ORIGINES: Record<string, string> = {
  iocs: 'IOC', c2: 'Serveur C2', machines: 'Machine', sourceIps: 'IP source', compromisedAccounts: 'Compte compromis',
  connexionIp: 'Connexion suspecte', expediteur: 'Expéditeur', repondreA: 'Répondre à', personne: 'Personne concernée',
  machineRattachee: 'Machine rattachée',
  personneNom: 'Personne concernée',
}

const dateFr = (d: string | Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, dateStyle: 'medium' }).format(new Date(d))

async function chercher() {
  const valeur = saisie.value.trim()
  if (!valeur || enCours.value) return
  enCours.value = true
  erreur.value = null
  try {
    const { data, error } = await eden.api.indicateurs.get({ query: { valeur } })
    if (error) {
      erreur.value = (error.value as { message?: string } | undefined)?.message ?? 'La recherche a échoué.'
      reponse.value = null
      return
    }
    reponse.value = data
    await navigateTo({ query: { valeur } }, { replace: true })
  }
  finally {
    enCours.value = false
  }
}

onMounted(() => {
  if (saisie.value) chercher()
})

useHead({ title: 'Chercher un indicateur' })
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
    <header>
      <UITitle class="font-sans text-secondary-900 tracking-tight">
        Chercher un indicateur
      </UITitle>
      <p class="text-sm text-secondary-600/90 mt-1 max-w-2xl">
        Une IP, un domaine, une URL, une empreinte, une adresse mail, un identifiant ou le nom d'une personne concernée : est-ce déjà connu ?
      </p>
    </header>

    <form
      class="flex flex-col sm:flex-row gap-3"
      @submit.prevent="chercher"
    >
      <label
        for="indicateur-valeur"
        class="sr-only"
      >Valeur à chercher</label>
      <UIInput
        id="indicateur-valeur"
        v-model="saisie"
        placeholder="203.0.113.7, exemple.fr, 44d88612fea8a8f36de82e1278abb02f…"
        class="h-11 flex-1 font-mono bg-white"
      />
      <UIButton
        type="submit"
        class="h-11"
        :disabled="enCours || !saisie.trim()"
      >
        {{ enCours ? 'Recherche…' : 'Chercher' }}
      </UIButton>
    </form>

    <p
      v-if="erreur"
      class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ erreur }}
    </p>

    <template v-if="reponse">
      <p class="text-sm text-secondary-600">
        Lu comme : <span class="font-semibold text-secondary-900">{{ NATURES[reponse.nature] ?? reponse.nature }}</span>
        <template v-if="reponse.candidats.length > 1">
          · cherché aussi sous <span class="font-mono">{{ reponse.candidats.slice(1).join(', ') }}</span>
        </template>
      </p>

      <section class="space-y-3">
        <h2 class="text-lg font-semibold text-secondary-900">
          Déjà vu dans Slowpoke
          <span class="ml-2 text-sm font-mono text-secondary-500">{{ reponse.slowpoke.total }}<template v-if="reponse.slowpoke.total >= reponse.slowpoke.plafond">+</template></span>
        </h2>
        <p
          v-if="reponse.slowpoke.rechercheParNom === 'trop_courte'"
          class="text-sm text-amber-800"
        >
          Nom trop court pour une recherche partielle : saisissez au moins trois caractères.
        </p>
        <p
          v-if="!reponse.slowpoke.total"
          class="text-sm text-secondary-600"
        >
          Aucun incident ne porte cette valeur<template v-if="reponse.slowpoke.rechercheParNom === 'faite'">
            , ni aucune personne concernée dont le nom ou l'adresse la contient
          </template>.
        </p>
        <ul
          v-else
          class="divide-y divide-secondary-100 rounded-xl border border-secondary-200 bg-white"
        >
          <li
            v-for="r in reponse.slowpoke.resultats"
            :key="`${r.incidentId}-${r.origine}`"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
          >
            <NuxtLink
              :to="`/incidents/${r.incidentId}`"
              class="font-mono text-sm text-primary-700 hover:underline"
            >
              {{ r.incidentId }}
            </NuxtLink>
            <span class="text-xs font-semibold rounded-full bg-secondary-100 px-2 py-0.5 text-secondary-700">{{ r.niveau }}</span>
            <span class="text-sm text-secondary-800">{{ r.type }}</span>
            <span class="text-xs text-secondary-500">{{ ORIGINES[r.origine] ?? r.origine }}</span>
            <span
              v-if="r.archive"
              class="text-xs rounded-full border border-secondary-300 px-2 py-0.5 text-secondary-500"
            >archivé</span>
            <span class="ml-auto text-xs font-mono text-secondary-500">{{ dateFr(r.createdAt) }}</span>
          </li>
        </ul>
      </section>

      <section class="space-y-3">
        <h2 class="text-lg font-semibold text-secondary-900">
          Listes blanches
        </h2>
        <p
          v-if="!reponse.listesBlanches.exclusions.length && !reponse.listesBlanches.reglesEdr.length"
          class="text-sm text-secondary-600"
        >
          Aucune exclusion consignée ni règle de l'EDR ne mentionne cette valeur.
        </p>
        <ul
          v-if="reponse.listesBlanches.exclusions.length"
          class="space-y-2"
        >
          <li
            v-for="x in reponse.listesBlanches.exclusions"
            :key="x.id"
            class="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm"
          >
            <span class="font-semibold">Exclusion {{ x.state === 'active' ? 'active' : 'révoquée' }}</span>
            · {{ x.scope }} ·
            <NuxtLink
              :to="`/incidents/${x.incidentId}`"
              class="font-mono text-primary-700 hover:underline"
            >{{ x.incidentId }}</NuxtLink>
          </li>
        </ul>
        <ul
          v-if="reponse.listesBlanches.reglesEdr.length"
          class="space-y-2"
        >
          <li
            v-for="r in reponse.listesBlanches.reglesEdr"
            :key="r.ref"
            class="rounded-xl border border-secondary-200 bg-white px-4 py-3 text-sm"
          >
            <span class="font-semibold">Règle de l'EDR</span>
            · {{ r.libelle || r.ref }}
            <span class="text-secondary-500">· {{ r.fourniParEditeur ? 'fournie par l\'éditeur' : 'posée par l\'établissement' }}</span>
            <span
              v-if="!r.presente"
              class="text-secondary-500"
            > · absente au dernier relevé</span>
          </li>
        </ul>
      </section>

      <section class="space-y-3">
        <h2 class="text-lg font-semibold text-secondary-900">
          Inventaire
        </h2>
        <p
          v-if="!reponse.inventaire.interroge"
          class="text-sm text-secondary-500 italic"
        >
          Non interrogé : {{ reponse.inventaire.motif }}
        </p>
        <p
          v-else-if="!reponse.inventaire.machines.length"
          class="text-sm text-secondary-600"
        >
          Aucune machine de ce nom dans l'inventaire.
        </p>
        <ul
          v-else
          class="space-y-2"
        >
          <li
            v-for="m in reponse.inventaire.machines"
            :key="m.glpiId"
            class="rounded-xl border border-secondary-200 bg-white px-4 py-3 text-sm"
          >
            <span class="font-mono">{{ m.nom }}</span>
            <span class="text-secondary-500"> · {{ m.entite ?? 'entité inconnue' }}</span>
            <span
              v-if="m.critique"
              class="ml-2 text-xs font-semibold rounded-full bg-red-50 px-2 py-0.5 text-red-700"
            >critique</span>
          </li>
        </ul>
      </section>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold text-secondary-900">
          Parc équipé de l'EDR
        </h2>
        <p class="text-sm text-secondary-500 italic">
          Non interrogé : {{ reponse.edr.motif }}
        </p>
      </section>
    </template>
  </div>
</template>
