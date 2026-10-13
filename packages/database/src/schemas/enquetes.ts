import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { incident } from "./schema";
import { user } from "./auth-schema";

// BIBLIOTHÈQUE DES REQUÊTES D'ENQUÊTE, recopiée du dépôt de procédures.
//
// Le dépôt fait foi : ce qu'une requête cherche, pourquoi, comment lire le résultat. Slowpoke
// n'exécute que les identifiants qu'il connaît. `commit` est la version relue en merge
// request, recopiée dans chaque étape lancée : on doit pouvoir dire ce qui a été exécuté.
export const enqueteRequete = pgTable("enquete_requete", {
    id: text("id").primaryKey(),
    chemin: text("chemin").notNull(),
    titre: text("titre").notNull(),
    source: text("source").notNull(),
    parametres: text("parametres").array().notNull(),
    pourquoi: text("pourquoi"),
    lireLeResultat: text("lire_le_resultat"),
    commande: text("commande"),
    commit: text("commit"),
    empreinte: text("empreinte").notNull(),
    synchroniseLe: timestamp("synchronise_le").defaultNow().notNull(),
});

// ÉTAT D'UNE ÉTAPE D'ENQUÊTE POUR UN INCIDENT — une ligne par case outillée.
//
// L'historique vit dans la chronologie de l'incident ; cette table porte le dernier état :
// ce qui a été lancé, avec quelle version de la requête, combien de résultats, et le
// verdict. « Impossible à vérifier » porte toujours son motif.
export const incidentEnqueteEtape = pgTable("incident_enquete_etape", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    playbookReference: text("playbook_reference").notNull(),
    cle: text("cle").notNull(),
    requeteId: text("requete_id").notNull(),
    requeteCommit: text("requete_commit"),
    source: text("source").notNull(),
    parametres: jsonb("parametres").$type<Record<string, string[]>>(),
    nombre: integer("nombre"),
    resultat: jsonb("resultat"),
    lanceLe: timestamp("lance_le"),
    lancePar: text("lance_par").references(() => user.id, { onDelete: "set null" }),
    verdict: text("verdict"),
    motif: text("motif"),
    verdictLe: timestamp("verdict_le"),
    verdictPar: text("verdict_par").references(() => user.id, { onDelete: "set null" }),
}, (table) => [
    uniqueIndex("incident_enquete_etape_uq").on(table.incidentId, table.playbookReference, table.cle),
    index("incident_enquete_etape_incident_idx").on(table.incidentId),
]);
