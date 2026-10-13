import { db } from '@slowpoke/database';
import webpush from 'web-push'
import { subscriptionsSchema, mainSchema } from '@slowpoke/database/tables'
import { and, arrayContains, eq, inArray } from 'drizzle-orm';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY!
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!

const siteLink = process.env.SITE_URL!

webpush.setVapidDetails(
  // Contact transmis aux services de push (Mozilla, Google…) pour joindre l'exploitant.
  // Une adresse de SERVICE, jamais nominative — et `||` car compose passe des chaînes
  // vides pour les variables non renseignées. Changer ce contact n'invalide pas les
  // abonnements existants : seule la paire de clés VAPID compte.
  process.env.VAPID_SUBJECT || 'mailto:admin@exemple.fr',
  vapidPublicKey,
  vapidPrivateKey
)

const TYPE_LABELS: Record<string, string> = {
  phishing: 'Phishing',
  malware: 'Malware',
  ransomware: 'Ransomware',
  data_breach: 'Fuite de données',
  ddos: 'DDoS',
  network_intrusion: 'Intrusion',
  other: 'Autre',
}

interface SendNotificationOptions {
  incidentId: string;
  message: string;
  userId?: string;
}

type PushSub = { endpoint: string, p256dh: string, auth: string }

/** Construit le payload de la notif : titre = « Type — date de détection », corps = message (timeline). */
async function buildPayload(incidentId: string, body: string): Promise<string> {
  const inc = await db.query.incident.findFirst({
    where: eq(mainSchema.incident.id, incidentId),
    columns: { type: true, createdAt: true },
    with: {
      phishingDetails: { columns: { detectedAt: true } },
      malwareDetails: { columns: { detectedAt: true } },
      ransomwareDetails: { columns: { detectedAt: true } },
      dataBreachDetails: { columns: { detectedAt: true } },
      intrusionDetails: { columns: { detectedAt: true } },
      ddosDetails: { columns: { startedAt: true } },
    },
  })

  const label = TYPE_LABELS[inc?.type ?? 'other'] ?? (inc?.type ?? 'Incident')
  const date = inc?.phishingDetails?.detectedAt
    ?? inc?.malwareDetails?.detectedAt
    ?? inc?.ransomwareDetails?.detectedAt
    ?? inc?.dataBreachDetails?.detectedAt
    ?? inc?.intrusionDetails?.detectedAt
    ?? inc?.ddosDetails?.startedAt
    ?? inc?.createdAt
  const dateStr = date ? new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  return JSON.stringify({
    title: dateStr ? `${label} — ${dateStr}` : label,
    body,
    link: `${siteLink}/incidents/${incidentId}`,
  })
}

/** Envoie le payload à toutes les souscriptions données ; purge celles expirées/révoquées (404/410). */
async function sendToSubscriptions(subs: PushSub[], payload: string) {
  await Promise.allSettled(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
    }
    catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        await db.delete(subscriptionsSchema.subscriptions)
          .where(eq(subscriptionsSchema.subscriptions.endpoint, s.endpoint))
      }
      else {
        console.error('❌ web-push:', err instanceof Error ? err.message : err)
      }
    }
  }))
}

/** Toutes les souscriptions (tous les navigateurs/appareils) des utilisateurs donnés. */
async function subscriptionsForUsers(userIds: string[]): Promise<PushSub[]> {
  if (userIds.length === 0) return []
  return db.query.subscriptions.findMany({
    where: inArray(subscriptionsSchema.subscriptions.userId, userIds),
    columns: { endpoint: true, p256dh: true, auth: true },
  })
}

