<script setup lang="ts">
import { UIButton, useToast } from '@slowpoke/ui'
import { ref, computed, onMounted } from 'vue'

// Écart entre les listes blanches consignées et les règles réellement présentes dans l'EDR.
//
// La vue montre l'écart et permet de le réduire, jamais toute seule : consigner demande un
// motif et une échéance, qui ne peuvent venir que d'un humain. Deux issues — rattacher la règle
// à l'incident qui la motive, ou lui programmer une revue si elle a été posée hors incident.

defineProps<{ modifiable: boolean }>()
const eden = useEden()
const toast = useToast()

type Etat = {
  dernierSucces: string | null
  dernierEssai: string | null
  dernierOk: boolean
  derniereErreur: string | null
  echecsConsecutifs: number
}
type Donnees = {
  legitimesSansExclusion: { id: string, type: string, severity: string, closDepuis: string }[]
  nonEnregistrees: { ref: string, libelle: string | null, criteres: string[], cible: string | null, creeeLe: string | null }[]
  disparues: { id: string, incidentId: string, scope: string, outilRef: string, reviewDate: string }[]
  nonRapprochees: { id: string, incidentId: string, scope: string, reviewDate: string }[]
  volume: { total: number, editeur: number }
  etat: Etat | null
  configure: boolean
}

const donnees = ref<Donnees | null>(null)
const chargement = ref(true)
const suggestions = ref<Record<string, { ref: string, libelle: string | null, criteres: string[], raison: string }[]>>({})

// Revues programmées des règles posées hors incident : sans elles, une règle décidée
// resterait affichée comme « non consignée » indéfiniment.
// `echeance` arrive en `Date` : Eden convertit toute chaîne ISO, même annoncée `string`.
type Revue = { id: string, regleRef: string, echeance: string | Date }
const revues = ref<Revue[]>([])
const revuePar = computed(() => new Map(revues.value.map(r => [r.regleRef, r])))

type Regle = Donnees['nonEnregistrees'][number]
const regleChoisie = ref<Regle | null>(null)
const decisionOuverte = ref(false)

function consigner(r: Regle) {
  regleChoisie.value = r
  decisionOuverte.value = true
}

async function charger() {
  const { data } = await eden.api.exclusions.rapprochement.get()
  donnees.value = (data as Donnees) ?? null
  const { data: listeRevues } = await eden.api.exclusions.revues.get({ query: { etat: 'active' } })
  revues.value = (listeRevues ?? []) as Revue[]
  chargement.value = false
}
onMounted(charger)

/**
 * Une vue vide ne dit pas d'elle-même si tout va bien ou si la lecture a échoué.
 * C'est ce message qui fait la différence.
 */
const temoin = computed(() => {
  const d = donnees.value
  if (!d) return null
  if (!d.configure) return { ton: 'neutre', texte: 'EDR non configuré — aucun rapprochement possible.' }

  const e = d.etat
  if (!e || !e.dernierSucces) {
    return { ton: 'alerte', texte: 'Aucune lecture réussie à ce jour : ce tableau ne reflète rien.' }
  }
  if (!e.dernierOk) {
    return {
      ton: 'alerte',
      texte: `Dernière lecture EN ÉCHEC (${e.echecsConsecutifs} essai(s)) — ${e.derniereErreur ?? 'cause inconnue'}. `
        + `Ce qui suit date du ${dateHeure(e.dernierSucces)}.`,
    }
  }
  return { ton: 'ok', texte: `Dernière lecture réussie le ${dateHeure(e.dernierSucces)}.` }
})

// Ne comptent comme écarts que les situations qu'on peut résoudre ICI. Une règle posée hors
// incident qui porte déjà sa revue programmée n'est plus un écart : elle a sa décision et
// son échéance. Celles qui n'ont encore rien s'ajoutent au compte, puisqu'on peut désormais
// les décider — un compteur qui ne descend jamais cesse d'être lu, mais un compteur qui
// ignore ce qu'on peut faire ne sert à rien non plus.
const total = computed(() => {
  const d = donnees.value
  if (!d) return 0
  const aDecider = d.nonEnregistrees.filter(r => !revuePar.value.has(r.ref)).length
  return d.disparues.length + d.legitimesSansExclusion.length + aDecider
})

// Texte de recherche par exclusion, et exclusion choisie par règle : les deux sens de
// l'appariement, selon le bloc depuis lequel on part.
const recherche = ref<Record<string, string>>({})
const lien = ref<Record<string, string>>({})

