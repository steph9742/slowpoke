import { createHmac } from "node:crypto"
import { db } from "@slowpoke/database"

export interface WebhookRow {
  id: string
  url: string
  secret: string | null
}

/** Un changement de champ d'incident : ce qui a été modifié, avant → après. */
export type IncidentChange = { field: string, from: unknown, to: unknown }

/** Envoie un payload à un webhook, signé en HMAC-SHA256 si un secret est défini. */
export async function sendToWebhook(hook: WebhookRow, event: string, body: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Slowpoke-Event': event,
  }
  if (hook.secret) {
    const signature = createHmac('sha256', hook.secret).update(body).digest('hex')
    headers['X-Slowpoke-Signature'] = `sha256=${signature}`
  }
  return fetch(hook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) })
}

/**
 * Sur événement d'incident : POST un payload riche vers chaque webhook actif abonné à cet événement.
 * Fire-and-forget (Promise.allSettled) → n'interrompt jamais la requête principale.
 */
export async function dispatchWebhooks(incidentId: string, event: string, message?: string, changes?: IncidentChange[], extra?: Record<string, unknown>) {
  const hooks = (await db.query.webhook.findMany({
    where: (w, { eq }) => eq(w.enabled, true),
  })).filter(h => h.events.includes(event))

  if (hooks.length === 0) return

  const incident = await db.query.incident.findFirst({
    where: (i, { eq }) => eq(i.id, incidentId),
  })

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    message: message ?? null,
    changes: changes && changes.length > 0 ? changes : null,
    incident,
    // Charge propre à l'événement, quand l'incident seul ne suffit pas à agir dessus :
    // un appariement, par exemple, porte la règle et l'échéance qui vient de faire autorité.
    ...(extra ?? {}),
  })

  await envoyerATous(hooks, event, body)
}

/**
 * Événement qui ne porte PAS sur un incident — l'échéance d'une liste blanche posée hors
 * incident, par exemple. Même forme de charge utile, `incident` à `null` : un consommateur qui
 * lit `event` n'a rien à changer, et aucun ne reçoit un incident inventé pour remplir le champ.
 */
export async function dispatchWebhooksSansIncident(event: string, message: string, extra?: Record<string, unknown>) {
  const hooks = (await db.query.webhook.findMany({
    where: (w, { eq }) => eq(w.enabled, true),
  })).filter(h => h.events.includes(event))

  if (hooks.length === 0) return

  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    message,
    changes: null,
    incident: null,
    ...(extra ?? {}),
  })

  await envoyerATous(hooks, event, body)
}

async function envoyerATous(hooks: WebhookRow[], event: string, body: string) {
  await Promise.allSettled(
    hooks.map(async (h) => {
      try {
        await sendToWebhook(h, event, body)
      }
      catch (err) {
        console.error(`❌ Webhook ${h.id} (${h.url}) — échec:`, err instanceof Error ? err.message : err)
      }
    }),
  )
}
