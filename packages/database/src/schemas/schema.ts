import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, pgEnum, uuid, jsonb, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { service_account, user } from "./auth-schema";
import { createAuditLogId, createIncidentId, createIncidentLogId } from "../utils/id";
import { incidentSubscriptions } from "./subscriptions";
import { phishingSchema } from "../schemas";
import { dataBreachIncident, ddosIncident, intrusionIncident, malwareIncident, ransomwareIncident } from "./incidents";


export const incidentType = pgEnum('incident_type', ['phishing', 'malware', 'ransomware', 'data_breach', 'ddos', 'network_intrusion', 'other']);
export const incidentSeverity = pgEnum('incident_severity', ['low', 'medium', 'high', 'critical']);
// `surveillance` : incident traité mais qu'on garde à l'œil un temps donné. Sans ce
// statut, on choisissait entre laisser un incident « ouvert » indéfiniment (et polluer les
// compteurs) ou le clore alors qu'on surveille encore.
export const incidentStatus = pgEnum('incident_status', ['open', 'investigating', 'in_progress', 'surveillance', 'resolved', 'closed']);

// Où l'incident se situe dans l'établissement. `inconnu` est une valeur légitime : mieux
// vaut l'assumer que de forcer un choix faux au moment de la déclaration.
export const incidentPerimeter = pgEnum('incident_perimeter', ['composante', 'laboratoire', 'service_central', 'infrastructure', 'etablissement_raccorde', 'inconnu']);
// `legitimate` se distingue de `benign` par ce qu'elle IMPLIQUE, pas par sa nuance :
//   false_positive -> l'outil s'est trompé, on corrige la règle de détection
//   benign         -> c'était réel mais sans conséquence, on classe
//   legitimate     -> c'était réel, voulu et autorisé, on met en LISTE BLANCHE
// Sans cette valeur, « bénin » servait aux deux derniers cas et on ne pouvait pas répondre
// à « quels incidents devraient avoir une exclusion et n'en ont pas ? ».
export const incidentResolution = pgEnum('incident_resolution', ['true_positive', 'risk_accepted', 'false_positive', 'benign', 'legitimate', 'duplicate']);

export type IncidentTypeValue = (typeof incidentType.enumValues)[number];

export const logType = pgEnum('log_type', ['update', 'comment', 'status_change', 'other', 'created', 'artifact_added', 'artifact_removed', 'user_added', 'user_removed', 'extension_updated', 'closed', 'enquete_etape', 'collecte', 'verification', 'action', 'archive']);

/**
 * Table incident générale
 */
export const incident = pgTable("incident", {
    id: text("id").primaryKey().$default(() => createIncidentId().toUpperCase()),
    type: incidentType("type").notNull(),
    severity: incidentSeverity("severity").notNull(),
    status: incidentStatus("status").notNull().$default(() => 'open'),
    resolution: incidentResolution("resolution"),
    description: text("description"),
    source: text("source"),
    // Référence externe optionnelle pour l'idempotence des imports (ex. n8n) — unique si présente
    externalId: text("external_id"),
    // ORIGINE DES DATES — trois instants distincts, souvent confondus à tort.
    //
    // `knowledgeAt` : quand l'ÉTABLISSEMENT a su, par qui que ce soit en son sein, ou par
    // réception d'un signalement tiers. C'est le point de départ des échéances
    // réglementaires. Nullable en base pour les incidents antérieurs à ce champ, mais
    // EXIGÉ à la création via l'API : une échéance calculée depuis la date de saisie est
    // fausse, et toujours dans le sens rassurant.
    knowledgeAt: timestamp("knowledge_at"),
    // `knowledgeEstimated` : vrai quand `knowledgeAt` est une approximation. Ne jamais
    // présenter une date déduite comme un fait établi.
    knowledgeEstimated: boolean("knowledge_estimated").default(false).notNull(),
    // `referredAt` : quand la cellule a été saisie. Distinct de la connaissance — un
    // signalement peut dormir un week-end avant d'arriver à la cellule.
    referredAt: timestamp("referred_at").defaultNow().notNull(),
    perimeter: incidentPerimeter("perimeter"),
    // Échéance du statut « surveillance » : au-delà, l'incident se clôt tout seul, en
    // conservant sa résolution. Sans échéance, « surveillance » deviendrait un second
    // « ouvert » dont personne ne sort jamais.
    surveillanceExpiresAt: timestamp("surveillance_expires_at"),
    // PRISE EN CHARGE — qui suit l'incident. Distincte de `createdBy` : déclarer un
    // incident n'est pas le prendre en charge, et le pilote peut changer en cours de route.
    // Jamais déduite d'un changement de statut : l'action est explicite, sans quoi personne
    // ne sait qui relancer ni quand cesser de relancer.
    pilot: text("pilot").references(() => user.id, { onDelete: "set null" }),
    takenOverAt: timestamp("taken_over_at"),
    // Qui a effectué l'action — différent du pilote lors d'une attribution par un admin.
    takenOverBy: text("taken_over_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => /* @__PURE__ */ new Date()).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdBySvc: text("created_by_svc").references(() => service_account.id, { onDelete: "set null" }),
    // ARCHIVAGE, AU LIEU DE LA SUPPRESSION.
    //
    // Supprimer effaçait en cascade douze tables, dont les exclusions et les échéances
    // réglementaires, et laissait les fichiers orphelins. Un incident archivé disparaît des
    // listes mais garde son dossier ; la suppression définitive ne vient qu'au terme de la
    // durée de conservation, et elle est tracée.
    archiveLe: timestamp("archive_le"),
    archivePar: text("archive_par").references(() => user.id, { onDelete: "set null" }),
    motifArchive: text("motif_archive"),
}, (table) => [
    index("incident_status_created_at_idx").on(table.status, table.createdAt),
    index("incident_archive_le_idx").on(table.archiveLe),
    // La vue « sans pilote » filtre là-dessus, et c'est la question qu'on pose le plus
    // souvent à la base : qu'est-ce qui n'est suivi par personne ?
    index("incident_pilot_idx").on(table.pilot),
    // Les échéances réglementaires se calculent depuis `knowledgeAt` : on trie et on
    // filtre dessus, il lui faut son index.
    index("incident_knowledge_at_idx").on(table.knowledgeAt),
    uniqueIndex("incident_external_id_uq").on(table.externalId),
]);

/**
 * Table des logs d'incidents, liée à la table incident par incidentId
 */
export const incidentLog = pgTable("incident_log", {
    id: text("id").primaryKey().$default(() => createIncidentLogId().toUpperCase()),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    message: text("message"),
    type: logType("type").notNull().$default(() => 'comment'),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => /* @__PURE__ */ new Date()).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdBySvc: text("created_by_svc").references(() => service_account.id, { onDelete: "set null" }),
}, (table) => [
    index("incident_log_incident_id_created_at_idx").on(table.incidentId, table.createdAt),
    check("incident_log_message_not_blank_ck", sql`length(trim(${table.message})) > 0`),
]);

