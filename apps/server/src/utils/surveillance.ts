import { db } from "@slowpoke/database";
import { mainSchema } from "@slowpoke/database/tables";
import { and, eq, lte, isNotNull, sql, isNull } from "drizzle-orm";
import { createLog } from "./log";

// FERMETURE AUTOMATIQUE DES INCIDENTS SOUS SURVEILLANCE.
//
// Un incident en `surveillance` est traité, mais gardé à l'œil jusqu'à une date ; passée cette
// date il se clôt de lui-même, sans quoi « surveillance » deviendrait un second « ouvert » dont
// personne ne sort. La RÉSOLUTION est conservée : on cesse d'observer, la nature de l'incident
// ne change pas.
//
// Règle métier de l'application, et donc tenue par le serveur : déportée dans un ordonnanceur
// externe, son arrêt ne fermerait plus rien sans que personne s'en aperçoive.

const INTERVALLE_MS = 60 * 60 * 1000 // toutes les heures : l'échéance est une date, pas une heure précise

// Identifiant arbitraire mais stable du verrou consultatif PostgreSQL.
const VERROU = 4837201

/**
 * Ferme les incidents dont la surveillance a expiré. Idempotent : la clause `where` ne
 * retient que ceux encore en `surveillance`, un second passage ne fait rien.
 */
export async function fermerSurveillancesExpirees(): Promise<number> {
  // Verrou consultatif : si l'application est répliquée un jour, une seule instance
  // travaille. `pg_try_advisory_lock` rend la main immédiatement plutôt que d'attendre —
  // une instance qui n'obtient pas le verrou n'a rien à faire, l'autre s'en charge.
  const [verrou] = (await db.execute(sql`SELECT pg_try_advisory_lock(${VERROU}) AS obtenu`)).rows as { obtenu: boolean }[]
  if (!verrou?.obtenu) return 0

  try {
    const expires = await db.select({ id: mainSchema.incident.id })
      .from(mainSchema.incident)
      .where(and(
        // Un dossier archivé n'est plus modifié, pas même par la clôture automatique.
        isNull(mainSchema.incident.archiveLe),
        eq(mainSchema.incident.status, 'surveillance'),
        isNotNull(mainSchema.incident.surveillanceExpiresAt),
        lte(mainSchema.incident.surveillanceExpiresAt, new Date()),
      ))

    if (!expires.length) return 0

    for (const { id } of expires) {
      await db.update(mainSchema.incident)
        .set({ status: 'closed' })
        .where(eq(mainSchema.incident.id, id))

      // Journalisé comme n'importe quelle clôture : la fermeture automatique doit être
      // lisible dans la chronologie, sans quoi un incident se refermerait « tout seul »
      // sans trace de la raison.
      await createLog(id, 'closed', undefined, undefined,
        'Clôture automatique : la période de surveillance est arrivée à échéance')
    }

    console.log(`🔒 Surveillance échue : ${expires.length} incident(s) clôturé(s)`)
    return expires.length
  }
  finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${VERROU})`)
  }
}

/** Démarre la vérification périodique. Appelée une fois au démarrage du serveur. */
export function demarrerSurveillance(): void {
  // Un passage au démarrage : si le serveur a été arrêté au-delà d'une échéance, on ne
  // veut pas attendre une heure de plus pour la rattraper.
  fermerSurveillancesExpirees().catch(e => console.error('❌ Surveillance (démarrage) :', e))

  const minuteur = setInterval(() => {
    fermerSurveillancesExpirees().catch(e => console.error('❌ Surveillance (périodique) :', e))
  }, INTERVALLE_MS)

  // Ne pas retenir le processus en vie pour ce seul minuteur.
  ;(minuteur as unknown as { unref?: () => void }).unref?.()
}
