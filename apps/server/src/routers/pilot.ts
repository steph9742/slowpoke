import { Elysia, t } from "elysia";
import { betterAuth } from "../middleware/auth";
import { db } from "@slowpoke/database";
import { mainSchema, authSchema } from "@slowpoke/database/tables";
import { eq, isNull, and } from "drizzle-orm";
import { createLog } from "../utils/log";

// PRISE EN CHARGE D'UN INCIDENT.
//
// `createdBy` dit qui a saisi, pas qui SUIT. Deux chemins distincts :
//   - auto-attribution : « je prends en charge », gestionnaires et admins ;
//   - attribution : un admin désigne QUELQU'UN D'AUTRE, y compris sur un incident déjà pris
//     (absence, congés, rééquilibrage). Dans ce cas `pilot` ≠ `takenOverBy`, et la distinction
//     des deux colonnes trace l'écart.
//
// La prise en charge ne se déduit JAMAIS d'un changement de statut : elle est explicite.

/** Nom lisible pour les messages de journal, sans exposer d'identifiant technique. */
async function nomDe(userId: string | null | undefined): Promise<string> {
  if (!userId) return 'personne'
  const [u] = await db.select({ name: authSchema.user.name, email: authSchema.user.email })
    .from(authSchema.user).where(eq(authSchema.user.id, userId)).limit(1)
  return u?.name || u?.email || 'un utilisateur'
}

export const pilotRouter = new Elysia({ name: 'pilot', prefix: '/api/incidents', tags: ['Incidents'] })
  .use(betterAuth)

  // Auto-attribution ET attribution par un admin partagent la même route : c'est la
  // présence de `pilotId` dans le corps qui les distingue, et le contrôle de rôle qui
  // décide si elle est permise.
  .post('/:id/pilot', async ({ params, body, user, status }) => {
    const [incident] = await db.select().from(mainSchema.incident)
      .where(eq(mainSchema.incident.id, params.id)).limit(1)
    if (!incident) return status(404, { message: 'Incident introuvable' })

    const roles = String(user?.role ?? '').split(',').map(r => r.trim())
    const estAdmin = roles.includes('admin')

    // Désigner quelqu'un d'autre est réservé aux admins. Un gestionnaire ne peut que se
    // désigner lui-même : sans cette limite, n'importe qui pourrait se décharger d'un
    // incident sur un collègue absent.
    const cible = body.pilotId ?? user!.id
    if (cible !== user!.id && !estAdmin) {
      return status(403, { message: "Seul un administrateur peut désigner un autre pilote." })
    }

    // Réattribuer un incident déjà pris en charge est permis (absences, congés), mais
    // seulement à un admin — un gestionnaire ne prend la main que sur un incident libre.
    if (incident.pilot && incident.pilot !== user!.id && !estAdmin) {
      return status(409, { message: 'Cet incident est déjà pris en charge. Un administrateur peut le réattribuer.' })
    }

    const [cibleExiste] = await db.select({ id: authSchema.user.id })
      .from(authSchema.user).where(eq(authSchema.user.id, cible)).limit(1)
    if (!cibleExiste) return status(404, { message: 'Utilisateur cible introuvable' })

    const [maj] = await db.update(mainSchema.incident)
      .set({ pilot: cible, takenOverAt: new Date(), takenOverBy: user!.id })
      .where(eq(mainSchema.incident.id, params.id))
      .returning()

    const nomCible = await nomDe(cible)
    const auto = cible === user!.id
    await createLog(
      params.id,
      'update',
      user?.id,
      undefined,
      auto ? `Prise en charge par ${nomCible}` : `Incident attribué à ${nomCible} par ${await nomDe(user!.id)}`,
      // Notification au pilote désigné — sauf s'il est l'auteur de l'action, personne
      // n'ayant besoin d'être prévenu de ce qu'il vient de faire (`createLog` écarte déjà
      // l'auteur de ses destinataires).
    )

    return maj
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({
      pilotId: t.Optional(t.String({ description: "Utilisateur à désigner. Absent = auto-attribution. Désigner un tiers est réservé aux admins." })),
    }),
    detail: {
      summary: 'Prendre en charge un incident ou en désigner le pilote',
      description: "Sans `pilotId` : auto-attribution (« je prends en charge »). Avec `pilotId` : attribution à un tiers, réservée aux administrateurs, y compris en réattribution.",
    },
  })

  // Retrait du pilote : retour à l'état non pris en charge.
  .delete('/:id/pilot', async ({ params, user, status }) => {
    const [incident] = await db.select().from(mainSchema.incident)
      .where(eq(mainSchema.incident.id, params.id)).limit(1)
    if (!incident) return status(404, { message: 'Incident introuvable' })
    if (!incident.pilot) return status(409, { message: "Cet incident n'a pas de pilote." })

    const roles = String(user?.role ?? '').split(',').map(r => r.trim())
    // On ne retire que son propre suivi, sauf pour un admin.
    if (incident.pilot !== user!.id && !roles.includes('admin')) {
      return status(403, { message: "Seul le pilote ou un administrateur peut retirer la prise en charge." })
    }

    const ancien = await nomDe(incident.pilot)
    const [maj] = await db.update(mainSchema.incident)
      .set({ pilot: null, takenOverAt: null, takenOverBy: null })
      .where(eq(mainSchema.incident.id, params.id))
      .returning()

    await createLog(params.id, 'update', user?.id, undefined, `Prise en charge retirée (était : ${ancien})`)
    return maj
  }, {
    auth: ['gestionnaire', 'admin'],
    params: t.Object({ id: t.String() }),
    detail: {
      summary: 'Retirer la prise en charge',
      description: "Remet l'incident à l'état non pris en charge. Réservé au pilote lui-même ou à un administrateur.",
    },
  })

  // Vue « sans pilote » : ce qui n'est suivi par personne, la question la plus utile au
  // quotidien. Ouverte aux lecteurs — savoir ce qui traîne n'est pas une action d'écriture.
  .get('/unassigned/list', async () => {
    return await db.select().from(mainSchema.incident)
      .where(and(
        isNull(mainSchema.incident.archiveLe),
        isNull(mainSchema.incident.pilot),
        // Un incident clos sans pilote n'appelle plus d'action : on ne l'y fait pas figurer.
        eq(mainSchema.incident.status, 'open'),
      ))
      .orderBy(mainSchema.incident.createdAt)
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    detail: {
      summary: 'Incidents ouverts sans pilote',
      description: "Incidents au statut « ouvert » que personne ne suit. Les incidents clos en sont écartés : ils n'appellent plus d'action.",
    },
  })
