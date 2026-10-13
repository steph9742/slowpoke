import { pgEnum, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core"
import { incident } from "./schema";
import { user } from "./auth-schema";
import { relations } from "drizzle-orm";

// `incident_updates` est conservé dans le TYPE POSTGRESQL — le retirer imposerait de
// recréer le type pour un gain nul — mais il est mort : les mises à jour ne notifient plus
// que les personnes qui SUIVENT l'incident, jamais tout le monde. Le code applicatif ne
// doit donc plus pouvoir l'écrire : voir `TypeNotificationGlobale` ci-dessous.
export const globalNotificationTypes = pgEnum('global_notification_types', ['incident_updates', 'new_incidents', 'revue_listes_blanches', 'alertes_graves'])

/** Les seules valeurs encore émises. `incident_updates` en est délibérément exclu. */
export type TypeNotificationGlobale = 'new_incidents' | 'revue_listes_blanches' | 'alertes_graves'

// Une souscription push = un navigateur/appareil. Plusieurs par utilisateur (endpoint unique → upsert).
export const subscriptions = pgTable('subscriptions', {
  id: uuid().primaryKey().defaultRandom(),
  userId: text().notNull().references(() => user.id, { onDelete: 'cascade' }),
  endpoint: text().notNull().unique(),
  p256dh: text().notNull(),
  auth: text().notNull(),
})

// Suivi d'un incident par un UTILISATEUR (indépendant du navigateur → notifie tous ses appareils).
export const incidentSubscriptions = pgTable('incident_subscriptions', {
  id: uuid().primaryKey().defaultRandom(),
  incidentId: text().notNull().references(() => incident.id, { onDelete: 'cascade' }),
  userId: text().notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (t) => [
  uniqueIndex('incident_subscriptions_incident_user_uq').on(t.incidentId, t.userId),
])

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(user, {
    fields: [subscriptions.userId],
    references: [user.id]
  }),
}))

export const incidentSubscriptionsRelations = relations(incidentSubscriptions, ({ one }) => ({
  incident: one(incident, {
    fields: [incidentSubscriptions.incidentId],
    references: [incident.id]
  }),
  user: one(user, {
    fields: [incidentSubscriptions.userId],
    references: [user.id]
  }),
}))

export const globalPushPreferences = pgTable('global_push_preferences', {
  id: uuid().primaryKey().defaultRandom(),
  userId: text().notNull().references(() => user.id, { onDelete: 'cascade' }).unique(),
  notifyOn: globalNotificationTypes().array().notNull(),
  lastUpdate: timestamp().notNull().defaultNow().$onUpdateFn(() => new Date()),
})

export const globalPushPreferencesRelations = relations(globalPushPreferences, ({ one }) => ({
  user: one(user, {
    fields: [globalPushPreferences.userId],
    references: [user.id]
  }),
}))
