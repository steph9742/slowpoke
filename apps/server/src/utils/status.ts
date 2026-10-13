import os from "node:os"

/**
 * Version réellement déployée : commit de construction, injecté à la fabrication de l'image.
 *
 * Un numéro figé dans le code ne dit rien de ce qui tourne, et un consommateur qui doit savoir
 * si un correctif est en service n'aurait que la parole de l'exploitant. `inconnue` signale une
 * image construite sans l'information, et vaut mieux qu'une valeur inventée.
 */
export const VERSION = process.env.GIT_COMMIT?.trim() || 'inconnue'

/**
 * Date de construction de l'image, en ISO 8601.
 *
 * Deux abrégés de commit ne s'ordonnent pas : rien dans la chaîne ne dit lequel précède l'autre,
 * donc un appelant qui doit vérifier « au moins telle version » ne peut pas conclure. Une date
 * se compare.
 */
export const DATE_CONSTRUCTION = process.env.BUILD_DATE?.trim() || null

export function healthcheck(details?: boolean) {
  if (!details) return { status: "ok", version: VERSION, construitLe: DATE_CONSTRUCTION }

  return {
    status: "ok",
    version: VERSION,
    construitLe: DATE_CONSTRUCTION,
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    freemem: os.freemem(),
    totalmem: os.totalmem(),
    cpus: os.cpus().length,
  }
}