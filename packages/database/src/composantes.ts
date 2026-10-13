// Rattachement d'un incident à une composante ou à un laboratoire.
//
// Les saisies arrivent sous des formes multiples (`cmpi-901`, `PT (cmpi-903)`, texte libre,
// encodage cassé) : grouper sur le texte donnerait autant de « composantes » que d'écritures.
// Seul le CODE est fiable, les libellés saisis vieillissant plus vite que lui. La
// correspondance code → libellé vit dans `organisation.ts`, propre à l'établissement.

import { CODE_ETABLISSEMENT, COMPOSANTES, ENTITES, PREFIXES_CODE, SIGLES_LABORATOIRES } from './organisation'

export { COMPOSANTES, PREFIXES_CODE }

export type ComposanteNormalisee = {
  /** Code de composante, ou la clé de l'établissement. `null` si la saisie n'en contient aucun. */
  code: string | null
  /** Libellé de référence, `null` si le code est inconnu de la table. */
  libelle: string | null
  /** Préfixe de saisie, rendu sans interprétation. */
  prefixe: string | null
  /** La saisie d'origine, toujours conservée. */
  brut: string | null
}

const MOTIF = new RegExp(`\\b(${PREFIXES_CODE.join('|')})-(\\d{3})\\b`, 'i')
const MOTIF_ETAB = new RegExp(`\\b${CODE_ETABLISSEMENT}\\b`)

/**
 * Extrait la composante d'une saisie libre.
 *
 * Ne devine jamais depuis le libellé : deux textes différents peuvent désigner la même
 * composante, et un même texte change de sens entre deux réorganisations. Sans code, le
 * résultat est `code: null` — une saisie non exploitable, ce qui se dit, plutôt qu'un
 * rattachement inventé.
 */
export function normaliserComposante(valeur: string | null | undefined): ComposanteNormalisee {
  const brut = valeur?.trim() || null
  if (!brut) return { code: null, libelle: null, prefixe: null, brut: null }

  const m = MOTIF.exec(brut)
  if (m) {
    const code = m[2]!
    return { code, libelle: COMPOSANTES[code] ?? null, prefixe: m[1]!.toLowerCase(), brut }
  }
  if (MOTIF_ETAB.test(brut)) {
    return { code: CODE_ETABLISSEMENT, libelle: COMPOSANTES[CODE_ETABLISSEMENT] ?? null, prefixe: null, brut }
  }
  return { code: null, libelle: null, prefixe: null, brut }
}

/**
 * Code de composante d'une entité d'inventaire, ou `null`.
 *
 * Le chemin est lu du plus précis au plus général : un département compte dans sa composante.
 * Un segment SŒUR ne s'hérite pas — « ST - Dépt. Informatique » est une entité distincte de
 * « ST ». Un segment inconnu est ignoré, et `null` pour un laboratoire ou une direction interne
 * n'est pas un échec : c'est l'absence de composante correspondante.
 */
export function composanteDeLEntite(entite: string | null | undefined): string | null {
  if (!entite) return null
  const segments = entite.split('>').map(s => s.trim()).filter(Boolean)
  for (let i = segments.length - 1; i >= 0; i--) {
    const direct = ENTITES[segments[i]!]
    if (direct) return direct
  }
  if (segments.length === 1 && segments[0] === CODE_ETABLISSEMENT) return CODE_ETABLISSEMENT
  return null
}

export type Laboratoire = {
  /** Code d'unité de recherche : `UMR1234`. */
  code: string
  /** Sigle usuel. */
  sigle: string
  /** Intitulé complet, tel que le référentiel l'écrit. */
  libelle: string
}

// `UMR`, `UPR`, `USR`, `UAR`, `EA`, `FRE`… : le type d'unité varie, le motif non — des
// lettres, un numéro, un sigle, deux points, un intitulé. Aucune table à tenir : tout est
// dans la valeur, donc un laboratoire créé demain est lu comme les autres.
const MOTIF_LABO = /^([A-Z]{2,4})\s?(\d{2,4})\s+([^:]+?)\s*:\s*(.+)$/

/**
 * Lit une saisie de laboratoire, ou rend `null`.
 *
 * `null` ne veut pas dire « laboratoire inconnu » mais « cette saisie n'a pas la forme d'un
 * laboratoire » — une composante, un service, ou du texte libre.
 */
export function normaliserLaboratoire(valeur: string | null | undefined): Laboratoire | null {
  const brut = valeur?.trim()
  if (!brut) return null
  const m = MOTIF_LABO.exec(brut)
  if (!m) return null
  return {
    code: `${m[1]!.toUpperCase()}${m[2]}`,
    sigle: m[3]!.trim(),
    libelle: brut,
  }
}

/** Vrai si une entité d'inventaire désigne un laboratoire (sigles déclarés dans `organisation.ts`). */
export function entiteEstLaboratoire(entite: string | null | undefined): boolean {
  if (!entite) return false
  return entite.split('>').map(s => s.trim()).some(seg => SIGLES_LABORATOIRES.has(seg))
}

/**
 * Nature d'un rattachement, sans jamais en inventer une.
 *
 * Un laboratoire n'est pas une composante : les deux se comptent séparément, et ranger l'un
 * sous l'autre inventerait une tutelle que personne n'a déclarée. `null` quand la saisie ne
 * permet de conclure ni à l'une ni à l'autre — une information à part entière.
 */
export function natureDuRattachement(valeur: string | null | undefined): 'composante' | 'laboratoire' | null {
  if (normaliserComposante(valeur).code) return 'composante'
  if (normaliserLaboratoire(valeur)) return 'laboratoire'
  return null
}
