<script setup lang="ts">
import { UIButton, useToast } from '@slowpoke/ui'

const eden = useEden()
const { isAdmin } = await useRoles()
const { isSupported, isUserSubscribed } = useSW()
const toast = useToast()

const NOTIFY_TYPES = [
  { value: 'new_incidents', label: 'Nouveaux incidents', desc: 'À chaque création d\'un incident. (Pour un incident précis, abonne-toi depuis sa page.)' },
  { value: 'revue_listes_blanches', label: 'Revue des listes blanches', desc: 'Sept jours avant une date de revue, puis tant qu\'elle est dépassée. Exclusions et règles posées hors incident.' },
  { value: 'alertes_graves', label: 'Alertes graves', desc: 'À l\'arrivée d\'une alerte neuve au-dessus du niveau réglé (P2 par défaut). Jamais sur une occurrence ni sur une série faite taire.' },
] as const

const loading = ref(true)
const busy = ref(false)
const pushEnabled = ref(false)
const notifyOn = ref<string[]>([])

onMounted(async () => {
  try {
    const status = await isUserSubscribed()
    pushEnabled.value = typeof status === 'object' ? status.onServer : false
    const { data } = await eden.api.notifications.global.get()
    notifyOn.value = data?.notifyOn ?? []
  }
  catch {
    // silencieux : l'UI reste utilisable
  }
  finally {
    loading.value = false
  }
})

async function togglePush() {
  if (busy.value) return
  busy.value = true
  try {
    if (pushEnabled.value) {
      await removeSubscription()
      pushEnabled.value = false
      toast.newToast({ duration: 2500, title: 'Notifications désactivées', message: '', type: 'success' })
    }
    else {
      await subscribeUserToPush()
      pushEnabled.value = true
      toast.newToast({ duration: 2500, title: 'Notifications activées', message: 'Ce navigateur recevra les alertes.', type: 'success' })
    }
  }
  catch (e) {
    console.error('Échec de l\'abonnement push:', e)
    toast.newToast({ duration: 4000, title: 'Erreur', message: 'Activation impossible (permission refusée ou clé VAPID serveur manquante).', type: 'error' })
  }
  finally {
    busy.value = false
  }
}

async function toggleType(value: string) {
  notifyOn.value = notifyOn.value.includes(value)
    ? notifyOn.value.filter(v => v !== value)
    : [...notifyOn.value, value]

  const { error } = await eden.api.notifications.global.post({
    notifyOn: notifyOn.value as ('new_incidents' | 'revue_listes_blanches' | 'alertes_graves')[],
  })
  if (error) {
    toast.newToast({ duration: 4000, title: 'Erreur', message: 'Enregistrement impossible.', type: 'error' })
    return
  }
  toast.newToast({ duration: 1500, title: 'Préférences enregistrées', message: '', type: 'success' })
}

useHead({ title: 'Réglages' })
</script>