export const incidentArtifact = pgTable("incident_artifact", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    artifactType: text("artifact_type").notNull(),
    name: text("name").notNull(),
    content: text("content"),
    mimeType: text("mime_type").notNull(),
    path: text("path"),
    // Empreinte calculée au dépôt : permet de reconnaître le même fichier d'un incident à
    // l'autre, et de comparer à un IOC sans rouvrir la pièce jointe.
    hashSha256: text("hash_sha256"),
    uploadedByUser: text("uploaded_by_user").references(() => user.id, { onDelete: "set null" }),
    uploadedBySvc: text("uploaded_by_svc").references(() => service_account.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // SUPPRESSION LOGIQUE. Une pièce retirée d'un dossier reste lisible par un
    // administrateur, avec qui l'a retirée et pourquoi : effacer le fichier effaçait aussi
    // la preuve qu'il avait existé.
    supprimeLe: timestamp("supprime_le"),
    supprimePar: text("supprime_par").references(() => user.id, { onDelete: "set null" }),
    motifSuppression: text("motif_suppression"),
}, (table) => [
    index("incident_artifact_incident_id_idx").on(table.incidentId),
    check("incident_artifact_name_not_blank_ck", sql`length(trim(${table.name})) > 0`),
    check("incident_artifact_mime_not_blank_ck", sql`length(trim(${table.mimeType})) > 0`),
]);

/**
 * Table des utilisateurs liés à un incident
 */
export const incidentUser = pgTable("incident_user", {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    affiliation: text("affiliation"),
    // La saisie telle qu'elle a été faite : conservée intacte, y compris ses libellés
    // périmés et ses encodages cassés. C'est la trace de ce que quelqu'un a écrit.
    composante: text("composante"),
    // Le code à trois chiffres qui en est extrait, seule partie exploitable pour compter.
    // Six écritures de la même composante circulent — `cmpi-901`, `cmpa-901`, `PT (…)`,
    // libellé tronqué — et grouper sur le texte donnerait autant de composantes que
    // d'écritures. `null` quand la saisie n'en contient aucun : une valeur non exploitable
    // se dit, elle ne s'invente pas.
    composanteCode: text("composante_code"),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
}, (table) => [
    index("incident_user_incident_id_idx").on(table.incidentId),
    uniqueIndex("incident_user_incident_email_uq").on(table.incidentId, table.email),
    check("incident_user_full_name_not_blank_ck", sql`length(trim(${table.fullName})) > 0`),
]);

export const incidentExtension = pgTable("incident_extension", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().unique().references(() => incident.id, { onDelete: "cascade" }),
    customType: text("custom_type").notNull(),
    tags: text("tags").array().default([]),
    customFields: jsonb("custom_fields").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => /* @__PURE__ */ new Date()).notNull(),
}, (table) => [
    index("incident_extension_custom_type_idx").on(table.customType),
    check("incident_extension_custom_type_not_blank_ck", sql`length(trim(${table.customType})) > 0`),
]);