async function proposer(exclusionId: string) {
  const { data } = await eden.api.exclusions({ id: exclusionId }).suggestions.get()
  suggestions.value = { ...suggestions.value, [exclusionId]: data ?? [] }
}

/**
 * Recherche libre, quand la suggestion automatique ne trouve rien — le cas dès que
 * l'exclusion et la règle sont rédigées dans des termes différents, ce qui est la norme :
 * l'une décrit une décision, l'autre un critère technique.
 */
async function chercher(exclusionId: string) {
  const { data } = await eden.api.exclusions['regles-libres'].get({ query: { q: recherche.value[exclusionId] ?? '' } })
  suggestions.value = { ...suggestions.value, [exclusionId]: data ?? [] }
}

async function apparier(exclusionId: string, outilRef: string | null) {
  const { error } = await eden.api.exclusions({ id: exclusionId }).rapprocher.patch({ outilRef })
  if (error) {
    // Le serveur nomme l'incident qui détient déjà la règle : le remplacer par « impossible »
    // obligerait à chercher soi-même ce qu'il vient de dire.
    const detail = (error.value as { message?: string } | undefined)?.message
    toast.newToast({ duration: 5000, title: 'Erreur', message: detail || 'Appariement impossible.', type: 'error' })
    return
  }
  await charger()
}
</script>

