// AFFICHAGE DES DATES — toujours dans le fuseau de l'établissement, jamais dans celui du
// process qui rend.
//
// `Intl.DateTimeFormat('fr-FR', …)` sans `timeZone` emploie le fuseau du process. Or les pages
// sont rendues DEUX FOIS : par Nitro dans le conteneur, qui tourne en UTC, puis par le
// navigateur. La même donnée produisait deux textes différents — d'où des heures fausses et une
// part des avertissements « Hydration completed but contains mismatches ».

/** Fuseau d'affichage. Le même que celui dans lequel les sources internes écrivent. */
export const FUSEAU_AFFICHAGE = 'Europe/Paris'

function formater(
  valeur: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string | null {
  if (valeur === null || valeur === undefined || valeur === '') return null
  const d = valeur instanceof Date ? valeur : new Date(valeur)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_AFFICHAGE, ...options }).format(d)
}

/** « 19 août 2026 à 10:44 » — la forme des fiches d'incident. */
export const dateHeure = (v: string | Date | null | undefined) =>
  formater(v, { dateStyle: 'long', timeStyle: 'short' })

/** « 19 août 2026 ». */
export const dateLongue = (v: string | Date | null | undefined) =>
  formater(v, { dateStyle: 'long' })

/** « 19 août 2026 » en version courte : « 19 août 2026 » → « 19 août ». */
export const dateMoyenne = (v: string | Date | null | undefined) =>
  formater(v, { dateStyle: 'medium' })

/** « 19/08 10:44 » — pour les colonnes étroites et les graphiques. */
export const dateCourte = (v: string | Date | null | undefined) =>
  formater(v, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** « 10:44 » seul. */
export const heure = (v: string | Date | null | undefined) =>
  formater(v, { hour: '2-digit', minute: '2-digit' })

/** Formatage libre, fuseau garanti. */
export const dateAvec = (v: string | Date | null | undefined, options: Intl.DateTimeFormatOptions) =>
  formater(v, options)

/**
 * Valeur pour un `<input type="date">` (`AAAA-MM-JJ`) ou `datetime-local` (`…THH:MM`).
 *
 * Eden convertit toute chaîne ressemblant à une date ISO en objet `Date` : une réponse annoncée
 * `string` arrive donc en `Date` et un `.slice()` échoue — silencieusement pour l'utilisateur,
 * qui voit un champ vide. Cette fonction accepte les deux formes.
 */
export const pourChampDate = (v: unknown, avecHeure = false): string => {
  const longueur = avecHeure ? 16 : 10
  if (typeof v === 'string') return v.slice(0, longueur)
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) return ''

  // Une date seule est stockée à minuit UTC : la lire en UTC rend le bon jour. Une
  // date-heure, elle, se saisit et se relit dans le fuseau de qui regarde — `datetime-local`
  // n'en porte aucun, et passer par UTC afficherait 09:00 pour un dépôt fait à 11:00.
  if (!avecHeure) return v.toISOString().slice(0, 10)

  const d2 = (n: number) => String(n).padStart(2, '0')
  return `${v.getFullYear()}-${d2(v.getMonth() + 1)}-${d2(v.getDate())}`
    + `T${d2(v.getHours())}:${d2(v.getMinutes())}`
}
