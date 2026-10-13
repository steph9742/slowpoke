import { pgTable, text, boolean, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { incident } from "./schema";
import { user } from "./auth-schema";

/**
 * Copie locale de l'inventaire GLPI.
 *
 * Copie et non interrogation à la volée : la recherche se fait à la frappe pendant qu'on saisit
 * un incident, souvent dans l'urgence. Elle doit être instantanée et rester disponible quand
 * GLPI ne l'est pas.
 *
 * Les champs `*_complet` portent l'arborescence GLPI (« Établissement > DSI > Proximité ») : le
 * nom seul est ambigu dès qu'il se répète dans deux branches.
 */
export const glpiMachine = pgTable("glpi_machine", {
    glpiId: text("glpi_id").primaryKey(),
    nom: text("nom").notNull(),
    entite: text("entite"),
    entiteComplet: text("entite_complet"),
    lieu: text("lieu"),
    lieuComplet: text("lieu_complet"),
    groupe: text("groupe"),
    groupeComplet: text("groupe_complet"),
    type: text("type"),
    os: text("os"),
    /**
     * La seule identité qui ne mente pas. GLPI accumule des entrées périmées — 219
     * doublons de nom sur 8 859 machines — et certains agents renvoient un nom par défaut
     * (« localhost ») qui ne désigne rien. Stocké pour ÉTABLIR le constat et lever une
     * ambiguïté, pas comme clé de rapprochement : en changer fusionnerait des fiches.
     */
    numeroSerie: text("numero_serie"),
    /** Calculé à la synchronisation d'après le groupe critique déclaré dans les réglages. */
    critique: boolean("critique").notNull().default(false),
    /**
     * Faux quand la machine n'est plus revenue d'une synchronisation. On ne supprime pas :
     * un incident peut la citer, et son nom doit rester lisible.
     */
    presente: boolean("presente").notNull().default(true),
    synchroniseLe: timestamp("synchronise_le").defaultNow().notNull(),
}, (table) => [
    index("glpi_machine_nom_idx").on(table.nom),
    index("glpi_machine_critique_idx").on(table.critique),
]);

/**
 * Machines rattachées à un incident.
 *
 * `nom` est stocké EN CLAIR à côté de l'identifiant : une machine sortie de l'inventaire,
 * un GLPI remplacé ou indisponible ne doivent jamais rendre une fiche illisible. Sans
 * `glpi_id`, c'est une saisie libre — parfaitement valide, et le cas normal pour une
 * machine absente de l'inventaire.
 */
export const incidentMachine = pgTable("incident_machine", {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: text("incident_id").notNull().references(() => incident.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
    glpiId: text("glpi_id"),
    ajoutePar: text("ajoute_par").references(() => user.id, { onDelete: "set null" }),
    ajouteLe: timestamp("ajoute_le").defaultNow().notNull(),
}, (table) => [
    uniqueIndex("incident_machine_uq").on(table.incidentId, table.nom),
    index("incident_machine_incident_idx").on(table.incidentId),
    index("incident_machine_glpi_idx").on(table.glpiId),
]);
