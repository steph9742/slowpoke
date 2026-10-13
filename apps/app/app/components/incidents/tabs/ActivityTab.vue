<script setup lang="ts">
import type { IncidentGetData } from '~/types/elysia'

const props = defineProps<{
  incident: IncidentGetData
  incidentId: string
}>()

type AffectedUser = NonNullable<IncidentGetData['affectedUsers']>[number]
type Log = AffectedUser['connectionLogs'][number]

const ACTION_LABELS: Record<string, string> = {
  messages_sent: 'Messages envoyés',
  messages_deleted: 'Messages supprimés',
  contacts_added: 'Contacts ajoutés',
  identity_modified: 'Identité modifiée',
  other: 'Autre',
}
const ACTION_ICON: Record<string, string> = {
  messages_sent: 'lucide:send',
  messages_deleted: 'lucide:trash-2',
  contacts_added: 'lucide:user-plus',
  identity_modified: 'lucide:pencil-line',
  other: 'lucide:shield-alert',
}
const actionLabel = (a: { actionType: string, label?: string | null }) =>
  a.actionType === 'other' && a.label ? a.label : (ACTION_LABELS[a.actionType] ?? a.actionType)
const actionIcon = (t: string) => ACTION_ICON[t] ?? 'lucide:activity'

const fmtDateTime = (d?: string | Date | null) =>
  d ? new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : ''
const fmtTime = (d?: string | Date | null) =>
  d ? new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : ''

// Fil chronologique fusionné : tous les logs de tous les utilisateurs, triés par heure
const events = computed(() => {
  const out: { id: string, user: string, log: Log }[] = []
  for (const u of props.incident.affectedUsers ?? []) {
    for (const log of u.connectionLogs ?? []) {
      out.push({ id: log.id, user: u.fullName, log })
    }
  }
  return out.sort((a, b) => new Date(a.log.activityStart).getTime() - new Date(b.log.activityStart).getTime())
})
</script>

<template>
  <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
    <div class="flex items-center gap-3 border-b border-gray-100 pb-4">
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
        <Icon
          name="lucide:activity"
          class="size-5"
        />
      </div>
      <div>
        <UITitle
          level="3"
          class="font-sans tracking-tight text-secondary-900 mb-0!"
        >
          Activité de l'incident
        </UITitle>
        <p class="text-xs text-secondary-500">
          Fil chronologique de l'activité observée, tous utilisateurs confondus.
        </p>
      </div>
    </div>

    <ol
      v-if="events.length"
      class="relative ml-2 border-l-2 border-rose-200/70 space-y-6"
    >
      <li
        v-for="e in events"
        :key="e.id"
        class="relative pl-6"
      >
        <span class="absolute -left-[7px] top-1.5 size-3 rounded-full bg-rose-500 ring-4 ring-white" />

        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span class="font-mono text-sm font-semibold text-secondary-900">{{ fmtDateTime(e.log.activityStart) }}</span>
          <span
            v-if="e.log.activityEnd"
            class="font-mono text-xs text-secondary-400"
          >→ {{ fmtTime(e.log.activityEnd) }}</span>
          <span class="text-sm font-medium text-secondary-700 break-words min-w-0">{{ e.user }}</span>
        </div>

        <div class="mt-1 rounded-xl border border-gray-200 bg-white shadow-sm p-3.5 space-y-2">
          <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-secondary-700">
            <Icon
              name="lucide:network"
              class="size-4 text-secondary-400 shrink-0"
            />
            <span>Connexion depuis</span>
            <span class="font-mono font-medium text-secondary-900 break-all min-w-0">{{ e.log.ipAddress }}</span>
            <span
              v-if="e.log.countryCode"
              class="inline-flex items-center rounded-md bg-secondary-100 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-secondary-600"
            >{{ e.log.countryCode }}</span>
            <span
              v-if="e.log.countryName"
              class="text-xs text-secondary-400"
            >{{ e.log.countryName }}</span>
          </p>

          <div
            v-if="e.log.actions?.length"
            class="flex flex-wrap gap-1.5"
          >
            <span
              v-for="(a, ai) in e.log.actions"
              :key="ai"
              class="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200/60 px-2 py-1 text-xs text-rose-700"
            >
              <Icon
                :name="actionIcon(a.actionType)"
                class="size-3.5"
              />
              {{ actionLabel(a) }}<template v-if="a.amount != null"> · <span class="font-mono font-semibold">{{ a.amount }}</span></template>
            </span>
          </div>
        </div>
      </li>
    </ol>

    <div
      v-else
      class="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50"
    >
      <Icon
        name="lucide:activity"
        class="size-7 text-gray-300 mb-2"
      />
      <span class="text-gray-400 font-geistmono text-sm select-none">Aucune activité enregistrée</span>
      <span class="text-gray-400 text-xs mt-1">Les logs d'activité s'ajoutent depuis l'onglet Utilisateurs.</span>
    </div>
  </div>
</template>