<template>
  <section
    v-if="!chargement"
    class="space-y-4"
  >
    <div class="flex flex-wrap items-center gap-3">
      <h2 class="text-sm font-semibold text-secondary-900 font-sans">
        Rapprochement avec l'EDR
      </h2>
      <span
        v-if="donnees?.configure"
        class="font-mono text-xs"
        :class="total ? 'text-amber-700' : 'text-secondary-500'"
      >{{ total }} écart(s)</span>
      <UIButton
        variant="ghost"
        class="ml-auto h-8 text-xs"
        @click="charger"
      >
        <Icon
          name="lucide:refresh-cw"
          class="size-3.5"
        />
        Actualiser
      </UIButton>
    </div>

    <!-- Sans ce témoin, zéro écart et « la lecture a échoué » se ressemblent exactement. -->
    <p
      v-if="temoin"
      class="rounded-xl border p-3 text-xs"
      :class="temoin.ton === 'alerte'
        ? 'border-red-200/70 bg-red-50/60 text-red-800'
        : temoin.ton === 'ok'
          ? 'border-secondary-200/60 bg-secondary-50/40 text-secondary-600'
          : 'border-secondary-200/60 bg-secondary-50/40 text-secondary-500'"
    >
      {{ temoin.texte }}
    </p>

    <!-- Cet écart-là ne dépend pas de l'EDR : il se voit même sans connecteur, et
         s'affiche donc hors du bloc conditionné à sa configuration. -->
    <div v-if="donnees?.legitimesSansExclusion.length">
      <h3 class="text-xs font-semibold text-secondary-500 uppercase tracking-widest font-mono mb-1.5">
        Clos « légitime » sans exclusion — {{ donnees.legitimesSansExclusion.length }}
      </h3>
      <ul class="flex flex-wrap gap-1.5">
        <li
          v-for="i in donnees.legitimesSansExclusion"
          :key="i.id"
        >
          <NuxtLink
            :to="`/incidents/${i.id}`"
            class="inline-flex items-baseline gap-1.5 rounded-lg border border-amber-200/60 bg-amber-50/30 px-2.5 py-1 hover:border-primary-300"
          >
            <span class="font-mono text-xs font-semibold text-secondary-500">#{{ i.id }}</span>
            <span class="text-xs text-secondary-600">{{ i.type }}</span>
          </NuxtLink>
        </li>
      </ul>
      <p class="mt-1.5 text-xs text-secondary-500">
        Classer un incident « légitime », c'est décider de ne plus le voir. Cette décision
        doit exister quelque part : ouvrez l'incident et enregistrez l'exclusion correspondante,
        avec son motif et sa date de revue.
      </p>
    </div>

    <template v-if="donnees?.configure">
      <div v-if="donnees.nonEnregistrees.length">
        <h3 class="text-xs font-semibold text-secondary-500 uppercase tracking-widest font-mono mb-1.5">
          Règles de l'EDR non consignées — {{ donnees.nonEnregistrees.length }}
        </h3>
        <ul class="space-y-1.5">
          <li
            v-for="r in donnees.nonEnregistrees"
            :key="r.ref"
            class="rounded-lg border border-secondary-200/60 bg-secondary-50/30 px-3 py-2"
          >
            <p class="text-sm text-secondary-800">
              {{ r.libelle || '(sans commentaire)' }}
              <span
                v-if="r.cible"
                class="ml-1 font-mono text-[11px] text-secondary-500"
              >{{ r.cible }}</span>
            </p>
            <p
              v-if="r.criteres.length"
              class="mt-0.5 font-mono text-[11px] text-secondary-600 break-all"
            >
              {{ r.criteres.join(' · ') }}
            </p>

            <div class="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                v-if="revuePar.get(r.ref)"
                class="inline-flex items-center gap-1 rounded-md border border-emerald-200/70 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
              >
                <Icon
                  name="lucide:calendar-check"
                  class="size-3"
                />
                Revue programmée au {{ dateMoyenne(revuePar.get(r.ref)!.echeance) }}
              </span>
              <UIButton
                v-if="modifiable"
                variant="outline"
                class="h-8 text-xs"
                :title="revuePar.get(r.ref)
                  ? 'Modifier la décision prise sur cette règle'
                  : 'Rattacher la règle à l\'incident qui la motive, ou lui programmer une revue'"
                @click="consigner(r)"
              >
                <Icon
                  name="lucide:clipboard-check"
                  class="size-3.5"
                />
                {{ revuePar.get(r.ref) ? 'Modifier' : 'Consigner' }}
              </UIButton>
            </div>

            <!-- L'appariement doit être possible depuis les DEUX blocs : on part tantôt de
                 la règle constatée, tantôt de la décision consignée. -->
            <div
              v-if="modifiable && donnees?.nonRapprochees.length"
              class="mt-1.5 flex flex-wrap items-center gap-2 border-t border-secondary-200/50 pt-1.5"
            >
              <label class="text-[11px] text-secondary-500">Décision déjà consignée :</label>
              <select
                v-model="lien[r.ref]"
                class="rounded border border-secondary-200 bg-white px-1.5 py-0.5 text-xs max-w-full"
              >
                <option value="">
                  choisir une exclusion…
                </option>
                <option
                  v-for="x in donnees.nonRapprochees"
                  :key="x.id"
                  :value="x.id"
                >
                  #{{ x.incidentId }} — {{ x.scope }}
                </option>
              </select>
              <button
                v-if="lien[r.ref]"
                type="button"
                class="rounded border border-primary-300 px-1.5 py-0.5 text-xs text-primary-700 hover:bg-primary-50"
                @click="apparier(lien[r.ref]!, r.ref)"
              >
                Rattacher
              </button>
            </div>
          </li>
        </ul>
        <p class="mt-1.5 text-xs text-secondary-500">
          <strong>{{ donnees.nonEnregistrees.length }} sur {{ donnees.volume.total }} règles</strong>
          présentes dans l'EDR : les {{ donnees.volume.editeur }} fournies par l'éditeur ne sont
          pas listées, elles ne relèvent d'aucune décision de la cellule.
        </p>
        <p class="mt-1 text-xs text-secondary-500">
          Listes blanches posées dans l'outil, pour la plupart sans incident d'origine :
          déploiement, scripts d'exploitation, exceptions techniques. « Consigner » tranche :
          <strong>rattachée à l'incident qui la motive</strong>, elle devient une exclusion ;
          <strong>posée hors incident</strong>, elle reçoit une revue programmée. Dans les
          deux cas, un motif et une échéance, rappelée le moment venu. Si l'une correspond à
          une décision déjà consignée, rattachez-la ci-dessus.
        </p>
      </div>

      <div v-if="donnees.disparues.length">
        <h3 class="text-xs font-semibold text-secondary-500 uppercase tracking-widest font-mono mb-1.5">
          Enregistrées, disparues de l'EDR — {{ donnees.disparues.length }}
        </h3>
        <ul class="space-y-1.5">
          <li
            v-for="e in donnees.disparues"
            :key="e.id"
            class="flex flex-wrap items-baseline gap-2 rounded-lg border border-red-200/60 bg-red-50/30 px-3 py-2"
          >
            <NuxtLink
              :to="`/incidents/${e.incidentId}`"
              class="font-mono text-xs font-semibold text-secondary-400 hover:text-primary-600"
            >#{{ e.incidentId }}</NuxtLink>
            <span class="font-mono text-sm text-secondary-800 break-all">{{ e.scope }}</span>
            <button
              v-if="modifiable"
              type="button"
              class="ml-auto text-xs text-secondary-500 hover:underline"
              title="La règle n'existe plus dans l'EDR : détacher la référence"
              @click="apparier(e.id, null)"
            >
              détacher
            </button>
          </li>
        </ul>
        <p class="mt-1.5 text-xs text-secondary-500">
          L'exclusion est toujours active dans Slowpoke, mais la règle a disparu de l'outil :
          la détection est donc revenue sans que personne ne l'ait décidé.
        </p>
      </div>

      <div v-if="donnees.nonRapprochees.length">
        <h3 class="text-xs font-semibold text-secondary-500 uppercase tracking-widest font-mono mb-1.5">
          Non rapprochées — {{ donnees.nonRapprochees.length }}
        </h3>
        <ul class="space-y-1.5">
          <li
            v-for="e in donnees.nonRapprochees"
            :key="e.id"
            class="rounded-lg border border-secondary-200/60 bg-white px-3 py-2"
          >
            <div class="flex flex-wrap items-baseline gap-2">
              <NuxtLink
                :to="`/incidents/${e.incidentId}`"
                class="font-mono text-xs font-semibold text-secondary-400 hover:text-primary-600"
              >#{{ e.incidentId }}</NuxtLink>
              <span class="font-mono text-sm text-secondary-800 break-all">{{ e.scope }}</span>
              <button
                v-if="modifiable"
                type="button"
                class="ml-auto text-xs text-primary-600 hover:underline"
                @click="proposer(e.id)"
              >
                chercher la règle
              </button>
            </div>

            <div
              v-if="modifiable && suggestions[e.id]"
              class="mt-1.5 flex flex-wrap items-center gap-2"
            >
              <input
                v-model="recherche[e.id]"
                type="text"
                placeholder="chercher une règle par commentaire, cible ou critère"
                class="min-w-0 flex-1 rounded border border-secondary-200 px-2 py-1 text-xs"
                @keyup.enter="chercher(e.id)"
              >
              <button
                type="button"
                class="rounded border border-secondary-300 px-1.5 py-0.5 text-xs text-secondary-600 hover:bg-secondary-50"
                @click="chercher(e.id)"
              >
                chercher
              </button>
            </div>

            <ul
              v-if="suggestions[e.id]?.length"
              class="mt-1.5 space-y-1 border-t border-secondary-200/60 pt-1.5"
            >
              <li
                v-for="s in suggestions[e.id]"
                :key="s.ref"
                class="flex flex-wrap items-baseline gap-2 text-xs"
              >
                <span class="text-secondary-700">{{ s.libelle || '(sans commentaire)' }}</span>
                <span class="font-mono text-[11px] text-secondary-500 break-all">{{ s.criteres.join(' · ') }}</span>
                <button
                  type="button"
                  class="ml-auto rounded border border-primary-300 px-1.5 py-0.5 text-primary-700 hover:bg-primary-50"
                  @click="apparier(e.id, s.ref)"
                >
                  c'est celle-ci
                </button>
              </li>
            </ul>
            <p
              v-else-if="suggestions[e.id]"
              class="mt-1 text-xs text-secondary-500"
            >
              Aucune règle ne correspond automatiquement — cherchez-la ci-dessus.
            </p>
          </li>
        </ul>
        <p class="mt-1.5 text-xs text-secondary-500">
          Exclusions consignées avant ce rapprochement, ou jamais appariées.
          <strong>Ce n'est pas un écart</strong> : tant qu'elles n'ont pas de référence, on ne peut
          rien affirmer sur leur présence dans l'EDR.
        </p>
      </div>

      <p
        v-if="!total && !donnees.nonRapprochees.length && donnees.etat?.dernierOk"
        class="text-sm text-secondary-600"
      >
        Aucun écart : aucune exclusion consignée n'a perdu sa règle, aucune règle de l'outil
        n'attend sa décision, et aucun incident clos « légitime » n'est resté sans décision.
      </p>
    </template>

    <ExclusionsDecisionRegleModal
      v-model="decisionOuverte"
      :regle="regleChoisie"
      @enregistre="charger"
    />
  </section>
</template>
