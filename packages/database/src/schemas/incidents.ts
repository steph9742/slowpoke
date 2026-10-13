import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, pgEnum, uuid, integer, jsonb, uniqueIndex, check } from "drizzle-orm/pg-core";
import { incident } from "./schema";

export const malwareType = pgEnum('malware_type', ['trojan', 'worm', 'spyware', 'adware', 'other']);
export const intrusionType = pgEnum('intrusion_type', ['port_scan', 'brute_force', 'vulnerability_exploit', 'defacement', 'other']);

export const malwareIncident = pgTable("malware_incident", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    rntCertId: text("rnt_cert_id"),
    malwareType: malwareType("malware_type"),
    // Ni defaultNow() ni notNull : quand la source ne transmet pas de date de détection,
    // la valeur reste VIDE. Inventer l'heure d'insertion produit une date fausse que rien
    // ne distingue ensuite d'une date réelle.
    detectedAt: timestamp("detected_at"),
    machines: text("machines").array(),
    iocs: text("iocs").array(),
    c2: text("c2").array(),
    networkLocations: text("network_locations").array(),
    additionalInfo: jsonb("additional_info"),
}, (table) => [
    uniqueIndex("malware_incident_incident_id_uq").on(table.incidentId),
]);

export const malwareIncidentRelations = relations(malwareIncident, ({ one }) => ({
    incident: one(incident, {
        fields: [malwareIncident.incidentId],
        references: [incident.id],
    }),
}))

export const ransomwareIncident = pgTable("ransomware_incident", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    rntCertId: text("rnt_cert_id"),
    // Ni defaultNow() ni notNull : quand la source ne transmet pas de date de détection,
    // la valeur reste VIDE. Inventer l'heure d'insertion produit une date fausse que rien
    // ne distingue ensuite d'une date réelle.
    detectedAt: timestamp("detected_at"),
    entrypoint: text("entrypoint"),
    machines: text("machines").array(),
    iocs: text("iocs").array(),
    concernedEntities: text("concerned_entities").array(),
    networkLocation: text("network_location").array(),
    additionalInfo: jsonb("additional_info"),
    ransomAmount: integer("ransom_amount"),
    ransomCurrency: text("ransom_currency"),
}, (table) => [
    uniqueIndex("ransomware_incident_incident_id_uq").on(table.incidentId),
    check("ransomware_incident_ransom_amount_non_negative_ck", sql`${table.ransomAmount} is null or ${table.ransomAmount} >= 0`),
    check("ransomware_incident_ransom_pair_ck", sql`(${table.ransomAmount} is null and ${table.ransomCurrency} is null) or (${table.ransomAmount} is not null and ${table.ransomCurrency} is not null)`),
    check("ransomware_incident_ransom_currency_not_blank_ck", sql`${table.ransomCurrency} is null or length(trim(${table.ransomCurrency})) > 0`),
]);

export const ransomwareIncidentRelations = relations(ransomwareIncident, ({ one }) => ({
    incident: one(incident, {
        fields: [ransomwareIncident.incidentId],
        references: [incident.id],
    }),
}))

export const dataBreachIncident = pgTable("data_breach_incident", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    // Ni defaultNow() ni notNull : quand la source ne transmet pas de date de détection,
    // la valeur reste VIDE. Inventer l'heure d'insertion produit une date fausse que rien
    // ne distingue ensuite d'une date réelle.
    detectedAt: timestamp("detected_at"),
    dataCategories: text("data_categories").array(),
    exfilDestinations: text("exfil_destinations").array(),
    recordsAffected: integer("records_affected"),
    additionalInfo: jsonb("additional_info"),
}, (table) => [
    uniqueIndex("data_breach_incident_incident_id_uq").on(table.incidentId),
    check("data_breach_incident_records_affected_non_negative_ck", sql`${table.recordsAffected} is null or ${table.recordsAffected} >= 0`),
]);

export const dataBreachIncidentRelations = relations(dataBreachIncident, ({ one }) => ({
    incident: one(incident, {
        fields: [dataBreachIncident.incidentId],
        references: [incident.id],
    }),
}))

export const ddosIncident = pgTable("ddos_incident", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    // Absente jusqu'ici : un DDoS avait un début d'attaque mais aucune date de détection,
    // alors que les deux diffèrent (l'attaque commence avant qu'on la voie).
    detectedAt: timestamp("detected_at"),
    durationMinutes: integer("duration_minutes"),
    targets: text("targets").array(),
    sourceIps: text("source_ips").array(),
    vectors: text("vectors").array(),
    targetPorts: text("target_ports").array(),
    peakBandwidthMbps: integer("peak_bandwidth_mbps"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
}, (table) => [
    uniqueIndex("ddos_incident_incident_id_uq").on(table.incidentId),
    check("ddos_incident_duration_non_negative_ck", sql`${table.durationMinutes} is null or ${table.durationMinutes} >= 0`),
    check("ddos_incident_peak_bandwidth_non_negative_ck", sql`${table.peakBandwidthMbps} is null or ${table.peakBandwidthMbps} >= 0`),
    check("ddos_incident_timeline_ck", sql`${table.startedAt} is null or ${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`),
]);

export const ddosIncidentRelations = relations(ddosIncident, ({ one }) => ({
    incident: one(incident, {
        fields: [ddosIncident.incidentId],
        references: [incident.id],
    }),
}))

export const intrusionIncident = pgTable("intrusion_incident", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    intrusionType: intrusionType("intrusion_type"),
    // Ni defaultNow() ni notNull : quand la source ne transmet pas de date de détection,
    // la valeur reste VIDE. Inventer l'heure d'insertion produit une date fausse que rien
    // ne distingue ensuite d'une date réelle.
    detectedAt: timestamp("detected_at"),
    sourceIps: text("source_ips").array(),
    compromisedAccounts: text("compromised_accounts").array(),
    machines: text("machines").array(),
    networkLocations: text("network_locations").array(),
    additionalInfo: jsonb("additional_info"),
}, (table) => [
    uniqueIndex("intrusion_incident_incident_id_uq").on(table.incidentId),
]);

export const intrusionIncidentRelations = relations(intrusionIncident, ({ one }) => ({
    incident: one(incident, {
        fields: [intrusionIncident.incidentId],
        references: [incident.id],
    }),
}))
