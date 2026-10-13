// NIVEAUX DE GRAVITÉ — source unique de la correspondance.
//
// Plusieurs échelles circulent : la grille P1–P4, les valeurs techniques de l'application,
// celles d'un SOC externe, celles de la source d'alertes. Le vocabulaire de référence est
// P1–P4 ; les valeurs techniques ne changent pas.
//
// L'enum `incident_severity` conserve donc `low|medium|high|critical` : le renommer casserait
// les intégrations, les comptes de service et les données existantes pour un gain cosmétique.
// Ce fichier évite seulement que quiconque ait à traduire de tête.

export const SEVERITY_VALUES = ['low', 'medium', 'high', 'critical'] as const
export type SeverityValue = (typeof SEVERITY_VALUES)[number]

export interface SeverityLevel {
  /** Valeur stockée en base. */
  value: SeverityValue
  /** Vocabulaire de référence du dispositif. */
  code: 'P1' | 'P2' | 'P3' | 'P4'
  /** Libellé français. */
  label: string
}

export const SEVERITY_LEVELS: readonly SeverityLevel[] = [
  { value: 'critical', code: 'P1', label: 'Critique' },
  { value: 'high', code: 'P2', label: 'Majeur' },
  { value: 'medium', code: 'P3', label: 'Modéré' },
  { value: 'low', code: 'P4', label: 'Mineur' },
] as const

const PAR_VALEUR = new Map<SeverityValue, SeverityLevel>(SEVERITY_LEVELS.map(n => [n.value, n]))

/** « P1 — Critique ». Forme d'affichage retenue partout : listes, fiches, filtres, statistiques. */
export function severityLabel(value: string | null | undefined): string {
  const n = PAR_VALEUR.get(value as SeverityValue)
  return n ? `${n.code} — ${n.label}` : String(value ?? '')
}

/** « P1 » seul, pour les affichages contraints (pastilles, colonnes étroites). */
export function severityCode(value: string | null | undefined): string {
  return PAR_VALEUR.get(value as SeverityValue)?.code ?? String(value ?? '')
}

/** Libellé seul, sans le code. */
export function severityName(value: string | null | undefined): string {
  return PAR_VALEUR.get(value as SeverityValue)?.label ?? String(value ?? '')
}

// Toutes les écritures acceptées en entrée d'API, ramenées à la valeur technique :
// le code (`p1`), la valeur (`critical`) et le libellé (`critique`, avec ou sans accent).
const ENTREES = new Map<string, SeverityValue>()
for (const n of SEVERITY_LEVELS) {
  const sansAccent = n.label.normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const forme of [n.value, n.code, n.label, sansAccent, `${n.code} — ${n.label}`]) {
    ENTREES.set(forme.toLowerCase(), n.value)
  }
}

/**
 * Ramène une gravité écrite sous n'importe laquelle de ses formes à la valeur technique.
 * Renvoie `null` si l'écriture n'est pas reconnue — au filtre appelant de refuser.
 */
export function normalizeSeverity(input: unknown): SeverityValue | null {
  if (typeof input !== 'string') return null
  return ENTREES.get(input.trim().toLowerCase()) ?? null
}

/** Les écritures acceptées, pour les messages d'erreur et la documentation OpenAPI. */
export const SEVERITY_ACCEPTED_INPUTS = SEVERITY_LEVELS
  .map(n => `${n.code} | ${n.value} | ${n.label}`)
  .join(' · ')
