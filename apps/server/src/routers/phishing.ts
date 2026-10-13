import { db } from "@slowpoke/database"
import Elysia, { t } from "elysia"
import { betterAuth } from "../middleware/auth"
import { createInsertSchema } from "drizzle-typebox"
import { phishingSchema } from "@slowpoke/database/tables"
import { and, eq } from "drizzle-orm"
import { createLog } from "../utils/log"

const dateType = t.Optional(t.Union([t.String(), t.Date(), t.Null()]))

const _identity = createInsertSchema(phishingSchema.phishingIdentity, { createdAt: dateType })
const _log = createInsertSchema(phishingSchema.phishingConnectionLog, { activityStart: dateType, activityEnd: dateType })
const _action = createInsertSchema(phishingSchema.phishingConnectionAction)

const IdentityBody = t.Omit(_identity, ['id', 'concernedUser', 'createdAt'])
const IdentityUpdateBody = t.Partial(IdentityBody)

const ActionBody = t.Omit(_action, ['id', 'connectionLogId'])
const LogBody = t.Intersect([
  t.Omit(_log, ['id', 'concernedUser']),
  t.Object({ actions: t.Optional(t.Array(ActionBody)) }),
])
const LogUpdateBody = t.Partial(LogBody)

// Vérifie que l'utilisateur appartient bien à l'incident — les identités/logs sont rattachés à cet utilisateur
async function assertUser(incidentId: string, userId: string): Promise<boolean> {
  const u = await db.query.incidentUser.findFirst({
    where: (iu, { eq, and }) => and(eq(iu.id, userId), eq(iu.incidentId, incidentId)),
    columns: { id: true },
  })
  return !!u
}

const userParam = t.Object({
  incidentId: t.String({ description: 'ID de l\'incident' }),
  userId: t.String({ description: 'ID de l\'utilisateur concerné' }),
})
const itemParam = t.Object({
  incidentId: t.String({ description: 'ID de l\'incident' }),
  userId: t.String({ description: 'ID de l\'utilisateur concerné' }),
  id: t.String({ description: 'ID de la sous-entité' }),
})

