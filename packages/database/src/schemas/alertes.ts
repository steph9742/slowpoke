import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, pgEnum, integer, jsonb, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { incident } from "./schema";
import { user } from "./auth-schema";
import { createIncidentId } from "../utils/id";

// FILE DE TRIAGE — ce qui mérite un regard, à côté de ce qui mérite un dossier.
//
// Une alerte n'est pas un incident : un incident porte des compteurs réglementaires, un
// pilote et une procédure. Tout ce qui mérite un regard entre ici, et seul ce qui mérite un
// suivi devient un incident ; le reste est écarté AVEC SON MOTIF.
//
// Ce n'est pas un SIEM : aucune recherche plein texte, aucune corrélation, aucun rejeu.

export const alerteSource = pgEnum('alerte_source', ['wazuh', 'n8n', 'manuel']);
export const alerteStatut = pgEnum('alerte_statut', ['nouvelle', 'en_cours', 'ecartee', 'escaladee']);
export const alerteMotifEcart = pgEnum('alerte_motif_ecart', [
    'faux_positif', 'benin', 'bruit_connu', 'doublon', 'hors_perimetre',
]);

export const alerte = pgTable("alerte", {
    // Même forme que les incidents : court, lisible à voix haute, citable dans un ticket.
    id: text("id").primaryKey().$default(() => createIncidentId().toUpperCase()),

    /**
     * PANIER DE REGROUPEMENT, calculé par le serveur : `source:règle:machine:jour`.
     *
     * Le jour est celui d'`Europe/Paris`, jamais celui de l'émetteur : une alerte à 00h30 à Paris
     * est la veille en UTC, et la série se scinderait une nuit sur deux. Une récidive le
     * lendemain est une alerte NEUVE.
     */
    panier: text("panier").notNull(),

    source: alerteSource("source").notNull().default('wazuh'),
    regleId: text("regle_id").notNull(),
    regleLibelle: text("regle_libelle").notNull(),
    /** Niveau de la source (0–16 chez Wazuh). La gravité en est DÉRIVÉE côté Slowpoke. */
    niveau: integer("niveau").notNull(),
    machine: text("machine").notNull(),
    ipsSource: text("ips_source").array().notNull().default(sql`'{}'::text[]`),
    compte: text("compte"),
    mitre: text("mitre").array().notNull().default(sql`'{}'::text[]`),

    /**
     * `premiereVue` ne bouge JAMAIS : c'est la date de connaissance de l'incident en cas
     * d'escalade. `derniereVue` suit les occurrences.
     */
    premiereVue: timestamp("premiere_vue").notNull(),
    derniereVue: timestamp("derniere_vue").notNull(),
    occurrences: integer("occurrences").notNull().default(1),

    statut: alerteStatut("statut").notNull().default('nouvelle'),
    motifEcart: alerteMotifEcart("motif_ecart"),
    noteEcart: text("note_ecart"),
    /** Renseigné quand l'alerte a été écartée par un silence posé sur la série. */
    silenceId: text("silence_id"),

    incidentId: text("incident_id").references(() => incident.id, { onDelete: "set null" }),
    assigneA: text("assigne_a").references(() => user.id, { onDelete: "set null" }),

    /** Retour vers l'alerte dans l'outil d'origine. Restreint à l'hôte configuré. */
    urlTableauDeBord: text("url_tableau_de_bord"),
    /** Le log brut, tronqué : c'est une pièce de contexte, pas un stockage de journaux. */
    logBrut: text("log_brut"),
    /** Contexte plat tel que l'émetteur le rend — url, code HTTP, relais syslog… */
    contexte: jsonb("contexte").$type<Record<string, string>>().notNull().default({}),

    creeeLe: timestamp("creee_le").defaultNow().notNull(),
    majLe: timestamp("maj_le").defaultNow().$onUpdate(() => /* @__PURE__ */ new Date()).notNull(),
}, (table) => [
    // Idempotence : une seconde alerte du même panier incrémente, elle ne duplique pas.
    uniqueIndex("alerte_panier_uq").on(table.panier),
    // L'accès principal : la file à trier, du plus récent au plus ancien.
    index("alerte_statut_derniere_vue_idx").on(table.statut, table.derniereVue),
    index("alerte_machine_idx").on(table.machine),
    index("alerte_regle_idx").on(table.regleId),
    index("alerte_incident_idx").on(table.incidentId),
    check("alerte_niveau_ck", sql`${table.niveau} >= 0 AND ${table.niveau} <= 16`),
    check("alerte_occurrences_ck", sql`${table.occurrences} >= 1`),
    // Un écartement sans motif est une décision qu'on ne peut pas défendre.
    check("alerte_motif_si_ecartee_ck", sql`${table.statut} <> 'ecartee' OR ${table.motifEcart} IS NOT NULL`),
]);

