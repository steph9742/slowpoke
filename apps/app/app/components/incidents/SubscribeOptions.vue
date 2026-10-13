<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { UIButton, UIDropdownMenu, UITooltip } from '@slowpoke/ui'
import type { UIDropdownMenuSection } from '@slowpoke/ui/src/components/dropdown/UIDropdownMenu'
import type { IncidentGetData } from '~/types/elysia'

const props = defineProps<{
  incident: IncidentGetData
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const { isSupported, isUserSubscribed } = useSW()
const eden = useEden()
const session = await useSSRAuth()

const clientSwStatus = ref<false | { onClient: boolean, onServer: boolean } | null>(null)
const isSubscribing = ref(false)

onMounted(async () => {
  clientSwStatus.value = await isUserSubscribed()
})

const hasActiveSwSubscription = computed(() => {
  const status = clientSwStatus.value
  return !!(status && status.onClient && status.onServer)
})

const currentUserId = computed(() => session.value?.user?.id)

// Le GET /:id construit `with` dynamiquement, donc la relation `subscription` (et son `user`)
// n'est pas capturée dans le type statique. On caste vers la forme réellement renvoyée au runtime.
type IncidentSubscriber = { user?: { id: string, name: string } | null }
const subscribers = computed(() => (props.incident?.subscribers ?? []) as IncidentSubscriber[])

const isSubscribedToIncident = computed(() => {
  return subscribers.value.some(s => s.user?.id === currentUserId.value)
})

// État optimiste : le bouton bascule immédiatement ; la vérité (props rafraîchies) reprend au refetch
const localOverride = ref<boolean | null>(null)
const isSubscribed = computed(() => localOverride.value ?? isSubscribedToIncident.value)
watch(isSubscribedToIncident, () => {
  localOverride.value = null
})

async function toggleSubscription() {
  if (isSubscribing.value) return
  isSubscribing.value = true

  const wasSubscribed = isSubscribed.value
  localOverride.value = !wasSubscribed // bascule optimiste immédiate

  try {
    const api = eden.api.notifications['subscribe-to']({ incidentId: props.incident.id })
    const { error } = wasSubscribed ? await api.delete() : await api.post()
    if (error) {
      localOverride.value = wasSubscribed // échec → on revient à l'état d'avant
      return
    }
    emit('refresh')
  }
  catch {
    localOverride.value = wasSubscribed
  }
  finally {
    isSubscribing.value = false
  }
}

const dropdownItems = computed<UIDropdownMenuSection[]>(() => {
  const sections: UIDropdownMenuSection[] = [
    {
      title: 'Mon Statut',
      icon: 'ph:radar-duotone',
      items: [
        {
          label: isSubscribed.value ? 'Se désabonner' : 'Recevoir les alertes',
          onClick: toggleSubscription,
          disabled: isSubscribing.value,
          destructive: isSubscribed.value,
        },
      ],
    },
  ]

  const subs = subscribers.value

  sections.push({
    title: `${subs.length} abonné${subs.length > 1 ? 's' : ''}`,
    icon: 'ph:users-duotone',
    items: subs.length > 0
      ? subs.map(sub => ({
          label: sub.user?.name ?? 'Inconnu',
          disabled: true,
        }))
      : [{ label: 'Aucun abonné pour l\'instant', disabled: true }],
  })

  if (isSupported.value) {
    sections.push({
      title: 'Système',
      icon: 'ph:cpu-duotone',
      items: [
        {
          label: clientSwStatus.value && clientSwStatus.value.onClient ? 'Push Web Actif' : 'Push Web Inactif',
          disabled: true,
        },
      ],
    })
  }

  return sections
})
</script>

<template>
  <template v-if="hasActiveSwSubscription">
    <UIDropdownMenu :items="dropdownItems">
      <UIButton
        variant="outline"
        size="md"
        :class="isSubscribed ? 'text-primary-700 border-primary-300/60' : ''"
      >
        <Icon
          :name="isSubscribing ? 'ph:spinner-gap-duotone' : (isSubscribed ? 'ph:bell-slash-duotone' : 'ph:bell-ringing-duotone')"
          :class="['size-4', isSubscribing ? 'animate-spin' : '']"
        />
        <span class="tracking-tight ml-1.5 font-medium">{{ isSubscribed ? 'Ne plus suivre' : 'Suivre l\'incident' }}</span>
      </UIButton>
    </UIDropdownMenu>
  </template>
  <template v-else>
    <UITooltip content="Activez les notifications dans les paramètres pour vous abonner à cet incident">
      <UIButton
        disabled
        variant="outline"
        size="md"
      >
        <Icon
          name="ph:bell-slash-duotone"
          class="size-4"
        />
        <span class="tracking-tight ml-1.5 font-medium">Push inactif</span>
      </UIButton>
    </UITooltip>
  </template>
</template>
