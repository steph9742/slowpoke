export const affiliationTypes = [
  { value: 'student', label: 'Étudiant' },
  { value: 'staff', label: 'Personnel' },
  { value: 'teacher', label: 'Enseignant' },
  { value: 'researcher', label: 'Chercheur' },
  { value: 'emeritus', label: 'Professeur émérite' },
  { value: 'registered_reader', label: 'Lecteur Absys' },
  { value: 'affiliate', label: 'Exterieur non hébergé' },
] as const

export type AffiliationType = typeof affiliationTypes[number]['value']
export type AffiliationTypeLabel = typeof affiliationTypes[number]['label']

// Sentinelle utilisée uniquement dans le sélecteur (jamais persistée) pour révéler le champ libre « Autre »
export const AFFILIATION_OTHER = '__other__'

// Affiche le libellé FR pour un code connu ; sinon affiche la saisie libre telle quelle (valeur « Autre »)
export function affiliationLabel(value?: string | null): string {
  if (!value) return ''
  const known = affiliationTypes.find(t => t.value === value)
  return known ? known.label : value
}