<template>
  <div class="p-5 max-w-3xl space-y-6">
    <div>
      <UITitle>Réglages</UITitle>
      <p class="text-sm text-secondary-500 mt-1">
        Notifications et intégrations.
      </p>
    </div>

    <section
      v-if="isAdmin"
      class="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5"
    >
      <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
          <Icon
            name="lucide:book-marked"
            class="size-5"
          />
        </div>
        <div>
          <h2 class="font-semibold text-secondary-900">
            Procédures
          </h2>
          <p class="text-xs text-secondary-500">
            Fiches et checklists de la cellule, lues depuis le dépôt de documentation.
          </p>
        </div>
      </div>
      <SettingsProceduresManager />
    </section>

    <section
      v-if="isAdmin"
      class="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5"
    >
      <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
          <Icon
            name="lucide:gavel"
            class="size-5"
          />
        </div>
        <div>
          <h2 class="font-semibold text-secondary-900">
            NIS 2 — entrée en vigueur
          </h2>
          <p class="text-xs text-secondary-500">
            À partir de quand un incident P2 arme les compteurs sans attendre de décision.
          </p>
        </div>
      </div>
      <SettingsNis2Manager />
    </section>

    <section
      v-if="isAdmin"
      class="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5"
    >
      <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
          <Icon
            name="lucide:server"
            class="size-5"
          />
        </div>
        <div>
          <h2 class="font-semibold text-secondary-900">
            Inventaire
          </h2>
          <p class="text-xs text-secondary-500">
            Machines lues depuis GLPI, pour les rattacher aux incidents sans faute de frappe.
          </p>
        </div>
      </div>
      <SettingsInventaireManager />
    </section>

    <section
      v-if="isAdmin"
      class="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5"
    >
      <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
          <Icon
            name="lucide:book-user"
            class="size-5"
          />
        </div>
        <div>
          <h2 class="font-semibold text-secondary-900">
            Annuaire (LDAP)
          </h2>
          <p class="text-xs text-secondary-500">
            État des comptes lu dans l'annuaire, en lecture seule, pour l'enquête « compte compromis ».
          </p>
        </div>
      </div>
      <SettingsLdapManager />
    </section>

    <section
      v-if="isAdmin"
      class="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5"
    >
      <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
          <Icon
            name="lucide:scroll-text"
            class="size-5"
          />
        </div>
        <div>
          <h2 class="font-semibold text-secondary-900">
            Journaux d'authentification (Wazuh)
          </h2>
          <p class="text-xs text-secondary-500">
            Authentifications d'un compte lues dans les archives de Wazuh, en lecture seule, pour l'enquête « compte compromis ».
          </p>
        </div>
      </div>
      <SettingsWazuhManager />
    </section>

    <section
      v-if="isAdmin"
      class="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5"
    >
      <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
          <Icon
            name="lucide:inbox"
            class="size-5"
          />
        </div>
        <div>
          <h2 class="font-semibold text-secondary-900">
            File d'alertes
          </h2>
          <p class="text-xs text-secondary-500">
            Ce qui entre dans la file de triage, ce qu'on en garde, et où mènent les liens vers l'outil.
          </p>
        </div>
      </div>
      <SettingsAlertesManager />
    </section>

    <section
      v-if="isAdmin"
      class="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5"
    >
      <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
          <Icon
            name="lucide:shield-off"
            class="size-5"
          />
        </div>
        <div>
          <h2 class="font-semibold text-secondary-900">
            EDR — listes blanches
          </h2>
          <p class="text-xs text-secondary-500">
            Compare les exclusions consignées aux règles réellement posées dans l'outil.
          </p>
        </div>
      </div>
      <SettingsEdrManager />
    </section>

    <section
      v-if="isAdmin"
      class="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5"
    >
      <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
          <Icon
            name="lucide:sparkles"
            class="size-5"
          />
        </div>
        <div>
          <h2 class="font-semibold text-secondary-900">
            Assistance
          </h2>
          <p class="text-xs text-secondary-500">
            Modèle local d'aide à l'analyse. Il propose, un analyste valide.
          </p>
        </div>
      </div>
      <SettingsAssistanceManager />
    </section>

    <section
      v-if="isAdmin"
      class="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5"
    >
      <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
          <Icon
            name="lucide:shield-check"
            class="size-5"
          />
        </div>
        <div>
          <h2 class="font-semibold text-secondary-900">
            Import SOC
          </h2>
          <p class="text-xs text-secondary-500">
            Récupère automatiquement les tickets du prestataire et en crée des incidents.
          </p>
        </div>
      </div>
      <SettingsSocImportManager />
    </section>

    <section class="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5">
      <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
          <Icon
            name="lucide:bell"
            class="size-5"
          />
        </div>
        <div>
          <h2 class="font-semibold text-secondary-900">
            Notifications push
          </h2>
          <p class="text-xs text-secondary-500">
            Alertes reçues dans le navigateur.
          </p>
        </div>
      </div>

      <p
        v-if="!isSupported"
        class="text-sm text-amber-600"
      >
        Ce navigateur ne supporte pas les notifications push.
      </p>

      <template v-else>
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-secondary-800">
              Notifications sur ce navigateur
            </p>
            <p class="text-xs text-secondary-500">
              Active la réception des alertes sur cet appareil.
            </p>
          </div>
          <UIButton
            :variant="pushEnabled ? 'outline' : 'primary'"
            :disabled="busy || loading"
            @click="togglePush"
          >
            {{ busy ? '…' : (pushEnabled ? 'Désactiver' : 'Activer') }}
          </UIButton>
        </div>

        <div
          v-if="pushEnabled"
          class="space-y-2 border-t border-gray-100 pt-4"
        >
          <p class="text-sm font-medium text-secondary-800">
            Me notifier pour
          </p>
          <label
            v-for="t in NOTIFY_TYPES"
            :key="t.value"
            class="flex items-start gap-3 rounded-xl border border-gray-200 p-3 cursor-pointer hover:bg-gray-50/70 transition-colors"
          >
            <input
              type="checkbox"
              class="mt-0.5 size-4 accent-primary-600"
              :checked="notifyOn.includes(t.value)"
              @change="toggleType(t.value)"
            >
            <div>
              <p class="text-sm font-medium text-secondary-800">
                {{ t.label }}
              </p>
              <p class="text-xs text-secondary-500">
                {{ t.desc }}
              </p>
            </div>
          </label>
        </div>
      </template>
    </section>

    <section class="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-5">
      <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
          <Icon
            name="lucide:webhook"
            class="size-5"
          />
        </div>
        <div>
          <h2 class="font-semibold text-secondary-900">
            Webhooks
          </h2>
          <p class="text-xs text-secondary-500">
            Relaie les événements d'incident vers n8n ou toute URL externe.
          </p>
        </div>
      </div>
      <SettingsWebhooksManager />
    </section>
  </div>
</template>
