import { pgTable, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { incident } from "./schema";
import { user } from "./auth-schema";

/**
 * Sorties du modèle, gardées à part des champs d'incident.
 *
 * Rien n'est fondu dans `description` ou `severity` : le jour où un incident sert dans une
 * procédure, il faut pouvoir séparer le constat du texte engendré. Le modèle et la version
 * du prompt sont stockés pour savoir ce qui a produit quoi.
 */
export const incidentAnalysis = pgTable("incident_analysis", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    /** resume | iocs | avancement | procedure */
    genre: text("genre").notNull(),
    contenu: jsonb("contenu").notNull(),
    modele: text("modele").notNull(),
    versionPrompt: text("version_prompt").notNull(),
    creeLe: timestamp("cree_le").defaultNow().notNull(),
    creePar: text("cree_par").references(() => user.id, { onDelete: "set null" }),
}, (table) => [
    // On garde l'historique et on affiche la dernière : une analyse refaite après
    // enrichissement de l'incident ne doit pas effacer la précédente.
    index("incident_analysis_incident_genre_idx").on(table.incidentId, table.genre, table.creeLe),
]);
