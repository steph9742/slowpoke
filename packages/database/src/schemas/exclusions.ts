import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, pgEnum, uuid, jsonb, boolean, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { incident } from "./schema";
import { user } from "./auth-schema";

// LISTES BLANCHES ET EXCLUSIONS.
//
// `resolution = benign` dit qu'une détection portait sur une activité légitime, sans
// enregistrer CE QUI a été mis en liste blanche, où, ni jusqu'à quand : l'inventaire des
// angles morts volontaires n'existait nulle part, et leur revue était impossible.

export const exclusionTool = pgEnum('exclusion_tool', ['harfanglab', 'wazuh', 'pare_feu', 'autre']);
export const exclusionState = pgEnum('exclusion_state', ['active', 'revoquee']);

export const exclusion = pgTable("exclusion", {
    id: uuid("id").primaryKey().defaultRandom(),
    // Une exclusion nait toujours d'un incident : c'est lui qui la motive et la justifie.
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    tool: exclusionTool("tool").notNull(),
    // Précision quand `tool` vaut `autre` : sans elle, on sait qu'une exclusion existe mais
    // plus sur quel outil — donc impossible de la lever le jour venu.
    toolOther: text("tool_other"),
    // PORTÉE — deux formes complémentaires, et c'est volontaire.
    //
    // `scopeDetails` porte les critères SÉPARÉMENT (chemin, empreinte, règle, machine…), ce qui
    // permet de retrouver « toutes les exclusions touchant srv-01 » — impossible sur du texte
    // libre. `scope` reste le texte lisible, composé à partir des critères.
    scopeDetails: jsonb("scope_details").$type<Record<string, string>>().default({}),
    scope: text("scope").notNull(),
    // Portée manifestement large (racine, joker seul, /8…) confirmée explicitement par
    // l'auteur. Conservé pour que la revue puisse remonter ces exclusions en priorité.
    broadScopeAcknowledged: boolean("broad_scope_acknowledged").notNull().default(false),
    // Pourquoi l'activité est légitime. OBLIGATOIRE et non vide : une exclusion sans motif
    // est indéfendable six mois plus tard, quand personne ne se souvient de la raison.
    reason: text("reason").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // OBLIGATOIRE : pas de liste blanche sans date de revue. C'est ce qui empêche un
    // angle mort temporaire de devenir permanent par simple oubli.
    reviewDate: timestamp("review_date").notNull(),
    /** Identifiant de la règle correspondante dans l'outil. NULLABLE, et l'absence est NORMALE :
     *  une exclusion sans référence n'est pas disparue, elle est seulement non rapprochée. */
    outilRef: text("outil_ref"),
    state: exclusionState("state").notNull().default('active'),
    revokedAt: timestamp("revoked_at"),
    revokedBy: text("revoked_by").references(() => user.id, { onDelete: "set null" }),
    // RAPPEL D'ÉCHÉANCE — ce qui a déjà été annoncé, pour ne pas le répéter chaque passage.
    // Sans ces deux colonnes, la tâche notifierait toutes les six heures et serait coupée au
    // bout d'une journée.
    derniereAlerteLe: timestamp("derniere_alerte_le"),
    derniereAlerteNiveau: text("derniere_alerte_niveau"),
}, (table) => [
    index("exclusion_incident_id_idx").on(table.incidentId),
    // La vue « listes blanches actives » trie par date de revue : c'est l'accès principal.
    index("exclusion_state_review_date_idx").on(table.state, table.reviewDate),
    // Une règle de l'EDR ne porte qu'une décision active à la fois. Deux exclusions actives
    // sur la même règle rendraient l'inventaire ambigu, et l'appariement indécidable.
    uniqueIndex("exclusion_outil_ref_active_idx").on(table.outilRef)
        .where(sql`${table.state} = 'active' AND ${table.outilRef} IS NOT NULL`),
    check("exclusion_scope_not_blank_ck", sql`length(trim(${table.scope})) > 0`),
    check("exclusion_reason_not_blank_ck", sql`length(trim(${table.reason})) > 0`),
]);

export const exclusionRelations = relations(exclusion, ({ one }) => ({
    incident: one(incident, {
        fields: [exclusion.incidentId],
        references: [incident.id],
    }),
}));

export const revueRegleEtat = pgEnum('revue_regle_etat', ['active', 'remplacee', 'levee']);

/**
 * REVUE D'UNE RÈGLE SANS INCIDENT.
 *
 * Une exclusion naît toujours d'un incident, et `exclusion` garde cet invariant. Mais l'EDR
 * porte aussi des règles posées hors incident, qui ne doivent pas échapper à la revue : elles
 * vivent donc ici, à côté et non dedans — rendre `incident_id` nullable aurait rendu le
 * registre ambigu. Le jour où la règle reçoit une exclusion, cette revue passe en `remplacee`.
 */
export const revueRegle = pgTable("revue_regle", {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Outil d'où vient la règle. Seul `harfanglab` est relevé aujourd'hui. */
    tool: exclusionTool("tool").notNull().default('harfanglab'),
    /** Référence de la règle dans l'outil. Pas de clé étrangère : une règle retirée de
     * l'EDR ne doit pas effacer la décision qui la concernait. */
    regleRef: text("regle_ref").notNull(),
    /** Ce que la règle neutralise, recopié au moment de la décision pour rester lisible
     * même si la règle disparaît du relevé. */
    libelle: text("libelle"),
    /** Pourquoi cette règle existe sans incident. Obligatoire : même exigence que pour une
     * exclusion, sinon la revue n'a rien à juger. */
    motif: text("motif").notNull(),
    echeance: timestamp("echeance").notNull(),
    etat: revueRegleEtat("etat").notNull().default('active'),
    creePar: text("cree_par").references(() => user.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le").defaultNow().notNull(),
    /** Renseigné quand une exclusion a pris le relais : voir le commentaire du bloc. */
    remplaceeLe: timestamp("remplacee_le"),
    remplaceeParExclusion: uuid("remplacee_par_exclusion").references(() => exclusion.id, { onDelete: "set null" }),
    leveeLe: timestamp("levee_le"),
    leveePar: text("levee_par").references(() => user.id, { onDelete: "set null" }),
    motifLevee: text("motif_levee"),
    derniereAlerteLe: timestamp("derniere_alerte_le"),
    derniereAlerteNiveau: text("derniere_alerte_niveau"),
}, (table) => [
    index("revue_regle_etat_echeance_idx").on(table.etat, table.echeance),
    // Une règle ne porte qu'une revue active : deux dates pour la même règle ne seraient
    // arbitrées par personne.
    uniqueIndex("revue_regle_ref_active_idx").on(table.tool, table.regleRef)
        .where(sql`${table.etat} = 'active'`),
    check("revue_regle_motif_not_blank_ck", sql`length(trim(${table.motif})) > 0`),
    check("revue_regle_ref_not_blank_ck", sql`length(trim(${table.regleRef})) > 0`),
]);

export const revueRegleRelations = relations(revueRegle, ({ one }) => ({
    exclusion: one(exclusion, {
        fields: [revueRegle.remplaceeParExclusion],
        references: [exclusion.id],
    }),
}));