/** JOURNAL DE TRIAGE — qui a décidé quoi, et quand. Séparé de la chronologie d'incident :
 *  une décision d'écartement se défend six mois plus tard, et pas sans son auteur. */
export const alerteJournal = pgTable("alerte_journal", {
    id: text("id").primaryKey().$default(() => createIncidentId().toUpperCase()),
    alerteId: text("alerte_id").notNull().references(() => alerte.id, { onDelete: "cascade" }),
    /** `creation`, `occurrence`, `statut`, `assignation`, `escalade`, `silence`. */
    genre: text("genre").notNull(),
    message: text("message").notNull(),
    parUtilisateur: text("par_utilisateur").references(() => user.id, { onDelete: "set null" }),
    /** Vrai quand l'auteur est un compte de service — l'ingestion, typiquement. */
    parService: text("par_service"),
    creeLe: timestamp("cree_le").defaultNow().notNull(),
}, (table) => [
    index("alerte_journal_alerte_idx").on(table.alerteId, table.creeLe),
]);

export const alerteRelations = relations(alerte, ({ one, many }) => ({
    incident: one(incident, {
        fields: [alerte.incidentId],
        references: [incident.id],
    }),
    journal: many(alerteJournal),
}));

export const alerteJournalRelations = relations(alerteJournal, ({ one }) => ({
    alerte: one(alerte, {
        fields: [alerteJournal.alerteId],
        references: [alerte.id],
    }),
}));

export const silenceEtat = pgEnum('silence_etat', ['active', 'levee']);

/**
 * SILENCE D'UNE SÉRIE — ce qu'on a décidé de ne plus voir arriver dans la file.
 *
 * Le panier étant journalier, écarter aujourd'hui ne dit rien de demain : la même série
 * revient chaque matin en « nouvelle », et au bout de deux semaines plus personne n'ouvre la
 * file. Un silence porte donc sur la règle, éventuellement restreinte à une machine.
 *
 * ÉCHÉANCE OBLIGATOIRE, comme pour une liste blanche : sans date de revue, c'est un angle
 * mort permanent que personne n'a décidé.
 */
