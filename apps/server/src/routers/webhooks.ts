import { Elysia, t } from 'elysia'
import { betterAuth } from '../middleware/auth'
import { db } from '@slowpoke/database'
import { webhooksSchema } from '@slowpoke/database/tables'
import { createInsertSchema, createSelectSchema } from 'drizzle-typebox'
import { eq } from 'drizzle-orm'
import { sendToWebhook } from '../utils/webhook'

const _selectWebhook = createSelectSchema(webhooksSchema.webhook)
const _insertWebhook = createInsertSchema(webhooksSchema.webhook)
const WebhookBody = t.Omit(_insertWebhook, ['id', 'createdAt'])

export const webhooksRouter = new Elysia({ name: 'webhooks', prefix: '/api/webhooks', tags: ['Webhooks'] })
  .use(betterAuth)
  .model({ Webhook: _selectWebhook })
  .get('/', async () => {
    return await db.select().from(webhooksSchema.webhook)
  }, {
    auth: ['admin'],
    response: { 200: t.Array(_selectWebhook) },
    detail: { summary: 'Lister les webhooks' },
  })
  .post('/', async ({ body }) => {
    const [created] = await db.insert(webhooksSchema.webhook).values(body).returning()
    if (!created) throw new Error('Échec de la création du webhook')
    return created
  }, {
    auth: ['admin'],
    body: WebhookBody,
    response: { 200: _selectWebhook },
    detail: {
      summary: 'Créer un webhook',
      description: "`events` liste les événements abonnés. La plupart sont des types de log d'incident (`created`, `status_change`, `update`, `comment`, `closed`…), auxquels s'ajoutent `exclusion_appariee`, `exclusion_detachee`, et deux événements qui ne portent AUCUN incident : `revue_liste_blanche_proche` et `revue_liste_blanche_depassee` — leur charge utile a `incident: null` et un objet `listeBlanche`.",
    },
  })
  .patch('/:id', async ({ params, body, status }) => {
    if (Object.keys(body).length === 0) return status(400, 'Aucune modification fournie')

    const [updated] = await db.update(webhooksSchema.webhook)
      .set(body)
      .where(eq(webhooksSchema.webhook.id, params.id))
      .returning()

    if (!updated) return status(404, 'Webhook introuvable')
    return updated
  }, {
    auth: ['admin'],
    params: t.Object({ id: t.String() }),
    body: t.Partial(WebhookBody),
    response: { 200: _selectWebhook, 400: t.String(), 404: t.String() },
    detail: { summary: 'Modifier un webhook' },
  })
  .delete('/:id', async ({ params, status }) => {
    const [deleted] = await db.delete(webhooksSchema.webhook)
      .where(eq(webhooksSchema.webhook.id, params.id))
      .returning()

    if (!deleted) return status(404, 'Webhook introuvable')
    return { success: true, id: deleted.id }
  }, {
    auth: ['admin'],
    params: t.Object({ id: t.String() }),
    response: { 200: t.Object({ success: t.Boolean(), id: t.String() }), 404: t.String() },
    detail: { summary: 'Supprimer un webhook' },
  })
  .post('/:id/test', async ({ params, status }) => {
    const [hook] = await db.select().from(webhooksSchema.webhook).where(eq(webhooksSchema.webhook.id, params.id))
    if (!hook) return status(404, 'Webhook introuvable')

    const body = JSON.stringify({
      event: 'test',
      timestamp: new Date().toISOString(),
      message: 'Test depuis Slowpoke',
      incident: null,
    })

    try {
      const res = await sendToWebhook(hook, 'test', body)
      return { ok: res.ok, status: res.status }
    }
    catch (err) {
      return status(502, `Échec: ${err instanceof Error ? err.message : 'erreur réseau'}`)
    }
  }, {
    auth: ['admin'],
    params: t.Object({ id: t.String() }),
    response: { 200: t.Object({ ok: t.Boolean(), status: t.Number() }), 404: t.String(), 502: t.String() },
    detail: { summary: 'Envoyer un payload de test au webhook' },
  })