export const phishingRouter = new Elysia({ name: 'phishing', prefix: '/api/phishing', tags: ['Phishing'] })
  .use(betterAuth)

  // ---------- Identités usurpées (par utilisateur) ----------
  .get('/:incidentId/users/:userId/identities', async ({ params, status }) => {
    if (!await assertUser(params.incidentId, params.userId)) return status(404, 'Utilisateur introuvable pour cet incident')
    return await db.query.phishingIdentity.findMany({
      where: (i, { eq }) => eq(i.concernedUser, params.userId),
      orderBy: (i, { asc }) => [asc(i.createdAt)],
    })
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    params: userParam,
    detail: { summary: 'Lister les identités usurpées d\'un utilisateur' },
  })

  .post('/:incidentId/users/:userId/identities', async ({ params, body, status, user, service_account }) => {
    if (!await assertUser(params.incidentId, params.userId)) return status(404, 'Utilisateur introuvable pour cet incident')

    const [identity] = await db.insert(phishingSchema.phishingIdentity).values({ ...body, concernedUser: params.userId }).returning()
    if (!identity) throw new Error('Échec de la création de l\'identité')

    await createLog(params.incidentId, 'update', user?.id, service_account?.id, 'Identité usurpée ajoutée')
    return identity
  }, {
    auth: ['gestionnaire', 'admin', 'svc'],
    params: userParam,
    body: IdentityBody,
    detail: { summary: 'Ajouter une identité usurpée à un utilisateur' },
  })

  .patch('/:incidentId/users/:userId/identities/:id', async ({ params, body, status, user, service_account }) => {
    if (!await assertUser(params.incidentId, params.userId)) return status(404, 'Utilisateur introuvable pour cet incident')
    if (Object.keys(body).length === 0) return status(400, 'Aucune modification fournie')

    const [identity] = await db.update(phishingSchema.phishingIdentity)
      .set(body)
      .where(and(eq(phishingSchema.phishingIdentity.id, params.id), eq(phishingSchema.phishingIdentity.concernedUser, params.userId)))
      .returning()
    if (!identity) return status(404, 'Identité non trouvée')

    await createLog(params.incidentId, 'update', user?.id, service_account?.id, 'Identité usurpée modifiée')
    return identity
  }, {
    auth: ['gestionnaire', 'admin', 'svc'],
    params: itemParam,
    body: IdentityUpdateBody,
    detail: { summary: 'Modifier une identité usurpée' },
  })

  .delete('/:incidentId/users/:userId/identities/:id', async ({ params, status, user, service_account }) => {
    if (!await assertUser(params.incidentId, params.userId)) return status(404, 'Utilisateur introuvable pour cet incident')

    await db.delete(phishingSchema.phishingIdentity)
      .where(and(eq(phishingSchema.phishingIdentity.id, params.id), eq(phishingSchema.phishingIdentity.concernedUser, params.userId)))

    await createLog(params.incidentId, 'update', user?.id, service_account?.id, 'Identité usurpée supprimée')
    return { success: true, id: params.id }
  }, {
    auth: ['gestionnaire', 'admin', 'svc'],
    params: itemParam,
    detail: { summary: 'Supprimer une identité usurpée' },
  })

  // ---------- Logs de connexion (par utilisateur, avec leurs actions) ----------
  .get('/:incidentId/users/:userId/logs', async ({ params, status }) => {
    if (!await assertUser(params.incidentId, params.userId)) return status(404, 'Utilisateur introuvable pour cet incident')
    return await db.query.phishingConnectionLog.findMany({
      where: (l, { eq }) => eq(l.concernedUser, params.userId),
      with: { actions: true },
      orderBy: (l, { asc }) => [asc(l.activityStart)],
    })
  }, {
    auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
    params: userParam,
    detail: { summary: 'Lister les logs d\'activité d\'un utilisateur' },
  })

  .post('/:incidentId/users/:userId/logs', async ({ params, body, status, user, service_account }) => {
    if (!await assertUser(params.incidentId, params.userId)) return status(404, 'Utilisateur introuvable pour cet incident')

    const log = await db.transaction(async (tx) => {
      const { actions, activityStart, activityEnd, ...rest } = body
      const [created] = await tx.insert(phishingSchema.phishingConnectionLog).values({
        ...rest,
        concernedUser: params.userId,
        activityStart: activityStart ? new Date(activityStart) : undefined,
        activityEnd: activityEnd ? new Date(activityEnd) : undefined,
      }).returning()
      if (!created) throw new Error('Échec de la création du log d\'activité')

      if (actions && actions.length > 0) {
        await tx.insert(phishingSchema.phishingConnectionAction).values(actions.map(a => ({ ...a, connectionLogId: created.id })))
      }
      return created
    })

    await createLog(params.incidentId, 'update', user?.id, service_account?.id, 'Log d\'activité ajouté')
    return log
  }, {
    auth: ['gestionnaire', 'admin', 'svc'],
    params: userParam,
    body: LogBody,
    detail: { summary: 'Ajouter un log d\'activité à un utilisateur' },
  })

  .patch('/:incidentId/users/:userId/logs/:id', async ({ params, body, status, user, service_account }) => {
    if (!await assertUser(params.incidentId, params.userId)) return status(404, 'Utilisateur introuvable pour cet incident')

    const [existing] = await db.select({ id: phishingSchema.phishingConnectionLog.id })
      .from(phishingSchema.phishingConnectionLog)
      .where(and(eq(phishingSchema.phishingConnectionLog.id, params.id), eq(phishingSchema.phishingConnectionLog.concernedUser, params.userId)))
      .limit(1)
    if (!existing) return status(404, 'Log non trouvé')

    await db.transaction(async (tx) => {
      const { actions, activityStart, activityEnd, ...rest } = body
      const set = {
        ...rest,
        ...(activityStart ? { activityStart: new Date(activityStart) } : {}),
        ...(activityEnd ? { activityEnd: new Date(activityEnd) } : {}),
      }
      if (Object.keys(set).length > 0) {
        await tx.update(phishingSchema.phishingConnectionLog).set(set).where(eq(phishingSchema.phishingConnectionLog.id, params.id))
      }

      if (actions) {
        await tx.delete(phishingSchema.phishingConnectionAction).where(eq(phishingSchema.phishingConnectionAction.connectionLogId, params.id))
        if (actions.length > 0) {
          await tx.insert(phishingSchema.phishingConnectionAction).values(actions.map(a => ({ ...a, connectionLogId: params.id })))
        }
      }
    })

    await createLog(params.incidentId, 'update', user?.id, service_account?.id, 'Log d\'activité modifié')
    return { success: true, id: params.id }
  }, {
    auth: ['gestionnaire', 'admin', 'svc'],
    params: itemParam,
    body: LogUpdateBody,
    detail: { summary: 'Modifier un log d\'activité (et ses actions)' },
  })

  .delete('/:incidentId/users/:userId/logs/:id', async ({ params, status, user, service_account }) => {
    if (!await assertUser(params.incidentId, params.userId)) return status(404, 'Utilisateur introuvable pour cet incident')

    await db.delete(phishingSchema.phishingConnectionLog)
      .where(and(eq(phishingSchema.phishingConnectionLog.id, params.id), eq(phishingSchema.phishingConnectionLog.concernedUser, params.userId)))

    await createLog(params.incidentId, 'update', user?.id, service_account?.id, 'Log d\'activité supprimé')
    return { success: true, id: params.id }
  }, {
    auth: ['gestionnaire', 'admin', 'svc'],
    params: itemParam,
    detail: { summary: 'Supprimer un log d\'activité' },
  })
