// DATES SANS FUSEAU — interprétées dans le fuseau de l'établissement, jamais dans celui du
// process.
//
// Une source interne écrit « 2026-08-19 10:44:00 » pour une heure locale ; `new Date()` lit
// une chaîne sans fuseau dans le fuseau du PROCESS, et les conteneurs tournent en UTC. La
// date partait en base décalée, alors que `knowledgeAt` fait courir les échéances.

/** Fuseau de l'établissement. Les sources internes (Zimbra, annuaire) écrivent leurs heures ici. */
export const FUSEAU_ETABLISSEMENT = 'Europe/Paris'

/** Une chaîne porte-t-elle déjà un fuseau ? `…Z`, `…+02:00`, `…-0500`. */
function porteUnFuseau(s: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(s.trim())
}

/** Décalage du fuseau en minutes à un instant donné, via `Intl` plutôt qu'une table : les
 *  règles d'heure d'été changent, pas le système d'exploitation. */
function decalageMinutes(instant: number, fuseau: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: fuseau,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))

  const p = Object.fromEntries(parts.map(x => [x.type, x.value])) as Record<string, string>
  // `hour` vaut « 24 » à minuit dans certaines implémentations : on ramène à 0.
  const heure = Number(p.hour) % 24
  const localeVueCommeUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    heure, Number(p.minute), Number(p.second),
  )
  // Arrondi à la minute : `formatToParts` ne rend pas les millisecondes, et sans cet arrondi
  // la soustraction emportait deux fois la fraction de l'entrée.
  return Math.round((localeVueCommeUTC - instant) / 60_000)
}

/**
 * Convertit une date d'une source interne en instant.
 *
 * Une chaîne AVEC fuseau est prise telle quelle ; SANS fuseau, elle est lue comme une heure
 * de l'établissement. Renvoie `null` sur une entrée illisible, plutôt qu'une `Invalid Date`
 * qui se propagerait jusqu'en base.
 */
export function parseDateEtablissement(valeur: string | Date | null | undefined): Date | null {
  if (valeur === null || valeur === undefined) return null
  if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? null : valeur

  const s = String(valeur).trim()
  if (!s) return null

  if (porteUnFuseau(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?)?$/)
  if (!m) {
    // Format inattendu : on tente l'analyse standard plutôt que de perdre la donnée, mais
    // sans prétendre corriger un fuseau qu'on n'a pas su lire.
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const [, a, mo, j, h = '0', mi = '0', sec = '0', ms = '0'] = m
  const commeSiUTC = Date.UTC(
    Number(a), Number(mo) - 1, Number(j),
    Number(h), Number(mi), Number(sec), Number(ms.padEnd(3, '0')),
  )

  // Le décalage dépend de l'instant et l'instant du décalage : on part de « la locale est de
  // l'UTC » puis on corrige. Dans l'heure du changement d'heure, la première solution
  // cohérente est retenue — même convention que PostgreSQL pour une heure ambiguë.
  let instant = commeSiUTC - decalageMinutes(commeSiUTC, FUSEAU_ETABLISSEMENT) * 60_000
  instant = commeSiUTC - decalageMinutes(instant, FUSEAU_ETABLISSEMENT) * 60_000

  return new Date(instant)
}
