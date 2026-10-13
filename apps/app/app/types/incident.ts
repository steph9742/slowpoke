import type { IncidentGetData } from './elysia'
import { SEVERITY_LEVELS } from '@slowpoke/database/severity'
import { STATUS_LABELS, RESOLUTION_LABELS } from '@slowpoke/database/labels'
import { normaliserComposante, normaliserLaboratoire } from '@slowpoke/database/composantes'

export type IncidentSeverity = IncidentGetData['severity']
export type IncidentStatus = IncidentGetData['status']
export type IncidentType = IncidentGetData['type']

// Libellés de gravité : dérivés de la source partagée (@slowpoke/database/severity), pas
// recopiés. Le vocabulaire de référence du dispositif est P1–P4 — l'affichage porte donc
// le code ET le libellé, pour que personne n'ait à traduire de tête.
export const severityDisplayNames: Record<IncidentSeverity, string> = Object.fromEntries(
  SEVERITY_LEVELS.map(n => [n.value, `${n.code} — ${n.label}`]),
) as Record<IncidentSeverity, string>

/** Le code seul (« P1 »), pour les pastilles et colonnes étroites. */
export const severityCodes: Record<IncidentSeverity, string> = Object.fromEntries(
  SEVERITY_LEVELS.map(n => [n.value, n.code]),
) as Record<IncidentSeverity, string>

export { SEVERITY_LEVELS, severityLabel, severityCode, severityName } from '@slowpoke/database/severity'

// Composante : le libellé de référence, jamais la saisie — plusieurs écritures désignent la
// même composante, et les libellés saisis sont périmés ou coupés.
/**
 * « IUT Nord … », ou le sigle seul pour une unité de recherche.
 *
 * Un laboratoire se saisit sous la forme « UMR0000 SIGLE: intitulé complet » : l'intitulé est
 * une définition, pas un nom, et c'est le SIGLE qui sert de titre. Rend la saisie telle quelle
 * si elle n'est ni l'un ni l'autre : montrer ce qui existe vaut mieux qu'un vide.
 */
export function composanteLabel(brut: string | null | undefined): string {
  const n = normaliserComposante(brut)
  if (n.libelle) return n.libelle
  const labo = normaliserLaboratoire(brut)
  if (labo) return labo.sigle
  return n.brut ?? ''
}

/** Le code seul, pour l'afficher en second. Vide si la saisie n'en contient pas. */
export function composanteCode(brut: string | null | undefined): string {
  return normaliserComposante(brut).code ?? ''
}

// Dérivé de la source partagée (@slowpoke/database/labels) : la même table alimente la
// main courante côté serveur. Une copie locale prendrait du retard sur l'enum, comme celle
// du serveur l'a fait pour `surveillance` et `legitimate`.
export const statusDisplayNames: Record<IncidentStatus, string> = STATUS_LABELS

export type IncidentResolution = NonNullable<IncidentGetData['resolution']>

export const resolutionDisplayNames: Record<IncidentResolution, string> = RESOLUTION_LABELS

/** Ce que chaque résolution implique. Affiché en aide à la saisie. */
export const resolutionHints: Record<IncidentResolution, string> = {
  true_positive: 'Menace réelle et avérée, traitée.',
  risk_accepted: 'Menace réelle, non corrigée : le risque est assumé, et c\'est cette décision qu\'on trace.',
  false_positive: 'L\'outil s\'est trompé : il n\'y avait rien. La règle de détection est à corriger.',
  benign: 'Activité réelle, mais sans conséquence. Rien à faire de plus.',
  legitimate: 'Activité réelle, voulue et autorisée. Appelle une liste blanche.',
  duplicate: 'Déjà traité dans un autre incident.',
}

export const typeDisplayNames: Record<IncidentType, string> = {
  phishing: 'Phishing',
  malware: 'Virus / Malware',
  ddos: 'DDoS',
  ransomware: 'Ransomware',
  network_intrusion: 'Intrusion réseau',
  data_breach: 'Fuite de données',
  other: 'Autre',
}

/** Où l'incident se situe dans l'établissement. */
export const perimeterDisplayNames: Record<string, string> = {
  composante: 'Composante',
  laboratoire: 'Laboratoire',
  service_central: 'Service central',
  infrastructure: 'Infrastructure',
  etablissement_raccorde: 'Établissement raccordé',
  inconnu: 'Inconnu',
}

export interface IncidentFormData {
  title: string
  description: string
  severity: IncidentSeverity
  type: IncidentType
  status: IncidentStatus
  details: Record<string, unknown>
}
