export type IncidentLogType = 'update' | 'comment' | 'status_change' | 'other' | 'created' | 'artifact_added' | 'artifact_removed' | 'user_added' | 'user_removed' | 'extension_updated'

export const TIMELINE_LOG_TYPE_OPTIONS: Array<{ label: string, value: IncidentLogType }> = [
  { label: 'Mise à jour', value: 'update' },
  { label: 'Commentaire', value: 'comment' },
  { label: 'Changement de statut', value: 'status_change' },
  { label: 'Autre', value: 'other' },
  { label: 'Création', value: 'created' },
  { label: 'Artéfact ajouté', value: 'artifact_added' },
  { label: 'Artéfact retiré', value: 'artifact_removed' },
  { label: 'Utilisateur ajouté', value: 'user_added' },
  { label: 'Utilisateur retiré', value: 'user_removed' },
  { label: 'Extension mise à jour', value: 'extension_updated' },
]