/** Notifie les utilisateurs qui SUIVENT l'incident (tous leurs navigateurs), sauf l'auteur. */
export async function sendNotification(options: SendNotificationOptions) {
  const { incidentId, message, userId } = options;
  const followers = await db.query.incidentSubscriptions.findMany({
    where: eq(subscriptionsSchema.incidentSubscriptions.incidentId, incidentId),
    columns: { userId: true },
  })
  const userIds = [...new Set(followers.map(f => f.userId))].filter(id => id !== userId)
  const subs = await subscriptionsForUsers(userIds)
  if (subs.length === 0) return
  await sendToSubscriptions(subs, await buildPayload(incidentId, message))
}

/** Notifie les utilisateurs abonnés globalement à ce type de notif (tous leurs navigateurs), sauf l'auteur. */
export async function sendGlobalNotification(incidentId: string, type: subscriptionsSchema.TypeNotificationGlobale, message: string, userId?: string) {
  const prefs = await db.query.globalPushPreferences.findMany({
    where: arrayContains(subscriptionsSchema.globalPushPreferences.notifyOn, [type]),
    columns: { userId: true },
  })
  const userIds = [...new Set(prefs.map(p => p.userId))].filter(id => id !== userId)
  const subs = await subscriptionsForUsers(userIds)
  if (subs.length === 0) return
  await sendToSubscriptions(subs, await buildPayload(incidentId, message))
}

/**
 * Notification globale qui ne parle PAS d'un incident — la revue des listes blanches, par
 * exemple. Le titre et le lien sont donnés par l'appelant, puisqu'il n'y a pas d'incident
 * d'où les tirer.
 */
export async function sendGlobalNotificationSansIncident(
  type: subscriptionsSchema.TypeNotificationGlobale,
  titre: string,
  corps: string,
  chemin: string,
) {
  const prefs = await db.query.globalPushPreferences.findMany({
    where: arrayContains(subscriptionsSchema.globalPushPreferences.notifyOn, [type]),
    columns: { userId: true },
  })
  const userIds = [...new Set(prefs.map(p => p.userId))]
  const subs = await subscriptionsForUsers(userIds)
  if (subs.length === 0) return
  await sendToSubscriptions(subs, JSON.stringify({ title: titre, body: corps, link: `${siteLink}${chemin}` }))
}

export async function addSubscription(subscription: webpush.PushSubscription, userId: string) {
  // Upsert par endpoint : re-souscrire le même navigateur met à jour ses clés, un nouveau navigateur ajoute une ligne
  return await db.insert(subscriptionsSchema.subscriptions).values({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userId,
  }).onConflictDoUpdate({
    target: subscriptionsSchema.subscriptions.endpoint,
    set: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId,
    },
  })
}

export async function subscribeToIncident(incidentId: string, userId: string) {
  // Suivi par utilisateur (dédupliqué) → tous ses navigateurs seront notifiés
  return await db.insert(subscriptionsSchema.incidentSubscriptions)
    .values({ incidentId, userId })
    .onConflictDoNothing()
}

export async function unsubscribeFromIncident(incidentId: string, userId: string) {
  return await db.delete(subscriptionsSchema.incidentSubscriptions)
    .where(and(
      eq(subscriptionsSchema.incidentSubscriptions.incidentId, incidentId),
      eq(subscriptionsSchema.incidentSubscriptions.userId, userId),
    ))
}

export async function subscribeToGlobalPush(userId: string, notifyOn: subscriptionsSchema.TypeNotificationGlobale[]) {
  await db.insert(subscriptionsSchema.globalPushPreferences).values({
    userId,
    notifyOn,
  })
    .onConflictDoUpdate({ target: subscriptionsSchema.globalPushPreferences.userId, set: { notifyOn, lastUpdate: new Date() } })
}

export async function unsubscribeFromGlobalPush(userId: string) {
  await db.delete(subscriptionsSchema.globalPushPreferences).where(eq(subscriptionsSchema.globalPushPreferences.userId, userId))
}

export async function removeSubscription(endpoint: string) {
  await db.delete(subscriptionsSchema.subscriptions).where(eq(subscriptionsSchema.subscriptions.endpoint, endpoint))
}