export const auditLog = pgTable("audit_log", {
    id: text("id").primaryKey().$default(() => createAuditLogId()),
    table_name: text("table_name").notNull(),
    row_id: text("row_id").notNull(),
    action: text("action").notNull(),
    actor_user: text("actor_user").references(() => user.id, { onDelete: "set null" }),
    actor_svc: text("actor_svc").references(() => service_account.id, { onDelete: "set null" }),
    // Ce que l'action a touché : système appelé, chemin, statut, nombre de résultats. Jamais
    // de jeton ni d'URL complète — ce journal se lit et se sauvegarde.
    details: jsonb("details"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
    index("audit_log_table_row_idx").on(table.table_name, table.row_id),
    index("audit_log_created_at_idx").on(table.createdAt),
    check("audit_log_table_name_not_blank_ck", sql`length(trim(${table.table_name})) > 0`),
    check("audit_log_row_id_not_blank_ck", sql`length(trim(${table.row_id})) > 0`),
    check("audit_log_action_not_blank_ck", sql`length(trim(${table.action})) > 0`),
]);

export const incidentRelations = relations(incident, ({ many, one }) => ({
    logs: many(incidentLog),
    createdByUser: one(user, {
        fields: [incident.createdBy],
        references: [user.id]
    }),
    createdBySvc: one(service_account, {
        fields: [incident.createdBySvc],
        references: [service_account.id]
    }),
    // Qui SUIT l'incident — distinct de qui l'a créé. Sans cette relation, l'interface ne
    // peut afficher que « pris en charge », sans dire par qui : or c'est précisément la
    // question à laquelle la prise en charge doit répondre.
    pilotUser: one(user, {
        fields: [incident.pilot],
        references: [user.id],
    }),
    affectedUsers: many(incidentUser),
    artifacts: many(incidentArtifact),
    extension: one(incidentExtension, {
        fields: [incident.id],
        references: [incidentExtension.incidentId],
    }),
    subscribers: many(incidentSubscriptions),
    phishingDetails: one(phishingSchema.phishingDetail, {
        fields: [incident.id],
        references: [phishingSchema.phishingDetail.incidentId],
    }),
    malwareDetails: one(malwareIncident, {
        fields: [incident.id],
        references: [malwareIncident.incidentId],
    }),
    ransomwareDetails: one(ransomwareIncident, {
        fields: [incident.id],
        references: [ransomwareIncident.incidentId],
    }),
    dataBreachDetails: one(dataBreachIncident, {
        fields: [incident.id],
        references: [dataBreachIncident.incidentId],
    }),
    ddosDetails: one(ddosIncident, {
        fields: [incident.id],
        references: [ddosIncident.incidentId],
    }),
    intrusionDetails: one(intrusionIncident, {
        fields: [incident.id],
        references: [intrusionIncident.incidentId],
    }),
}))

export const incidentLogRelations = relations(incidentLog, ({ one }) => ({
    incident: one(incident, {
        fields: [incidentLog.incidentId],
        references: [incident.id]
    }),
    createdByUser: one(user, {
        fields: [incidentLog.createdBy],
        references: [user.id]
    }),
    createdBySvc: one(service_account, {
        fields: [incidentLog.createdBySvc],
        references: [service_account.id]
    })
}))

export const incidentUserRelations = relations(incidentUser, ({ one, many }) => ({
    incident: one(incident, {
        fields: [incidentUser.incidentId],
        references: [incident.id]
    }),
    malwareIncident: one(malwareIncident, {
        fields: [incidentUser.incidentId],
        references: [malwareIncident.incidentId],
    }),
    ransomwareIncident: one(ransomwareIncident, {
        fields: [incidentUser.incidentId],
        references: [ransomwareIncident.incidentId],
    }),
    dataBreachIncident: one(dataBreachIncident, {
        fields: [incidentUser.incidentId],
        references: [dataBreachIncident.incidentId],
    }),
    phishingIdentities: many(phishingSchema.phishingIdentity),
    connectionLogs: many(phishingSchema.phishingConnectionLog),
}))

export const incidentExtensionRelations = relations(incidentExtension, ({ one }) => ({
    incident: one(incident, {
        fields: [incidentExtension.incidentId],
        references: [incident.id],
    }),
}))

export const incidentArtifactRelations = relations(incidentArtifact, ({ one }) => ({
    incident: one(incident, {
        fields: [incidentArtifact.incidentId],
        references: [incident.id]
    }),
    uploadedByUser: one(user, {
        fields: [incidentArtifact.uploadedByUser],
        references: [user.id]
    }),
    uploadedBySvc: one(service_account, {
        fields: [incidentArtifact.uploadedBySvc],
        references: [service_account.id]
    })
}))