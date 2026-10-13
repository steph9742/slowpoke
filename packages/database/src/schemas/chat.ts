import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { incident } from "./schema";
import { user } from "./auth-schema";

/**
 * Échanges avec le modèle, à propos d'un incident.
 *
 * Volontairement HORS de `incident_log` : le journal est une pièce de dossier, qui peut
 * servir dans une plainte ou une notification. Une conversation avec un modèle n'y a pas sa
 * place, même exacte.
 *
 * `proprietaire` porte la portée : `null` pour la conversation partagée de l'incident,
 * l'identifiant d'un utilisateur pour sa conversation personnelle.
 */
export const incidentChat = pgTable("incident_chat", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    proprietaire: text("proprietaire").references(() => user.id, { onDelete: "cascade" }),
    /** user | assistant */
    role: text("role").notNull(),
    contenu: text("contenu").notNull(),
    /** Qui a posé la question. Vide pour les réponses du modèle. */
    auteur: text("auteur").references(() => user.id, { onDelete: "set null" }),
    modele: text("modele"),
    creeLe: timestamp("cree_le").defaultNow().notNull(),
}, (table) => [
    index("incident_chat_fil_idx").on(table.incidentId, table.proprietaire, table.creeLe),
]);