export const silenceAlerte = pgTable("silence_alerte", {
    id: text("id").primaryKey().$default(() => createIncidentId().toUpperCase()),
    source: alerteSource("source").notNull().default('wazuh'),
    regleId: text("regle_id").notNull(),
    /** `null` : toutes les machines. Restreindre est toujours préférable. */
    machine: text("machine"),
    motif: alerteMotifEcart("motif").notNull(),
    note: text("note"),
    echeance: timestamp("echeance").notNull(),
    etat: silenceEtat("etat").notNull().default('active'),
    creePar: text("cree_par").references(() => user.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le").defaultNow().notNull(),
    leveeLe: timestamp("levee_le"),
    leveePar: text("levee_par").references(() => user.id, { onDelete: "set null" }),
    motifLevee: text("motif_levee"),
    derniereAlerteLe: timestamp("derniere_alerte_le"),
    derniereAlerteNiveau: text("derniere_alerte_niveau"),
}, (table) => [
    index("silence_alerte_etat_echeance_idx").on(table.etat, table.echeance),
    index("silence_alerte_regle_idx").on(table.source, table.regleId),
    check("silence_alerte_regle_not_blank_ck", sql`length(trim(${table.regleId})) > 0`),
]);

/**
 * AGRÉGAT MENSUEL — ce qui survit à la purge : le décompte par mois, règle, machine et motif.
 * Les alertes écartées sont la matière du réglage des règles, et un palmarès qui perd la
 * mémoire chaque trimestre ne sert à rien.
 */
export const alerteAgregat = pgTable("alerte_agregat", {
    id: text("id").primaryKey().$default(() => createIncidentId().toUpperCase()),
    /** Mois au format `AAAA-MM`, en heure de Paris. */
    mois: text("mois").notNull(),
    source: alerteSource("source").notNull(),
    regleId: text("regle_id").notNull(),
    machine: text("machine").notNull(),
    statut: alerteStatut("statut").notNull(),
    motifEcart: alerteMotifEcart("motif_ecart"),
    alertes: integer("alertes").notNull().default(0),
    occurrences: integer("occurrences").notNull().default(0),
    majLe: timestamp("maj_le").defaultNow().$onUpdate(() => /* @__PURE__ */ new Date()).notNull(),
}, (table) => [
    uniqueIndex("alerte_agregat_uq").on(table.mois, table.source, table.regleId, table.machine, table.statut, table.motifEcart),
    index("alerte_agregat_mois_idx").on(table.mois),
]);

/**
 * AVIS DU MODÈLE SUR UNE ALERTE — gardé à part : le jour où une décision de triage est
 * contestée, il faut pouvoir montrer ce qu'un humain a décidé et, séparément, ce qu'un modèle
 * avait proposé. Le modèle et la version du prompt disent ce qui a produit quoi.
 */
export const alerteAvis = pgTable("alerte_avis", {
    id: text("id").primaryKey().$default(() => createIncidentId().toUpperCase()),
    alerteId: text("alerte_id").notNull().references(() => alerte.id, { onDelete: "cascade" }),
    contenu: jsonb("contenu").notNull(),
    modele: text("modele").notNull(),
    versionPrompt: text("version_prompt").notNull(),
    creeLe: timestamp("cree_le").defaultNow().notNull(),
    creePar: text("cree_par").references(() => user.id, { onDelete: "set null" }),
}, (table) => [
    // L'historique est conservé : un avis redemandé après enrichissement ne doit pas
    // effacer le précédent.
    index("alerte_avis_alerte_idx").on(table.alerteId, table.creeLe),
]);

/** Échanges avec le modèle à propos d'une alerte. Un seul fil, PARTAGÉ : ce qu'on apprend au
 *  modèle vaut pour toute la cellule. Hors du journal de triage, qui porte les décisions. */
export const alerteChat = pgTable("alerte_chat", {
    id: text("id").primaryKey().$default(() => createIncidentId().toUpperCase()),
    alerteId: text("alerte_id").notNull().references(() => alerte.id, { onDelete: "cascade" }),
    /** user | assistant */
    role: text("role").notNull(),
    contenu: text("contenu").notNull(),
    /** Qui a posé la question. Vide pour les réponses du modèle. */
    auteur: text("auteur").references(() => user.id, { onDelete: "set null" }),
    modele: text("modele"),
    creeLe: timestamp("cree_le").defaultNow().notNull(),
}, (table) => [
    index("alerte_chat_fil_idx").on(table.alerteId, table.creeLe),
]);

export const connaissancePortee = pgEnum('connaissance_portee', ['machine', 'regle']);

/**
 * CE QUE LA CELLULE SAIT, ET QUE LA SOURCE NE DIT PAS — « cette machine est le reverse proxy ».
 *
 * Attaché à une machine ou à une règle, pas à une alerte : sinon le lendemain la même série
 * repart de zéro et l'analyste suivant réexplique la même chose. Joint à ce que le modèle
 * lit, et affiché à qui trie.
 */
export const connaissanceLocale = pgTable("connaissance_locale", {
    id: text("id").primaryKey().$default(() => createIncidentId().toUpperCase()),
    portee: connaissancePortee("portee").notNull(),
    /** Nom de machine, ou identifiant de règle, selon la portée. */
    valeur: text("valeur").notNull(),
    note: text("note").notNull(),
    creePar: text("cree_par").references(() => user.id, { onDelete: "set null" }),
    creeLe: timestamp("cree_le").defaultNow().notNull(),
    majLe: timestamp("maj_le").defaultNow().$onUpdate(() => /* @__PURE__ */ new Date()).notNull(),
}, (table) => [
    uniqueIndex("connaissance_locale_uq").on(table.portee, table.valeur),
    check("connaissance_locale_note_not_blank_ck", sql`length(trim(${table.note})) > 0`),
]);
