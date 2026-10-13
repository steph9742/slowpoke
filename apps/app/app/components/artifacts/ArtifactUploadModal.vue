<script setup lang="ts">
import { UIButton, UIDialog, useToast, UIInput } from '@slowpoke/ui'

const props = defineProps<{
  incidentId: string
}>()

const emit = defineEmits<{
  (e: 'artifact-uploaded'): void
}>()

const eden = useEden()

const openValue = ref<boolean>(false)

const file = shallowRef<File | null | undefined>(null)
const meta = reactive({
  name: '',
  content: '',
})

const onFileChange = (event: Event) => {
  file.value = event.target instanceof HTMLInputElement && event.target.files ? event.target.files[0] : null
}

const dropzoneRef = templateRef('dropzone')
const onDrop = (files: File[] | null) => {
  if (!files) return
  file.value = files[0]
}

const { isOverDropZone } = useDropZone(dropzoneRef, {
  onDrop,
  multiple: false,
  preventDefaultForUnhandled: false,
})

const reset = () => {
  file.value = null
  openValue.value = false
}

const uploadFile = async () => {
  if (!file.value) return useToast().newToast({ duration: 3000, title: 'Aucun fichier sélectionné', message: 'Veuillez sélectionner un fichier à uploader.', type: 'error' })

  await eden.api.artifacts({ incidentId: props.incidentId }).upload.post({
    file: file.value,
    name: meta.name,
    content: meta.content,
  })

  openValue.value = false
  emit('artifact-uploaded')
  return useToast().newToast({ duration: 3000, title: 'Fichier uploadé', message: 'Le fichier a été uploadé avec succès.', type: 'success' })
}
</script>

<template>
  <UIButton
    variant="outline"
    size="sm"
    @click="openValue = true"
  >
    Uploader un artéfact
  </UIButton>
  <UIDialog
    v-model="openValue"
    title="Uploader un artéfact"
  >
    <template #content>
      <div class="w-full space-y-5">
        <label
          ref="dropzone"
          for="file-upload"
          class="border border-gray-300 rounded-lg px-3 py-1.5 w-full grid place-items-center h-30"
        >
          <p class="text-sm font-sans">
            {{ file ? file.name : isOverDropZone ? 'Déposer le fichier ici' : 'Sélectionner un fichier ou le glisser-déposer ici' }}
          </p>
        </label>
        <input
          id="file-upload"
          type="file"
          placeholder="Select a file to upload"
          class="hidden"
          @change="onFileChange"
        >
        <div class="space-y-3">
          <UIInput
            v-model="meta.name"
            label="Nom de l'artéfact"
            class="mt-4"
          />
          <UIInput
            v-model="meta.content"
            label="Contenu de l'artéfact"
            class="mt-4"
            textarea
            rows="4"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <UIButton
        variant="outline"
        size="sm"
        @click="reset"
      >
        Annuler
      </UIButton>
      <UIButton
        :disabled="!file"
        size="sm"
        @click="uploadFile"
      >
        Uploader
      </UIButton>
    </template>
  </UIDialog>
</template>
