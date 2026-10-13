<script setup lang="ts">
import { UIButton, UIInput, useToast } from '@slowpoke/ui'
import { ref, onMounted } from 'vue'

// Réglages de la file d'alertes.
//
// Rien ici n'est propre à l'établissement : une autre installation a une autre source, un
// autre tableau de bord et un autre bruit de fond. C'est la raison d'être de cet écran —
// ces trois valeurs vivaient en constantes dans le code.

const eden = useEden()
const toast = useToast()

const chargement = ref(true)
const enCours = ref(false)
const tableauDeBord = ref('')
const seuil = ref<number | undefined>(undefined)
const retentionJours = ref<number | undefined>(undefined)
const niveauNotification = ref<number | undefined>(undefined)
const seuilDefaut = ref(10)
const retentionDefaut = ref(90)
const niveauNotificationDefaut = ref(12)

type Etat = {
  tableauDeBord: string | null
  seuil: number
  retentionJours: number
  niveauNotification: number
  seuilDefaut: number
  retentionDefaut: number
  niveauNotificationDefaut: number
}

function appliquer(d: Etat) {
  tableauDeBord.value = d.tableauDeBord ?? ''
  seuil.value = d.seuil
  retentionJours.value = d.retentionJours
  niveauNotification.value = d.niveauNotification
  seuilDefaut.value = d.seuilDefaut
  retentionDefaut.value = d.retentionDefaut
  niveauNotificationDefaut.value = d.niveauNotificationDefaut
}

onMounted(async () => {
  const { data } = await eden.api.settings.alertes.get()
  if (data) appliquer(data as Etat)
  chargement.value = false
})

async function enregistrer() {
  if (enCours.value) return
  enCours.value = true
  const { data, error } = await eden.api.settings.alertes.put({
    tableauDeBord: tableauDeBord.value,
    ...(seuil.value === undefined ? {} : { seuil: seuil.value }),
    ...(retentionJours.value === undefined ? {} : { retentionJours: retentionJours.value }),
    ...(niveauNotification.value === undefined ? {} : { niveauNotification: niveauNotification.value }),
  })
  enCours.value = false
  if (error || !data) {
    const detail = (error?.value as { message?: string } | undefined)?.message
    toast.newToast({ title: 'Enregistrement impossible', message: detail ?? '', type: 'error', duration: 6000 })
    return
  }
  appliquer(data as Etat)
  toast.newToast({ title: 'Réglages enregistrés', message: '', type: 'success' })
}
</script>

<template>
  <div class="space-y-4">
    <p
      v-if="chargement"
      class="text-sm text-secondary-400"
    >
      Lecture des réglages…
    </p>
    <template v-else>
      <p class="text-sm text-secondary-600">
        La file de triage reçoit les alertes de la source (Wazuh aujourd'hui) par
        <span class="font-mono text-xs">POST /api/alerts</span>, avec une clé de service. Ces trois réglages
        décident de ce qui entre, de ce qu'on garde, et d'où mènent les liens.
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-1 sm:col-span-2">
          <label
            for="alertes-tableau"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Adresse du tableau de bord (https)</label>
          <UIInput
            id="alertes-tableau"
            v-model="tableauDeBord"
            placeholder="https://wazuh.exemple.fr"
          />
          <p class="text-[11px] text-secondary-500">
            Les liens « Ouvrir dans l'outil » reçus des émetteurs sont <strong>réécrits vers cette adresse</strong>.
            Un émetteur fabrique son lien avec l'adresse qu'il connaît — souvent celle d'un réseau interne —
            que personne ne joint depuis un poste : le lien s'ouvrait sur rien. Vide, le lien est gardé tel quel,
            et à défaut l'adresse des réglages Wazuh sert quand l'accès passe par le tableau de bord.
          </p>
        </div>

        <div class="space-y-1">
          <label
            for="alertes-seuil"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Seuil d'ingestion (niveau)</label>
          <UIInput
            id="alertes-seuil"
            v-model.number="seuil"
            type="number"
            min="0"
            max="16"
            :placeholder="String(seuilDefaut)"
          />
          <p class="text-[11px] text-secondary-500">
            En dessous, l'alerte est <strong>refusée avec son motif</strong>, jamais avalée en silence.
            Descendre le seuil n'a de sens qu'une fois le réglage des règles fait : une file qu'on
            n'arrive pas à vider est une file qu'on cesse de lire.
          </p>
        </div>

        <div class="space-y-1">
          <label
            for="alertes-retention"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Rétention (jours)</label>
          <UIInput
            id="alertes-retention"
            v-model.number="retentionJours"
            type="number"
            min="7"
            max="3650"
            :placeholder="String(retentionDefaut)"
          />
          <p class="text-[11px] text-secondary-500">
            Porte sur les alertes <strong>non escaladées</strong>. Les lignes partent, leur décompte reste
            dans l'agrégat mensuel — les alertes écartées sont la matière du réglage des règles.
            Les escaladées suivent la rétention de leur incident.
          </p>
        </div>

        <div class="space-y-1">
          <label
            for="alertes-notification"
            class="block text-xs font-semibold uppercase tracking-wider text-secondary-500"
          >Notifier à partir du niveau</label>
          <UIInput
            id="alertes-notification"
            v-model.number="niveauNotification"
            type="number"
            min="0"
            max="17"
            :placeholder="String(niveauNotificationDefaut)"
          />
          <p class="text-[11px] text-secondary-500">
            Une alerte <strong>neuve</strong> au-dessus de ce niveau envoie une notification à qui l'a demandée
            (Réglages → Notifications → « Alertes graves »). Jamais sur une occurrence, jamais sur une série
            faite taire. <strong>17 = ne jamais notifier</strong> : notifier chaque alerte, c'est faire couper
            les notifications au bout d'une journée, et perdre celles qui comptaient.
          </p>
        </div>
      </div>

      <UIButton
        :disabled="enCours"
        @click="enregistrer"
      >
        Enregistrer
      </UIButton>
    </template>
  </div>
</template>
