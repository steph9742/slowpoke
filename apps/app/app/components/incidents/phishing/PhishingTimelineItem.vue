<script setup lang="ts">
import type { IncidentGetData } from '~/types/elysia'

type AffectedUser = NonNullable<IncidentGetData['affectedUsers']>[number]
type Log = AffectedUser['connectionLogs'][number]

defineProps<{
  log: Log
  isLast?: boolean
}>()

const getActionColor = (type: string) => {
  switch (type) {
    case 'messages_sent': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30'
    case 'messages_deleted': return 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
    case 'contacts_added': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
    case 'identity_modified': return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
    default: return 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-300 border-primary-200 dark:border-primary-500/30'
  }
}

const getActionIcon = (type: string) => {
  switch (type) {
    case 'messages_sent': return 'lucide:send'
    case 'messages_deleted': return 'lucide:trash-2'
    case 'contacts_added': return 'lucide:user-plus'
    case 'identity_modified': return 'lucide:pencil-line'
    default: return 'lucide:shield-alert'
  }
}

const formatActionName = (action: { actionType: string, label?: string | null }) => {
  if (action.actionType === 'other' && action.label) return action.label
  const translations: Record<string, string> = {
    messages_sent: 'Messages envoyés',
    messages_deleted: 'Messages supprimés',
    contacts_added: 'Contacts ajoutés',
    identity_modified: 'Identité modifiée',
    other: 'Autre',
  }
  return translations[action.actionType] || action.actionType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const hasInfo = (info: unknown): info is Record<string, unknown> =>
  !!info && typeof info === 'object' && Object.keys(info as Record<string, unknown>).length > 0
</script>

<template>
  <div class="relative pl-6 sm:pl-10">
    <div
      class="absolute -left-1.25 sm:-left-2.25 top-1 sm:top-2 flex h-3 w-3 sm:h-4 sm:w-4 items-center justify-center rounded-full bg-background border-[3px] border-primary-400 ring-4 ring-background z-10 transition-colors shadow-[0_0_8px_rgba(var(--color-primary-500),0.4)]"
    />

    <div
      class="group rounded-xl border border-primary-200/50 bg-background/30 backdrop-blur-md p-3 sm:p-5 shadow-sm transition-all hover:border-primary-300 hover:shadow-md"
    >
      <div
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 sm:gap-4 sm:mb-5 sm:pb-4 border-b border-primary-200/40"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50/50 border border-primary-200/50 text-primary-600"
          >
            <Icon
              name="lucide:network"
              class="size-5"
            />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 min-w-0">
              <h4 class="font-mono text-sm font-semibold tracking-wide text-text break-all min-w-0">
                {{ log.ipAddress }}
              </h4>
              <span
                v-if="log.countryCode"
                class="inline-flex items-center rounded-md border border-primary-200/50 bg-primary-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary-700"
              >
                {{ log.countryCode }}
              </span>
            </div>
            <p
              v-if="log.countryName"
              class="text-xs text-secondary-500 mt-0.5 font-medium"
            >
              {{ log.countryName }}
            </p>
          </div>
        </div>

        <div class="flex flex-col sm:items-end text-sm">
          <div class="flex items-center gap-1.5 text-text/80">
            <Icon
              name="lucide:clock"
              class="size-3.5 text-secondary-400"
            />
            <span class="font-mono text-xs font-medium">{{ new Date(log.activityStart).toLocaleString('fr-FR') }}</span>
          </div>
          <div
            v-if="log.activityEnd"
            class="flex items-center gap-1.5 text-xs text-secondary-500 mt-1"
          >
            <Icon
              name="lucide:arrow-right"
              class="size-3"
            />
            <span class="font-mono text-[11px]">{{ new Date(log.activityEnd).toLocaleString('fr-FR') }}</span>
          </div>
        </div>
      </div>

      <div
        v-if="log.actions && log.actions.length > 0"
        class="space-y-4"
      >
        <h5 class="text-xs font-bold uppercase tracking-wider text-secondary-500 flex items-center gap-2 mb-3">
          <Icon
            name="lucide:activity"
            class="size-3.5 text-primary-400"
          />
          Activité détectée
        </h5>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div
            v-for="action in log.actions"
            :key="action.id"
            class="flex items-start gap-2.5 rounded-lg border border-primary-200/30 bg-primary-50/10 p-3 sm:p-3.5 transition-colors hover:bg-primary-50/20"
          >
            <div
              :class="['flex size-8 shrink-0 items-center justify-center rounded-md border shadow-sm', getActionColor(action.actionType)]"
            >
              <Icon
                :name="getActionIcon(action.actionType)"
                class="size-4"
              />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2 mb-1">
                <span class="text-sm font-semibold text-text break-words min-w-0">
                  {{ formatActionName(action) }}
                </span>
                <span
                  v-if="action.amount !== null"
                  class="font-mono text-[10px] font-bold text-primary-700 bg-primary-100 border border-primary-200/50 px-1.5 py-0.5 rounded-full"
                >
                  x{{ action.amount }}
                </span>
              </div>

              <div
                v-if="hasInfo(action.additionalInfo)"
                class="mt-2"
              >
                <div
                  class="max-h-24 overflow-y-auto w-full rounded border border-primary-200/40 bg-background/50 p-2 opacity-80 group-hover:opacity-100 transition-opacity styled-scrollbar"
                >
                  <pre
                    class="text-[10px] font-mono text-secondary-600 whitespace-pre-wrap break-all leading-relaxed"
                  >{{ JSON.stringify(action.additionalInfo, null, 2) }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        v-else
        class="text-xs text-secondary-500 italic flex items-center gap-2 py-2 bg-secondary-50/30 rounded-md px-3 border border-secondary-100 mt-2"
      >
        <Icon
          name="lucide:minus-circle"
          class="size-3.5"
        /> Aucune action spécifique enregistrée
      </div>
    </div>
  </div>
</template>
