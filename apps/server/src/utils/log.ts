import { db } from "@slowpoke/database";
import { mainSchema } from "@slowpoke/database/tables";
import { sendGlobalNotification, sendNotification } from "./notification";
import { dispatchWebhooks, type IncidentChange } from "./webhook";

type LogTypes = typeof mainSchema.logType.enumValues[number]

export async function createLog(incidentId: string, type: LogTypes = 'comment', userId?: string, svcId?: string, message?: string, changes?: IncidentChange[], options?: { silent?: boolean }) {
  const [log] = await db.insert(mainSchema.incidentLog).values({
    type: type,
    incidentId: incidentId,
    createdBy: userId,
    createdBySvc: svcId,
    message: message,
  }).returning();

  // Import silencieux (ex. reprise d'historique via n8n) : on journalise mais sans notifier ni relayer
  if (!options?.silent) {
    if (type === 'created') {
      // Nouvel incident → abonnés globaux « Nouveaux incidents »
      await sendGlobalNotification(incidentId, 'new_incidents', message ?? 'Nouvel incident signalé', userId)
    }
    else {
      // Mise à jour → uniquement les utilisateurs qui SUIVENT cet incident (plus de firehose global)
      await sendNotification({ incidentId, message: message ?? 'Incident mis à jour', userId })
    }

    // Relaie l'événement vers les webhooks abonnés (n8n, etc.) — fire-and-forget
    await dispatchWebhooks(incidentId, type, message, changes)
  }

  // `.returning()` après l'insertion d'une ligne renvoie toujours cette ligne : le
  // `| undefined` vient du destructuring du tableau, pas d'un cas atteignable. Sans cette
  // assertion, `POST /:id/log` ne satisfait pas sa réponse déclarée (`200: 'Log'`).
  return log!
}