import { Elysia, t } from 'elysia'
import { betterAuth } from '../middleware/auth'
import { addSubscription, removeSubscription, subscribeToGlobalPush, subscribeToIncident, unsubscribeFromIncident } from '../utils/notification'
import { createInsertSchema } from 'drizzle-typebox'
import { subscriptionsSchema } from '@slowpoke/database/tables'
import { db } from '@slowpoke/database'

const _createGlobalSubscription = createInsertSchema(subscriptionsSchema.globalPushPreferences)

export const notificationsRouter = new Elysia({ name: 'notifications', prefix: '/api/notifications', tags: ['Notifications'], detail: { hide: true } })
    .use(betterAuth)
    .get('/public-key', async () => {
      return process.env.VAPID_PUBLIC_KEY!
    }, {
      auth: ['lecteur', 'gestionnaire', 'admin'],
    })
    .get('/is-subscribed', async ({ user }) => {
      const subscription = await db.query.subscriptions.findFirst({
        where: (subscription, { eq }) => eq(subscription.userId, user.id),
      })
      return { isSubscribed: !!subscription }
    }, {
      auth: ['lecteur', 'gestionnaire', 'admin'],
    })
    .get('/global', async ({ user }) => {
      const prefs = await db.query.globalPushPreferences.findFirst({
        where: (p, { eq }) => eq(p.userId, user.id),
        columns: { notifyOn: true },
      })
      return { notifyOn: prefs?.notifyOn ?? [] }
    }, {
      auth: ['lecteur', 'gestionnaire', 'admin'],
    })
    .post('/activate', async ({ body, status, user }) => {
      await addSubscription(body.subscription, user.id)

      status(201)
      return { message: 'Subscription added' }
    }, {
      auth: ['lecteur', 'gestionnaire', 'admin'],
      body: t.Object({
        subscription: t.Object({
          endpoint: t.String(),
          expirationTime: t.Optional(t.Union([t.Number(), t.Null()])),
          keys: t.Object({
            p256dh: t.String(),
            auth: t.String(),
          })
        })
      }),
    })
    .post('/subscribe-to/:incidentId', async ({ params, status, user }) => {
      await subscribeToIncident(params.incidentId, user.id)

      status(201)
      return { message: 'Subscribed to notifications' }
    }, {
      auth: ['lecteur', 'gestionnaire', 'admin'],
      params: t.Object({
        incidentId: t.String(),
      })
    })
    .delete('/subscribe-to/:incidentId', async ({ params, user }) => {
      await unsubscribeFromIncident(params.incidentId, user.id)

      return { message: 'Unsubscribed from notifications' }
    }, {
      auth: ['lecteur', 'gestionnaire', 'admin'],
      params: t.Object({
        incidentId: t.String(),
      })
    })
    .post('/global', async ({ body, status, user }) => {
      // Le corps hérite de l'enum PostgreSQL, qui contient encore `incident_updates`.
      // Cette valeur est morte — les mises à jour ne notifient plus que les suiveurs d'un
      // incident. On l'écarte à l'entrée plutôt que de l'enregistrer sans effet.
      const VIVANTES = ['new_incidents', 'revue_listes_blanches', 'alertes_graves'] as const
      await subscribeToGlobalPush(user.id, body.notifyOn.filter((v): v is typeof VIVANTES[number] => VIVANTES.includes(v as typeof VIVANTES[number])))

      status(201)
      return { message: 'Subscribed to global notifications' }
    }, {
      auth: ['lecteur', 'gestionnaire', 'admin'],
      body: t.Omit(_createGlobalSubscription, ['userId', 'lastUpdate', 'id']),
    })
    .delete('/unsubscribe', async ({ query }) => await removeSubscription(query.endpoint), {
      auth: ['lecteur', 'gestionnaire', 'admin'],
      query: t.Object({
        endpoint: t.String(),
      })
    })