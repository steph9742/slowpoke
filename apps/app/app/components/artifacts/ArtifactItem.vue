<script setup lang="ts">
import type { Artifact } from '~/types/elysia'
import { MIME_TYPES } from '~/types/mime'
import { useToast } from '@slowpoke/ui'

const toast = useToast()

const props = defineProps<{
  incidentId: string
  artifact: Artifact
}>()

// TÉLÉCHARGEMENT PAR `fetch`, ET NON PAR EDEN.
//
// Eden interprète la réponse selon son type MIME : un `text/plain` revient en chaîne, un
// `application/json` en objet déjà parsé — donc réécrit, plus identique à l'octet près —
// et le reste en ArrayBuffer. Un fichier n'est pas une valeur à interpréter : `fetch` rend
// les octets tels qu'ils sont, quel que soit le type.
const downloadArtifact = async () => {
  const echec = (message: string) => toast.newToast({
    title: 'Téléchargement impossible', message, type: 'error', duration: 6000,
  })

  try {
    const base = String(useRuntimeConfig().public.serverBaseUrl ?? '').replace(/\/$/, '')
    const reponse = await fetch(`${base}/api/artifacts/download/${props.artifact.id}`, {
      credentials: 'include',
    })

    if (!reponse.ok) {
      echec(reponse.status === 404
        ? 'Le fichier n\'est plus sur le serveur. Les pièces envoyées avant la mise en place du volume de stockage n\'étaient pas conservées d\'un déploiement à l\'autre.'
        : `Le serveur a répondu ${reponse.status}.`)
      return
    }

    const blob = await reponse.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = props.artifact.name || `artifact-${props.artifact.id}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
  catch (error) {
    // Une erreur réseau ne doit pas rester dans la console : un bouton sans effet ne se
    // diagnostique pas.
    echec(error instanceof Error ? error.message : 'Erreur réseau.')
  }
}
</script>

<template>
  <li
    class="shadow border border-gray-200 rounded-xl size-48  flex flex-col bg-gray-100 overflow-hidden"
  >
    <div
      class="flex items-center justify-center bg-gray-50 h-full cursor-pointer relative transition-colors duration-150 before:absolute before:inset-0 before:content-['Télécharger'] before:opacity-0 hover:before:opacity-100 before:flex before:items-center before:justify-center before:text-sm before:text-white before:bg-black/40 before:transition-opacity before:duration-150"
      @click="downloadArtifact()"
    >
      <Icon
        name="lucide:file"
        class="size-10 text-primary-400"
      />
    </div>
    <div class="bg-white w-full px-2.5 py-2 h-full max-h-16">
      <p class="font-medium text-xs">
        {{ artifact.name }}
      </p>
      <p class="text-gray-500 text-xs">
        {{ MIME_TYPES[props.artifact.mimeType as keyof typeof MIME_TYPES] || props.artifact.mimeType }}
      </p>
    </div>
  </li>
</template>
