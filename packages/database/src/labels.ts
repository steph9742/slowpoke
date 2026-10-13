// LIBELLÉS FRANÇAIS DES STATUTS ET RÉSOLUTIONS — source unique, importée des deux côtés.
//
// Tenues en double, ces tables prenaient du retard sur les enums, et la main courante
// affichait des valeurs techniques quand l'interface était à jour.
//
// Les clés sont TYPÉES SUR LES ENUMS du schéma (`import type` : rien de drizzle n'atteint le
// bundle client), donc ajouter une valeur sans son libellé est une erreur de compilation.

import type { incidentStatus, incidentResolution } from './schemas/schema'

type StatusValue = (typeof incidentStatus.enumValues)[number]
type ResolutionValue = (typeof incidentResolution.enumValues)[number]

export const STATUS_LABELS: Record<StatusValue, string> = {
  open: 'Ouvert',
  investigating: 'Investigation',
  in_progress: 'En cours',
  surveillance: 'Sous surveillance',
  resolved: 'Résolu',
  closed: 'Fermé',
}

export const RESOLUTION_LABELS: Record<ResolutionValue, string> = {
  true_positive: 'Vrai positif',
  risk_accepted: 'Risque assumé',
  false_positive: 'Faux positif',
  benign: 'Bénin',
  legitimate: 'Activité légitime',
  duplicate: 'Doublon',
}

/** Libellé d'un statut ; retombe sur la valeur brute pour une donnée hors enum. */
export function statusLabel(value: string | null | undefined): string {
  return STATUS_LABELS[value as StatusValue] ?? String(value ?? '')
}

/** Libellé d'une résolution ; `—` pour l'absence (incident non résolu). */
export function resolutionLabel(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return RESOLUTION_LABELS[value as ResolutionValue] ?? String(value)
}
