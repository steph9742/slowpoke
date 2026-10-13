import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, pgEnum, uuid, integer, index, uniqueIndex, check, jsonb } from "drizzle-orm/pg-core";
import { incident, incidentUser } from "./schema";

export const phishingAction = pgEnum('phishing_action', ['messages_sent', 'messages_deleted', 'contacts_added', 'identity_modified', 'other']);

export const logType = pgEnum('log_type', ['update', 'comment', 'status_change', 'other']);

export const phishingDetail = pgTable("phishing_detail", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    // Ni defaultNow() ni notNull : quand la source ne transmet pas de date de détection,
    // la valeur reste VIDE. Inventer l'heure d'insertion produit une date fausse que rien
    // ne distingue ensuite d'une date réelle.
    detectedAt: timestamp("detected_at"),
}, (table) => [
    uniqueIndex("phishing_detail_incident_id_uq").on(table.incidentId),
]);

export const phishingIdentity = pgTable("phishing_identity", {
    id: uuid("id").primaryKey().defaultRandom(),
    concernedUser: uuid("concerned_user").notNull().references(() => incidentUser.id, { onDelete: "cascade" }),
    identity_name: text("identity_name").notNull(),
    fromDisplayName: text("from_display_name"),
    fromAddress: text("from_address"),
    replyDisplayName: text("reply_display_name"),
    replyAddress: text("reply_address"),
    createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => [
    index("phishing_identity_concerned_user_idx").on(table.concernedUser),
    check("phishing_identity_name_not_blank_ck", sql`length(trim(${table.identity_name})) > 0`),
]);

export const phishingConnectionLog = pgTable("phishing_connection_log", {
    id: uuid("id").primaryKey().defaultRandom(),
    concernedUser: uuid("concerned_user").notNull().references(() => incidentUser.id, { onDelete: "cascade" }),
    activityStart: timestamp("activity_start").defaultNow().notNull(),
    activityEnd: timestamp("activity_end"),
    ipAddress: text("ip_address").notNull(),
    countryCode: text("country_code"),
    countryName: text("country_name"),
}, (table) => [
    index("phishing_connection_log_concerned_user_idx").on(table.concernedUser),
    check("phishing_connection_log_timeline_ck", sql`${table.activityEnd} is null or ${table.activityEnd} >= ${table.activityStart}`),
    check("phishing_connection_log_ip_not_blank_ck", sql`length(trim(${table.ipAddress})) > 0`),
    check("phishing_connection_log_country_code_shape_ck", sql`${table.countryCode} is null or upper(${table.countryCode}) ~ '^[A-Z]{2}$'`),
]);

export const phishingConnectionAction = pgTable("phishing_connection_action", {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionLogId: uuid("connection_log_id").notNull().references(() => phishingConnectionLog.id, { onDelete: "cascade" }),
    actionType: phishingAction("action_type").notNull(),
    amount: integer("amount"),
    additionalInfo: jsonb("additional_info").default({}),
    label: text("label"),
}, (table) => [
    index("phishing_connection_action_log_id_idx").on(table.connectionLogId),
    check("phishing_connection_action_amount_non_negative_ck", sql`${table.amount} is null or ${table.amount} >= 0`),
]);

export const phishingRelations = relations(phishingDetail, ({ one }) => ({
    incident: one(incident, {
        fields: [phishingDetail.incidentId],
        references: [incident.id],
    }),
}))

export const phishingConnectionLogRelations = relations(phishingConnectionLog, ({ one, many }) => ({
    concernedUser: one(incidentUser, {
        fields: [phishingConnectionLog.concernedUser],
        references: [incidentUser.id],
    }),
    actions: many(phishingConnectionAction),
}))

export const phishingIdentityRelations = relations(phishingIdentity, ({ one }) => ({
    concernedUser: one(incidentUser, {
        fields: [phishingIdentity.concernedUser],
        references: [incidentUser.id],
    }),
}))

export const phishingConnectionActionRelations = relations(phishingConnectionAction, ({ one }) => ({
    connectionLog: one(phishingConnectionLog, {
        fields: [phishingConnectionAction.connectionLogId],
        references: [phishingConnectionLog.id],
    }),
}))