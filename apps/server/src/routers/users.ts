import { db } from "@slowpoke/database"
import Elysia, { t } from "elysia"
import { betterAuth } from "../middleware/auth"
import { createInsertSchema, createSelectSchema } from "drizzle-typebox"
import { mainSchema } from "@slowpoke/database/tables"
import { eq, and } from "drizzle-orm"
import { createLog } from "../utils/log"
import { normaliserComposante } from '@slowpoke/database/composantes'

const _insertIncidentUser = createInsertSchema(mainSchema.incidentUser, {
  email: t.String({ format: 'email', description: 'Email de l\'utilisateur' }),
})

const _selectIncidentUser = createSelectSchema(mainSchema.incidentUser)

export const usersRouter = new Elysia({ name: 'users', prefix: '/api/users', tags: ['Utilisateurs'] })
    .use(betterAuth)
    .model({
      IncidentUser: _selectIncidentUser,
    })
    .get('/:incidentId', async ({ params }) => {
      const users = await db.query.incidentUser.findMany({
        where: (iu, { eq }) => eq(iu.incidentId, params.incidentId),
      })

      return users
    }, {
      auth: ['lecteur', 'gestionnaire', 'admin', 'svc'],
      params: t.Object({
        incidentId: t.String({ description: 'ID de l\'incident' }),
      }),
      detail: {
        summary: 'Obtenir la liste des utilisateurs impliqués dans un incident',
        description: 'Récupère la liste des utilisateurs liés à un incident donné.'
      },
      response: {
        200: t.Array(_selectIncidentUser, { description: 'Liste des utilisateurs liés à l\'incident' })
      }
    })
    .post('/:incidentId', async ({ params, body }) => {
      const [user] = await db.insert(mainSchema.incidentUser).values({
        ...body,
        // Le code est dérivé de la saisie, jamais demandé à l'appelant : deux champs à
        // renseigner à la main finiraient par se contredire.
        composanteCode: normaliserComposante(body.composante).code,
        incidentId: params.incidentId,
      }).returning()

      if (!user) throw new Error('Échec de la création de l\'utilisateur');

      return user
    }, {
      auth: ['gestionnaire', 'admin', 'svc'],
      params: t.Object({
        incidentId: t.String({ description: 'ID de l\'incident' }),
      }),
      body: t.Omit(_insertIncidentUser, ['id', 'incidentId']),
      afterResponse: async ({ responseValue, user, service_account }) => {
        const created = responseValue as typeof _selectIncidentUser.static
        if (!created?.incidentId) return
        await createLog(created.incidentId, 'user_added', user?.id, service_account?.id, created.fullName)
      },
      detail: {
        summary: 'Ajouter un utilisateur à un incident',
        description: 'Ajoute un utilisateur à un incident donné en fournissant son nom complet, son email, son affiliation et sa composante.'
      },
      response: {
        200: _selectIncidentUser
      }
    })
    .patch('/:incidentId/:iuid', async ({ params, body, status }) => {
      if (Object.keys(body).length === 0) return status(400, 'Aucune modification fournie')

      const [user] = await db.update(mainSchema.incidentUser)
        // La composante change : le code suit. Le laisser derrière produirait une
        // statistique juste sur d'anciennes données et fausse sur les nouvelles.
        .set('composante' in body ? { ...body, composanteCode: normaliserComposante(body.composante).code } : body)
        .where(
          and(
            eq(mainSchema.incidentUser.id, params.iuid),
            eq(mainSchema.incidentUser.incidentId, params.incidentId)
          )
        )
        .returning()

      if (!user) return status(404, 'Utilisateur non trouvé')

      return user
    }, {
      auth: ['gestionnaire', 'admin', 'svc'],
      params: t.Object({
        incidentId: t.String({ description: 'ID de l\'incident' }),
        iuid: t.String({ description: 'ID de l\'utilisateur' }),
      }),
      body: t.Partial(t.Omit(_insertIncidentUser, ['id', 'incidentId'])),
      detail: {
        summary: 'Modifier un utilisateur d\'un incident',
        description: 'Met à jour les informations d\'un utilisateur concerné par un incident.'
      },
      response: {
        200: _selectIncidentUser,
        400: t.String({ description: 'Aucune modification fournie' }),
        404: t.String({ description: 'Utilisateur non trouvé' })
      }
    })
    .delete('/:incidentId/:iuid', async ({ params, user, service_account, status }) => {
      const [removed] = await db.delete(mainSchema.incidentUser)
        .where(
          and(
            eq(mainSchema.incidentUser.id, params.iuid),
            eq(mainSchema.incidentUser.incidentId, params.incidentId)
          )
        )
        .returning()

      if (!removed) return status(404, 'Utilisateur non trouvé')

      await createLog(params.incidentId, 'user_removed', user?.id, service_account?.id, removed.fullName)

      return { success: true, id: removed.id }
    }, {
      auth: ['gestionnaire', 'admin', 'svc'],
      params: t.Object({
        incidentId: t.String({ description: 'ID de l\'incident' }),
        iuid: t.String({ description: 'ID de l\'utilisateur' }),
      }),
      detail: {
        summary: 'Supprimer un utilisateur d\'un incident',
        description: 'Supprime un utilisateur d\'un incident donné en fournissant l\'ID de l\'utilisateur.'
      },
      response: {
        200: t.Object({ success: t.Boolean(), id: t.String() }, { description: 'Utilisateur supprimé' }),
        404: t.String({ description: 'Utilisateur non trouvé' })
      }
    })